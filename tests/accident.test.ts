import { describe, expect, it } from 'vitest';
import { resolveAccidents, roundSafetyScore } from '../src/core/accident';
import { createGameState } from '../src/core/gameEngine';
import { SeededRandom } from '../src/core/rng';
import { positionKey, type Board, type GridPosition } from '../src/model/types';

function seedWithFirstDrawIn(min: number, max: number): number {
  for (let seed = 0; seed < 1000; seed += 1) {
    const value = new SeededRandom(seed).next();
    if (value >= min && value < max) return seed;
  }
  throw new Error('Could not find a fixed seed for the requested probability boundary.');
}

describe('conditional safety events', () => {
  it('does not create rain-related incidents in clear weather', () => {
    const board = createGameState(73, 91).board;
    const water = Object.fromEntries(board.roadCells.map((cell) => [positionKey(cell), 30]));
    const result = resolveAccidents(board, [], water, 'clear', new SeededRandom(22));
    expect(result.roadAccidents).toEqual([]);
    expect(result.buildingAccidents).toEqual([]);
    expect(roundSafetyScore('clear', [], result)).toBe(100);
  });

  it('applies heavy-rain tree and grass penalties once after a single road accident', () => {
    const generated = createGameState(70, 80).board;
    const cell = generated.roadCells.find((road) => !generated.buildings.some(({ entranceRoadCell }) => positionKey(entranceRoadCell) === positionKey(road)))!;
    const minimalBoard: Board = { ...generated, roadCells: [cell], buildings: [], buildSlots: [] };
    const upper = { x: cell.x + 1, y: cell.y } satisfies GridPosition;
    const lower = { x: cell.x - 1, y: cell.y } satisfies GridPosition;
    const facilities = [
      { position: upper, kind: 'tree' as const },
      { position: lower, kind: 'grass' as const }
    ];
    const seed = seedWithFirstDrawIn(0, 0.4);
    const result = resolveAccidents(minimalBoard, facilities, { [positionKey(cell)]: 6 }, 'heavy', new SeededRandom(seed));
    expect(result.roadAccidents).toEqual([{ cellKey: positionKey(cell), penalty: 9 }]);
    expect(roundSafetyScore('heavy', facilities, result)).toBe(91);
  });

  it('never judges a building entrance as an ordinary road accident', () => {
    const board = createGameState(17, 18).board;
    const entranceKeys = new Set(board.buildings.map(({ entranceRoadCell }) => positionKey(entranceRoadCell)));
    const water = Object.fromEntries(board.roadCells.map((cell) => [positionKey(cell), 24]));
    const result = resolveAccidents(board, [], water, 'heavy', new SeededRandom(300));
    expect(result.roadAccidents.every(({ cellKey }) => !entranceKeys.has(cellKey))).toBe(true);
    expect(result).toEqual(resolveAccidents(board, [], water, 'heavy', new SeededRandom(300)));
  });

  it('lowers building-event risk when a canopy is installed', () => {
    const generated = createGameState(41, 44).board;
    const building = generated.buildings[0]!;
    const minimal = { ...generated, roadCells: [], buildings: [building], buildSlots: [] };
    const sheltered: Board = {
      ...minimal,
      buildings: [{ ...building, hasCanopy: true }]
    };
    const seed = seedWithFirstDrawIn(0.15, 0.5);
    expect(resolveAccidents(minimal, [], {}, 'heavy', new SeededRandom(seed)).buildingAccidents).toEqual([building.id]);
    expect(resolveAccidents(sheltered, [], {}, 'heavy', new SeededRandom(seed)).buildingAccidents).toEqual([]);
  });
});
