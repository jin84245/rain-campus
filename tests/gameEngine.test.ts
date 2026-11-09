import { describe, expect, it } from 'vitest';
import { createGameState, finishChallenge, returnToBuild, setBuildingAppearance, startChallenge } from '../src/core/gameEngine';

describe('five-round game flow', () => {
  it('replays the same results from the same seeds and locks construction while running', () => {
    const initial = createGameState(456, 789);
    const first = startChallenge(initial);
    const replay = startChallenge(createGameState(456, 789));
    expect(first.reports).toHaveLength(5);
    expect(first.reports).toEqual(replay.reports);
    expect(first.summary).toEqual(replay.summary);
    expect(first.phase).toBe('running');
  });

  it('returns to construction with the same map and event seeds after a result', () => {
    const running = startChallenge(createGameState(987, 654));
    const result = finishChallenge(running);
    const build = returnToBuild(result);
    expect(result.phase).toBe('result');
    expect(build.phase).toBe('build');
    expect(build.mapSeed).toBe(987);
    expect(build.eventSeed).toBe(654);
    expect(build.board).toEqual(running.board);
  });

  it('changes building appearance without changing challenge results or budget', () => {
    const initial = createGameState(123, 456);
    const buildingId = initial.board.buildings[0]!.id;
    const changed = setBuildingAppearance(initial, buildingId, 'brick');
    expect(changed.board.buildings.find(({ id }) => id === buildingId)?.appearance).toBe('brick');
    expect(changed.budgetRemaining).toBe(initial.budgetRemaining);
    expect(startChallenge(changed).reports).toEqual(startChallenge(initial).reports);

    const locked = setBuildingAppearance(startChallenge(initial), buildingId, 'blue');
    expect(locked.board.buildings.find(({ id }) => id === buildingId)?.appearance).toBeUndefined();
  });
});
