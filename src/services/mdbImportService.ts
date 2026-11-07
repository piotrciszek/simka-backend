import fs from 'fs/promises';
import path from 'path';
import type { PoolConnection } from 'mysql2/promise';
import pool from '../config/db';
import { EXTRACTION_JSON_FILENAME } from './mdbExtractionService';

// Whitelisty kolumn z MDB, które importujemy (TEAM_COLUMNS → mdb_teams, SCHEDULE_COLUMNS → mdb_schedule).
// Nazwy kolumn wstawiamy do SQL przez interpolację (placeholdery `?` działają tylko dla wartości),
// więc muszą pochodzić z kodu, a nie z JSON-a — inaczej byłby to SQL injection przez nazwę kolumny.
const TEAM_COLUMNS = [
  'TeamRating',
  'Championships',
  'Playoffs',
  'TotalSalary',
  'NumPlayers',
  'ActivePlayers',
  'OldWinRating',
  'WinRating',
  'Streak',
  'HomeWins',
  'HomeLosses',
  'RoadWins',
  'RoadLosses',
  'Win%',
  'TotalWins',
  'TotalLosses',
  'PlayoffWins',
  'PlayoffLosses',
  'FinalsAppearances',
  'Points',
  'PointsAllowed',
  'Steals',
  'StealsAllowed',
  'Rebounds',
  'ReboundsAllowed',
  'Assists',
  'AssistsAllowed',
  'Blocks',
  'BlocksAllowed',
  'Turnovers',
  'TurnoversAllowed',
  'FGA',
  'FG',
  'FGAallowed',
  'FGallowed',
  '3PA',
  '3P',
  '3PAallowed',
  '3Pallowed',
  'FT',
  'FTA',
  'FTAllowed',
  'FTAallowed',
  'LastPlayoffYear',
  'DraftRank',
  'Cs',
  'PFs',
  'SFs',
  'SGs',
  'PGs',
  'KeyPlayer1',
  'KeyPlayer2',
  'KeyPlayer3',
  'Pace',
  'Press',
  'Trap',
  'Offense',
  'CutSalary',
  'CutSalary2',
  'CutSalary3',
  'CutSalary4',
  'CutSalary5',
  'CutSalary6',
  'CutSalary7',
  'CutSalary8',
  'UsedMidException',
  'UsedLowException',
  'pbp',
  'CoachTeam',
  'DraftFocus',
  'GB',
  'ConfGB',
  'DivRank',
  'ConfRank',
  'City',
  'Name',
  'Conference',
  'Division',
  'Owner',
  'C1',
  'C2',
  'C3',
  'PF1',
  'PF2',
  'PF3',
  'SF1',
  'SF2',
  'SF3',
  'SG1',
  'SG2',
  'SG3',
  'PG1',
  'PG2',
  'PG3',
] as const;

// Day, Home, Away nie ma na liście — Day jest częścią klucza, a Home/Away (nazwy drużyn)
// zamieniamy przy imporcie na home_team_id / away_team_id
const SCHEDULE_COLUMNS = [
  'HomeScore',
  'AwayScore',
  'BoxName',
  'PlayerOfGameID',
  'PlayerOfGame',
  'HomePointsID',
  'HomePoints',
  'HomeRebID',
  'HomeRebs',
  'HomeAssistID',
  'HomeAssists',
  'AwayPointsID',
  'AwayPoints',
  'AwayRebID',
  'AwayRebs',
  'AwayAssistID',
  'AwayAssists',
  'HomeQ1',
  'HomeQ2',
  'HomeQ3',
  'HomeQ4',
  'HomeOT',
  'AwayQ1',
  'AwayQ2',
  'AwayQ3',
  'AwayQ4',
  'AwayOT',
] as const;

type SqlValue = string | number | boolean | null;

interface MdbImportResult {
  season: number;
  teams: number;
  games: number;
}

