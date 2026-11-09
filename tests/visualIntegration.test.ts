import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { generateBoard, validateBoard } from '../src/core/mapGenerator';
import { createGameState } from '../src/core/gameEngine';
import { previewPlacement } from '../src/core/placement';
import { simulateChallenge } from '../src/core/simulation';
import { positionKey } from '../src/model/types';
import { buildingSignFontSize, buildingSignText, getCanopyPixelBox, layoutBuildingFootprints, visualFootprintContains, type PixelRect } from '../src/visual/buildingLayout';
import { buildDecorationLayout, decorationOverlapsReserved } from '../src/visual/decorationLayout';
import { calculateCameraFrame } from '../src/visual/cameraFraming';
import { getPreviewOverlayColor } from '../src/visual/previewColors';
import { roadTileIndex } from '../src/visual/roadTiles';
import { campusAssets } from '../src/visual/assetsManifest';

const key = positionKey;
const TILE = GAME_CONFIG.map.tileSize;
const inside = (a: PixelRect, b: PixelRect): boolean =>
  a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
const intersects = (a: PixelRect, b: PixelRect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Coverage of the actual 8 slots and their shared candidate cells. */
describe('V4.3 campus-specific names and visual framing', () => {
  it('changes display names only, preserving stable gameplay identifiers and numeric parameters', () => {
    expect(GAME_CONFIG.buildings.map((building) => [building.type,building.name])).toEqual([
      ['library','骋望楼'],['teaching','东区主教'],['canteen','食堂'],
      ['shop','地下超市'],['dormitory','西四']
    ]);
    for (const seed of [1,7,25,123]) {
      const board = generateBoard(seed);
      expect(board.buildings.map((building)=>building.name).sort()).toEqual(
        [...GAME_CONFIG.buildings.map((building)=>building.name)].sort()
      );
      const footprints=layoutBuildingFootprints(board);
      const decorations=buildDecorationLayout(board);
      const frame=calculateCameraFrame(board,footprints,decorations,995,680);
      expect(frame.zoom).toBeGreaterThan(0);
      for(const f of footprints){
        const b=board.buildings.find((building)=>building.id===f.buildingId)!;
        expect(buildingSignText(b.name,f.compactLabel).replace(/\n/g,'')).toBe(b.name);
      }
    }
  });
});

describe('V4.1 visual/interaction regressions', () => {
  it('keeps ALL five building sprites anchored, labels bounded, canopies attached, and decoration free', () => {
    const seenTurns = new Set<number>();
    for (let seed = 0; seed < 500; seed += 1) {
      const board = generateBoard(seed);
      expect(validateBoard(board)).toBe(true);
      expect(board.buildSlots).toHaveLength(8);
      seenTurns.add(board.turns);
      const reserved = new Set([
        ...board.roadCells.map(key),
        ...board.buildSlots.flatMap((slot) => slot.candidateCells.map(key))
      ]);
      const footprints = layoutBuildingFootprints(board);
      const taken = new Set<string>();
      expect(footprints).toHaveLength(5);
      for (const footprint of footprints) {
        const building = board.buildings.find((b) => b.id === footprint.buildingId);
        expect(building).toBeDefined();
        expect(visualFootprintContains(footprint, building!.position), `building detached seed ${seed} id ${building!.id}`).toBe(true);
        const area = {x: footprint.x * TILE, y: footprint.y * TILE, width: footprint.width * TILE, height: footprint.height * TILE};
        // A full-width 14px sign may extend onto vacant grass when the sprite
        // is 1x1; only compact (10px, two-line) and 2x2/3x3 signs stay inside.
        if (footprint.width > 1 || footprint.compactLabel) {
          expect(inside(footprint.labelBox, area), `sign outside intended area seed ${seed}`).toBe(true);
        }
        const renderedName = buildingSignText(building!.name, footprint.compactLabel);
        expect(renderedName.replace(/\n/g, ''), `missing Chinese name seed ${seed}`).toBe(building!.name);
        const actualText = buildingSignText(building!.name, footprint.compactLabel);
        const longestLine = Math.max(...actualText.split('\n').map((line) => [...line].length));
        const actualFontSize = buildingSignFontSize(building!.name, footprint);
        expect(actualFontSize).toBeGreaterThanOrEqual(12);
        expect(footprint.labelBox.width).toBeGreaterThanOrEqual(longestLine * actualFontSize);
        // Even extended name badges cannot obscure roads or construction cells.
        for (const position of [...board.roadCells, ...board.buildSlots.flatMap((slot) => slot.candidateCells)]) {
          expect(intersects(footprint.labelBox, {
            x: position.x * TILE, y: position.y * TILE, width: TILE, height: TILE
          }), `name blocks road/build tile seed ${seed} id ${building!.id}`).toBe(false);
        }
        for (const other of footprints.filter((entry) => entry.buildingId !== footprint.buildingId)) {
          expect(intersects(footprint.labelBox, {
            x: other.x * TILE, y: other.y * TILE,
            width: other.width * TILE, height: other.height * TILE
          }), `name overlaps another building seed ${seed}`).toBe(false);
          expect(intersects(footprint.labelBox, other.labelBox), `two name badges overlap seed ${seed}`).toBe(false);
        }
        expect(inside(getCanopyPixelBox(footprint), area), `awning detached seed ${seed}`).toBe(true);
        expect(intersects(footprint.labelBox, getCanopyPixelBox(footprint)), `sign/awning overlap seed ${seed} id ${building!.id}`).toBe(false);
        expect(footprint.width).toBeGreaterThanOrEqual(1);
        expect(footprint.width).toBeLessThanOrEqual(3);
        expect(footprint.height).toBe(footprint.width);
        for (let y = footprint.y; y < footprint.y + footprint.height; y += 1) {
          for (let x = footprint.x; x < footprint.x + footprint.width; x += 1) {
            const cell = `${x},${y}`;
            expect(reserved.has(cell), `building covers road or build cell ${seed}/${cell}`).toBe(false);
            expect(taken.has(cell), `building overlaps another building ${seed}/${cell}`).toBe(false);
            taken.add(cell);
          }
        }
      }
      const decorations = buildDecorationLayout(board);
      expect(decorations).toEqual(buildDecorationLayout(board));
      for (const decoration of decorations) {
        expect(decorationOverlapsReserved(board, decoration), `prop obstructs gameplay seed ${seed}`).toBe(false);
      }
      const frame = calculateCameraFrame(board, footprints, decorations, 1024, 576);
      expect(frame.zoom).toBeGreaterThan(0);
      expect(frame.zoom).toBeLessThanOrEqual(2);
      expect(frame.x).toBeGreaterThan(0);
      expect(frame.y).toBeGreaterThan(0);
      // Pixel label rects participate in the camera-fit content bounds.
      for (const footprint of footprints) {
        expect(footprint.labelBox.x).toBeGreaterThanOrEqual(frame.bounds.x - 1);
        expect(footprint.labelBox.y).toBeGreaterThanOrEqual(frame.bounds.y - 1);
        expect(footprint.labelBox.x + footprint.labelBox.width).toBeLessThanOrEqual(frame.bounds.x + frame.bounds.width + 1);
        expect(footprint.labelBox.y + footprint.labelBox.height).toBeLessThanOrEqual(frame.bounds.y + frame.bounds.height + 1);
      }
    }
    expect([...seenTurns].sort()).toEqual([0, 1, 2, 3]);
  });

  it('keeps full names for known compact cases (seeds 1, 25 and 123)', () => {
    for (const seed of [1, 25, 123]) {
      const board = generateBoard(seed);
      const footprints = layoutBuildingFootprints(board);
      expect(footprints.some((entry) => entry.width === 1)).toBe(true);
      for (const entry of footprints) {
        const name = board.buildings.find((building) => building.id === entry.buildingId)!.name;
        expect(buildingSignText(name, entry.compactLabel).replace(/\n/g, '')).toBe(name);
      }
    }
  });

  it('uses source PNGs exactly half the displayed pixel size at 1x1, 2x2 and 3x3', () => {
    const keys = new Set(campusAssets().map(({key})=>key));
    for (const kind of GAME_CONFIG.buildings.map((b) => b.type)) {
      for (const appearance of ['campus', 'brick', 'blue']) {
        for (const size of [1, 2, 3]) {
          const asset = campusAssets().find((entry) => entry.key === `campus-building-${kind}-${appearance}-${size}`);
          expect(asset).toBeDefined();
          expect(keys.has(asset!.key)).toBe(true);
          const png = readFileSync(`public/${asset!.path}`);
          expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
          expect(png.readUInt32BE(16)).toBe(size * 16);
          expect(png.readUInt32BE(20)).toBe(size * 16);
          expect(size * TILE / (size * 16)).toBe(2);
        }
      }
    }
  });

  it('renders conflict red even if the core returns an empty list of new positions', () => {
    const state = createGameState(7, 456);
    const slotId = state.board.buildSlots[0]!.id;
    state.facilities.push({position:state.board.buildSlots[0]!.candidateCells[0]!,kind:'grass',variant:'lawn'});
    const preview = previewPlacement(state,slotId,'tree');
    expect(preview.status).toBe('conflict');
    expect(preview.positions).toHaveLength(0);
    expect(getPreviewOverlayColor(preview.status,false)).toBe(0xd94845);
    expect(getPreviewOverlayColor('no-change',false)).toBe(0x9bb2ab);
    expect(getPreviewOverlayColor('ready',true)).toBe(0x39df8c);
    expect(getPreviewOverlayColor('over-budget',true)).toBe(0xe76e63);
  });

  it('maps every road orientation and preserves the numerical five-round algorithm', () => {
    for (let mask = 0; mask < 16; mask += 1) {
      expect(roadTileIndex(mask)).toBeGreaterThanOrEqual(0);
      expect(roadTileIndex(mask)).toBeLessThan(47);
    }
    expect(() => roadTileIndex(-1)).toThrow();
    expect(() => roadTileIndex(16)).toThrow();
    for (const seed of [0, 1, 4, 7, 42, 123]) {
      const board = generateBoard(seed);
      const before = simulateChallenge(board, [], 456);
      const visuals = layoutBuildingFootprints(board);
      buildDecorationLayout(board);
      calculateCameraFrame(board, visuals, buildDecorationLayout(board), 1024, 576);
      expect(simulateChallenge(board, [], 456)).toEqual(before);
      expect(before.rounds).toHaveLength(5);
    }
  });
});
