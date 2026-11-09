import './styles/app.css';
import { createGameState } from './core/gameEngine';
import { createSeed } from './core/rng';
import { CampusScene, createCampusGame } from './scenes/CampusScene';
import { UIController } from './ui/uiController';

function seedFromQuery(name: string): number {
  const value = new URLSearchParams(window.location.search).get(name);
  if (value === null) return createSeed();
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 0xffff_ffff
    ? parsed >>> 0
    : createSeed();
}

function start(): void {
  const initialState = createGameState(seedFromQuery('mapSeed'), seedFromQuery('eventSeed'));
  const scene = new CampusScene();
  createCampusGame(scene);
  scene.setPresentation('day', 'clear', {});
  new UIController(scene, initialState);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

