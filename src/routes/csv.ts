import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse';
import pool from '../config/db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import {
  Player,
  PlayerFull,
  PlayerTrade,
  PlayerAttributes,
  TeamSalarySingleYear,
  TeamSalaryAllYears,
} from '../types/players';

const router = Router();
router.use(authenticate);

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

    // Zabezpieczenie przed path traversal (np. "../../etc/passwd")
    if (filename.includes('..') || filename.includes('/')) {
      res.status(400).json({ message: 'Nieprawidłowa nazwa pliku' });
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

    // Parsuj CSV przed transakcją — żeby nie trzymać połączenia podczas I/O
    const players: any[] = [];
    try {
      const parser = fs.createReadStream(filepath).pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }),
      );

      for await (const row of parser) {
        // Explicit mapping CSV → Database (bezpieczniejsze niż array pozycje)
        const playerData = {
          first_name: row.FirstName || '',
          last_name: row.LastName || '',
          position: row.Position || '',
          team: row.Team || null,
          height: parseInt(row.Height) || null,
          weight: parseInt(row.Weight) || null,
          age: parseInt(row.Age) || null,
          college: row.College || null,
          experience: parseInt(row.Experience) || 0,
          inside_scoring: parseInt(row.InsideScoring) || 0,
          jumpshot: parseInt(row.Jumpshot) || 0,
          three_p: parseInt(row['3P']) || 0,
          handling: parseInt(row.Handling) || 0,
          passing: parseInt(row.Passing) || 0,
          quickness: parseInt(row.Quickness) || 0,
          post_d: parseInt(row.PostD) || 0,
          perimeter_d: parseInt(row.PerimeterD) || 0,
          drive_d: parseInt(row.DriveD) || 0,
          stealing: parseInt(row.Stealing) || 0,
          blocking: parseInt(row.Blocking) || 0,
          oreb: parseInt(row.Oreb) || 0,
          dreb: parseInt(row.Dreb) || 0,
          jumping: parseInt(row.Jumping) || 0,
          strength: parseInt(row.Strength) || 0,
          potential: parseInt(row.Potential) || 0,
          salary1: parseInt(row.Salary1) || 0,
          salary2: parseInt(row.Salary2) || 0,
          salary3: parseInt(row.Salary3) || 0,
          salary4: parseInt(row.Salary4) || 0,
          salary5: parseInt(row.Salary5) || 0,
          salary6: parseInt(row.Salary6) || 0,
          salary7: parseInt(row.Salary7) || 0,
        };

        players.push(playerData);
      }
    } catch (error) {
      console.error(error);
      res.status(400).json({ message: 'Błąd parsowania CSV' });
      return;
    }

    if (players.length === 0) {
      res.status(400).json({ message: 'CSV jest pusty lub nieprawidłowy' });
      return;
    }

    // Transakcja — albo wszystko albo nic
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('UPDATE csv_uploads SET is_active = false');

      const [result]: any = await connection.query(
        'INSERT INTO csv_uploads (filename, filepath, season, is_active, uploaded_by) VALUES (?, ?, ?, true, ?)',
        [filename, filepath, season, req.user!.id],
      );

      const csvUploadId = result.insertId;

      // Konwersja obiektów na arrays w poprawnej kolejności dla VALUES
      const playersWithId = players.map(p => [
        csvUploadId,
        p.first_name, p.last_name, p.position, p.team,
        p.height, p.weight, p.age, p.college, p.experience,
        p.inside_scoring, p.jumpshot, p.three_p, p.handling, p.passing, p.quickness,
        p.post_d, p.perimeter_d, p.drive_d, p.stealing, p.blocking,
        p.oreb, p.dreb, p.jumping, p.strength, p.potential,
        p.salary1, p.salary2, p.salary3, p.salary4, p.salary5, p.salary6, p.salary7,
      ]);

      await connection.query('DELETE FROM players WHERE csv_upload_id != ?', [csvUploadId]);
      await connection.query(
        `INSERT INTO players (
          csv_upload_id, first_name, last_name, position, team,
          height, weight, age, college, experience,
          inside_scoring, jumpshot, three_p, handling, passing, quickness,
          post_d, perimeter_d, drive_d, stealing, blocking,
          oreb, dreb, jumping, strength, potential,
          salary1, salary2, salary3, salary4, salary5, salary6, salary7
        ) VALUES ?`,
        [playersWithId],
      );

      await connection.commit();

      res.status(201).json({
        message: 'CSV załadowany pomyślnie',
        season,
        playersCount: players.length,
      });
    } catch (error) {
      await connection.rollback();
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    } finally {
      connection.release();
    }
  },
);

