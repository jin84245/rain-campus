import type { GridPosition } from '../model/types';

const N = 1;
const E = 2;
const S = 4;
const W = 8;

export type RoadShape = 'end' | 'horizontal' | 'vertical' | 'corner' | 'junction';

export function roadMask(position: GridPosition, roads: Set<string>): number {
  let mask = 0;
  if (roads.has(`${position.x},${position.y - 1}`)) mask |= N;
  if (roads.has(`${position.x + 1},${position.y}`)) mask |= E;
  if (roads.has(`${position.x},${position.y + 1}`)) mask |= S;
  if (roads.has(`${position.x - 1},${position.y}`)) mask |= W;
  return mask;
}

export function roadShape(mask: number): RoadShape {
  const bits = [N, E, S, W].filter((bit) => (mask & bit) !== 0);
  if (bits.length <= 1) return 'end';
  if (bits.length >= 3) return 'junction';
  if ((mask === (E | W))) return 'horizontal';
  if ((mask === (N | S))) return 'vertical';
  return 'corner';
}
