import type { RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';
import type {
  ConferenceStandings,
  StandingsResponse,
  TeamStanding,
  WinLoss,
} from '../types/standings';

// Typy wierszy z zapytań — RowDataPacket pozwala przekazać je do pool.execute<...>() bez `any`.
// DECIMAL i SUM() mysql2 zwraca jako string, dlatego część pól ma typ string | number.
interface TeamRow extends RowDataPacket {
  teamId: number;
  city: string;
  name: string;
  conference: string;
  division: string;
  divRank: number;
  confRank: number;
  homeWins: number;
  homeLosses: number;
  roadWins: number;
  roadLosses: number;
  winPct: string;
  gb: string;
  confGb: string;
  streak: number;
}

interface Last10Row extends RowDataPacket {
  teamId: number;
  wins: string;
  losses: string;
}

const NO_GAMES: WinLoss = { wins: 0, losses: 0 };

async function findLatestSeason(): Promise<number | null> {
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT MAX(season) AS season FROM mdb_teams');
  return rows[0]?.season ?? null;
}

// Bilans ostatnich 10 rozegranych meczów każdej drużyny (mecz rozegrany: BoxName <> 'N/A')
async function findLast10(season: number): Promise<Map<number, WinLoss>> {
  const [rows] = await pool.execute<Last10Row[]>(
    `WITH team_games AS (
       -- Każdy mecz jako dwa wiersze: z perspektywy gospodarza i gościa
       SELECT home_team_id AS team_id, Day, HomeScore > AwayScore AS won
       FROM mdb_schedule WHERE season = ? AND BoxName <> 'N/A'
       UNION ALL
       SELECT away_team_id, Day, AwayScore > HomeScore
       FROM mdb_schedule WHERE season = ? AND BoxName <> 'N/A'
     ),
     ranked AS (
       -- Numerujemy mecze każdej drużyny od najnowszego (rn = 1 to ostatni mecz)
       SELECT team_id, won, ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY Day DESC) AS rn
       FROM team_games
     )
     SELECT team_id AS teamId, SUM(won) AS wins, COUNT(*) - SUM(won) AS losses
     FROM ranked
     WHERE rn <= 10
     GROUP BY team_id`,
    [season, season],
  );

  return new Map(
    rows.map(row => [row.teamId, { wins: Number(row.wins), losses: Number(row.losses) }]),
  );
}

async function findLastGameDay(season: number): Promise<number | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT MAX(Day) AS lastGameDay FROM mdb_schedule WHERE season = ? AND BoxName <> 'N/A'`,
    [season],
  );
  return rows[0]?.lastGameDay ?? null;
}

/**
 * Zwraca tabelę ligi pogrupowaną: konferencja → dywizja → drużyny (wg DivRank).
 * @param season Sezon; bez parametru — najnowszy zaimportowany
 * @returns null, gdy dla sezonu nie ma danych w mdb_teams
 */
export async function getStandings(season?: number): Promise<StandingsResponse | null> {
  const resolvedSeason = season ?? (await findLatestSeason());
  if (resolvedSeason === null) {
    return null;
  }

  // Aliasy w SQL od razu dają nazwy w camelCase, jak w odpowiedzi API
  const [teamRows] = await pool.execute<TeamRow[]>(
    `SELECT team_id AS teamId, City AS city, Name AS name, Conference AS conference,
            Division AS division, DivRank AS divRank, ConfRank AS confRank,
            HomeWins AS homeWins, HomeLosses AS homeLosses, RoadWins AS roadWins,
            RoadLosses AS roadLosses, \`Win%\` AS winPct, GB AS gb, ConfGB AS confGb,
            Streak AS streak
     FROM mdb_teams
     WHERE season = ?
     ORDER BY Conference, Division, DivRank`,
    [resolvedSeason],
  );
  if (teamRows.length === 0) {
    return null;
  }

  const [last10ByTeam, lastGameDay] = await Promise.all([
    findLast10(resolvedSeason),
    findLastGameDay(resolvedSeason),
  ]);

  // Grupowanie: wiersze są posortowane po konferencji i dywizji, więc Map zachowa tę kolejność
  const conferences = new Map<string, Map<string, TeamStanding[]>>();
  for (const row of teamRows) {
    const team: TeamStanding = {
      teamId: row.teamId,
      city: row.city,
      name: row.name,
      // Bilans sezonu = dom + wyjazd (TotalWins/TotalLosses to bilans całej historii franczyzy)
      wins: row.homeWins + row.roadWins,
      losses: row.homeLosses + row.roadLosses,
      winPct: Number(row.winPct),
      last10: last10ByTeam.get(row.teamId) ?? NO_GAMES,
      home: { wins: row.homeWins, losses: row.homeLosses },
      road: { wins: row.roadWins, losses: row.roadLosses },
      gb: Number(row.gb),
      confGb: Number(row.confGb),
      divRank: row.divRank,
      confRank: row.confRank,
      streak: row.streak,
    };

    const divisions = conferences.get(row.conference) ?? new Map<string, TeamStanding[]>();
    conferences.set(row.conference, divisions);
    const teams = divisions.get(row.division) ?? [];
    divisions.set(row.division, teams);
    teams.push(team);
  }

  const result: ConferenceStandings[] = [...conferences].map(([name, divisions]) => ({
    name,
    divisions: [...divisions].map(([divisionName, teams]) => ({ name: divisionName, teams })),
  }));

  return { season: resolvedSeason, lastGameDay, conferences: result };
}
