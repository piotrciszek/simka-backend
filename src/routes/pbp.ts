import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const PBP_DIR = process.env.PBP_DIR || path.join(process.cwd(), 'uploads/pbp');

router.get('/files', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!fs.existsSync(PBP_DIR)) {
      res.json([]);
      return;
    }

    const files = fs
      .readdirSync(PBP_DIR)
      .filter(f => f.endsWith('.txt'))
      .map(f => ({
        filename: f,
        size: fs.statSync(path.join(PBP_DIR, f)).size,
        modifiedAt: fs.statSync(path.join(PBP_DIR, f)).mtime,
      }))
      .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

    res.json(files);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Błąd serwera' });
  }
});

export default router;
