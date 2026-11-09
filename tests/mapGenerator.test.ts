import { describe, expect, it } from 'vitest';
import { generateBoard, generateRoadPath, validateBoard } from '../src/core/mapGenerator';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { positionKey, type GridPosition } from '../src/model/types';

function turns(path: GridPosition[]): number {
  let result = 0;
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1]!;
    const current = path[index]!;
    const next = path[index + 1]!;
    if (current.x - previous.x !== next.x - current.x || current.y - previous.y !== next.y - current.y) result += 1;
  }
  return result;
}

describe('campus map generation', () => {
  it('supports the straight and three-turn edge layouts in both valid orientations', () => {
    const straight = generateRoadPath(51, 0, 'horizontal');
    const bent = generateRoadPath(52, 3, 'vertical');
    expect(straight).toHaveLength(GAME_CONFIG.map.roadCells);
    expect(turns(straight)).toBe(0);
    expect(bent).toHaveLength(GAME_CONFIG.map.roadCells);
    expect(turns(bent)).toBe(3);
    expect(bent.some((cell, index) => index > 0 && cell.x !== bent[index - 1]!.x)).toBe(true);
    expect(bent.some((cell, index) => index > 0 && cell.y !== bent[index - 1]!.y)).toBe(true);
  });

  it('creates deterministic 32x18 boards with five entrances and eight usable slots', () => {
    for (const seed of [0, 1, 17, 42, 12345, 0xffff_ffff]) {
      const board = generateBoard(seed);
      expect(validateBoard(board)).toBe(true);
      expect(board.seed).toBe(seed >>> 0);
      expect(GAME_CONFIG.map.width).toBe(32);
      expect(GAME_CONFIG.map.height).toBe(18);
      expect(board.roadCells).toHaveLength(20);
      expect(board.turns).toBeGreaterThanOrEqual(0);
      expect(board.turns).toBeLessThanOrEqual(3);
      expect(board.buildings).toHaveLength(5);
      expect(board.buildSlots).toHaveLength(GAME_CONFIG.map.buildPairSlots);
      expect(board.buildSlots).toHaveLength(8);
      expect(new Set(board.roadCells.map(positionKey)).size).toBe(20);
      expect(new Set(board.buildings.map(({ entranceRoadCell }) => positionKey(entranceRoadCell))).size).toBe(5);
      expect(board.buildSlots.every(({ candidateCells }) => candidateCells.length >= 1 && candidateCells.length <= 2)).toBe(true);
      expect(new Set(board.buildSlots.flatMap(({ candidateCells }) => candidateCells.map(positionKey))).size).toBeGreaterThanOrEqual(8);
      expect(generateBoard(seed)).toEqual(board);
    }
  });

  it('keeps eight distinct selectable groups across straight, one-turn, two-turn, and three-turn roads', () => {
    const boards = [7, 0, 1, 4].map(generateBoard);
    expect(new Set(boards.map(({ turns }) => turns))).toEqual(new Set([0, 1, 2, 3]));
    for (const board of boards) {
      expect(board.buildSlots).toHaveLength(8);
      expect(new Set(board.buildSlots.map(({ roadAnchor }) => positionKey(roadAnchor))).size).toBe(8);
      for (const slot of board.buildSlots) {
        for (const cell of slot.candidateCells) {
          expect(Math.abs(cell.x - slot.roadAnchor.x) + Math.abs(cell.y - slot.roadAnchor.y)).toBe(1);
        }
      }
    }
  });

  it('keeps buildings off the road and gives each one a unique orthogonal entrance', () => {
    const board = generateBoard(938475);
    const roadKeys = new Set(board.roadCells.map(positionKey));
    for (const building of board.buildings) {
      expect(roadKeys.has(positionKey(building.position))).toBe(false);
      expect(roadKeys.has(positionKey(building.entranceRoadCell))).toBe(true);
      expect(Math.abs(building.position.x - building.entranceRoadCell.x) + Math.abs(building.position.y - building.entranceRoadCell.y)).toBe(1);
    }
  });
});
