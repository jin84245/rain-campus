import { GAME_CONFIG } from '../config/gameConfig';
import { type Board } from '../model/types';
import type { Decoration } from './decorationLayout';
import type { VisualFootprint } from './buildingLayout';

export interface CameraFrame { x: number; y: number; zoom: number; bounds: { x:number; y:number; width:number; height:number } }
/** Camera logic is purely visual; world GridPosition and game rules remain unchanged. */
export function calculateCameraFrame(
  board: Board,
  footprints: VisualFootprint[],
  decorations: Decoration[],
  viewWidth: number,
  viewHeight: number
): CameraFrame {
  void decorations; // kept for backward-compatible interface
  const boxes: { x:number;y:number;w:number;h:number }[] = [
    ...board.roadCells.map((p)=>({x:p.x,y:p.y,w:1,h:1})),
    ...board.buildSlots.flatMap((s)=>s.candidateCells.map((p)=>({x:p.x,y:p.y,w:1,h:1}))),
    ...footprints.map((b)=>({x:b.x,y:b.y,w:b.width,h:b.height})),
    // The sign has an explicit pixel bounding box, and participates in the
    // camera-fit calculation even if its placement changes in later themes.
    ...footprints.map((b)=>({
      x:b.labelBox.x/GAME_CONFIG.map.tileSize,
      y:b.labelBox.y/GAME_CONFIG.map.tileSize,
      w:b.labelBox.width/GAME_CONFIG.map.tileSize,
      h:b.labelBox.height/GAME_CONFIG.map.tileSize
    })),
    // Decoration is optional scenery; don't let a distant flowerbed shrink the game.
    // Fit the playable campus (road, all slots, all buildings and full names).
  ];
  if(boxes.length===0)return {x:viewWidth/2,y:viewHeight/2,zoom:1,bounds:{x:0,y:0,width:viewWidth,height:viewHeight}};
  const s=GAME_CONFIG.map.tileSize;
  const left=Math.min(...boxes.map((b)=>b.x))*s;
  const top=Math.min(...boxes.map((b)=>b.y))*s;
  const right=Math.max(...boxes.map((b)=>b.x+b.w))*s;
  const bottom=Math.max(...boxes.map((b)=>b.y+b.h))*s;
  const margin=0.85*s;
  const width=right-left+2*margin;
  const height=bottom-top+2*margin;
  const zoom=Math.min(2,Math.max(.42,Math.min(viewWidth/width,viewHeight/height)*.965));
  return {x:(left+right)/2,y:(top+bottom)/2,zoom,bounds:{x:left,y:top,width:right-left,height:bottom-top}};
}
