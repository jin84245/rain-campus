import { GAME_CONFIG } from '../config/gameConfig';
import { positionKey, type Board, type Building, type GridPosition } from '../model/types';

export interface PixelRect { x: number; y: number; width: number; height: number }
export type EntranceSide = 'north' | 'south' | 'east' | 'west';
export interface VisualFootprint {
  buildingId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Always contains the building's original gameplay anchor. */
  labelBox: PixelRect;
  entranceSide: EntranceSide;
  /** Compact two-line label only when all nearby full-size badges are obstructed. */
  compactLabel?: boolean;
}

function footprintCells(x0: number, y0: number, size: number): GridPosition[] {
  const cells: GridPosition[] = [];
  for (let dy = 0; dy < size; dy += 1) {
    for (let dx = 0; dx < size; dx += 1) cells.push({ x: x0 + dx, y: y0 + dy });
  }
  return cells;
}

export function buildingEntranceSide(building: Pick<Building, 'position' | 'entranceRoadCell'>): EntranceSide {
  if (building.entranceRoadCell.x < building.position.x) return 'west';
  if (building.entranceRoadCell.x > building.position.x) return 'east';
  if (building.entranceRoadCell.y < building.position.y) return 'north';
  return 'south';
}

/** Default inset sign for 2x2/3x3 buildings; 1x1 labels are positioned separately. */
export function getBuildingLabelBox(x: number, y: number, size: number, side: EntranceSide): PixelRect {
  const tile = GAME_CONFIG.map.tileSize;
  const left = x * tile;
  const top = y * tile;
  const width = size * tile;
  const paddingX = side === 'east' || side === 'west' ? 8 : 4;
  return {
    x: left + paddingX,
    y: top + (side === 'south' ? 2 : width - 21),
    width: width - paddingX * 2,
    height: 19
  };
}


/** Preserve the complete building name even in a compact two-line sign. */
export function buildingSignText(name: string, compactLabel = false): string {
  const characters = [...name];
  return compactLabel && characters.length > 2
    ? `${characters.slice(0, 2).join('')}\n${characters.slice(2).join('')}`
    : name;
}

/** Text size derived from the REAL allocated sign box, not hardcoded to a tiny
 * 10px label. Every line must fit its physical pixel width. */
export function buildingSignFontSize(name: string, footprint: Pick<VisualFootprint, 'compactLabel' | 'labelBox'>): number {
  if (footprint.compactLabel) return 12;
  return [...name].length * 14 <= footprint.labelBox.width ? 14 : 12;
}

/**
 * Complete, readable signs even for a 1x1 visual building.
 * Larger buildings keep an inset roof sign. Compact buildings receive a
 * 14px horizontal label adjacent to their sprite, placed only over empty
 * non-interactive ground. The sign never changes the gameplay hitbox.
 */
function assignReadableLabelBoxes(board: Board, footprints: VisualFootprint[]): void {
  const tile = GAME_CONFIG.map.tileSize;
  const forbidden: PixelRect[] = [
    ...board.roadCells.map(({ x, y }) => ({ x: x * tile, y: y * tile, width: tile, height: tile })),
    ...board.buildSlots.flatMap((slot) => slot.candidateCells.map(({ x, y }) => (
      { x: x * tile, y: y * tile, width: tile, height: tile }
    )))
  ];
  const buildingBoxes = footprints.map(({ x, y, width, height }) => ({
    x: x * tile, y: y * tile, width: width * tile, height: height * tile
  }));
  const intersects = (a: PixelRect, b: PixelRect): boolean =>
    a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
  const labelBoxes: PixelRect[] = [];

  // The larger buildings' inset signs are always valid and take priority.
  for (const f of footprints.filter((entry) => entry.width > 1)) {
    labelBoxes.push(f.labelBox);
  }
  const mapWidth = GAME_CONFIG.map.width * tile;
  const mapHeight = GAME_CONFIG.map.height * tile;
  for (const f of footprints.filter((entry) => entry.width === 1)) {
    const building = board.buildings.find(({ id }) => id === f.buildingId);
    if (!building) throw new Error(`Missing building ${f.buildingId}`);
    // Chinese text at 14px with 3px padding; 50px for a three-character name.
    const labelWidth = Math.max(34, [...building.name].length * 14 + 8);
    const labelHeight = 19;
    const fx = f.x * tile;
    const fy = f.y * tile;
    const result: { box: PixelRect; priority: number }[] = [];
    // A small building may display its own horizontal sign across its roof;
    // slight overhang into EMPTY grass is allowed. Keep roads/build slots free.
    const offsets = [0, -8, 8, -16, 16, -24, 24, -32, 32, -48, 48];
    const sides: EntranceSide[] = ['north', 'south', 'east', 'west'];
    const canopy = getCanopyPixelBox(f);
    const currentBuildingIndex = footprints.indexOf(f);
    for (const shift of offsets) {
      for (const yShift of [0, 10, 12, 4]) {
        const roof: PixelRect = {
          x: Math.round(fx + (tile - labelWidth) / 2 + shift),
          y: fy + yShift,
          width: labelWidth,
          height: labelHeight
        };
        if (roof.x < 0 || roof.y < 0 || roof.x + roof.width > mapWidth || roof.y + roof.height > mapHeight) continue;
        if (forbidden.some((other) => intersects(roof, other))) continue;
        if (buildingBoxes.some((other, index) => index !== currentBuildingIndex && intersects(roof, other))) continue;
        if (labelBoxes.some((other) => intersects(roof, other))) continue;
        if (intersects(roof, canopy)) continue;
        result.push({ box: roof, priority: -20 + Math.abs(shift) * 0.8 + Math.abs(yShift - 5) * .1 });
      }
    }
    for (const side of sides) {
      for (const shift of offsets) {
        for (const gap of [2, 10, 18, 34, 50]) {
          let x = fx + (tile - labelWidth) / 2;
          let y = fy + (tile - labelHeight) / 2;
          if (side === 'north') { x += shift; y = fy - labelHeight - gap; }
          if (side === 'south') { x += shift; y = fy + tile + gap; }
          if (side === 'west') { x = fx - labelWidth - gap; y += shift; }
          if (side === 'east') { x = fx + tile + gap; y += shift; }
          const box: PixelRect = { x: Math.round(x), y: Math.round(y), width: labelWidth, height: labelHeight };
          if (box.x < 0 || box.y < 0 || box.x + box.width > mapWidth || box.y + box.height > mapHeight) continue;
          if (forbidden.some((other) => intersects(box, other))) continue;
          if (buildingBoxes.some((other) => intersects(box, other))) continue;
          if (labelBoxes.some((other) => intersects(box, other))) continue;
          // Avoid placing signage along the building entrance / busy road side.
          const priority = gap + Math.abs(shift) * .8 + (side === f.entranceSide ? 12 : 0);
          result.push({ box, priority });
        }
      }
    }
    result.sort((a, b) => a.priority - b.priority || a.box.y - b.box.y || a.box.x - b.box.x);
    const best = result[0];
    if (best) {
      f.labelBox = best.box;
    } else {
      // Rare crowded layout: preserve *every* character on a small, two-line
      // rooftop sign. Keep it opposite the road-facing awning without covering
      // any adjacent road, construction slot, or another building.
      const width = 24;
      const height = 24;
      const x = fx + (f.entranceSide === 'west' ? 8 : 0);
      const y = fy + (f.entranceSide === 'north' ? 8 : 0);
      f.labelBox = { x, y, width, height };
      f.compactLabel = true;
    }
    labelBoxes.push(f.labelBox);
  }
}

