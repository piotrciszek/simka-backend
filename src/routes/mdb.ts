import { Router, Response } from 'express';
import path from 'path';
import { AuthRequest, authenticate, requireRole } from '../middleware/auth';
import {
  backupExtraction,
  extractMdb,
  MdbSourceNotFoundError,
} from '../services/mdbExtractionService';
import { importMdb, MdbExtractionNotFoundError } from '../services/mdbImportService';

const router = Router();
const DEFAULT_FILENAME = 'simbasket.mdb';
const DB_DIR = path.resolve(process.env.DB_DIR || path.join(process.cwd(), 'uploads', 'db'));
// Tylko znaki 0-9a-f i "-" — dzięki temu extractionId jest bezpieczny jako nazwa katalogu
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(authenticate);

router.post(
  '/extract',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const filename =
      typeof req.body?.filename === 'string' && req.body.filename.trim()
        ? req.body.filename.trim()
        : DEFAULT_FILENAME;

    // basename === filename → brak separatorów ścieżki; jedyne "niebezpieczne" nazwy bez
    // separatora to "." i "..", a te odpadają na wymaganiu końcówki .mdb
    if (filename !== path.basename(filename) || !filename.toLowerCase().endsWith('.mdb')) {
      res.status(400).json({ message: 'Podaj poprawną nazwę pliku MDB bez ścieżki.' });
      return;
    }

    // Celowe ostrzeżenie dla UI: plik o innej nazwie niż oczekiwana to częsta pomyłka
    // (np. stary save). Frontend po kodzie MDB_FILENAME_CONFIRMATION_REQUIRED pokazuje
    // dialog i ponawia żądanie z confirmDifferentFilename: true
    const confirmDifferentFilename = req.body?.confirmDifferentFilename === true;
    if (filename !== DEFAULT_FILENAME && !confirmDifferentFilename) {
      res.status(409).json({
        code: 'MDB_FILENAME_CONFIRMATION_REQUIRED',
        message: `Plik ma nazwę "${filename}", a oczekiwana nazwa to "${DEFAULT_FILENAME}". Potwierdź kontynuację.`,
        filename,
        expectedFilename: DEFAULT_FILENAME,
      });
      return;
    }

    if (req.body?.includeCsv !== undefined && typeof req.body.includeCsv !== 'boolean') {
      res.status(400).json({ message: 'Pole includeCsv musi mieć wartość true albo false.' });
      return;
    }

    // CSV generujemy tylko na wyraźne żądanie (includeCsv: true) — domyślnie sam JSON
    const includeCsv = req.body?.includeCsv === true;

    try {
      const result = await extractMdb(DB_DIR, filename, includeCsv);
      res.json({
        message: `MDB wyeksportowano do JSON ${includeCsv ? 'i plików CSV' : 'bez plików CSV'}. Dane nie zostały jeszcze zapisane do bazy SQL.`,
        ...result,
      });
    } catch (error) {
      console.error('Błąd eksportu pliku MDB:', error);
      const status = error instanceof MdbSourceNotFoundError ? 404 : 500;
      const reason = error instanceof Error ? error.message : 'nieznany błąd';
      // Prefiks dodajemy tutaj, nie w serwisie — serwis rzuca oryginalny błąd (pełny stack trace
      // w logach), a UI dostaje czytelny komunikat, że padł właśnie eksport
      res.status(status).json({ message: `Nie udało się wyeksportować MDB: ${reason}` });
    }
  },
);

router.post(
  '/import',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const extractionId = req.body?.extractionId;
    if (typeof extractionId !== 'string' || !UUID_REGEX.test(extractionId)) {
      res.status(400).json({
        message: 'Podaj poprawny extractionId otrzymany z endpointu /mdb/extract.',
      });
      return;
    }

    try {
      const result = await importMdb(DB_DIR, extractionId);

      // Backup po udanym imporcie — jego błąd nie cofa importu (dane są już w bazie),
      // więc zwracamy 200 z ostrzeżeniem zamiast 500
      let backupDirectory: string | null = null;
      try {
        backupDirectory = await backupExtraction(DB_DIR, extractionId);
      } catch (error) {
        console.error('Błąd backupu eksportu MDB:', error);
      }

      const backupWarning = backupDirectory ? '' : ' Uwaga: nie udało się zrobić backupu eksportu.';
      res.json({
        message: `Zaimportowano lub zaktualizowano ${result.teams} drużyn i ${result.games} meczów dla sezonu ${result.season}.${backupWarning}`,
        ...result,
        backupDirectory,
      });
    } catch (error) {
      console.error('Błąd importu z MDB:', error);
      const message = error instanceof Error ? error.message : 'Nieznany błąd importu z MDB.';
      const status = error instanceof MdbExtractionNotFoundError ? 404 : 500;
      res.status(status).json({ message });
    }
  },
);

export default router;
