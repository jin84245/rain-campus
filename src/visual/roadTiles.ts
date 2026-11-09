/** Adapt the existing 4-neighbor bitmask to Pulse's 47-tile blob road atlas.
 *  North=1 East=2 South=4 West=8, unchanged from src/core/roadAutotile.ts.
 *  Pulse mapping.json (0:isolated,1..4:ends,5..6:straights,7..14:corners,
 *  15..30:T junctions,31..46:crossings).
 */
const MASK_TO_PULSE_TILE: Record<number, number> = {
  0: 0,
  1: 1, 2: 2, 4: 3, 8: 4,
  5: 5, 10: 6,
  3: 7, 6: 9, 12: 11, 9: 13,
  14: 15, 13: 19, 11: 23, 7: 27,
  15: 31
};
export function roadTileIndex(mask: number): number {
  if (!Number.isInteger(mask) || mask < 0 || mask > 15) throw new RangeError(`Invalid road mask: ${mask}`);
  return MASK_TO_PULSE_TILE[mask] ?? 0;
}
export function roadTextureKey(mask: number): string {
  return `pulse-road-${String(roadTileIndex(mask)).padStart(2, '0')}`;
}
