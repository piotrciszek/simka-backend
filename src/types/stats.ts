// Types for player statistics and related API responses
// Shared between routes and potentially frontend

export interface PlayerStat {
  id: number;
  Name: string;
  Team: string;
  Position: string;
  Games: number;
  Minutes: number;
  FG: number;
  FGA: number;
  'FG%': number;
  FT: number;
  FTA: number;
  'FT%': number;
  '3P': number;
  '3PA': number;
  '3P%': number;
  Rebounds: number;
  OREB: number;
  Assists: number;
  Steals: number;
  Blocks: number;
  Turnovers: number;
  Fouls: number;
  Points: number;
  'eFG%': number;
  'TS%': number;
  EFF: number;
  'AST/TO': number;
  USG: number;
  POSS: number;
  PPP: number;
  PIE: number;
}

export interface ScorerRanking {
  rank: number;
  name: string;
  ts: string;
  efg: string;
  fga: string;
  shooterScore: string;
}

export interface StatsFilters {
  team?: string;
  minGames?: number;
  season?: string;
  position?: string;
}

export interface PlayerComparison {
  leftPlayer: PlayerStat;
  rightPlayer: PlayerStat;
}

export interface PlayerListItem {
  Name: string;
  Team: string;
  Position: string;
}

// Database row interface (what comes from MySQL)
export interface PlayerStatRow {
  id: number;
  player_name: string;
  team: string;
  csv_upload_id: number;
  season: string;
  games: number;
  minutes: number;
  fg: number;
  fga: number;
  ft: number;
  fta: number;
  three_p: number;
  three_pa: number;
  rebounds: number;
  oreb: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  points: number;
  fg_pct: number;
  ft_pct: number;
  three_p_pct: number;
  true_shooting_pct: number;
  effective_fg_pct: number;
  efficiency: number;
  ast_to_ratio: number;
  usage_rate: number;
  possessions: number;
  points_per_possession: number;
  shooter_score: number;
  // Source tracking fields
  source_file?: string;
  source_type?: 'csv' | 'scraping' | 'manual';
  source_date?: Date;
  game_week?: number;
  source_checksum?: string;
  processed_at?: Date;
  created_at: Date;
  updated_at: Date;
}