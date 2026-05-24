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
  options: SaveStatsOptions,
): Promise<number> {
  // Import pool inside function to avoid env variable issues during module loading
  const pool = (await import('../config/db')).default;

  if (playerStats.length === 0) {
    return 0;
  }

  // Rozpocznij transakcję dla lepszej wydajności
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // KROK 1: Wyczyść wszystkie stare statystyki dla tego sezonu
    const [deleteResult] = await connection.execute(
      'DELETE FROM player_stats WHERE season = ?',
      [options.season]
    );

    // KROK 2: Przetwarzaj nowe dane w mniejszych batch'ach (100 rekordów naraz)
    const batchSize = 100;
    let totalProcessed = 0;

    for (let i = 0; i < playerStats.length; i += batchSize) {
      const batch = playerStats.slice(i, i + batchSize);

      // Przygotowanie wartości dla batch INSERT
      const values = batch.map(stats => [
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
        options.sourceType,
      ]);

      // Tworzenie placeholderów dla tego batch'a
      const placeholders = values
        .map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .join(',');

      // Spłaszczenie tablicy wartości
      const flatValues = values.flat();

      // Prosty batch INSERT (bez ON DUPLICATE KEY - już wyczyściliśmy stare dane)
      const batchInsertQuery = `
        INSERT INTO player_stats (
          player_name, team, csv_upload_id, season,
          games, minutes, fg, fga, ft, fta, three_p, three_pa,
          points, rebounds, oreb, assists, steals, blocks, turnovers, fouls,
          fg_pct, ft_pct, three_p_pct, true_shooting_pct, effective_fg_pct,
          efficiency, ast_to_ratio, usage_rate, possessions, points_per_possession,
          shooter_score, pie, source_file, source_type
        ) VALUES ${placeholders}
      `;

      await connection.execute(batchInsertQuery, flatValues);
      totalProcessed += batch.length;
    }

    // Zatwierdź transakcję
    await connection.commit();
    return totalProcessed;

  } catch (error) {
    // W przypadku błędu - rollback
    await connection.rollback();
    throw error;
  } finally {
    // Zwolnij połączenie
    connection.release();
  }
}
