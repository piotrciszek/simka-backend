import { Router, Request, Response } from 'express';
import { getStandings } from '../services/standingsService';

// Publiczny router (bez authenticate) — tabela ligi jest widoczna także dla niezalogowanych,
// tak jak wcześniej divstand.htm. Rate limit jest dołożony przy montowaniu w app.ts.
const router = Router();

/**
 * @swagger
 * /api/standings:
 *   get:
 *     summary: Tabela ligi (konferencja → dywizja → drużyny) z L10
 *     description: Publiczny endpoint. Dane z ostatniego importu MDB (mdb_teams + mdb_schedule).
 *     tags: [Standings]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: season
 *         required: false
 *         schema:
 *           type: integer
 *           example: 2051
 *         description: Sezon; domyślnie najnowszy zaimportowany
 *     responses:
 *       200:
 *         description: Tabela ligi
 *       400:
 *         description: Nieprawidłowy parametr season
 *       404:
 *         description: Brak danych dla sezonu
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  let season: number | undefined;
  if (req.query.season !== undefined) {
    season = Number(req.query.season);
    if (!Number.isInteger(season) || season < 0 || season > 65535) {
      res.status(400).json({ message: 'Parametr season musi być liczbą całkowitą.' });
      return;
    }
  }

  try {
    const standings = await getStandings(season);
    if (!standings) {
      res.status(404).json({
        message: season
          ? `Brak danych tabeli dla sezonu ${season}.`
          : 'Brak danych tabeli — nie zaimportowano jeszcze żadnego sezonu.',
      });
      return;
    }
    res.json(standings);
  } catch (error) {
    console.error('Błąd pobierania tabeli ligi:', error);
    res.status(500).json({ message: 'Nie udało się pobrać tabeli ligi.' });
  }
});

export default router;
