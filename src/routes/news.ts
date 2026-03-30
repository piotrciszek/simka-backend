import { Router, Response } from 'express';
import pool from '../config/db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /news — lista newsów
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows]: any = await pool.query(
      `SELECT n.id, n.title, n.content, n.created_at,
              u.username as author
       FROM news n
       JOIN users u ON n.author_id = u.id
       ORDER BY n.created_at DESC`,
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

// POST /news — dodaj news (admin, komisz)
router.post(
  '/',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { title, content } = req.body;

    if (!title || !content) {
      res.status(400).json({ message: 'Podaj tytuł i treść' });
      return;
    }

    try {
      const [result]: any = await pool.query(
        'INSERT INTO news (title, content, author_id) VALUES (?, ?, ?)',
        [title, content, req.user!.id],
      );
      res.status(201).json({ message: 'News dodany', id: result.insertId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

// DELETE /news/:id — usuń news (admin, komisz)
router.delete(
  '/:id',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const newsId = parseInt(req.params['id'] as string);

    if (isNaN(newsId) || newsId <= 0) {
      res.status(400).json({ message: 'Nieprawidłowe ID newsa' });
      return;
    }

    try {
      const [result]: any = await pool.query('DELETE FROM news WHERE id = ?', [newsId]);

      if (result.affectedRows === 0) {
        res.status(404).json({ message: 'News nie istnieje' });
        return;
      }

      res.json({ message: 'News usunięty' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd serwera' });
    }
  },
);

export default router;
