import { GAME_CONFIG } from '../config/gameConfig';
import { positionKey, type FacilityKind, type FacilityVariant, type GameState, type GridPosition, type PlacedFacility } from '../model/types';

export interface PlacementPreview {
  status: 'ready' | 'no-change' | 'conflict' | 'over-budget';
  positions: GridPosition[];
  cost: number;
  message: string;
}

export function previewPlacement(state: GameState, slotId: string, kind: FacilityKind): PlacementPreview {
  const slot = state.board.buildSlots.find((candidate) => candidate.id === slotId);
  if (!slot) return { status: 'conflict', positions: [], cost: 0, message: '这个操作位不存在。' };
  const placed = new Map(state.facilities.map((facility) => [positionKey(facility.position), facility.kind]));
  const uniqueCandidates = [...new Map(slot.candidateCells.map((cell) => [positionKey(cell), cell])).values()];
  const positions: GridPosition[] = [];

  for (const cell of uniqueCandidates) {
    const existing = placed.get(positionKey(cell));
    if (existing && existing !== kind) {
      return { status: 'conflict', positions: [], cost: 0, message: '候选位置已有其他设施，本次操作未放置。' };
    }
    if (!existing) positions.push(cell);
  }

  if (positions.length === 0) {
    return { status: 'no-change', positions: [], cost: 0, message: '这些位置已有相同设施，无需重复购买。' };
  }
  const cost = positions.length * GAME_CONFIG.costs[kind];
  if (cost > state.budgetRemaining) {
    return { status: 'over-budget', positions, cost, message: `预算不足，需要 ${cost}，当前剩余 ${state.budgetRemaining}。` };
  }
  return { status: 'ready', positions, cost, message: `本次新增 ${positions.length} 个${facilityName(kind)}，花费 ${cost}。` };
}

const facilityName = (kind: FacilityKind): string => ({ tree: '树木', grass: '草坪', drain: '排水口' })[kind];

export function placeFacility(state: GameState, slotId: string, kind: FacilityKind, variant?: FacilityVariant): GameState {
  if (state.phase !== 'build') return { ...state, message: '挑战进行中，建设操作已锁定。' };
  const preview = previewPlacement(state, slotId, kind);
  if (preview.status !== 'ready') return { ...state, message: preview.message };
  const facilities: PlacedFacility[] = preview.positions.map((position) => ({
    position,
    kind,
    ...(kind === 'tree' || kind === 'grass' ? { variant: variant ?? (kind === 'tree' ? 'broadleaf' : 'lawn') } : {})
  }));
  return {
    ...state,
    facilities: [...state.facilities, ...facilities],
    budgetRemaining: state.budgetRemaining - preview.cost,
    history: [...state.history, { facilityPositions: preview.positions.map(positionKey) }],
    message: preview.message
  };
}

export function installCanopy(state: GameState, buildingId: string): GameState {
  if (state.phase !== 'build') return { ...state, message: '挑战进行中，建设操作已锁定。' };
  const building = state.board.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return { ...state, message: '没有找到这栋建筑。' };
  if (building.hasCanopy) return { ...state, message: `${building.name} 已有遮雨棚。` };
  const cost = GAME_CONFIG.costs.canopy;
  if (cost > state.budgetRemaining) return { ...state, message: `预算不足，遮雨棚需要 ${cost}。` };
  return {
    ...state,
    board: {
      ...state.board,
      buildings: state.board.buildings.map((candidate) =>
        candidate.id === buildingId ? { ...candidate, hasCanopy: true } : candidate
      )
    },
    budgetRemaining: state.budgetRemaining - cost,
    history: [...state.history, { facilityPositions: [], canopyBuildingId: buildingId }],
    message: `已为${building.name}安装遮雨棚，花费 ${cost}。`
  };
}

export function undoLastBuild(state: GameState): GameState {
  if (state.phase !== 'build' || state.history.length === 0) return state;
  const entry = state.history[state.history.length - 1];
  if (!entry) return state;
  const removed = new Set(entry.facilityPositions);
  const removedCount = state.facilities.filter((facility) => removed.has(positionKey(facility.position))).length;
  const canopy = entry.canopyBuildingId
    ? state.board.buildings.find((building) => building.id === entry.canopyBuildingId)
    : undefined;
  const facilityRefund = state.facilities
    .filter((facility) => removed.has(positionKey(facility.position)))
    .reduce((sum, facility) => sum + GAME_CONFIG.costs[facility.kind], 0);
  const canopyRefund = canopy?.hasCanopy ? GAME_CONFIG.costs.canopy : 0;
  return {
    ...state,
    facilities: state.facilities.filter((facility) => !removed.has(positionKey(facility.position))),
    board: entry.canopyBuildingId
      ? {
          ...state.board,
          buildings: state.board.buildings.map((building) =>
            building.id === entry.canopyBuildingId ? { ...building, hasCanopy: false } : building
          )
        }
      : state.board,
    budgetRemaining: Math.min(GAME_CONFIG.budget, state.budgetRemaining + facilityRefund + canopyRefund),
    history: state.history.slice(0, -1),
    message: canopy ? `已撤销${canopy.name}的遮雨棚。` : `已撤销 ${removedCount} 个新设施。`
  };
}

export function clearBuild(state: GameState): GameState {
  if (state.phase !== 'build') return { ...state, message: '挑战进行中，建设操作已锁定。' };
  return {
    ...state,
    facilities: [],
    board: {
      ...state.board,
      buildings: state.board.buildings.map((building) => ({ ...building, hasCanopy: false }))
    },
    budgetRemaining: GAME_CONFIG.budget,
    history: [],
    message: '本局建设已清空，预算已恢复。'
  };
}

export function comfortScore(state: Pick<GameState, 'facilities' | 'board'>): number {
  const unique = new Map(state.facilities.map((facility) => [positionKey(facility.position), facility]));
  const trees = [...unique.values()].filter(({ kind }) => kind === 'tree').length;
  const grass = [...unique.values()].filter(({ kind }) => kind === 'grass').length;
  const canopies = state.board.buildings.filter(({ hasCanopy }) => hasCanopy).length;
  return Math.min(100, GAME_CONFIG.comfort.base + trees * GAME_CONFIG.comfort.tree + grass * GAME_CONFIG.comfort.grass + canopies * GAME_CONFIG.comfort.canopy);
}

export function remainingBuildSlots(state: GameState): string[] {
  return state.board.buildSlots.map(({ id }) => id);
}


