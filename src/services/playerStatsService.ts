import { CalculatedPlayerStats } from '../utils/basketballStats';

export interface SaveStatsOptions {
  season: string;
  csvUploadId?: number;
  sourceFile: string;
  sourceType: string;
}

/**
 * Zapisuje obliczone statystyki graczy do bazy danych
 * @param playerStats Tablica obliczonych statystyk
 * @param options Opcje zapisu (season, csvUploadId, etc.)
 * @returns Promise<number> Liczba przetworzonych graczy
 */
export async function savePlayerStats(
  playerStats: CalculatedPlayerStats[],
  options: SaveStatsOptions
): Promise<number> {
  // Import pool inside function to avoid env variable issues during module loading
  const pool = (await import('../config/db')).default;
  let processedPlayers = 0;


  const insertQuery = `
    INSERT INTO player_stats (
      player_name, team, csv_upload_id, season,
      games, minutes, fg, fga, ft, fta, three_p, three_pa,
      points, rebounds, oreb, assists, steals, blocks, turnovers, fouls,
      fg_pct, ft_pct, three_p_pct, true_shooting_pct, effective_fg_pct,
      efficiency, ast_to_ratio, usage_rate, possessions, points_per_possession,
      shooter_score, pie, source_file, source_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      games = VALUES(games), minutes = VALUES(minutes),
      fg = VALUES(fg), fga = VALUES(fga), ft = VALUES(ft), fta = VALUES(fta),
      three_p = VALUES(three_p), three_pa = VALUES(three_pa),
      points = VALUES(points), rebounds = VALUES(rebounds), oreb = VALUES(oreb),
      assists = VALUES(assists), steals = VALUES(steals), blocks = VALUES(blocks),
      turnovers = VALUES(turnovers), fouls = VALUES(fouls), fg_pct = VALUES(fg_pct), ft_pct = VALUES(ft_pct),
      three_p_pct = VALUES(three_p_pct), true_shooting_pct = VALUES(true_shooting_pct),
      effective_fg_pct = VALUES(effective_fg_pct), efficiency = VALUES(efficiency),
      ast_to_ratio = VALUES(ast_to_ratio), usage_rate = VALUES(usage_rate),
      possessions = VALUES(possessions), points_per_possession = VALUES(points_per_possession),
      shooter_score = VALUES(shooter_score), pie = VALUES(pie)
  `;

  for (const stats of playerStats) {
    await pool.execute(insertQuery, [
      stats.playerName,
      stats.team,
      options.csvUploadId || 0,
      options.season,
      stats.games,
      stats.minutes,
      stats.fg,
      stats.fga,
      stats.ft,
      stats.fta,
      stats.threeP,
      stats.threePA,
      stats.points,
      stats.rebounds,
      stats.oreb,
      stats.assists,
      stats.steals,
      stats.blocks,
      stats.turnovers,
      stats.fouls,
      stats.fgPct,
      stats.ftPct,
      stats.threePPct,
      stats.trueShootingPct,
      stats.effectiveFgPct,
      stats.efficiency,
      stats.astToRatio,
      stats.usageRate,
      stats.possessions,
      stats.pointsPerPossession,
      stats.shooterScore,
      stats.pie,
      options.sourceFile,
      options.sourceType
    ]);

    processedPlayers++;
  }

  return processedPlayers;
}