export class MdbExtractionNotFoundError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDatabaseValue(value: unknown): value is SqlValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function isUnsignedSmallInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 65535;
}

// Wyciąga z rekordu wartości kolumn z whitelisty — brak kolumny albo zły typ przerywa import
function pickColumns(
  record: Record<string, unknown>,
  columns: readonly string[],
  label: string,
): SqlValue[] {
  return columns.map(column => {
    const value = record[column];
    if (!Object.prototype.hasOwnProperty.call(record, column) || !isDatabaseValue(value)) {
      throw new Error(`${label} ma brakującą lub nieprawidłową wartość w polu ${column}.`);
    }
    return value;
  });
}

// Czyta JSON eksportu i sprawdza SeasonInfo (wspólne dla wszystkich importowanych tabel)
async function readExtraction(
  dbDirectory: string,
  extractionId: string,
): Promise<{ season: number; data: Record<string, unknown> }> {
  // extractionId jest zwalidowany w route jako UUID, więc nie zawiera "../" — bezpieczny w ścieżce
  const jsonPath = path.join(dbDirectory, 'extracted', extractionId, EXTRACTION_JSON_FILENAME);

  let fileContent: string;
  try {
    fileContent = await fs.readFile(jsonPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new MdbExtractionNotFoundError(
        `Nie znaleziono eksportu MDB o identyfikatorze ${extractionId}.`,
      );
    }
    throw error;
  }

  let data: unknown;
  try {
    data = JSON.parse(fileContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'nieznany błąd';
    throw new Error(`Nie udało się odczytać JSON eksportu MDB: ${message}`);
  }

  if (!isRecord(data)) {
    throw new Error('JSON eksportu MDB ma nieprawidłowy format.');
  }

  const seasonInfo = data.SeasonInfo;
  if (!Array.isArray(seasonInfo) || seasonInfo.length !== 1 || !isRecord(seasonInfo[0])) {
    throw new Error('JSON musi zawierać dokładnie jeden rekord SeasonInfo.');
  }

  const season = seasonInfo[0].Season;
  if (!isUnsignedSmallInt(season)) {
    throw new Error('SeasonInfo.Season musi być liczbą całkowitą z zakresu 0–65535.');
  }

  return { season, data };
}

// Wiersze do mdb_teams + mapa nazwa → ID (Schedule zapisuje drużyny nazwą, np. "Timberwolves")
function buildTeamRows(
  teams: unknown,
  season: number,
): { rows: SqlValue[][]; teamIdByName: Map<string, number> } {
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error('JSON musi zawierać co najmniej jeden rekord Team.');
  }

  const teamIdByName = new Map<string, number>();
  const ids = new Set<number>();
  const rows = teams.map((team, index) => {
    const label = `Rekord Team o indeksie ${index}`;
    if (!isRecord(team) || !isUnsignedSmallInt(team.ID)) {
      throw new Error(`${label} nie zawiera prawidłowego ID.`);
    }
    // Bez tej kontroli ON DUPLICATE KEY po cichu nadpisałby jedną drużynę drugą
    if (ids.has(team.ID)) {
      throw new Error(`W JSON powtórzono Team.ID=${team.ID}. Import przerwany.`);
    }
    ids.add(team.ID);

    // Nazwa musi być unikalna, inaczej mecze z Schedule trafiłyby do złej drużyny
    if (typeof team.Name !== 'string' || teamIdByName.has(team.Name)) {
      throw new Error(`${label} ma pustą lub powtórzoną nazwę (Name).`);
    }
    teamIdByName.set(team.Name, team.ID);

    return [season, team.ID, ...pickColumns(team, TEAM_COLUMNS, label)];
  });

  return { rows, teamIdByName };
}