/**
 * Aesthetic-only sprite footprints. EVERY building contains its original logical
 * anchor. Every other anchor, the road, and each buildable candidate remain free.
 * A 3x3/2x2/1x1 sprite has a matching native-resolution PNG, never rescaled from
 * the 48x48 PNG to a fractional number of tiles.
 */
export function layoutBuildingFootprints(board: Board): VisualFootprint[] {
  const reserved = new Set([
    ...board.roadCells.map(positionKey),
    ...board.buildSlots.flatMap((slot) => slot.candidateCells.map(positionKey))
  ]);
  const allAnchors = new Map(board.buildings.map((building) => [positionKey(building.position), building.id]));
  const used = new Set<string>();
  const results: VisualFootprint[] = [];
  const { width, height } = GAME_CONFIG.map;

  for (const building of board.buildings) {
    let selected: { x: number; y: number; size: number; score: number } | null = null;
    const anchor = building.position;
    for (const size of [3, 2, 1]) {
      for (let x0 = anchor.x - size + 1; x0 <= anchor.x; x0 += 1) {
        for (let y0 = anchor.y - size + 1; y0 <= anchor.y; y0 += 1) {
          if (x0 < 0 || y0 < 0 || x0 + size > width || y0 + size > height) continue;
          const cells = footprintCells(x0, y0, size);
          if (cells.some((cell) => {
            const key = positionKey(cell);
            const owner = allAnchors.get(key);
            return reserved.has(key) || used.has(key) || (owner !== undefined && owner !== building.id);
          })) continue;
          // Always prioritize the largest possible sprite, then the one whose
          // center is closest to its logical anchor. This is deterministic.
          const centerX = x0 + (size - 1) / 2;
          const centerY = y0 + (size - 1) / 2;
          const score = (3 - size) * 100 + Math.abs(centerX - anchor.x) + Math.abs(centerY - anchor.y)
            + y0 * 0.0001 + x0 * 0.00001;
          if (!selected || score < selected.score) selected = { x: x0, y: y0, size, score };
        }
      }
    }
    // A 1x1 sprite on the anchor is always legal for a valid Board.
    if (!selected) throw new Error(`No valid visual footprint for ${building.id}`);
    for (const cell of footprintCells(selected.x, selected.y, selected.size)) {
      used.add(positionKey(cell));
    }
    const side = buildingEntranceSide(building);
    results.push({
      buildingId: building.id,
      x: selected.x,
      y: selected.y,
      width: selected.size,
      height: selected.size,
      entranceSide: side,
      labelBox: getBuildingLabelBox(selected.x, selected.y, selected.size, side)
    });
  }
  assignReadableLabelBoxes(board, results);
  return results;
}

/** Small pixel awning fixed to the VISIBLE building's entrance-facing edge. */
export function getCanopyPixelBox(footprint: VisualFootprint): PixelRect {
  const tile = GAME_CONFIG.map.tileSize;
  const x = footprint.x * tile;
  const y = footprint.y * tile;
  const width = footprint.width * tile;
  const height = footprint.height * tile;
  if (footprint.entranceSide === 'north' || footprint.entranceSide === 'south') {
    const awningWidth = Math.min(26, width - 8);
    return {
      x: x + (width - awningWidth) / 2,
      y: footprint.entranceSide === 'north' ? y + 2 : y + height - 8,
      width: awningWidth,
      height: 6
    };
  }
  const awningHeight = Math.min(26, height - 8);
  return {
    x: footprint.entranceSide === 'west' ? x + 2 : x + width - 8,
    y: y + (height - awningHeight) / 2,
    width: 6,
    height: awningHeight
  };
}

export function visualFootprintContains(footprint: VisualFootprint, position: GridPosition): boolean {
  return position.x >= footprint.x && position.x < footprint.x + footprint.width
    && position.y >= footprint.y && position.y < footprint.y + footprint.height;
}
