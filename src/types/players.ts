// Types dla endpointów /csv/players-full i /csv/team-salary
// Generated: 2026-05-26

// Podstawowy interface Player (bez zmian - kompatybilny z istniejącym)
export interface Player {
  id: number;
  firstName: string;
  lastName: string;
  position: string;
  team: string;
}

// Rozszerzony interface z wszystkimi atrybutami z CSV
export interface PlayerFull extends Player {
  // Physical/demographic
  height?: number; // wzrost w calach
  weight?: number; // waga w funtach
  age?: number;
  college?: string;
  experience: number; // lata doświadczenia

  // Offensive skills (0-100)
  inside_scoring: number;
  jumpshot: number;
  three_p: number; // 3P shooting
  handling: number;
  passing: number;
  quickness: number;

  // Defensive skills (0-100)
  post_d: number;
  perimeter_d: number;
  drive_d: number;
  stealing: number;
  blocking: number;

  // Physical/rebounding (0-100)
  oreb: number; // offensive rebounds
  dreb: number; // defensive rebounds
  jumping: number;
  strength: number;
  potential: number; // rozwój gracza

  // Contracts (USD, 7 years)
  salary1: number;
  salary2: number;
  salary3: number;
  salary4: number;
  salary5: number;
  salary6: number;
  salary7: number;
}

// Subset dla trade machine (tylko salary info)
export interface PlayerTrade extends Player {
  salary1: number;
}

// Subset dla porównań (tylko atrybuty bez salary/demographics)
export interface PlayerAttributes extends Player {
  // Offensive skills
  inside_scoring: number;
  jumpshot: number;
  three_p: number;
  handling: number;
  passing: number;
  quickness: number;

  // Defensive skills
  post_d: number;
  perimeter_d: number;
  drive_d: number;
  stealing: number;
  blocking: number;

  // Physical
  oreb: number;
  dreb: number;
  jumping: number;
  strength: number;
  potential: number;
}

// Team salary dla konkretnego roku
export interface TeamSalarySingleYear {
  team: string;
  totalSalary: number;
  playerCount: number;
  contractYear: number; // 1-7
}

// Team salary dla wszystkich lat kontraktu
export interface TeamSalaryAllYears {
  team: string;
  salary1Total: number;
  salary2Total: number;
  salary3Total: number;
  salary4Total: number;
  salary5Total: number;
  salary6Total: number;
  salary7Total: number;
  playerCount: number;
}