function buildScheduleRows(
  schedule: unknown,
  season: number,
  teamIdByName: Map<string, number>,
): SqlValue[][] {
  // Pusta lista jest OK (np. przed wygenerowaniem terminarza) — brak tabeli już nie
  if (!Array.isArray(schedule)) {
    throw new Error('JSON musi zawierać tabelę Schedule.');
  }

  return schedule.map((game, index) => {
    const label = `Rekord Schedule o indeksie ${index}`;
    if (!isRecord(game) || !isUnsignedSmallInt(game.Day)) {
      throw new Error(`${label} nie zawiera prawidłowego pola Day.`);
    }

    const homeId = typeof game.Home === 'string' ? teamIdByName.get(game.Home) : undefined;
    const awayId = typeof game.Away === 'string' ? teamIdByName.get(game.Away) : undefined;
    if (homeId === undefined || awayId === undefined) {
      throw new Error(
        `${label} ma drużynę spoza tabeli Team (Home="${game.Home}", Away="${game.Away}").`,
      );
    }

    return [season, game.Day, homeId, awayId, ...pickColumns(game, SCHEDULE_COLUMNS, label)];
  });
}

// Wspólny upsert: klucz (keyColumns) identyfikuje wiersz, pozostałe kolumny są aktualizowane.
// table i nazwy kolumn pochodzą wyłącznie ze stałych w tym pliku (whitelist).
async function upsertRows(
  connection: PoolConnection,
  table: 'mdb_teams' | 'mdb_schedule',
  keyColumns: readonly string[],
  valueColumns: readonly string[],
  rows: SqlValue[][],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const columns = [...keyColumns, ...valueColumns];
  const quotedColumns = columns.map(column => `\`${column}\``).join(', ');
  const rowPlaceholders = `(${columns.map(() => '?').join(', ')})`;
  // "incoming" to alias wiersza, który próbujemy wstawić (MySQL ≥ 8.0.19) — zastępuje
  // przestarzałe VALUES(kolumna). Nie działa na MariaDB.
  const updates = valueColumns.map(column => `\`${column}\` = incoming.\`${column}\``).join(', ');

  // Jedno zapytanie na tabelę: Schedule to ~1189 wierszy × 31 kolumn ≈ 37 tys. placeholderów,
  // poniżej limitu MySQL (65 535)
  await connection.execute(
    `INSERT INTO \`${table}\` (${quotedColumns})
     VALUES ${rows.map(() => rowPlaceholders).join(', ')} AS incoming
     ON DUPLICATE KEY UPDATE ${updates}`,
    rows.flat(),
  );
}

/**
 * Importuje z wcześniejszego eksportu MDB tabele Team (→ mdb_teams) i Schedule (→ mdb_schedule).
 * Upsert po kluczach naturalnych — ponowny import aktualizuje wiersze, nie tworzy duplikatów.
 * Obie tabele w jednej transakcji: albo zapisze się wszystko, albo nic.
 * Cały JSON jest walidowany przed otwarciem połączenia z bazą.
 * @param dbDirectory Katalog DB_DIR (eksporty są w podkatalogu extracted/)
 * @param extractionId UUID zwrócony przez POST /mdb/extract
 */
export async function importMdb(
  dbDirectory: string,
  extractionId: string,
): Promise<MdbImportResult> {
  const { season, data } = await readExtraction(dbDirectory, extractionId);
  const { rows: teamRows, teamIdByName } = buildTeamRows(data.Team, season);
  const scheduleRows = buildScheduleRows(data.Schedule, season, teamIdByName);

  // Transakcja, bo to dwa osobne zapytania — błąd w Schedule cofa też zmiany w Team
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await upsertRows(connection, 'mdb_teams', ['season', 'team_id'], TEAM_COLUMNS, teamRows);
    await upsertRows(
      connection,
      'mdb_schedule',
      ['season', 'Day', 'home_team_id', 'away_team_id'],
      SCHEDULE_COLUMNS,
      scheduleRows,
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return { season, teams: teamRows.length, games: scheduleRows.length };
}
