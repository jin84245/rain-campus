import { GAME_CONFIG } from '../config/gameConfig';
import { positionKey, type Board, type GridPosition } from '../model/types';
import { layoutBuildingFootprints, visualFootprintContains } from './buildingLayout';

export type DecorationKind = 'sidewalk' | 'streetlamp' | 'bench' | 'flowerbed' | 'grass-detail';
export interface Decoration { kind: DecorationKind; position: GridPosition; variant?: number }
const neighbors = ({x,y}:GridPosition):GridPosition[] => [
  {x:x+1,y}, {x:x-1,y}, {x,y:y+1}, {x,y:y-1}
];
const within = ({x,y}:GridPosition):boolean => x>=0 && y>=0 && x<GAME_CONFIG.map.width && y<GAME_CONFIG.map.height;
function visualHash(seed: number, x: number, y: number, salt: number):number {
  let v = (seed ^ Math.imul(x+17, 0x9e3779b9) ^ Math.imul(y+29, 0x85ebca6b) ^ salt) >>> 0;
  v = Math.imul(v ^ (v >>> 16), 0x7feb352d);
  v = Math.imul(v ^ (v >>> 15), 0x846ca68b);
  return (v ^ (v >>> 16)) >>> 0;
}

/** Decorations are derived only from Board; they never consume numerical simulation RNG. */
export function buildDecorationLayout(board:Board):Decoration[] {
  const road = new Set(board.roadCells.map(positionKey));
  const buildable = new Set(board.buildSlots.flatMap((slot)=>slot.candidateCells.map(positionKey)));
  const entrances = new Set(board.buildings.map((b)=>positionKey(b.entranceRoadCell)));
  const buildings = new Set(board.buildings.map((b)=>positionKey(b.position)));
  const footprints = layoutBuildingFootprints(board);
  const occupiedVisual = new Set(footprints.flatMap((f)=>{
    const list:string[]=[];
    for(let y=f.y;y<f.y+f.height;y++)for(let x=f.x;x<f.x+f.width;x++)list.push(`${x},${y}`);
    return list;
  }));
  // A compact building sign may extend onto EMPTY grass. Reserve that visual
  // area so a decorative flowerbed/lamp cannot cover a full building name.
  const signCells = new Set<string>();
  for (const footprint of footprints) {
    const box = footprint.labelBox;
    for (let y = Math.floor(box.y / GAME_CONFIG.map.tileSize);
      y < Math.ceil((box.y + box.height) / GAME_CONFIG.map.tileSize); y += 1) {
      for (let x = Math.floor(box.x / GAME_CONFIG.map.tileSize);
        x < Math.ceil((box.x + box.width) / GAME_CONFIG.map.tileSize); x += 1) {
        signCells.add(`${x},${y}`);
      }
    }
  }
  const blocked = new Set([...road,...buildable,...entrances,...buildings,...occupiedVisual,...signCells]);
  const walkway = new Map<string,GridPosition>();
  for (const cell of board.roadCells) for (const n of neighbors(cell)) {
    if (within(n) && !road.has(positionKey(n)) && !buildings.has(positionKey(n)) && !occupiedVisual.has(positionKey(n))) walkway.set(positionKey(n),n);
  }
  const result:Decoration[] = [...walkway.values()].map((position)=>({kind:'sidewalk',position}));
  const decorationTaken = new Set<string>();
  const candidates = [...walkway.values()]
    .filter((p)=>!blocked.has(positionKey(p)))
    .sort((a,b)=>visualHash(board.seed,a.x,a.y,31)-visualHash(board.seed,b.x,b.y,31));
  const maxDesired:Record<'streetlamp'|'bench'|'flowerbed',number> = {streetlamp:3,bench:2,flowerbed:4};
  function place(kind:'streetlamp'|'bench'|'flowerbed',minDistance:number):void {
    let count=0;
    for (const p of candidates) {
      if (count>=maxDesired[kind]) break;
      const key=positionKey(p);
      if (decorationTaken.has(key) || blocked.has(key)) continue;
      if (result.some((d) => d.kind === kind && Math.max(Math.abs(d.position.x-p.x),Math.abs(d.position.y-p.y))<minDistance)) continue;
      result.push({kind,position:p});decorationTaken.add(key);count++;
    }
  }
  place('streetlamp',3);place('bench',2);place('flowerbed',2);
  const flowers:Decoration[]=[];
  for(let y=0;y<GAME_CONFIG.map.height;y++)for(let x=0;x<GAME_CONFIG.map.width;x++){
    const p={x,y};const key=positionKey(p);
    if(blocked.has(key)||decorationTaken.has(key)||walkway.has(key))continue;
    const h=visualHash(board.seed,x,y,57);
    if(h%29===0)flowers.push({kind:'grass-detail',position:p,variant:h%3});
  }
  return [...result,...flowers];
}
/** Used by integration checks, separate from physical game collision. */
export function decorationOverlapsReserved(board: Board, decoration: Decoration):boolean {
  if (decoration.kind === 'sidewalk') return false; // paving is an underlay
  const p=decoration.position;
  return board.roadCells.some((r)=>positionKey(r)===positionKey(p))
    || board.buildSlots.some((s)=>s.candidateCells.some((c)=>positionKey(c)===positionKey(p)))
    || board.buildings.some((b)=>positionKey(b.position)===positionKey(p))
    || layoutBuildingFootprints(board).some((f)=>{
      const tile=GAME_CONFIG.map.tileSize;
      const box=f.labelBox;
      const labelOverlapsTile=box.x<(p.x+1)*tile&&box.x+box.width>p.x*tile
        &&box.y<(p.y+1)*tile&&box.y+box.height>p.y*tile;
      return visualFootprintContains(f,p)||labelOverlapsTile;
    });
}
