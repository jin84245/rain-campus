import { GAME_CONFIG } from '../config/gameConfig';
import type { Board, ChallengeSummary, PlacedFacility, RoundReport } from '../model/types';
import { resolveAccidents, roundSafetyScore } from './accident';
import { comfortScore } from './placement';
import { SeededRandom } from './rng';
import { summarizeRounds } from './scoring';
import { rollWeather } from './weather';
import { waterFrames } from './water';

export function simulateChallenge(board: Board, facilities: PlacedFacility[], eventSeed: number): ChallengeSummary {
  const rng = new SeededRandom(eventSeed);
  const comfort = comfortScore({ board, facilities });
  const rounds: RoundReport[] = [];

  for (let roundIndex = 0; roundIndex < GAME_CONFIG.roundCount; roundIndex += 1) {
    const { period, weather } = rollWeather(rng);
    const frames = waterFrames(board, facilities, weather);
    const finalWater = frames[frames.length - 1] ?? {};
    const floodedCells = board.roadCells
      .map(({ x, y }) => `${x},${y}`)
      .filter((key) => (finalWater[key] ?? 0) >= GAME_CONFIG.water.floodThreshold);
    const accidents = resolveAccidents(board, facilities, finalWater, weather, rng);
    rounds.push({
      roundIndex,
      period,
      weather,
      waterFrames: frames,
      floodedCells,
      roadAccidents: accidents.roadAccidents,
      buildingAccidents: accidents.buildingAccidents,
      safetyScore: roundSafetyScore(weather, facilities, accidents),
      comfortScore: comfort
    });
  }

  return summarizeRounds(rounds);
}

export type { ChallengeSummary };
