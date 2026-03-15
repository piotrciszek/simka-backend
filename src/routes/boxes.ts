import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

const BOXES_DIR = (process.env.BOXES_DIR || path.join(process.cwd(), 'uploads/boxes')).replace(
  /\\/g,
  '/',
);
const PBP_DIR = process.env.PBP_DIR || path.join(process.cwd(), 'uploads/pbp');

router.get('/test', (req, res) => {
  res.json({ ok: true });
});
// GET /boxes/day/:day — pobierz wyniki dnia
router.get(
  '/day/:day',
  authenticate,
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const day = parseInt(req.params['day'] as string);

    if (isNaN(day) || day < 1 || day > 200) {
      res.status(400).json({ message: 'Nieprawidłowy numer dnia' });
      return;
    }

    const games: any[] = [];
    let gameNum = 1;

    // Sprawdzaj pliki po kolei aż braknie
    while (gameNum <= 14) {
      const filepath = path.join(BOXES_DIR, `${day}-${gameNum}.html`).replace(/\\/g, '/');

      if (!fs.existsSync(filepath)) break;

      try {
        const html = fs.readFileSync(filepath, 'utf-8');
        const $ = cheerio.load(html);
        const teams: { name: string; score: string }[] = [];

        $('table tr').each((i, row) => {
          if (teams.length >= 2) return; // stop po znalezieniu 2 drużyn
          const cells = $(row).find('td font');
          if (cells.length >= 2) {
            const name = $(cells[0]).text().trim();
            const score = $(cells[cells.length - 1])
              .text()
              .trim();
            if (name && score && /^\d+$/.test(score)) {
              teams.push({ name, score });
            }
          }
        });

        if (teams.length === 2) {
          games.push({
            gameNum,
            away: teams[0],
            home: teams[1],
          });
        }
      } catch (e) {
        console.error(`Błąd parsowania ${day}-${gameNum}.html`, e);
      }
      gameNum++;
    }

    if (games.length === 0) {
      res.status(404).json({ message: `Brak plików dla dnia ${day}` });
      return;
    }

    res.json({ day, games });
  },
);

export default router;
