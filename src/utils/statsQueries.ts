import { StatsFilters } from '../types/stats';

// Wspólne kolumny dla różnych typów statystyk
export const BASIC_STATS_COLUMNS = `
  ps.player_name as Name,
  'N/A' as Position,
  ps.team as Team,
  ps.games as Games,
  ps.minutes as Minutes,
  ps.fg as FG,
  ps.fga as FGA,
  ps.ft as FT,
  ps.fta as FTA,
  ps.three_p as '3P',
  ps.three_pa as '3PA',
  ps.rebounds as Rebounds,
  ps.assists as Assists,
  ps.steals as Steals,
  ps.blocks as Blocks,
  ps.turnovers as Turnovers,
  ps.fouls as Fouls,
  ps.points as Points,
  ps.oreb as OREB
`;

export const ADVANCED_STATS_COLUMNS = `
  ps.id,
  ${BASIC_STATS_COLUMNS},
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
  'N/A' as Position,
  ps.points as Points,
  ps.rebounds as Rebounds,
  ps.assists as Assists,
  ps.steals as Steals,
  ps.blocks as Blocks,
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
export const BASE_STATS_FROM = `
  FROM player_stats ps
  JOIN csv_uploads cu ON ps.csv_upload_id = cu.id
  WHERE cu.is_active = 1
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
  let query = `SELECT ${columns} ${BASE_STATS_FROM}`;
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
    query += ' AND p.position = ?';
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
  const placeholders = playerNames.map(() => '?').join(' OR ps.player_name = ');
  const orderFields = playerNames.map(() => '?').join(', ');

  const query = `
    SELECT ${COMPARISON_STATS_COLUMNS}
    ${BASE_STATS_FROM}
      AND (ps.player_name = ${placeholders})
    ORDER BY FIELD(ps.player_name, ${orderFields})
  `;

  const params = [...playerNames, ...playerNames];
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
      ps.true_shooting_pct as ts,
      ps.effective_fg_pct as efg,
      ps.fga as fga,
      ps.shooter_score as shooterScore
    ${BASE_STATS_FROM}
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