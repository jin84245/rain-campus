import { GAME_CONFIG } from '../config/gameConfig';
import { positionKey, type Board, type FacilityKind, type PlacedFacility, type RoadAccident, type Weather } from '../model/types';
import { SeededRandom } from './rng';

const adjacentFacility = (
  cellKey: string,
  kind: FacilityKind,
  facilities: PlacedFacility[],
  roadPosition: { x: number; y: number }
): boolean => facilities.some((facility) =>
  facility.kind === kind
  && Math.max(Math.abs(facility.position.x - roadPosition.x), Math.abs(facility.position.y - roadPosition.y)) <= GAME_CONFIG.water.influenceRange
  && positionKey(facility.position) !== cellKey
);

export interface AccidentResult {
  roadAccidents: RoadAccident[];
  buildingAccidents: string[];
}

export function resolveAccidents(
  board: Board,
  facilities: PlacedFacility[],
  finalWater: Record<string, number>,
  weather: Weather,
  rng: SeededRandom
): AccidentResult {
  const roadAccidents: RoadAccident[] = [];
  const buildingAccidents: string[] = [];
  const entranceKeys = new Set(board.buildings.map(({ entranceRoadCell }) => positionKey(entranceRoadCell)));
  const roadProbability = weather === 'clear' ? 0 : GAME_CONFIG.safety.roadAccidentProbability[weather];
  const buildingProbabilities = weather === 'clear' ? null : GAME_CONFIG.safety.buildingAccidentProbability[weather];

  if (roadProbability > 0) {
    for (const cell of board.roadCells) {
      const cellKey = positionKey(cell);
      if (entranceKeys.has(cellKey) || (finalWater[cellKey] ?? 0) < GAME_CONFIG.water.floodThreshold) continue;
      if (rng.next() >= roadProbability) continue;
      let penalty = GAME_CONFIG.safety.roadAccidentPenalty;
      if (weather === 'heavy' && adjacentFacility(cellKey, 'tree', facilities, cell)) {
        penalty += GAME_CONFIG.safety.heavyTreeExtraPenaltyOnAccident;
      }
      if (weather === 'heavy' && adjacentFacility(cellKey, 'grass', facilities, cell)) {
        penalty += GAME_CONFIG.safety.heavyGrassExtraPenaltyOnAccident;
      }
      roadAccidents.push({ cellKey, penalty });
    }
  }

  if (buildingProbabilities) {
    for (const building of board.buildings) {
      const chance = building.hasCanopy ? buildingProbabilities.withCanopy : buildingProbabilities.withoutCanopy;
      if (rng.next() < chance) buildingAccidents.push(building.id);
    }
  }

  return { roadAccidents, buildingAccidents };
}

export function roundSafetyScore(
  weather: Weather,
  facilities: PlacedFacility[],
  accidents: AccidentResult
): number {
  const penalties = accidents.roadAccidents.reduce((sum, accident) => sum + accident.penalty, 0);
  const buildingPenalty = weather === 'light'
    ? GAME_CONFIG.safety.buildingAccidentPenalty.light
    : weather === 'heavy' ? GAME_CONFIG.safety.buildingAccidentPenalty.heavy : 0;
  const treeCount = new Set(facilities.filter(({ kind }) => kind === 'tree').map(({ position }) => positionKey(position))).size;
  const treeBonus = weather === 'light'
    ? Math.min(treeCount * GAME_CONFIG.safety.lightTreeBonusPerUniqueTree, GAME_CONFIG.safety.lightTreeBonusCap)
    : 0;
  const raw = 100
    - penalties
    - accidents.buildingAccidents.length * buildingPenalty
    + treeBonus;
  return Math.max(0, Math.min(100, raw));
}
