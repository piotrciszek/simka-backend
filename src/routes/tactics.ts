import { Router, Response } from 'express';
import pool from '../config/db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET /tactics/team/:teamId — pobierz taktykę drużyny
router.get('/team/:teamId', async (req: AuthRequest, res: Response): Promise<void> => {
  const teamId = parseInt(req.params['teamId'] as string);

  try {
    // Sprawdź czy user ma dostęp do tej drużyny
    const [teamRows]: any = await pool.query('SELECT id, user_id FROM teams WHERE id = ?', [
      teamId,
    ]);

    if (teamRows.length === 0) {
      res.status(404).json({ message: 'Drużyna nie istnieje' });
      return;
    }

    if (
      (req.user!.role === 'user' || req.user!.role === 'komisz') &&
      teamRows[0].user_id !== req.user!.id
    ) {
      res.status(403).json({ message: 'Brak uprawnień' });
      return;
    }

    const [rows]: any = await pool.query(
      `SELECT t.id, t.team_id, t.status, t.version,
              t.data_draft as "dataDraft",
              t.data_pending as "dataPending", 
              t.data_approved as "dataApproved",
              t.submitted_at as "submittedAt",
              t.approved_at as "approvedAt",
              u.username as "approvedBy"
      FROM tactics t
      LEFT JOIN users u ON t.approved_by = u.id
      WHERE t.team_id = ?`,
      [teamId],
    );

    if (rows.length === 0) {
      res.status(404).json({ message: 'Brak taktyki dla tej drużyny' });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// POST /tactics/team/:teamId — utwórz taktykę dla drużyny (admin, komisz)
router.post(
  '/team/:teamId',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const teamId = parseInt(req.params['teamId'] as string);

    try {
      const [teamRows]: any = await pool.query('SELECT id FROM teams WHERE id = ?', [teamId]);

      if (teamRows.length === 0) {
        res.status(404).json({ message: 'Drużyna nie istnieje' });
        return;
      }

      const [existing]: any = await pool.query('SELECT id FROM tactics WHERE team_id = ?', [
        teamId,
      ]);

      if (existing.length > 0) {
        res.status(409).json({ message: 'Taktyka dla tej drużyny już istnieje' });
        return;
      }

      const [result]: any = await pool.query(
        'INSERT INTO tactics (team_id, status, version) VALUES (?, "draft", 0)',
        [teamId],
      );

      res.status(201).json({
        message: 'Taktyka utworzona',
        id: result.insertId,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// PUT /tactics/:id/draft — zapisz draft taktyki (właściciel drużyny)
router.put('/:id/draft', async (req: AuthRequest, res: Response): Promise<void> => {
  const tacticId = parseInt(req.params['id'] as string);
  const { data } = req.body;

  if (!data) {
    res.status(400).json({ message: 'Brak danych taktyki' });
    return;
  }

  try {
    const [rows]: any = await pool.query(
      `SELECT t.id, t.status, t.version, tm.user_id 
       FROM tactics t
       JOIN teams tm ON t.team_id = tm.id
       WHERE t.id = ?`,
      [tacticId],
    );

    if (rows.length === 0) {
      res.status(404).json({ message: 'Taktyka nie istnieje' });
      return;
    }

    const tactic = rows[0];

    // Tylko właściciel drużyny może edytować draft
    if (
      (req.user!.role === 'user' || req.user!.role === 'komisz') &&
      tactic.user_id !== req.user!.id
    ) {
      res.status(403).json({ message: 'Brak uprawnień' });
      return;
    }

    await pool.query(
      `UPDATE tactics 
       SET data_draft = ?, version = version + 1, status = 'draft'
       WHERE id = ?`,
      [JSON.stringify(data), tacticId],
    );

    res.json({ message: 'Draft zapisany', version: tactic.version + 1 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// PUT /tactics/:id/submit — wyślij taktykę do zatwierdzenia
router.put('/:id/submit', async (req: AuthRequest, res: Response): Promise<void> => {
  const tacticId = parseInt(req.params['id'] as string);

  try {
    const [rows]: any = await pool.query(
      `SELECT t.id, t.status, t.data_draft, t.version, tm.user_id 
       FROM tactics t
       JOIN teams tm ON t.team_id = tm.id
       WHERE t.id = ?`,
      [tacticId],
    );

    if (rows.length === 0) {
      res.status(404).json({ message: 'Taktyka nie istnieje' });
      return;
    }

    const tactic = rows[0];

    if (
      (req.user!.role === 'user' || req.user!.role === 'komisz') &&
      tactic.user_id !== req.user!.id
    ) {
      res.status(403).json({ message: 'Brak uprawnień' });
      return;
    }

    if (!tactic.data_draft) {
      res.status(400).json({ message: 'Brak draftu do wysłania' });
      return;
    }

    await pool.query(
      `UPDATE tactics 
       SET data_pending = data_draft,
           status = 'pending',
           submitted_at = NOW()
       WHERE id = ?`,
      [tacticId],
    );

    res.json({ message: 'Taktyka wysłana do zatwierdzenia' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// PUT /tactics/:id/review — komisz otwiera taktykę do review
router.put(
  '/:id/review',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const tacticId = parseInt(req.params['id'] as string);

    try {
      const [rows]: any = await pool.query(
        'SELECT id, status, version, data_pending FROM tactics WHERE id = ?',
        [tacticId],
      );

      if (rows.length === 0) {
        res.status(404).json({ message: 'Taktyka nie istnieje' });
        return;
      }

      if (rows[0].status !== 'pending') {
        res.status(400).json({ message: 'Taktyka nie czeka na zatwierdzenie' });
        return;
      }

      // Zapisujemy wersję którą komisz otworzył
      await pool.query('UPDATE tactics SET mod_opened_version = ? WHERE id = ?', [
        rows[0].version,
        tacticId,
      ]);

      res.json({
        message: 'Taktyka otwarta do review',
        tactic: rows[0],
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// PUT /tactics/:id/approve — komisz zatwierdza taktykę
router.put(
  '/:id/approve',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const tacticId = parseInt(req.params['id'] as string);

    try {
      const [rows]: any = await pool.query(
        'SELECT id, status, version, mod_opened_version, data_pending FROM tactics WHERE id = ?',
        [tacticId],
      );

      if (rows.length === 0) {
        res.status(404).json({ message: 'Taktyka nie istnieje' });
        return;
      }

      const tactic = rows[0];

      if (tactic.status !== 'pending') {
        res.status(400).json({ message: 'Taktyka nie czeka na zatwierdzenie' });
        return;
      }

      // Race condition check
      if (tactic.version !== tactic.mod_opened_version) {
        res.status(409).json({
          message: 'Taktyka zmieniła się od momentu otwarcia — sprawdź nową wersję',
          current_version: tactic.version,
          opened_version: tactic.mod_opened_version,
          data_pending: tactic.data_pending,
        });
        return;
      }

      await pool.query(
        `UPDATE tactics 
       SET data_approved = data_pending,
           status = 'approved',
           approved_at = NOW(),
           approved_by = ?
       WHERE id = ?`,
        [req.user!.id, tacticId],
      );

      res.json({ message: 'Taktyka zatwierdzona' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// GET /tactics/pending — lista taktyk czekających na zatwierdzenie i juz zatwierdzonych (admin, komisz)
router.get(
  '/pending',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const [rows]: any = await pool.query(
        `SELECT t.id, t.status, t.version, 
              t.submitted_at as "submittedAt",
              t.approved_at as "approvedAt",
              t.data_pending as "dataPending",
              t.data_approved as "dataApproved",
              tm.name as "teamName",
              tm.logo_path as "logoPath",
              u.username as "ownerUsername",
              ua.username as "approvedBy"
      FROM tactics t
      JOIN teams tm ON t.team_id = tm.id
      LEFT JOIN users u ON tm.user_id = u.id
      LEFT JOIN users ua ON t.approved_by = ua.id
      ORDER BY 
        CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END,
        t.submitted_at DESC`,
      );

      res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// GET /tactics/all-lineups — lista wszystkich drużyn z ich aktualną taktyką (wszyscy zalogowani)
router.get('/all-lineups', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows]: any = await pool.query(
      `SELECT t.id, t.name as teamName, t.logo_path,
              tac.data_approved, tac.data_pending,
              tac.status, tac.approved_at, tac.submitted_at
       FROM teams t
       LEFT JOIN tactics tac ON tac.team_id = t.id
       WHERE t.is_active = true
       ORDER BY t.name`,
    );

    const result = rows.map((row: any) => {
      // Zdecyduj które dane pokazac
      let data = null;
      let displayStatus = 'brak';

      const approved = row.data_approved ?? null;
      const pending = row.data_pending ?? null;

      if (approved && pending) {
        // Porownaj daty — nowszy wygrywa
        const approvedDate = new Date(row.approved_at || 0);
        const pendingDate = new Date(row.submitted_at || 0);
        if (pendingDate > approvedDate) {
          data = pending;
          displayStatus = 'pending';
        } else {
          data = approved;
          displayStatus = 'approved';
        }
      } else if (approved) {
        data = approved;
        displayStatus = 'approved';
      } else if (pending) {
        data = pending;
        displayStatus = 'pending';
      }

      return {
        teamId: row.id,
        teamName: row.teamName,
        logo_path: row.logo_path,
        displayStatus,
        data,
      };
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

export default router;
