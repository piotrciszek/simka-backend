import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

const BOXES_DIR = (process.env.BOXES_DIR || path.join(process.cwd(), 'uploads/boxes')).replace(
  /\\/g,
  '/',
);
const PBP_DIR = process.env.PBP_DIR || path.join(process.cwd(), 'uploads/pbp');

router.get('/test', authenticate, (req, res) => {
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

    // All-Star Weekend
    if (day === 60) {
      const allStarFiles = [
        { filename: 'rookiegame.html', gameNum: 1 },
        { filename: 'allstar.html', gameNum: 2 },
      ];

      for (const { filename, gameNum } of allStarFiles) {
        const filepath = path.join(BOXES_DIR, filename).replace(/\\/g, '/');
        if (!fs.existsSync(filepath)) continue;

        try {
          const html = fs.readFileSync(filepath, 'utf-8');
          const $ = cheerio.load(html);
          const teams: { name: string; score: string }[] = [];

          $('table tr').each((i, row) => {
            if (teams.length >= 2) return;
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
            games.push({ gameNum, filename, away: teams[0], home: teams[1] });
          }
        } catch (e) {
          console.error(`Błąd parsowania ${filename}`, e);
        }
      }

      res.json({ day, games });
      return;
    }
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

// GET /boxes/playoffs — pobierz wyniki serii playoffs
router.get(
  '/playoffs',
  authenticate,
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const htmlDir = process.env.HTML_DIR || path.join(process.cwd(), 'uploads/html');
    const filepath = path.join(htmlDir, 'playoffs.htm').replace(/\\/g, '/');

    if (!fs.existsSync(filepath)) {
      res.status(404).json({ message: 'Brak pliku playoffs.htm' });
      return;
    }

    try {
      const raw = fs.readFileSync(filepath);
      const html = iconv.decode(raw, 'win1250');
      const $ = cheerio.load(html);

      const allNames: string[] = [];
      const allWins: string[] = [];

      $('table[width="100"]').each((i, table) => {
        const link = $(table).find('a');
        if (link.length) allNames.push(link.text().trim());
      });

      $('table[width="20"]').each((i, table) => {
        const val = $(table).find('font').text().trim();
        if (/^\d+$/.test(val)) allWins.push(val);
      });

      const p = (ni: number, wi: number) => ({
        team1: allNames[ni] ?? '',
        wins1: allWins[wi] ?? '0',
        team2: allNames[ni + 1] ?? '',
        wins2: allWins[wi + 1] ?? '0',
      });

      const R1_SEEDS = ['#1/#8', '#4/#5', '#2/#7', '#3/#6'];
      const round1West = [p(0, 0), p(8, 8), p(18, 18), p(27, 26)].map((p, i) => ({
        ...p,
        seeds: R1_SEEDS[i],
        conference: 'West',
      }));
      const round1East = [p(2, 2), p(10, 10), p(20, 20), p(29, 28)].map((p, i) => ({
        ...p,
        seeds: R1_SEEDS[i],
        conference: 'East',
      }));
      const round2West = [p(4, 4), p(22, 22)].map(p => ({ ...p, conference: 'West' }));
      const round2East = [p(6, 6), p(24, 24)].map(p => ({ ...p, conference: 'East' }));
      const confFinalsWest = [{ ...p(12, 12), conference: 'West' }];
      const confFinalsEast = [{ ...p(14, 14), conference: 'East' }];
      const finals = [p(16, 16)];

      res.json({
        round1: { west: round1West, east: round1East },
        round2: { west: round2West, east: round2East },
        confFinals: { west: confFinalsWest, east: confFinalsEast },
        finals,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Błąd parsowania playoffs.htm' });
    }
  },
);

export default router;
