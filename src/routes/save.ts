import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const SAVE_DIR = process.env.SAVE_DIR || path.join(process.cwd(), 'uploads/save');

router.get('/files', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!fs.existsSync(SAVE_DIR)) {
      res.json([]);
      return;
    }

    const items = fs
      .readdirSync(SAVE_DIR)
      .map(f => {
        const stat = fs.statSync(path.join(SAVE_DIR, f));
        return {
          filename: f,
          size: stat.isDirectory() ? null : stat.size,
          modifiedAt: stat.mtime,
          isDirectory: stat.isDirectory(),
        };
      })
      .sort((a, b) => {
        // foldery pierwsze
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return b.modifiedAt.getTime() - a.modifiedAt.getTime();
      });

    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

export default router;
