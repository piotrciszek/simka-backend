import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /auth/login
router.post('/login', async (req, res): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ message: 'Podaj login i hasło' });
    return;
  }

  try {
    // tylko potrzebne kolumny
    const [rows]: any = await pool.query(
      'SELECT id, username, role, password_hash, must_change_password FROM users WHERE username = ? AND is_active = true',
      [username],
    );

    const user = rows[0];

    if (!user) {
      res.status(401).json({ message: 'Nieprawidłowy login lub hasło' });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      res.status(401).json({ message: 'Nieprawidłowy login lub hasło' });
      return;
    }

    // Zapis aktywności, req.ip działa poprawnie dzięki "trust proxy" ustawionemu w app.ts
    const ip = req.ip ?? 'unknown';
    await pool.query('INSERT INTO user_activity (user_id, ip_address) VALUES (?, ?)', [
      user.id,
      ip,
    ]);

    const secret = process.env.JWT_SECRET as string;
    const expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'];
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, secret, {
      expiresIn,
    });

    res.json({
      token,
      mustChangePassword: user.must_change_password,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// POST /auth/change-password
router.post(
  '/change-password',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: 'Podaj aktualne i nowe hasło' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ message: 'Nowe hasło musi mieć minimum 8 znaków' });
      return;
    }

    try {
      // Potrzebujemy tylko hash hasła do weryfikacji
      const [rows]: any = await pool.query('SELECT password_hash FROM users WHERE id = ?', [
        req.user!.id,
      ]);

      const user = rows[0];
      const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);

      if (!passwordMatch) {
        res.status(401).json({ message: 'Aktualne hasło jest nieprawidłowe' });
        return;
      }

      const newHash = await bcrypt.hash(newPassword, 12);

      await pool.query(
        'UPDATE users SET password_hash = ?, must_change_password = false WHERE id = ?',
        [newHash, req.user!.id],
      );

      res.json({ message: 'Hasło zostało zmienione' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// GET /auth/activity - admin i komisz
router.get('/activity', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'komisz') {
    res.status(403).json({ message: 'Brak dostępu' });
    return;
  }

  try {
    const [rows]: any = await pool.query(`
      SELECT 
        u.id,
        u.username,
        t.name AS teamName,
        t.logo_path AS teamLogo,
        ua.ip_address AS ipAddress,
        ua.logged_at AS loggedAt
      FROM users u
      LEFT JOIN teams t ON t.user_id = u.id
      LEFT JOIN user_activity ua ON ua.id = (
        SELECT id FROM user_activity
        WHERE user_id = u.id
        ORDER BY logged_at DESC
        LIMIT 1
      )
      ORDER BY ua.logged_at IS NULL, ua.logged_at DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

export default router;
