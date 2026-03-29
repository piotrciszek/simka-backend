import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Parsuje param URL do liczby dodatniej, zwraca null jeśli nieprawidłowy
const parseId = (param: string | string[] | undefined): number | null => {
  const value = Array.isArray(param) ? param[0] : param;
  const id = parseInt(value ?? '', 10);
  return isNaN(id) || id <= 0 ? null : id;
};

// Wszystkie routes wymagają zalogowania
router.use(authenticate);

// GET /users/gm-list — lista GM-ów z przypisanymi drużynami (admin, komisz)
router.get('/gm-list', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows]: any = await pool.query(
      `SELECT t.name as teamName, t.logo_path, u.username, u.email
       FROM teams t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.is_active = true
       ORDER BY t.name`,
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// GET /users — lista userów (admin, komisz)
router.get(
  '/',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const [rows]: any = await pool.query(
        `SELECT u.id, u.username, u.email, u.role, u.is_active, u.must_change_password, u.created_at,
              t.id AS teamId, t.name AS teamName
       FROM users u
       LEFT JOIN teams t ON t.user_id = u.id
       ORDER BY u.role, u.username`,
      );
      res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// POST /users — tworzenie usera (tylko admin)
router.post('/', requireRole('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  const { username, password, email, role } = req.body;

  if (!username || !password || !role) {
    res.status(400).json({ message: 'Podaj username, hasło i rolę' });
    return;
  }

  if (!['admin', 'komisz', 'user'].includes(role)) {
    res.status(400).json({ message: 'Nieprawidłowa rola' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ message: 'Hasło musi mieć minimum 8 znaków' });
    return;
  }

  try {
    const [existing]: any = await pool.query('SELECT id FROM users WHERE username = ?', [username]);

    if (existing.length > 0) {
      res.status(409).json({ message: 'Użytkownik o tej nazwie już istnieje' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result]: any = await pool.query(
      `INSERT INTO users (username, password_hash, email, role, must_change_password, created_by)
       VALUES (?, ?, ?, ?, true, ?)`,
      [username, passwordHash, email || null, role, req.user!.id],
    );

    res.status(201).json({
      message: 'Użytkownik utworzony',
      id: result.insertId,
      username,
      role,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// PUT /users/:id/reset-password — reset hasła (admin, komisz)
router.put(
  '/:id/reset-password',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { newPassword } = req.body;
    const userId = parseId(req.params['id']);
    if (userId === null) {
      res.status(400).json({ message: 'Nieprawidłowe ID użytkownika' });
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ message: 'Hasło musi mieć minimum 8 znaków' });
      return;
    }

    try {
      const [rows]: any = await pool.query('SELECT id, role FROM users WHERE id = ?', [userId]);

      if (rows.length === 0) {
        res.status(404).json({ message: 'Użytkownik nie istnieje' });
        return;
      }

      // Komisz nie może resetować hasła adminowi
      if (req.user!.role === 'komisz' && rows[0].role === 'admin') {
        res.status(403).json({ message: 'Brak uprawnień' });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);

      await pool.query(
        'UPDATE users SET password_hash = ?, must_change_password = true WHERE id = ?',
        [passwordHash, userId],
      );

      res.json({ message: 'Hasło zostało zresetowane' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// PUT /users/:id/toggle-active — blokowanie/odblokowanie usera (tylko admin)
router.put(
  '/:id/toggle-active',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = parseId(req.params['id']);
    if (userId === null) {
      res.status(400).json({ message: 'Nieprawidłowe ID użytkownika' });
      return;
    }

    if (userId === req.user!.id) {
      res.status(400).json({ message: 'Nie możesz zablokować własnego konta' });
      return;
    }

    try {
      const [rows]: any = await pool.query('SELECT id, role, is_active FROM users WHERE id = ?', [
        userId,
      ]);

      if (rows.length === 0) {
        res.status(404).json({ message: 'Użytkownik nie istnieje' });
        return;
      }

      // Komisz nie może blokować admina
      if (req.user!.role === 'komisz' && rows[0].role === 'admin') {
        res.status(403).json({ message: 'Brak uprawnień' });
        return;
      }

      const newStatus = !rows[0].is_active;

      await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, userId]);

      // Przy blokowaniu odepnij drużynę
      if (!newStatus) {
        await pool.query('UPDATE teams SET user_id = NULL WHERE user_id = ?', [userId]);
      }

      res.json({
        message: newStatus ? 'Użytkownik odblokowany' : 'Użytkownik zablokowany',
        is_active: newStatus,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// PUT /users/:id/role — zmiana roli (admin i komisz)
router.put(
  '/:id/role',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = parseId(req.params['id']);
    if (userId === null) {
      res.status(400).json({ message: 'Nieprawidłowe ID użytkownika' });
      return;
    }
    const { role } = req.body;

    if (!['admin', 'komisz', 'user'].includes(role)) {
      res.status(400).json({ message: 'Nieprawidłowa rola' });
      return;
    }

    if (userId === req.user!.id) {
      res.status(400).json({ message: 'Nie możesz zmienić własnej roli' });
      return;
    }

    // Komisz nie może nadawać roli admin
    if (req.user!.role === 'komisz' && role === 'admin') {
      res.status(403).json({ message: 'Brak uprawnień' });
      return;
    }

    try {
      await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
      res.json({ message: 'Rola zmieniona' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// PUT /users/:id/team — przypisanie drużyny (admin i komisz)
router.put(
  '/:id/team',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = parseId(req.params['id']);
    if (userId === null) {
      res.status(400).json({ message: 'Nieprawidłowe ID użytkownika' });
      return;
    }
    const { teamId } = req.body;

    try {
      // Odepnij usera od poprzedniej drużyny
      await pool.query('UPDATE teams SET user_id = NULL WHERE user_id = ?', [userId]);
      // Przypisz nową drużynę (lub zostaw null)
      if (teamId !== null) {
        await pool.query('UPDATE teams SET user_id = ? WHERE id = ?', [userId, teamId]);
      }
      res.json({ message: 'Drużyna przypisana' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// PUT /users/:id/email — zmiana emaila (tylko zalogowany użytkownik)
router.put('/:id/email', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = parseId(req.params['id']);
  if (userId === null) {
    res.status(400).json({ message: 'Nieprawidłowe ID użytkownika' });
    return;
  }
  const { email } = req.body;

  // Użytkownik może zmieniać tylko swój email
  if (userId !== req.user!.id) {
    res.status(403).json({ message: 'Brak uprawnień' });
    return;
  }

  try {
    await pool.query('UPDATE users SET email = ? WHERE id = ?', [email || null, userId]);
    res.json({ message: 'Email zaktualizowany' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// DELETE /users/:id — usuwanie usera (tylko admin)
router.delete(
  '/:id',
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = parseId(req.params['id']);
    if (userId === null) {
      res.status(400).json({ message: 'Nieprawidłowe ID użytkownika' });
      return;
    }

    if (userId === req.user!.id) {
      res.status(400).json({ message: 'Nie możesz usunąć własnego konta' });
      return;
    }

    try {
      await pool.query('UPDATE teams SET user_id = NULL WHERE user_id = ?', [userId]);
      await pool.query('DELETE FROM users WHERE id = ?', [userId]);
      res.json({ message: 'Użytkownik usunięty' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

export default router;
