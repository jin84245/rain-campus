import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/core/gameEngine';
import { comfortScore, placeFacility, previewPlacement, installCanopy, undoLastBuild, clearBuild } from '../src/core/placement';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { positionKey, type FacilityKind } from '../src/model/types';
import { simulateChallenge } from '../src/core/simulation';

const initial = () => createGameState(731, 884);

describe('facility placement and budget', () => {
  it('deduplicates repeated purchases and undo refunds only newly created facilities', () => {
    const state = initial();
    const slot = state.board.buildSlots[0]!;
    const preview = previewPlacement(state, slot.id, 'tree');
    expect(preview.status).toBe('ready');
    const placed = placeFacility(state, slot.id, 'tree');
    expect(placed.facilities).toHaveLength(preview.positions.length);
    expect(placed.budgetRemaining).toBe(GAME_CONFIG.budget - preview.cost);
    expect(comfortScore(placed)).toBe(GAME_CONFIG.comfort.base + preview.positions.length * GAME_CONFIG.comfort.tree);

    const duplicate = placeFacility(placed, slot.id, 'tree');
    expect(duplicate.facilities).toEqual(placed.facilities);
    expect(duplicate.budgetRemaining).toBe(placed.budgetRemaining);
    expect(duplicate.history).toEqual(placed.history);

    const undone = undoLastBuild(placed);
    expect(undone.facilities).toHaveLength(0);
    expect(undone.budgetRemaining).toBe(GAME_CONFIG.budget);
  });

  it('keeps tree variants visual-only with identical cost, comfort, and challenge results', () => {
    const state = initial();
    const slot = state.board.buildSlots[0]!;
    const broadleaf = placeFacility(state, slot.id, 'tree', 'broadleaf');
    const pine = placeFacility(state, slot.id, 'tree', 'pine');

    expect(broadleaf.facilities.map(({ variant }) => variant)).toEqual(Array(broadleaf.facilities.length).fill('broadleaf'));
    expect(pine.facilities.map(({ variant }) => variant)).toEqual(Array(pine.facilities.length).fill('pine'));
    expect(pine.budgetRemaining).toBe(broadleaf.budgetRemaining);
    expect(comfortScore(pine)).toBe(comfortScore(broadleaf));
    expect(simulateChallenge(state.board, pine.facilities, state.eventSeed)).toEqual(
      simulateChallenge(state.board, broadleaf.facilities, state.eventSeed)
    );

    const lawn = placeFacility(state, slot.id, 'grass', 'lawn');
    const tuft = placeFacility(state, slot.id, 'grass', 'grass-tuft');
    const shrub = placeFacility(state, slot.id, 'grass', 'shrub');
    expect(tuft.budgetRemaining).toBe(lawn.budgetRemaining);
    expect(shrub.budgetRemaining).toBe(lawn.budgetRemaining);
    expect(comfortScore(tuft)).toBe(comfortScore(lawn));
    expect(simulateChallenge(state.board, shrub.facilities, state.eventSeed)).toEqual(
      simulateChallenge(state.board, lawn.facilities, state.eventSeed)
    );
  });

  it('allows same-type overlap without rebuying and rejects a different-type conflict', () => {
    const state = initial();
    const slot = state.board.buildSlots.find((candidate) => candidate.candidateCells.length === 2)!;
    const existing = slot.candidateCells[0]!;
    const seeded = { ...state, facilities: [{ position: existing, kind: 'tree' as FacilityKind }] };
    const preview = previewPlacement(seeded, slot.id, 'tree');
    expect(preview.status).toBe('ready');
    expect(preview.positions.map(positionKey)).not.toContain(positionKey(existing));
    expect(preview.cost).toBe(GAME_CONFIG.costs.tree);
    expect(previewPlacement(seeded, slot.id, 'grass').status).toBe('conflict');
  });

  it('rejects an over-budget operation as a whole', () => {
    const state = initial();
    const slot = state.board.buildSlots[0]!;
    const preview = previewPlacement(state, slot.id, 'drain');
    const short = { ...state, budgetRemaining: preview.cost - 1 };
    const result = placeFacility(short, slot.id, 'drain');
    expect(result.facilities).toEqual([]);
    expect(result.budgetRemaining).toBe(short.budgetRemaining);
    expect(result.history).toEqual([]);
    expect(result.message).toContain('预算不足');
  });

  it('installs one canopy per building, and undo restores both shelter and budget', () => {
    const state = initial();
    const building = state.board.buildings[0]!;
    const installed = installCanopy(state, building.id);
    expect(installed.board.buildings[0]?.hasCanopy).toBe(true);
    expect(installed.budgetRemaining).toBe(GAME_CONFIG.budget - GAME_CONFIG.costs.canopy);
    const duplicate = installCanopy(installed, building.id);
    expect(duplicate.budgetRemaining).toBe(installed.budgetRemaining);
    expect(duplicate.history).toHaveLength(1);
    const undone = undoLastBuild(installed);
    expect(undone.board.buildings[0]?.hasCanopy).toBe(false);
    expect(undone.budgetRemaining).toBe(GAME_CONFIG.budget);
  });

  it('clears all facilities and canopies back to the configured budget', () => {
    const state = initial();
    const withCanopy = installCanopy(state, state.board.buildings[0]!.id);
    const withTree = placeFacility(withCanopy, withCanopy.board.buildSlots[0]!.id, 'tree');
    const reset = clearBuild(withTree);
    expect(reset.facilities).toEqual([]);
    expect(reset.board.buildings.every(({ hasCanopy }) => !hasCanopy)).toBe(true);
    expect(reset.budgetRemaining).toBe(GAME_CONFIG.budget);
    expect(reset.history).toEqual([]);
  });
});
