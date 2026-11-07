// Typy odpowiedzi GET /api/standings (tabela ligi z mdb_teams + L10 z mdb_schedule)
// Liczby są "surowe" — formatowanie (np. GB "-" dla lidera, Win% ",789") robi frontend.

export interface WinLoss {
  wins: number;
  losses: number;
}

export interface TeamStanding {
  teamId: number;
  city: string;
  name: string;
  wins: number;
  losses: number;
  winPct: number;
  last10: WinLoss;
  home: WinLoss;
  road: WinLoss;
  gb: number;
  confGb: number;
  divRank: number;
  confRank: number;
  // Seria: dodatnia = wygrane z rzędu, ujemna = porażki z rzędu
  streak: number;
}

export interface DivisionStandings {
  name: string;
  teams: TeamStanding[];
}

export interface ConferenceStandings {
  name: string;
  divisions: DivisionStandings[];
}

export interface StandingsResponse {
  season: number;
  // Ostatni dzień sezonu z rozegranym meczem (null, gdy sezon jeszcze się nie zaczął)
  lastGameDay: number | null;
  conferences: ConferenceStandings[];
}
