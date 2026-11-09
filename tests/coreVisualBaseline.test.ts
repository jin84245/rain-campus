import { describe, expect, it } from 'vitest';
import fixture from './fixtures/v4-core-regression.json';
import { createGameState, buildCanopy, buildFacility, startChallenge } from '../src/core/gameEngine';
import type { FacilityKind } from '../src/model/types';

type Setup = { mapSeed: number; eventSeed: number; build: FacilityKind[]; canopy?: boolean };

describe('V4 hard numeric regression: full five-round records and per-cell water', () => {
  for (const [name, baseline] of Object.entries(fixture)) {
    it(`matches frozen original core algorithms for ${name}`, () => {
      const { configuration } = baseline as { configuration: Setup };
      let state = createGameState(configuration.mapSeed, configuration.eventSeed);
      for (const [index, kind] of configuration.build.entries()) {
        state = buildFacility(state, state.board.buildSlots[index]!.id, kind);
      }
      if (configuration.canopy) {
        state = buildCanopy(state, state.board.buildings[0]!.id);
      }
      const result = startChallenge(state);
      expect({
        configuration,
        facilities: state.facilities.map(({ position, kind }) => ({ position, kind })),
        buildings: state.board.buildings.map(({ id, hasCanopy }) => ({ id, canopy: hasCanopy })),
        budgetRemaining: state.budgetRemaining,
        summary: result.summary
      }).toEqual(baseline);
    });
  }
});
