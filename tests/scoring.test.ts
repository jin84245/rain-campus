import { describe, expect, it } from 'vitest';
import { summarizeRounds } from '../src/core/scoring';
import { GAME_CONFIG } from '../src/config/gameConfig';
import type { RoundReport } from '../src/model/types';

function rounds(safetyScore: number, comfortScore: number): RoundReport[] {
  return Array.from({ length: GAME_CONFIG.roundCount }, (_, roundIndex) => ({
    roundIndex,
    period: 'day',
    weather: 'clear',
    waterFrames: [],
    floodedCells: [],
    roadAccidents: [],
    buildingAccidents: [],
    safetyScore,
    comfortScore
  }));
}

describe('challenge scoring', () => {
  it('weights safety and comfort as configured and assigns the expected grade', () => {
    const summary = summarizeRounds(rounds(80, 60));
    expect(summary.averageSafety).toBe(80);
    expect(summary.averageComfort).toBe(60);
    expect(summary.totalScore).toBe(Math.round(0.55 * 80 + 0.45 * 60));
    expect(summary.grade).toBe('B');
  });

  it('clamps overall scores and gives a finite empty summary', () => {
    const perfect = summarizeRounds(rounds(1000, 1000));
    const empty = summarizeRounds([]);
    expect(perfect.totalScore).toBe(100);
    expect(perfect.grade).toBe('S');
    expect(empty.totalScore).toBe(0);
    expect(Number.isFinite(empty.averageSafety)).toBe(true);
    expect(Number.isFinite(empty.averageComfort)).toBe(true);
  });
});
