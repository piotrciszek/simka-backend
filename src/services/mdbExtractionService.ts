import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import MDBReader, { type Value } from 'mdb-reader';

export class MdbSourceNotFoundError extends Error {}

// Wspólna nazwa pliku — extraction go zapisuje, import (mdbImportService) go czyta
export const EXTRACTION_JSON_FILENAME = 'simbasket.json';
// Metadane eksportu — backup musi wiedzieć, który plik MDB skopiować (nazwa może być inna niż domyślna)
const META_FILENAME = 'meta.json';
const BACKEND_ROOT = path.resolve(__dirname, '../..');

interface ExtractionMeta {
  sourceFile: string;
  createdAt: string;
}

export interface MdbExtractionResult {
  sourceFile: string;
  extractionId: string;
  outputDirectory: string;
  csvExported: boolean;
  tables: { name: string; records: number }[];
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }
  // Tablice/obiekty pochodzą z kolumn typu Complex (załączniki Accessa) — rzadkie w .mdb,
  // ale bez tej obsługi trafiłyby do CSV jako "[object Object]"
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeValue(nestedValue)]),
    );
  }
  return value;
}

function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text =
    typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Eksportuje wszystkie tabele z pliku MDB do JSON (i opcjonalnie do CSV — jeden plik na tabelę).
 * Wynik trafia do `<sourceDirectory>/extracted/<extractionId>/`. Nic nie jest zapisywane do bazy SQL —
 * to robi osobny krok importu (importMdb) na podstawie extractionId.
 * @param sourceDirectory Katalog z plikami MDB (DB_DIR)
 * @param filename Nazwa pliku MDB (bez ścieżki — walidowana w route)
 * @param includeCsv Czy dodatkowo zapisać pliki CSV (domyślnie nie)
 */
export async function extractMdb(
  sourceDirectory: string,
  filename: string,
  includeCsv = false,
): Promise<MdbExtractionResult> {
  const sourcePath = path.join(sourceDirectory, filename);
  let sourceStat;
  try {
    sourceStat = await fs.lstat(sourcePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new MdbSourceNotFoundError(`Nie znaleziono pliku MDB: ${filename}`);
    }
    throw error;
  }

  // lstat (nie stat) nie podąża za symlinkiem — więc isFile() odrzuci też linki
  if (!sourceStat.isFile()) {
    throw new Error('Wskazany plik MDB nie jest zwykłym plikiem.');
  }

  const outputRoot = path.join(sourceDirectory, 'extracted');
  await fs.mkdir(outputRoot, { recursive: true });

  // Zapisujemy najpierw do katalogu .tmp-*, a na końcu robimy rename. Rename w obrębie
  // jednego dysku jest atomowy — import nigdy nie zobaczy w połowie zapisanego eksportu,
  // a przy błędzie wystarczy usunąć katalog tymczasowy
  const runId = randomUUID();
  const temporaryDirectory = path.join(outputRoot, `.tmp-${runId}`);
  // Katalog nazywamy samym UUID — import odnajdzie go bezpośrednio po extractionId
  const finalDirectory = path.join(outputRoot, runId);
  await fs.mkdir(temporaryDirectory);

  try {
    const reader = new MDBReader(await fs.readFile(sourcePath));
    const tableNames = reader.getTableNames();
    const exportedData: Record<string, unknown[]> = {};
    const tables: MdbExtractionResult['tables'] = [];

    for (const tableName of tableNames) {
      // Nazwa tabeli staje się nazwą pliku CSV — odrzucamy nazwy, które mogłyby
      // wyjść poza katalog eksportu (path traversal), np. "../../app"
      if (
        tableName === '.' ||
        tableName === '..' ||
        tableName.includes('/') ||
        tableName.includes('\\')
      ) {
        throw new Error(`Nieprawidłowa nazwa tabeli MDB: ${tableName}`);
      }

      const table = reader.getTable(tableName);
      const columns = table.getColumnNames();
      const records = table.getData<Record<string, Value>>();
      const rows = records.map(record =>
        Object.fromEntries(
          columns.map(column => [column, normalizeValue(record[column])]),
        ),
      );

      exportedData[tableName] = rows;
      tables.push({ name: tableName, records: rows.length });

      if (includeCsv) {
        const csvRows = [
          columns.map(toCsvCell).join(','),
          ...rows.map(row => columns.map(column => toCsvCell(row[column])).join(',')),
        ];
        await fs.writeFile(
          path.join(temporaryDirectory, `${tableName}.csv`),
          `\uFEFF${csvRows.join('\r\n')}\r\n`,
          'utf8',
        );
      }
    }

    if (tables.length === 0) {
      throw new Error('Eksport MDB nie zawiera tabel użytkownika.');
    }

    await fs.writeFile(
      path.join(temporaryDirectory, EXTRACTION_JSON_FILENAME),
      JSON.stringify(exportedData, null, 2),
      'utf8',
    );
    const meta: ExtractionMeta = { sourceFile: filename, createdAt: new Date().toISOString() };
    await fs.writeFile(
      path.join(temporaryDirectory, META_FILENAME),
      JSON.stringify(meta, null, 2),
      'utf8',
    );
    await fs.rename(temporaryDirectory, finalDirectory);

    return {
      sourceFile: filename,
      extractionId: runId,
      outputDirectory: path.relative(BACKEND_ROOT, finalDirectory),
      csvExported: includeCsv,
      tables,
    };
  } catch (error) {
    // Sprzątamy niedokończony eksport i przekazujemy oryginalny błąd dalej
    // (z pełnym stack trace) — kontekst "Błąd eksportu pliku MDB" dopisuje log w route
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

// 2026-11-04_22-15-30 (czas lokalny serwera) — bez ":", bo Windows nie pozwala go użyć w nazwie
function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_` +
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

/**
 * Przenosi eksport do extracted/backup/<data>_<extractionId>/ i dokłada kopię pliku MDB,
 * z którego powstał. Wywoływane po udanym imporcie do bazy. Oryginalny MDB zostaje
 * w DB_DIR (FTP i tak nadpisze go następnym save'em). Nic nie jest kasowane automatycznie.
 * @returns Ścieżka katalogu backupu względem katalogu backendu
 */
export async function backupExtraction(dbDirectory: string, extractionId: string): Promise<string> {
  // extractionId zwalidowany w route jako UUID — bezpieczny w ścieżce
  const extractionDirectory = path.join(dbDirectory, 'extracted', extractionId);
  const meta: ExtractionMeta = JSON.parse(
    await fs.readFile(path.join(extractionDirectory, META_FILENAME), 'utf8'),
  );

  const backupRoot = path.join(dbDirectory, 'extracted', 'backup');
  const backupDirectory = path.join(backupRoot, `${formatTimestamp(new Date())}_${extractionId}`);
  await fs.mkdir(backupRoot, { recursive: true });

  // Eksport przenosimy (rename), a MDB kopiujemy — oryginał zostaje w DB_DIR
  await fs.rename(extractionDirectory, backupDirectory);
  // path.basename — sourceFile czytamy z pliku, więc nie ufamy mu, że nie zawiera ścieżki
  const sourceFile = path.basename(meta.sourceFile);
  await fs.copyFile(path.join(dbDirectory, sourceFile), path.join(backupDirectory, sourceFile));

  return path.relative(BACKEND_ROOT, backupDirectory);
}
