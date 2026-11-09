export interface GridPosition {
  x: number;
  y: number;
}

export type FacilityKind = 'tree' | 'grass' | 'drain';
export type TreeVariant = 'broadleaf' | 'pine' | 'autumn';
export type GrassVariant = 'lawn' | 'grass-tuft' | 'shrub';
export type FacilityVariant = TreeVariant | GrassVariant;
export type BuildingAppearance = 'campus' | 'brick' | 'blue';
export type BuildTool = TreeVariant | GrassVariant | 'drain' | 'canopy';
export type Weather = 'clear' | 'light' | 'heavy';
export type Period = 'day' | 'night';
export type GamePhase = 'build' | 'running' | 'result';

export interface Building {
  id: string;
  type: 'library' | 'teaching' | 'canteen' | 'shop' | 'dormitory';
  name: string;
  position: GridPosition;
  entranceRoadCell: GridPosition;
  hasCanopy: boolean;
  appearance?: BuildingAppearance;
}

export interface BuildSlot {
  id: string;
  roadAnchor: GridPosition;
  candidateCells: GridPosition[];
}

export interface PlacedFacility {
  position: GridPosition;
  kind: FacilityKind;
  variant?: FacilityVariant;
}

export interface Board {
  roadCells: GridPosition[];
  buildings: Building[];
  buildSlots: BuildSlot[];
  seed: number;
  turns: number;
  fallbackUsed: boolean;
}

export interface RoadAccident {
  cellKey: string;
  penalty: number;
}

export interface RoundReport {
  roundIndex: number;
  period: Period;
  weather: Weather;
  waterFrames: Record<string, number>[];
  floodedCells: string[];
  roadAccidents: RoadAccident[];
  buildingAccidents: string[];
  safetyScore: number;
  comfortScore: number;
}

export interface ChallengeSummary {
  rounds: RoundReport[];
  averageSafety: number;
  averageComfort: number;
  totalScore: number;
  grade: 'S' | 'A' | 'B' | 'C';
}

export interface BuildHistoryEntry {
  facilityPositions: string[];
  canopyBuildingId?: string;
}

export interface GameState {
  board: Board;
  mapSeed: number;
  eventSeed: number;
  phase: GamePhase;
  facilities: PlacedFacility[];
  budgetRemaining: number;
  history: BuildHistoryEntry[];
  reports: RoundReport[];
  currentRoundIndex: number;
  currentTick: number;
  summary: ChallengeSummary | null;
  message: string;
}

export const positionKey = ({ x, y }: GridPosition): string => `${x},${y}`;
