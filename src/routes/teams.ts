import { Router, Response } from 'express';
import pool from '../config/db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET /teams — lista drużyn
// admin/komisz widzi wszystkie, user widzi tylko swoje
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let rows: any;

    if (req.user!.role === 'user') {
      [rows] = await pool.query(
        `SELECT t.id, t.name, t.csv_team_name as "csvTeamName", t.logo_path, t.is_active, t.created_at,
                u.username as owner_username
        FROM teams t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.user_id = ?
        ORDER BY t.name`,
        [req.user!.id],
      );
    } else {
      [rows] = await pool.query(
        `SELECT t.id, t.name, t.csv_team_name as "csvTeamName", t.logo_path, t.is_active, t.created_at,
                u.username as owner_username
         FROM teams t
         LEFT JOIN users u ON t.user_id = u.id
         ORDER BY u.username, t.name`,
      );
    }

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// GET /teams/:id — szczegóły drużyny
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const teamId = parseInt(req.params['id'] as string);

  try {
    const [rows]: any = await pool.query(
      `SELECT t.id, t.name, t.csv_team_name as "csvTeamName", t.logo_path, t.is_active, t.created_at,
              t.user_id, u.username as owner_username
       FROM teams t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.id = ?`,
      [teamId],
    );

    if (rows.length === 0) {
      res.status(404).json({ message: 'Drużyna nie istnieje' });
      return;
    }

    const team = rows[0];

    // User może widzieć tylko swoją drużynę
    if (req.user!.role === 'user' && team.user_id !== req.user!.id) {
      res.status(403).json({ message: 'Brak uprawnień' });
      return;
    }

    res.json(team);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// POST /teams — tworzenie drużyny (admin, komisz)
router.post(
  '/',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { name, user_id } = req.body;

    if (!name) {
      res.status(400).json({ message: 'Podaj nazwę drużyny' });
      return;
    }

    try {
      // Sprawdź czy user istnieje (jeśli podany)
      if (user_id) {
        const [userRows]: any = await pool.query(
          'SELECT id FROM users WHERE id = ? AND is_active = true',
          [user_id],
        );
        if (userRows.length === 0) {
          res.status(404).json({ message: 'Użytkownik nie istnieje' });
          return;
        }
      }

      const [result]: any = await pool.query('INSERT INTO teams (name, user_id) VALUES (?, ?)', [
        name,
        user_id || null,
      ]);

      res.status(201).json({
        message: 'Drużyna utworzona',
        id: result.insertId,
        name,
        user_id: user_id || null,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// PUT /teams/:id — edycja drużyny (admin, komisz)
router.put(
  '/:id',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const teamId = parseInt(req.params['id'] as string);
    const { name, user_id, is_active } = req.body;

    try {
      const [rows]: any = await pool.query('SELECT id FROM teams WHERE id = ?', [teamId]);

      if (rows.length === 0) {
        res.status(404).json({ message: 'Drużyna nie istnieje' });
        return;
      }

      await pool.query(
        `UPDATE teams 
       SET name = COALESCE(?, name),
           user_id = COALESCE(?, user_id),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
        [name || null, user_id || null, is_active ?? null, teamId],
      );

      res.json({ message: 'Drużyna zaktualizowana' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

export default router;
