/** Assets are local, offline and licensed CC0 (Pulse 16x16 / Kenney RPG Urban 1.0). */
export const CAMPUS_ASSET_BASE = 'assets/campus/v4';
export const BUILDING_TYPES = ['library', 'teaching', 'canteen', 'shop', 'dormitory'] as const;
export const BUILDING_APPEARANCES = ['campus', 'brick', 'blue'] as const;
export const PROP_TYPES = ['tree', 'bush', 'streetlamp', 'park_bench', 'potted_plant', 'manhole_cover', 'flowerbed'] as const;
export const ROAD_TILE_INDICES = Array.from({ length: 47 }, (_, index) => index);

export function campusAssets(): { key: string; path: string }[] {
  const entries: { key: string; path: string }[] = [];
  for (const mode of ['day', 'night']) {
    for (const tile of ['grass_1', 'grass_2', 'grass_3', 'sidewalk', 'asphalt', 'asphalt_dashes']) {
      entries.push({ key: `${mode}-${tile}`, path: `${CAMPUS_ASSET_BASE}/terrain/${mode}-${tile}.png` });
    }
  }
  for (const index of ROAD_TILE_INDICES) {
    const token = String(index).padStart(2, '0');
    entries.push({ key: `pulse-road-${token}`, path: `${CAMPUS_ASSET_BASE}/roads/road-${token}.png` });
  }
  for (const type of PROP_TYPES) {
    entries.push({ key: `pulse-${type}`, path: `${CAMPUS_ASSET_BASE}/props/${type}.png` });
  }
  for (const tree of ['pine', 'autumn']) {
    entries.push({ key: `pulse-tree-${tree}`, path: `${CAMPUS_ASSET_BASE}/props/tree-${tree}.png` });
  }
  for (const type of BUILDING_TYPES) {
    for (const appearance of BUILDING_APPEARANCES) {
      for (const size of [1, 2, 3]) {
        entries.push({ key: `campus-building-${type}-${appearance}-${size}`, path: `${CAMPUS_ASSET_BASE}/buildings/${type}-${appearance}-${size}.png` });
      }
    }
  }
  return entries;
}
