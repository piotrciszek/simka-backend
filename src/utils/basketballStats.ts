export interface RawPlayerStats {
  Name: string;
  Team?: string;
  Position?: string;
  Games?: string | number;
  Minutes?: string | number;
  FG?: string | number;
  FGA?: string | number;
  FT?: string | number;
  FTA?: string | number;
  '3P'?: string | number;
  '3PA'?: string | number;
  Points?: string | number;
  Rebounds?: string | number;
  OREB?: string | number;
  Assists?: string | number;
  Steals?: string | number;
  Blocks?: string | number;
  Turnovers?: string | number;
  Fouls?: string | number;
  PIE?: string | number;
}

export interface CalculatedPlayerStats {
  // Podstawowe dane
  playerName: string;
  team: string;
  position: string;

  // Raw stats z CSV
  games: number;
  minutes: number;
  fg: number;
  fga: number;
  ft: number;
  fta: number;
  threeP: number;
  threePA: number;
  points: number;
  rebounds: number;
  oreb: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  pie: number;

  // Calculated percentages
  fgPct: number;
  threePPct: number;
  ftPct: number;

  // Advanced metrics
  trueShootingPct: number;
  effectiveFgPct: number;
  efficiency: number;
  astToRatio: number;
  usageRate: number;
  possessions: number;
  pointsPerPossession: number;
  shooterScore: number;
}

/**
 * Oblicza zaawansowane statystyki koszykarskie na podstawie raw danych z CSV
 * @param rawStats Surowe dane z CSV
 * @returns CalculatedPlayerStats Obliczone statystyki
 */
export function calculatePlayerStats(rawStats: RawPlayerStats): CalculatedPlayerStats {
  // Konwersja string -> number z fallback na 0
  const games = Number(rawStats.Games) || 0;
  const minutes = Number(rawStats.Minutes) || 0;
  const fg = Number(rawStats.FG) || 0;
  const fga = Number(rawStats.FGA) || 0;
  const ft = Number(rawStats.FT) || 0;
  const fta = Number(rawStats.FTA) || 0;
  const threeP = Number(rawStats['3P']) || 0;
  const threePA = Number(rawStats['3PA']) || 0;
  const points = Number(rawStats.Points) || 0;
  const rebounds = Number(rawStats.Rebounds) || 0;
  const oreb = Number(rawStats.OREB) || 0;
  const assists = Number(rawStats.Assists) || 0;
  const steals = Number(rawStats.Steals) || 0;
  const blocks = Number(rawStats.Blocks) || 0;
  const turnovers = Number(rawStats.Turnovers) || 0;
  const fouls = Number(rawStats.Fouls) || 0;
  const pie = Number(rawStats.PIE) || 0;

  // KROK 1: Basic Percentages
  const fgPct = fga > 0 ? (fg / fga) : 0;
  const threePPct = threePA > 0 ? (threeP / threePA) : 0;
  const ftPct = fta > 0 ? (ft / fta) : 0;

  // KROK 2: Advanced Metrics
  const trueShootingPct = (fga + 0.44 * fta) > 0
    ? (points / (2 * (fga + 0.44 * fta)))
    : 0;

  const effectiveFgPct = fga > 0
    ? ((fg + 0.5 * threeP) / fga)
    : 0;

  const effTotal = points + rebounds + assists + steals + blocks -
    ((fga - fg) + (fta - ft) + turnovers);
  const efficiency = games > 0 ? (effTotal / games) : 0;

  const astToRatio = turnovers > 0
    ? (assists / turnovers)
    : assists;

  const usgTotal = fga + 0.44 * fta + turnovers;
  const possTotal = fga + 0.44 * fta - oreb + turnovers;
  const usageRate = games > 0 ? (usgTotal / games) : 0;
  const possessions = games > 0 ? (possTotal / games) : 0;
  const pointsPerPossession = possTotal > 0 ? (points / possTotal) : 0;

  // KROK 3: ShooterScore Algorithm
  const tsPercent = trueShootingPct * 100;
  const efgPercent = effectiveFgPct * 100;
  const fgaPerGame = games > 0 ? fga / games : 0;
  const shooterScore = ((tsPercent * 0.7) + (efgPercent * 0.3)) * Math.sqrt(fgaPerGame);

  return {
    // Podstawowe dane
    playerName: rawStats.Name.trim(),
    team: rawStats.Team || 'Unknown',
    position: rawStats.Position?.trim() || 'N/A',

    // Raw stats
    games,
    minutes,
    fg,
    fga,
    ft,
    fta,
    threeP,
    threePA,
    points,
    rebounds,
    oreb,
    assists,
    steals,
    blocks,
    turnovers,
    fouls,
    pie,

    // Calculated stats
    fgPct,
    threePPct,
    ftPct,
    trueShootingPct,
    effectiveFgPct,
    efficiency,
    astToRatio,
    usageRate,
    possessions,
    pointsPerPossession,
    shooterScore
  };
}