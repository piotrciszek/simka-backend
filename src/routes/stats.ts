import { Router, Response } from 'express';
import pool from '../config/db';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import path from 'path';
import fs from 'fs';
import {
  PlayerStat,
  ScorerRanking,
  StatsFilters,
  PlayerComparison,
  PlayerListItem
} from '../types/stats';
import { parseCsvFile } from '../utils/csvParser';
import { calculatePlayerStats } from '../utils/basketballStats';
import { savePlayerStats } from '../services/playerStatsService';
import {
  buildStatsQuery,
  buildPlayerComparisonQuery,
  buildScorersRankingQuery,
  ADVANCED_STATS_COLUMNS,
  BASIC_STATS_COLUMNS
} from '../utils/statsQueries';

const router = Router();
router.use(authenticate);

// Simple test endpoint (no database queries)
router.get('/test', async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({
    message: 'Stats API is working!',
    user: req.user?.username,
    timestamp: new Date().toISOString()
  });
});

// GET /stats/advanced - Get advanced stats with optional filters
router.get('/advanced', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filters = req.query as any as StatsFilters;
    const { query, params } = buildStatsQuery(ADVANCED_STATS_COLUMNS, filters);

    const [rows] = await pool.execute(query, params);
    res.json(rows as PlayerStat[]);
  } catch (error) {
    console.error('Error fetching advanced stats:', error);
    res.status(500).json({ message: 'Błąd pobierania statystyk' });
  }
});

// GET /stats/summary - Get summary stats (for advanced-stats component)
router.get('/summary', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { season } = req.query;
    const filters: StatsFilters = season ? { season: season as string } : {};
    const { query, params } = buildStatsQuery(BASIC_STATS_COLUMNS, filters);

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching summary stats:', error);
    res.status(500).json({ message: 'Błąd pobierania statystyk' });
  }
});

// GET /stats/compare - Compare two players
router.get('/compare', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { players } = req.query;

    if (!players || typeof players !== 'string') {
      res.status(400).json({ message: 'Podaj parametr players (np. players=Player1,Player2)' });
      return;
    }

    const playerNames = players.split(',').map(name => name.trim());

    if (playerNames.length !== 2) {
      res.status(400).json({ message: 'Podaj dokładnie 2 graczy oddzielonych przecinkiem' });
      return;
    }

    const { query, params } = buildPlayerComparisonQuery(playerNames);
    const [rows] = await pool.execute(query, params);
    const players_data = rows as PlayerStat[];

    if (players_data.length !== 2) {
      res.status(404).json({
        message: 'Nie znaleziono jednego lub obu graczy',
        found: players_data.map(p => p.Name)
      });
      return;
    }

    res.json({
      leftPlayer: players_data[0],
      rightPlayer: players_data[1]
    } as PlayerComparison);
  } catch (error) {
    console.error('Error comparing players:', error);
    res.status(500).json({ message: 'Błąd porównywania graczy' });
  }
});

// GET /stats/rankings/scorers - Get scorers ranking
router.get('/rankings/scorers', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { minFGA = 5, season } = req.query;
    const { query, params } = buildScorersRankingQuery(Number(minFGA), season as string);

    const [rows] = await pool.execute(query, params);
    const rankings = (rows as any[]).map((player, index) => ({
      rank: index + 1,
      name: player.name,
      ts: Number(player.ts).toFixed(1),
      efg: Number(player.efg).toFixed(1),
      fga: Number(player.fga).toFixed(1),
      shooterScore: Number(player.shooterScore).toFixed(3)
    }));

    res.json(rankings as ScorerRanking[]);
  } catch (error) {
    console.error('Error fetching scorers ranking:', error);
    res.status(500).json({ message: 'Błąd pobierania rankingu' });
  }
});

// GET /stats/players - Get list of all players (for dropdowns)
router.get('/players', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = `
      SELECT DISTINCT
        ps.player_name as Name,
        ps.team as Team,
        'N/A' as Position
      FROM player_stats ps
      JOIN csv_uploads cu ON ps.csv_upload_id = cu.id
      WHERE cu.is_active = 1
      ORDER BY ps.player_name
    `;

    const [rows] = await pool.execute(query);
    res.json(rows as PlayerListItem[]);
  } catch (error) {
    console.error('Error fetching players list:', error);
    res.status(500).json({ message: 'Błąd pobierania listy graczy' });
  }
});

// GET /stats/files - Lista plików CSV ze statystykami (admin/komisz)
router.get(
  '/files',
  requireRole('admin', 'komisz'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const statsDir = process.env.STATS_DIR || path.join(__dirname, '../../uploads/stats');

      if (!fs.existsSync(statsDir)) {
        res.json([]);
        return;
      }

      const items = fs
        .readdirSync(statsDir)
        .filter(f => f.endsWith('.csv')) // Tylko pliki CSV
        .map(f => {
          const stat = fs.statSync(path.join(statsDir, f));
          return {
            filename: f,
            size: stat.size,
            modifiedAt: stat.mtime,
          };
        })
        .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime()); // Najnowsze pierwsze

      res.json(items);
    } catch (error) {
      console.error('Error reading stats directory:', error);
      res.status(500).json({ message: 'Błąd odczytu folderu ze statystykami' });
    }
  }
);

// POST /stats/generate-from-file - Generate player stats from stats CSV file
router.post('/generate-from-file', requireRole('admin', 'komisz'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { filename, season, csvUploadId } = req.body;

    if (!filename || !season) {
      res.status(400).json({ message: 'Podaj filename i season' });
      return;
    }

    // Parsowanie CSV
    const statsDir = process.env.STATS_DIR || path.join(__dirname, '../../uploads/stats');
    const csvFilePath = path.join(statsDir, filename);

    const rawStatsRows = await parseCsvFile(csvFilePath);

    if (rawStatsRows.length === 0) {
      res.status(400).json({ message: 'CSV jest pusty lub brak prawidłowych danych' });
      return;
    }

    // Obliczanie statystyk dla każdego gracza
    const calculatedStats = rawStatsRows.map(row => calculatePlayerStats(row));

    // Zapis do bazy
    const processedPlayers = await savePlayerStats(calculatedStats, {
      season,
      csvUploadId: csvUploadId || 0,
      sourceFile: filename,
      sourceType: 'csv'
    });

    res.json({
      message: `Statystyki wygenerowane pomyślnie`,
      playersProcessed: processedPlayers,
      statsGenerated: calculatedStats.length
    });

  } catch (error) {
    console.error('Error generating stats:', error);
    res.status(500).json({
      message: 'Błąd generowania statystyk',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;