// GET /csv/file/:filename — zwraca surowy plik CSV jako tekst (admin/komisz)
router.get(
  '/file/:filename',
  requireRole('admin', 'komisz'),
  (req: AuthRequest, res: Response): void => {
    const filename = String(req.params['filename']);

    // Zabezpieczenie przed path traversal (np. "../../etc/passwd")
    if (filename.includes('..') || filename.includes('/')) {
      res.status(400).json({ message: 'Nieprawidłowa nazwa pliku' });
      return;
    }

    const csvDir = process.env.CSV_DIR || path.join(process.cwd(), 'uploads/csv');
    const filepath = path.join(csvDir, filename);

    if (!fs.existsSync(filepath)) {
      res.status(404).json({ message: 'Plik nie istnieje' });
      return;
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    fs.createReadStream(filepath).pipe(res);
  },
);

// GET /csv/players-full — gracze z wszystkimi atrybutami (z filtrami)
router.get('/players-full', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { team, fields } = req.query;

    // Określ które kolumny zwrócić na podstawie 'fields' parametru
    let columns: string;

    switch (fields) {
      case 'trade':
        // Trade machine: podstawowe + salary
        columns = `p.id, p.first_name as "firstName", p.last_name as "lastName",
                   p.team, p.position, p.salary1`;
        break;

      case 'attributes':
        // Porównanie: podstawowe + skills/attributes (bez height/weight/college/salary)
        columns = `p.id, p.first_name as "firstName", p.last_name as "lastName",
                   p.team, p.position,
                   p.inside_scoring, p.jumpshot, p.three_p, p.handling, p.passing, p.quickness,
                   p.post_d, p.perimeter_d, p.drive_d, p.stealing, p.blocking,
                   p.oreb, p.dreb, p.jumping, p.strength, p.potential`;
        break;

      case 'all':
      default:
        // Wszystkie kolumny
        columns = `p.id, p.first_name as "firstName", p.last_name as "lastName",
                   p.position, p.team, p.height, p.weight, p.age, p.college, p.experience,
                   p.inside_scoring, p.jumpshot, p.three_p, p.handling, p.passing, p.quickness,
                   p.post_d, p.perimeter_d, p.drive_d, p.stealing, p.blocking,
                   p.oreb, p.dreb, p.jumping, p.strength, p.potential,
                   p.salary1, p.salary2, p.salary3, p.salary4, p.salary5, p.salary6, p.salary7`;
        break;
    }

    // Build query z optional team filter
    let query = `
      SELECT ${columns}
      FROM players p
      JOIN csv_uploads c ON p.csv_upload_id = c.id
      WHERE c.is_active = true
    `;
    const params: any[] = [];

    if (team) {
      query += ' AND p.team = ?';
      params.push(team);
    }

    query += ' ORDER BY p.team, p.position, p.last_name, p.first_name';

    const [rows] = await pool.execute(query, params);

    // Type casting na podstawie fields parametru
    let typedRows: Player[] | PlayerTrade[] | PlayerAttributes[] | PlayerFull[];
    switch (fields) {
      case 'trade':
        typedRows = rows as PlayerTrade[];
        break;
      case 'attributes':
        typedRows = rows as PlayerAttributes[];
        break;
      default:
        typedRows = rows as PlayerFull[];
    }

    res.json(typedRows);

  } catch (error) {
    console.error('Error fetching players-full:', error);
    res.status(500).json({ message: 'Błąd pobierania danych graczy' });
  }
});

// GET /csv/team-salary/:team — suma pensji dla zespołu (wszystkie lata lub wybrany rok)
router.get('/team-salary/:team', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const team = req.params.team;
    const year = req.query.year as string; // optional: 1-7

    if (!team) {
      res.status(400).json({ message: 'Podaj nazwę zespołu' });
      return;
    }

    if (year) {
      // Konkretny rok kontraktu
      const yearNum = parseInt(year);
      if (yearNum < 1 || yearNum > 7) {
        res.status(400).json({ message: 'Rok kontraktu musi być 1-7' });
        return;
      }

      const [rows]: any = await pool.execute(`
        SELECT
          p.team,
          SUM(p.salary${yearNum}) as totalSalary,
          COUNT(*) as playerCount,
          ${yearNum} as contractYear
        FROM players p
        JOIN csv_uploads c ON p.csv_upload_id = c.id
        WHERE c.is_active = true AND p.team = ?
        GROUP BY p.team
      `, [team]);

      const result: TeamSalarySingleYear = rows[0] || {
        team,
        totalSalary: 0,
        playerCount: 0,
        contractYear: yearNum
      };
      res.json(result);

    } else {
      // Wszystkie lata kontraktu
      const [rows]: any = await pool.execute(`
        SELECT
          p.team,
          SUM(p.salary1) as salary1Total,
          SUM(p.salary2) as salary2Total,
          SUM(p.salary3) as salary3Total,
          SUM(p.salary4) as salary4Total,
          SUM(p.salary5) as salary5Total,
          SUM(p.salary6) as salary6Total,
          SUM(p.salary7) as salary7Total,
          COUNT(*) as playerCount
        FROM players p
        JOIN csv_uploads c ON p.csv_upload_id = c.id
        WHERE c.is_active = true AND p.team = ?
        GROUP BY p.team
      `, [team]);

      const result: TeamSalaryAllYears = rows[0] || {
        team,
        salary1Total: 0, salary2Total: 0, salary3Total: 0, salary4Total: 0,
        salary5Total: 0, salary6Total: 0, salary7Total: 0,
        playerCount: 0
      };
      res.json(result);
    }

  } catch (error) {
    console.error('Error fetching team salary:', error);
    res.status(500).json({ message: 'Błąd pobierania salary zespołu' });
  }
});

export default router;
