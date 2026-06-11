import { StatsFilters } from '../types/stats';

// TOTALS - dla advanced-stats (sumy z bazy)
export const BASIC_STATS_COLUMNS = `
  ps.player_name as Name,
  ps.position as Position,
  ps.team as Team,
  CAST(ps.games as SIGNED) as Games,
  CAST(ps.minutes as SIGNED) as Minutes,
  CAST(ps.fg as SIGNED) as FG,
  CAST(ps.fga as SIGNED) as FGA,
  CAST(ps.ft as SIGNED) as FT,
  CAST(ps.fta as SIGNED) as FTA,
  CAST(ps.three_p as SIGNED) as '3P',
  CAST(ps.three_pa as SIGNED) as '3PA',
  CAST(ps.rebounds as SIGNED) as Rebounds,
  CAST(ps.assists as SIGNED) as Assists,
  CAST(ps.steals as SIGNED) as Steals,
  CAST(ps.blocks as SIGNED) as Blocks,
  CAST(ps.turnovers as SIGNED) as Turnovers,
  CAST(ps.fouls as SIGNED) as Fouls,
  CAST(ps.points as SIGNED) as Points,
  CAST(ps.oreb as SIGNED) as OREB
`;

// PER GAME - dla advanced-statsp (dzielone przez mecze)
export const PER_GAME_STATS_COLUMNS = `
  ps.player_name as Name,
  ps.position as Position,
  ps.team as Team,
  ps.games as Games,
  ROUND(ps.minutes * ps.per_game_factor, 2) as Minutes,
  ROUND(ps.fg * ps.per_game_factor, 2) as FG,
  ROUND(ps.fga * ps.per_game_factor, 2) as FGA,
  ROUND(ps.ft * ps.per_game_factor, 2) as FT,
  ROUND(ps.fta * ps.per_game_factor, 2) as FTA,
  ROUND(ps.three_p * ps.per_game_factor, 2) as '3P',
  ROUND(ps.three_pa * ps.per_game_factor, 2) as '3PA',
  ROUND(ps.rebounds * ps.per_game_factor, 2) as Rebounds,
  ROUND(ps.assists * ps.per_game_factor, 2) as Assists,
  ROUND(ps.steals * ps.per_game_factor, 2) as Steals,
  ROUND(ps.blocks * ps.per_game_factor, 2) as Blocks,
  ROUND(ps.turnovers * ps.per_game_factor, 2) as Turnovers,
  ROUND(ps.fouls * ps.per_game_factor, 2) as Fouls,
  ROUND(ps.points * ps.per_game_factor, 2) as Points,
  ROUND(ps.oreb * ps.per_game_factor, 2) as OREB
`;

export const ADVANCED_STATS_COLUMNS = `
  ${PER_GAME_STATS_COLUMNS},
  ps.fg_pct as 'FG%',
  ps.ft_pct as 'FT%',
  ps.three_p_pct as '3P%',
  ps.effective_fg_pct as 'eFG%',
  ps.true_shooting_pct as 'TS%',
  ps.efficiency as EFF,
  ps.ast_to_ratio as 'AST/TO',
  ps.usage_rate as USG,
  ps.possessions as POSS,
  ps.points_per_possession as PPP,
  ps.pie as PIE
`;

export const COMPARISON_STATS_COLUMNS = `
  ps.player_name as Name,
  ps.team as Team,
  ps.position as Position,
  ROUND(ps.points * ps.per_game_factor, 2) as Points,
  ROUND(ps.rebounds * ps.per_game_factor, 2) as Rebounds,
  ROUND(ps.assists * ps.per_game_factor, 2) as Assists,
  ROUND(ps.steals * ps.per_game_factor, 2) as Steals,
  ROUND(ps.blocks * ps.per_game_factor, 2) as Blocks,
  ps.fg_pct as 'FG%',
  ps.three_p_pct as '3P%',
  ps.ft_pct as 'FT%',
  ps.effective_fg_pct as 'eFG%',
  ps.true_shooting_pct as 'TS%',
  ps.efficiency as EFF,
  ps.ast_to_ratio as 'AST/TO',
  ps.usage_rate as USG,
  ps.possessions as POSS,
  ps.points_per_possession as PPP,
  ps.pie as PIE
`;

