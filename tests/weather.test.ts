import { describe, expect, it } from 'vitest';
import { rollWeather } from '../src/core/weather';
import { SeededRandom } from '../src/core/rng';

describe('weather rolls', () => {
  it('uses only the allowed weather for each period and repeats from its seed', () => {
    for (const seed of [0, 1, 2, 5, 20, 2026, 65535]) {
      const first = rollWeather(new SeededRandom(seed));
      const repeated = rollWeather(new SeededRandom(seed));
      expect(repeated).toEqual(first);
      if (first.period === 'day') expect(['clear', 'light']).toContain(first.weather);
      else expect(['clear', 'heavy']).toContain(first.weather);
    }
  });
});
