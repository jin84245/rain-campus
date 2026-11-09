import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/core/gameEngine';
import { waterFrames } from '../src/core/water';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { positionKey } from '../src/model/types';

describe('dynamic water', () => {
  it('adds equal rain to each road cell and resets clear-weather water to zero', () => {
    const board = createGameState(77, 90).board;
    const frames = waterFrames(board, [], 'heavy');
    expect(frames[0]?.[positionKey(board.roadCells[0]!)]).toBe(GAME_CONFIG.rainPerTick.heavy);
    expect(frames[7]?.[positionKey(board.roadCells[0]!)]).toBe(GAME_CONFIG.rainPerTick.heavy * GAME_CONFIG.tickCountPerRound);
    expect(waterFrames(board, [], 'clear').every((frame) => Object.values(frame).every((value) => value === 0))).toBe(true);
  });

  it('applies grass absorption once, drains nearby roads, and never makes water negative', () => {
    const board = createGameState(77, 90).board;
    const slot = board.buildSlots.find(({ candidateCells, roadAnchor }) =>
      candidateCells.length > 0 && !board.buildings.some(({ entranceRoadCell }) => positionKey(entranceRoadCell) === positionKey(roadAnchor))
    )!;
    const roadKey = positionKey(slot.roadAnchor);
    const facilityPosition = slot.candidateCells[0]!;
    const grass = waterFrames(board, [{ position: facilityPosition, kind: 'grass' }], 'heavy');
    expect(grass[0]?.[roadKey]).toBe(2.5);
    expect(grass[7]?.[roadKey]).toBe(20);
    const drained = waterFrames(board, [
      { position: facilityPosition, kind: 'drain' },
      { position: slot.candidateCells[1] ?? facilityPosition, kind: 'drain' }
    ], 'heavy');
    expect(drained.every((frame) => Object.values(frame).every((value) => value >= 0))).toBe(true);
    expect(drained[7]?.[roadKey]).toBe(0);
  });

  it('reduces rain at a sheltered entrance and keeps entry water separate from road incidents', () => {
    const board = createGameState(123, 456).board;
    const target = board.buildings[0]!;
    const entranceKey = positionKey(target.entranceRoadCell);
    const unsheltered = waterFrames(board, [], 'heavy');
    const shelteredBoard = {
      ...board,
      buildings: board.buildings.map((building) => building.id === target.id ? { ...building, hasCanopy: true } : building)
    };
    const sheltered = waterFrames(shelteredBoard, [], 'heavy');
    expect(unsheltered[7]?.[entranceKey]).toBe(24);
    expect(sheltered[0]?.[entranceKey]).toBe(0.75);
    expect(sheltered[7]?.[entranceKey]).toBe(6);
  });
});
