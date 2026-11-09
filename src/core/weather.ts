import { GAME_CONFIG } from '../config/gameConfig';
import { type Period, type Weather } from '../model/types';
import { SeededRandom } from './rng';

export interface WeatherRoll {
  period: Period;
  weather: Weather;
}

export function rollWeather(rng: SeededRandom): WeatherRoll {
  const period: Period = rng.next() < GAME_CONFIG.dayProbability ? 'day' : 'night';
  if (period === 'day') {
    return { period, weather: rng.next() < GAME_CONFIG.rainProbability.day ? 'light' : 'clear' };
  }
  return { period, weather: rng.next() < GAME_CONFIG.rainProbability.night ? 'heavy' : 'clear' };
}

export function weatherLabel(period: Period, weather: Weather): string {
  if (weather === 'clear') return period === 'day' ? '晴天' : '夜间无雨';
  return weather === 'light' ? '小雨' : '暴雨';
}
