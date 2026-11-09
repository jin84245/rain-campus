import { GAME_CONFIG } from '../config/gameConfig';
import type { ChallengeSummary, RoundReport } from '../model/types';

export const clampScore = (score: number): number => Math.max(0, Math.min(100, score));

export function summarizeRounds(rounds: RoundReport[]): ChallengeSummary {
  const averageSafety = rounds.length === 0
    ? 0
    : rounds.reduce((sum, round) => sum + round.safetyScore, 0) / rounds.length;
  const averageComfort = rounds.length === 0
    ? 0
    : rounds.reduce((sum, round) => sum + round.comfortScore, 0) / rounds.length;
  const totalScore = Math.round(
    GAME_CONFIG.score.safetyWeight * averageSafety + GAME_CONFIG.score.comfortWeight * averageComfort
  );
  const grade: ChallengeSummary['grade'] = totalScore >= GAME_CONFIG.score.gradeS
    ? 'S'
    : totalScore >= GAME_CONFIG.score.gradeA
      ? 'A'
      : totalScore >= GAME_CONFIG.score.gradeB ? 'B' : 'C';
  return { rounds, averageSafety, averageComfort, totalScore: clampScore(totalScore), grade };
}
