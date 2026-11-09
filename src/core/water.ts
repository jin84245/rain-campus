import { GAME_CONFIG } from '../config/gameConfig';
import { positionKey, type Board, type FacilityKind, type GridPosition, type PlacedFacility, type Weather } from '../model/types';

const withinRange = (a: GridPosition, b: GridPosition): boolean =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= GAME_CONFIG.water.influenceRange;

export function waterFrames(board: Board, facilities: PlacedFacility[], weather: Weather): Record<string, number>[] {
  const amount = GAME_CONFIG.rainPerTick[weather];
  const entries = new Map<string, boolean>();
  for (const building of board.buildings) {
    entries.set(positionKey(building.entranceRoadCell), building.hasCanopy);
  }
  const facilityPositions = (kind: FacilityKind): GridPosition[] =>
    facilities.filter((facility) => facility.kind === kind).map((facility) => facility.position);
  const grass = facilityPositions('grass');
  const drains = facilityPositions('drain');
  let current = new Map(board.roadCells.map((cell) => [positionKey(cell), 0]));
  const frames: Record<string, number>[] = [];

  for (let tick = 0; tick < GAME_CONFIG.tickCountPerRound; tick += 1) {
    const next = new Map<string, number>();
    for (const cell of board.roadCells) {
      const key = positionKey(cell);
      const old = current.get(key) ?? 0;
      const hasCanopy = entries.get(key) ?? false;
      const rain = hasCanopy ? amount * (1 - GAME_CONFIG.water.canopyEntranceRainReduction) : amount;
      const absorbs = grass.some((position) => withinRange(cell, position));
      const drainsCell = drains.some((position) => withinRange(cell, position));
      const value = Math.max(
        0,
        old + rain
          - (absorbs ? GAME_CONFIG.water.grassAbsorptionPerTick : 0)
          - (drainsCell ? GAME_CONFIG.water.drainRemovalPerTick : 0)
      );
      next.set(key, value);
    }
    current = next;
    frames.push(Object.fromEntries(current));
  }
  return frames;
}
