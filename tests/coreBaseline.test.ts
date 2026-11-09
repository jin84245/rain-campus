import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateBoard } from '../src/core/mapGenerator';
import { simulateChallenge } from '../src/core/simulation';

const baseline = JSON.parse(readFileSync(
  new URL('../artifacts/baseline/pre-v4-20261104/core-baseline.json', import.meta.url),
  'utf8'
));

describe('visual upgrade core regression', () => {
  it('keeps seeded weather, water, accident, and score results unchanged', () => {
    const summary = simulateChallenge(generateBoard(baseline.mapSeed), [], baseline.eventSeed);
    const rounds = summary.rounds.map((round) => ({
      period: round.period,
      weather: round.weather,
      waterFrames: round.waterFrames.map((frame) => {
        const values = Object.values(frame);
        return {
          total: values.reduce((sum, value) => sum + value, 0),
          max: Math.max(0, ...values)
        };
      }),
      floodedRoadCells: round.floodedCells.length,
      roadAccidents: round.roadAccidents.length,
      buildingAccidents: round.buildingAccidents.length,
      safetyScore: round.safetyScore,
      comfortScore: round.comfortScore
    }));

    expect(rounds).toEqual(baseline.rounds);
    expect({
      averageSafety: summary.averageSafety,
      averageComfort: summary.averageComfort,
      totalScore: summary.totalScore,
      grade: summary.grade
    }).toEqual(baseline.final);
  });
});