// Wspólny base query dla wszystkich statystyk
// For TOTALS - no per_game_factor needed
export const BASE_STATS_FROM = `
  FROM player_stats ps
  WHERE 1=1
`;

// For PER GAME - with per_game_factor
export const PER_GAME_STATS_FROM = `
  FROM (
    SELECT *,
      CASE WHEN games > 0 THEN 1.0/games ELSE 0 END as per_game_factor
    FROM player_stats
  ) ps
  WHERE 1=1
`;

/**
 * Buduje pełne zapytanie SQL z filtrami
 * @param columns String z kolumnami SELECT
 * @param filters Obiekty z filtrami (team, season, minGames, position)
 * @param orderBy String z klauzulą ORDER BY (opcjonalny)
 * @returns {query: string, params: any[]} Zapytanie i parametry
 */
export function buildStatsQuery(
  columns: string,
  filters: StatsFilters = {},
  orderBy: string = 'ORDER BY ps.points DESC'
): { query: string; params: any[] } {
  // Auto-detect if we need per_game_factor based on columns content
  const needsPerGameFactor = columns.includes('per_game_factor');
  const fromClause = needsPerGameFactor ? PER_GAME_STATS_FROM : BASE_STATS_FROM;

  let query = `SELECT ${columns} ${fromClause}`;
  const params: any[] = [];

  if (filters.team) {
    query += ' AND ps.team = ?';
    params.push(filters.team);
  }

  if (filters.minGames && filters.minGames > 0) {
    query += ' AND ps.games >= ?';
    params.push(filters.minGames);
  }

  if (filters.season) {
    query += ' AND ps.season = ?';
    params.push(filters.season);
  }

  if (filters.position) {
    query += ' AND ps.position = ?';
    params.push(filters.position);
  }

  if (orderBy) {
    query += ` ${orderBy}`;
  }

  return { query, params };
}

/**
 * Buduje zapytanie do porównania graczy
 * @param playerNames Tablica z nazwami graczy do porównania
 * @returns {query: string, params: any[]} Zapytanie i parametry
 */
export function buildPlayerComparisonQuery(
  playerNames: string[]
): { query: string; params: any[] } {
  if (playerNames.length === 0) {
    throw new Error('Player names array cannot be empty');
  }

  const placeholders = playerNames.map(() => '?').join(', ');

  const query = `
    SELECT ${COMPARISON_STATS_COLUMNS}
    ${PER_GAME_STATS_FROM}
      AND ps.player_name IN (${placeholders})
    ORDER BY ps.player_name
  `;

  const params = [...playerNames];
  return { query, params };
}

/**
 * Buduje zapytanie do rankingu strzelców
 * @param minFGA Minimalny próg FGA
 * @param season Opcjonalny sezon
 * @returns {query: string, params: any[]} Zapytanie i parametry
 */
export function buildScorersRankingQuery(
  minFGA: number = 5,
  season?: string
): { query: string; params: any[] } {
  let query = `
    SELECT
      ps.player_name as name,
      ROUND(ps.true_shooting_pct * 100, 1) as ts,
      ROUND(ps.effective_fg_pct * 100, 1) as efg,
      ROUND(ps.fga * ps.per_game_factor, 1) as fga,
      ps.shooter_score as shooterScore
    ${PER_GAME_STATS_FROM}
      AND ps.fga >= ?
  `;

  const params: any[] = [minFGA];

  if (season) {
    query += ' AND ps.season = ?';
    params.push(season);
  }

  query += ' ORDER BY ps.shooter_score DESC';

  return { query, params };
}