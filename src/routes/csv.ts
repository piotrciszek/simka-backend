import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse';
import pool from '../config/db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// Konfiguracja multer — gdzie zapisywać pliki
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/csv';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}_${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || path.extname(file.originalname) === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Tylko pliki CSV są dozwolone'));
    }
  },
});

// POST /csv/upload — wgraj nowy CSV (tylko admin)
router.post(
  '/upload',
  requireRole('admin'),
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ message: 'Brak pliku' });
      return;
    }

    const { season } = req.body;

    if (!season) {
      res.status(400).json({ message: 'Podaj sezon (np. 2024-25)' });
      return;
    }

    try {
      // Dezaktywuj poprzedni aktywny CSV
      await pool.query('UPDATE csv_uploads SET is_active = false');

      // Zapisz nowy upload
      const [result]: any = await pool.query(
        'INSERT INTO csv_uploads (filename, filepath, season, is_active, uploaded_by) VALUES (?, ?, ?, true, ?)',
        [req.file.originalname, req.file.path, season, req.user!.id],
      );

      const csvUploadId = result.insertId;

      // Parsuj CSV i zapisz graczy
      const players: any[] = [];

      const parser = fs.createReadStream(req.file.path).pipe(
        parse({
          columns: true, // pierwsza linia to nagłówki
          skip_empty_lines: true,
          trim: true,
        }),
      );

      for await (const row of parser) {
        players.push([
          csvUploadId,
          row.FirstName || '',
          row.LastName || '',
          row.Position || '',
          row.Team || null,
        ]);
      }

      if (players.length === 0) {
        res.status(400).json({ message: 'CSV jest pusty lub nieprawidłowy' });
        return;
      }

      // Usuń starych graczy i wstaw nowych
      await pool.query('DELETE FROM players WHERE csv_upload_id != ?', [csvUploadId]);

      await pool.query(
        'INSERT INTO players (csv_upload_id, first_name, last_name, position, team) VALUES ?',
        [players],
      );

      res.status(201).json({
        message: 'CSV wgrany pomyślnie',
        season,
        playersCount: players.length,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// GET /csv/players — lista graczy z aktywnego CSV
router.get('/players', async (req: AuthRequest, res: Response): Promise<void> => {
  const { team } = req.query;

  try {
    let rows: any;

    if (team) {
      [rows] = await pool.query(
        `SELECT p.id, p.first_name as "firstName", p.last_name as "lastName", p.position, p.team
         FROM players p
         JOIN csv_uploads c ON p.csv_upload_id = c.id
         WHERE c.is_active = true AND p.team = ?
         ORDER BY p.position, p.last_name, p.first_name`,
        [team],
      );
    } else {
      [rows] = await pool.query(
        `SELECT p.id, p.first_name as "firstName", p.last_name as "lastName", p.position, p.team
         FROM players p
         JOIN csv_uploads c ON p.csv_upload_id = c.id
         WHERE c.is_active = true
         ORDER BY p.team, p.position, p.last_name, p.first_name`,
      );
    }

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// GET /csv/uploads — historia uploadów (admin)
router.get(
  '/uploads',
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const [rows]: any = await pool.query(
        `SELECT c.id, c.filename, c.season, c.is_active, c.uploaded_at,
              u.username as uploaded_by
       FROM csv_uploads c
       JOIN users u ON c.uploaded_by = u.id
       ORDER BY c.uploaded_at DESC`,
      );

      res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// GET /csv/files — lista plików CSV dostępnych na serwerze
router.get(
  '/files',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      // const csvDir = '/public_html/csv';  //PROD ONLY
      // const csvDir = path.join(process.cwd(), 'uploads/csv'); //DEV ONLY
      const csvDir = process.env.CSV_DIR || path.join(process.cwd(), 'uploads/csv');

      if (!fs.existsSync(csvDir)) {
        res.json([]);
        return;
      }

      const items = fs
        .readdirSync(csvDir)
        .map(f => {
          const stat = fs.statSync(path.join(csvDir, f));
          return {
            filename: f,
            size: stat.isDirectory() ? null : stat.size,
            modifiedAt: stat.mtime,
            isDirectory: stat.isDirectory(),
          };
        })
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return b.modifiedAt.getTime() - a.modifiedAt.getTime();
        });

      res.json(items);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd odczytu folderu' });
    }
  },
);

// POST /csv/load-file — załaduj CSV z serwera (tylko admin)
router.post(
  '/load-file',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { filename, season } = req.body;

    if (!filename || !season) {
      res.status(400).json({ message: 'Podaj nazwę pliku i sezon' });
      return;
    }

    // const filepath = path.join('/public_html/csv', filename);
    const filepath = path.join(
      process.env.CSV_DIR || path.join(process.cwd(), 'uploads/csv'),
      filename,
    );

    if (!fs.existsSync(filepath)) {
      res.status(404).json({ message: 'Plik nie istnieje' });
      return;
    }

    try {
      await pool.query('UPDATE csv_uploads SET is_active = false');

      const [result]: any = await pool.query(
        'INSERT INTO csv_uploads (filename, filepath, season, is_active, uploaded_by) VALUES (?, ?, ?, true, ?)',
        [filename, filepath, season, req.user!.id],
      );

      const csvUploadId = result.insertId;

      const players: any[] = [];

      const parser = fs.createReadStream(filepath).pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }),
      );

      for await (const row of parser) {
        players.push([
          csvUploadId,
          row.FirstName || '',
          row.LastName || '',
          row.Position || '',
          row.Team || null,
        ]);
      }

      if (players.length === 0) {
        res.status(400).json({ message: 'CSV jest pusty lub nieprawidłowy' });
        return;
      }

      await pool.query('DELETE FROM players WHERE csv_upload_id != ?', [csvUploadId]);

      await pool.query(
        'INSERT INTO players (csv_upload_id, first_name, last_name, position, team) VALUES ?',
        [players],
      );

      res.status(201).json({
        message: 'CSV załadowany pomyślnie',
        season,
        playersCount: players.length,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

export default router;
