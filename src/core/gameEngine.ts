import { GAME_CONFIG } from '../config/gameConfig';
import { generateBoard } from './mapGenerator';
import { clearBuild, installCanopy, placeFacility, undoLastBuild } from './placement';
import { simulateChallenge } from './simulation';
import type { BuildingAppearance, FacilityKind, FacilityVariant, GameState } from '../model/types';

export function createGameState(mapSeed: number, eventSeed: number): GameState {
  return {
    board: generateBoard(mapSeed),
    mapSeed: mapSeed >>> 0,
    eventSeed: eventSeed >>> 0,
    phase: 'build',
    facilities: [],
    budgetRemaining: GAME_CONFIG.budget,
    history: [],
    reports: [],
    currentRoundIndex: 0,
    currentTick: 0,
    summary: null,
    message: '先安排设施，再开始五轮挑战。'
  };
}

export function buildFacility(state: GameState, slotId: string, kind: FacilityKind, variant?: FacilityVariant): GameState {
  return placeFacility(state, slotId, kind, variant);
}

export function setBuildingAppearance(state: GameState, buildingId: string, appearance: BuildingAppearance): GameState {
  if (state.phase !== 'build') return { ...state, message: '挑战进行中，外观调整已锁定。' };
  if (!state.board.buildings.some((building) => building.id === buildingId)) return { ...state, message: '没有找到这栋建筑。' };
  return {
    ...state,
    board: {
      ...state.board,
      buildings: state.board.buildings.map((building) =>
        building.id === buildingId ? { ...building, appearance } : building
      )
    }
  };
}

export function buildCanopy(state: GameState, buildingId: string): GameState {
  return installCanopy(state, buildingId);
}

export function undoBuild(state: GameState): GameState {
  return undoLastBuild(state);
}

export function resetBuild(state: GameState): GameState {
  return clearBuild(state);
}

export function startChallenge(state: GameState): GameState {
  if (state.phase !== 'build') return state;
  const summary = simulateChallenge(state.board, state.facilities, state.eventSeed);
  return {
    ...state,
    phase: 'running',
    currentRoundIndex: 0,
    currentTick: 0,
    reports: summary.rounds,
    summary,
    message: '挑战开始，建设已锁定。'
  };
}

export function setChallengeTick(state: GameState, tick: number): GameState {
  if (state.phase !== 'running') return state;
  return { ...state, currentTick: Math.max(0, Math.min(GAME_CONFIG.tickCountPerRound, tick)) };
}

export function advanceChallengeRound(state: GameState): GameState {
  if (state.phase !== 'running') return state;
  if (state.currentRoundIndex + 1 >= GAME_CONFIG.roundCount) return finishChallenge(state);
  return { ...state, currentRoundIndex: state.currentRoundIndex + 1, currentTick: 0 };
}

export function finishChallenge(state: GameState): GameState {
  if (state.phase !== 'running') return state;
  return {
    ...state,
    phase: 'result',
    currentRoundIndex: Math.max(0, state.reports.length - 1),
    currentTick: GAME_CONFIG.tickCountPerRound,
    message: '五轮挑战完成。'
  };
}

export function returnToBuild(state: GameState): GameState {
  if (state.phase !== 'result') return state;
  return {
    ...state,
    phase: 'build',
    currentRoundIndex: 0,
    currentTick: 0,
    reports: [],
    summary: null,
    message: '可以在原地图上调整方案；地图与事件种子保持不变。'
  };
}



