import { AUTO, Game, Scale, Scene } from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { positionKey, type BuildTool, type GameState, type Period, type Weather, type Building, type GridPosition } from '../model/types';
import { roadMask } from '../core/roadAutotile';
import type { PlacementPreview } from '../core/placement';
import { campusAssets } from '../visual/assetsManifest';
import { roadTextureKey } from '../visual/roadTiles';
import { getPreviewOverlayColor } from '../visual/previewColors';
import { buildDecorationLayout, type Decoration } from '../visual/decorationLayout';
import { buildingSignFontSize, buildingSignText, getCanopyPixelBox, layoutBuildingFootprints, visualFootprintContains, type VisualFootprint } from '../visual/buildingLayout';
import { calculateCameraFrame } from '../visual/cameraFraming';

const TILE = GAME_CONFIG.map.tileSize;
const WIDTH = GAME_CONFIG.map.width * TILE;
const HEIGHT = GAME_CONFIG.map.height * TILE;
// Visual-only beyond-board drawing area: camera is free to show outside the 32x18 grid.
const VISUAL_PAD = Math.max(WIDTH, HEIGHT) * 3;
const pkey = positionKey;
const groundHash = (seed:number,x:number,y:number):number => {
  let h = (seed ^ Math.imul(x + 83, 0x9e3779b9) ^ Math.imul(y + 17, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16),0x7feb352d);
  return (h ^ (h >>> 15)) >>> 0;
};

export class CampusScene extends Scene {
  state: GameState | null = null;
  tool: BuildTool = 'broadleaf';
  onSlotAction: ((slotId:string)=>void)|null=null;
  onBuildingAction: ((buildingId:string)=>void)|null=null;
  onSlotPreview: ((slotId:string)=>PlacementPreview)|null=null;
  onPreviewMessage: ((message:string,isError:boolean)=>void)|null=null;
  onClearPreview: (()=>void)|null=null;

  private created=false;
  private mapLayer!: Phaser.GameObjects.Graphics;
  private groundLayer!: Phaser.GameObjects.Graphics;
  private canopyLayer!: Phaser.GameObjects.Graphics;
  private atmosphereLayer!: Phaser.GameObjects.Graphics;
  private waterLayer!: Phaser.GameObjects.Graphics;
  private facilityLayer!: Phaser.GameObjects.Graphics;
  private slotLayer!: Phaser.GameObjects.Graphics;
  private previewLayer!: Phaser.GameObjects.Graphics;
  private worldImages: Phaser.GameObjects.Image[]=[];
  private worldTexts: Phaser.GameObjects.Text[]=[];
  private facilityImages: Phaser.GameObjects.Image[]=[];
  private slotTexts: Phaser.GameObjects.Text[]=[];
  private rainEmitter: Phaser.GameObjects.Particles.ParticleEmitter|null=null;
  private hoveredSlotId:string|null=null;
  private hoveredBuildingId:string|null=null;
  private footprints:VisualFootprint[]=[];
  private decorations:Decoration[]=[];
  private water:Record<string,number>={};
  private period:Period='day';
  private weather:Weather='clear';

  constructor(){ super('CampusScene'); }

  preload():void {
    for(const asset of campusAssets())this.load.image(asset.key,asset.path);
  }

  create():void {
    this.cameras.main.setBackgroundColor('#b9d4aa');
    this.scale.on('resize', this.handleGameResize, this);
    this.groundLayer=this.add.graphics().setDepth(-1);
    this.mapLayer=this.add.graphics().setDepth(4);
    this.canopyLayer=this.add.graphics().setDepth(91);
    this.facilityLayer=this.add.graphics().setDepth(19);
    this.waterLayer=this.add.graphics().setDepth(30);
    this.atmosphereLayer=this.add.graphics().setDepth(40);
    this.slotLayer=this.add.graphics().setDepth(65);
    this.previewLayer=this.add.graphics().setDepth(66);
    this.createRainTexture();
    this.input.on('pointermove',this.handlePointerMove,this);
    this.input.on('pointerdown',this.handlePointerDown,this);
    this.input.on('pointerout',this.clearHover,this);
    this.created=true;
    this.renderState();
  }

  setState(state:GameState, redraw=true):void {
    if(this.state?.mapSeed!==state.mapSeed){
      this.hoveredSlotId=null;
      this.hoveredBuildingId=null;
    }
    this.state=state;
    if(this.created&&redraw)this.renderState();
  }

  setTool(tool:BuildTool):void {
    this.tool=tool;
    this.hoveredSlotId=null;this.hoveredBuildingId=null;
    this.onClearPreview?.();
    if(this.created){this.drawSlots();this.drawPreview();}
  }

  setPresentation(period:Period,weather:Weather,water:Record<string,number>):void {
    const changedWeather=this.weather!==weather;
    const changedPeriod=this.period!==period;
    this.period=period;this.weather=weather;this.water=water;
    if(!this.created)return;
    if(changedPeriod)this.drawWorld();
    this.drawWater();
    this.drawAtmosphere();
    if(changedWeather)this.updateRain();
  }

  private createRainTexture():void {
    // One 4x12 texture is reused by Phaser's native ParticleEmitter.
    const g=this.make.graphics({x:0,y:0});
    g.fillStyle(0xe1f3ff,0.8);g.fillRect(1,0,2,9);
    g.fillStyle(0xb6dcf9,0.75);g.fillRect(0,9,2,3);
    g.generateTexture('campus-rain-streak',4,12);g.destroy();
  }

  private renderState():void {
    if(!this.state)return;
    this.drawWorld();
    this.drawFacilities();
    this.drawWater();
    this.drawAtmosphere();
    this.drawSlots();
    this.drawPreview();
  }

  private addImage(x:number,y:number,key:string,width:number=TILE,height:number=TILE,depth:number=3):Phaser.GameObjects.Image {
    const image=this.add.image(x,y,key).setDisplaySize(width,height).setDepth(depth);
    this.worldImages.push(image);
    return image;
  }

  private handleGameResize(gameSize: Phaser.Structs.Size):void {
    if (!this.created || !this.state) return;
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.fitCamera();
    if (this.weather !== 'clear') this.updateRain();
  }

  private fitCamera():void {
    if (!this.state) return;
    const camera = this.cameras.main;
    const frame = calculateCameraFrame(
      this.state.board, this.footprints, this.decorations,
      camera.width, camera.height
    );
    camera.setZoom(frame.zoom);
    camera.centerOn(frame.x, frame.y);
  }

  private drawWorld():void {
    const state=this.state;
    if(!state)return;
    for(const image of this.worldImages)image.destroy();
    for(const text of this.worldTexts)text.destroy();
    this.worldImages=[];this.worldTexts=[];
    this.mapLayer.clear();
    this.groundLayer.clear();
    this.canopyLayer.clear();
    this.footprints=layoutBuildingFootprints(state.board);
    this.decorations=buildDecorationLayout(state.board);
    const night=this.period==='night';
    const mode=night?'night':'day';
    const allRoad=new Set(state.board.roadCells.map(pkey));
    const seed=state.board.seed;
    // Continuous grass extends beyond the LOGICAL board. Camera movement and
    // responsive viewports never expose a green rectangle/brightness seam.
    const grassColor = night ? 0x749978 : 0xb9d4aa;
    this.cameras.main.setBackgroundColor(grassColor);
    this.groundLayer.fillStyle(grassColor, 1);
    this.groundLayer.fillRect(-VISUAL_PAD, -VISUAL_PAD,
      WIDTH + VISUAL_PAD * 2, HEIGHT + VISUAL_PAD * 2);
    // Deliberately NO full-square grass PNGs. Tiny, near-tone pixels add
    // atmosphere without making a checkerboard/patchwork map.
    this.groundLayer.fillStyle(night ? 0x6f9271 : 0xaac89e, 0.24);
    for (let y = -16; y < GAME_CONFIG.map.height + 16; y += 1) {
      for (let x = -16; x < GAME_CONFIG.map.width + 16; x += 1) {
        const hash = groundHash(seed, x, y);
        if (hash % 9 !== 0) continue;
        const gx = x * TILE + 4 + (hash % 21);
        const gy = y * TILE + 5 + ((hash >>> 7) % 20);
        this.groundLayer.fillRect(gx, gy, 2, 2);
        if ((hash >>> 12) % 3 === 0) this.groundLayer.fillRect(gx + 4, gy + 2, 2, 1);
      }
    }
    // Layer 1: paving; building and player hitboxes are never changed.
    for(const d of this.decorations) if(d.kind==='sidewalk'){
      this.addImage(d.position.x*TILE+TILE/2,d.position.y*TILE+TILE/2,`${mode}-sidewalk`,TILE,TILE,1);
    }
    // Layer 2: Pulse's true 47-tile blob pieces, chosen by existing roadMask.
    for(const road of state.board.roadCells){
      const mask=roadMask(road,allRoad);
      this.addImage(road.x*TILE+TILE/2,road.y*TILE+TILE/2,roadTextureKey(mask),TILE,TILE,2);
      // A sparse, scale-correct central road mark, not a substitute for the road art.
      if(mask===5||mask===10){
        const midX=road.x*TILE+16,midY=road.y*TILE+16;
        this.mapLayer.fillStyle(0xdec875,0.63);
        if(mask===5)this.mapLayer.fillRect(midX-1,midY-5,2,10);
        else this.mapLayer.fillRect(midX-5,midY-1,10,2);
      }
    }
    // Layer 7: CC0 campus props; free-form visuals, no collision or numerical effects.
    for(const d of this.decorations){
      if(d.kind==='sidewalk')continue;
      const x=d.position.x*TILE+TILE/2,y=d.position.y*TILE+TILE/2;
      if(d.kind==='grass-detail'){
        // Tiny grass tufts are visual only; no full-tile high-contrast squares.
        this.groundLayer.fillStyle(night ? 0x6f9677 : 0x91b989, 0.3);
        this.groundLayer.fillRect(x - 3, y + 4, 2, 3);
        this.groundLayer.fillRect(x + 2, y + 2, 2, 2);
        continue;
      }
      const texture=d.kind==='streetlamp'?'pulse-streetlamp':d.kind==='bench'?'pulse-park_bench':'pulse-flowerbed';
      this.addImage(x,y,texture,TILE,TILE,8+d.position.y*.001);
    }
    // Layer 12: 5 complete, 3x3 tile-based building sprites, never wall fragments.
    for(const building of state.board.buildings){
      const area=this.footprints.find((f)=>f.buildingId===building.id);
      if(!area)continue;
      // Delineate actual landmarks from the paving and vegetation, without
      // changing the logical hitbox, footprint or simulation model.
      this.mapLayer.lineStyle(2, 0xffebbc, 0.7);
      this.mapLayer.strokeRect(area.x*TILE+1,area.y*TILE+1,
        area.width*TILE-2,area.height*TILE-2);
      const appearance=building.appearance??'campus';
      const cx=(area.x+area.width/2)*TILE;
      const cy=(area.y+area.height/2)*TILE;
      // Native sprite resolution is 16/32/48px for the 1/2/3-grid footprint;
      // every sprite is displayed at exactly 2x per source pixel.
      this.addImage(cx,cy,`campus-building-${building.type}-${appearance}-${area.width}`,
        area.width*TILE,area.height*TILE,12+(area.y+area.height)*.01);
      const box=area.labelBox;
      // Every building uses its FULL name. For compact 1x1 sprites, the
      // reserved labelBox sits immediately beside the building, never clipped
      // into one Chinese character or laid over an interactive build slot.
      // Tiny sprites may require a compact two-line FULL name rather than
      // clipping the text to its first Chinese character.
      const signText=buildingSignText(building.name,area.compactLabel);
      const label=this.add.text(box.x,box.y,signText,{
        fontFamily:'Microsoft YaHei, Noto Sans SC, Arial, sans-serif',
        fontSize:`${buildingSignFontSize(building.name,area)}px`,
        color:'#153b36',fontStyle:'bold',align:'center',
        backgroundColor:'#fff4ce',padding:{x:0,y:0}
      }).setOrigin(0,0).setDepth(92);
      label.setFixedSize(box.width,box.height);
      this.worldTexts.push(label);
      if(building.hasCanopy){
        // Draw an awning ON the sprite's road-facing edge. The gameplay
        // entranceRoadCell remains unchanged for water/accident calculations.
        const awning=getCanopyPixelBox(area);
        this.canopyLayer.fillStyle(0x684f3a,0.95);
        this.canopyLayer.fillRect(awning.x-1,awning.y-1,awning.width+2,awning.height+2);
        this.canopyLayer.fillStyle(0xe6b969,1);
        this.canopyLayer.fillRect(awning.x,awning.y,awning.width,awning.height);
        this.canopyLayer.fillStyle(0xffeed0,0.95);
        if(area.entranceSide==='east'||area.entranceSide==='west'){
          for(let j=1;j<awning.height-1;j+=5){
            this.canopyLayer.fillRect(awning.x,awning.y+j,awning.width,2);
          }
        }else{
          for(let j=1;j<awning.width-1;j+=5){
            this.canopyLayer.fillRect(awning.x+j,awning.y,2,awning.height);
          }
        }
      }
    }
    this.fitCamera();
  }

  private drawFacilities():void {
    if(!this.state)return;
    this.facilityLayer.clear();
    for(const image of this.facilityImages)image.destroy();
    this.facilityImages=[];
    for(const f of this.state.facilities){
      const x=(f.position.x+.5)*TILE,y=(f.position.y+.5)*TILE;
      const key=f.kind==='tree'
        ? f.variant==='pine'?'pulse-tree-pine':f.variant==='autumn'?'pulse-tree-autumn':'pulse-tree'
        : f.kind==='drain'?'pulse-manhole_cover'
        : f.variant==='grass-tuft'||f.variant==='shrub'?'pulse-bush':'pulse-potted_plant';
      const pic=this.add.image(x,y,key).setDisplaySize(TILE,TILE).setDepth(20+f.position.y*.01);
      this.facilityImages.push(pic);
      if(f.kind==='grass'&&f.variant==='shrub')pic.setTint(0xc6dfba);
      if(f.kind==='grass'&&f.variant==='lawn'){
        // Flat planted strip marker under the potted plant.
        this.facilityLayer.fillStyle(0x76b95f,.62);
        this.facilityLayer.fillRoundedRect(f.position.x*TILE+4,f.position.y*TILE+6,TILE-8,TILE-12,3);
      }
    }
  }

  private drawWater():void {
    this.waterLayer.clear();
    if(!this.state)return;
    for(const p of this.state.board.roadCells){
      const amount=this.water[pkey(p)]??0;
      if(amount<=0)continue;
      const flooded=amount>=GAME_CONFIG.water.floodThreshold;
      const strength=Math.min(1,amount/(GAME_CONFIG.water.floodThreshold*2));
      const x=p.x*TILE,y=p.y*TILE;
      // Dynamic water covering the roadway with progressive shallow/deep color.
      this.waterLayer.fillStyle(flooded?0x278ec1:0x7fc6d6,0.13+0.48*strength);
      this.waterLayer.fillRoundedRect(x+2,y+2,TILE-4,TILE-4,4);
      this.waterLayer.lineStyle(1,flooded?0xc2edff:0xb5dce5,0.28+.45*strength);
      this.waterLayer.strokeEllipse(x+TILE/2,y+TILE/2,12+strength*12,6+strength*7);
      if(flooded){
        this.waterLayer.lineStyle(1,0xd1f0ff,.65);
        this.waterLayer.beginPath();this.waterLayer.moveTo(x+6,y+9);this.waterLayer.lineTo(x+13,y+9);this.waterLayer.strokePath();
        this.waterLayer.beginPath();this.waterLayer.moveTo(x+19,y+24);this.waterLayer.lineTo(x+27,y+24);this.waterLayer.strokePath();
      }
    }
  }

  private drawAtmosphere():void {
    this.atmosphereLayer.clear();
    if(this.period==='day'&&this.weather==='clear')return;
    const night=this.period==='night';
    this.atmosphereLayer.fillStyle(night?0x13273c:0x6a9cab,night?(this.weather==='heavy'?0.32:0.22):0.10);
    this.atmosphereLayer.fillRect(-VISUAL_PAD,-VISUAL_PAD,
      WIDTH+VISUAL_PAD*2,HEIGHT+VISUAL_PAD*2);
    if(night){
      for(const d of this.decorations){
        if(d.kind!=='streetlamp')continue;
        const x=d.position.x*TILE+16,y=d.position.y*TILE+16;
        this.atmosphereLayer.fillStyle(0xffd880,.14);this.atmosphereLayer.fillCircle(x,y,36);
        this.atmosphereLayer.fillStyle(0xfff1b3,.7);this.atmosphereLayer.fillCircle(x,y,5);
      }
    }
  }

  private drawSlots():void {
    this.slotLayer.clear();
    for(const text of this.slotTexts)text.destroy();this.slotTexts=[];
    if(!this.state||this.state.phase!=='build'||this.tool==='canopy')return;
    const occupied=new Set(this.state.facilities.map((f)=>pkey(f.position)));
    this.state.board.buildSlots.forEach((slot,index)=>{
      for(const cell of slot.candidateCells){
        const x=cell.x*TILE,y=cell.y*TILE;
        const built=occupied.has(pkey(cell));
        const active=this.hoveredSlotId===slot.id;
        const color=built?0x6e8c86:active?0x71d993:0xdfe2aa;
        this.slotLayer.fillStyle(color,built ? 0.16 : active ? 0.27 : 0.16);
        this.slotLayer.fillRoundedRect(x+1,y+1,TILE-2,TILE-2,4);
        this.slotLayer.lineStyle(active?3:2,color,active?1:.86);
        this.slotLayer.strokeRoundedRect(x+2,y+2,TILE-4,TILE-4,4);
        const label=this.add.text(x+TILE/2,y+TILE/2,String(index+1),{
          fontFamily:'Arial,sans-serif',fontSize:'14px',fontStyle:'bold',color:built?'#e7ece7':'#203c34',
          backgroundColor:built?'#55726b':'#f7f5d7',padding:{x:2,y:1}
        }).setOrigin(.5,.5).setDepth(67);
        this.slotTexts.push(label);
      }
    });
  }

  private drawPreview():void {
    this.previewLayer.clear();
    if(!this.state||this.state.phase!=='build')return;
    if(this.tool==='canopy'){
      const target=this.state.board.buildings.find((b)=>b.id===this.hoveredBuildingId);
      if(!target)return;
      const f=this.footprints.find((v)=>v.buildingId===target.id);
      if(!f)return;
      const invalid=target.hasCanopy||this.state.budgetRemaining<GAME_CONFIG.costs.canopy;
      this.previewLayer.lineStyle(4,invalid?0xd95e5a:0x68d890,.95);
      this.previewLayer.strokeRoundedRect(f.x*TILE+3,f.y*TILE+3,f.width*TILE-6,f.height*TILE-6,6);
      return;
    }
    if(!this.hoveredSlotId)return;
    const slot=this.state.board.buildSlots.find((s)=>s.id===this.hoveredSlotId);
    const preview=this.onSlotPreview?.(this.hoveredSlotId);
    if(!slot||!preview)return;
    const newPositions=new Set(preview.positions.map(pkey));
    for(const cell of slot.candidateCells){
      const isNew=newPositions.has(pkey(cell));
      // A conflict returns zero positions: it MUST show red rejection, not the
      // neutral gray used for already-built, no-op candidates.
      const color=getPreviewOverlayColor(preview.status,isNew);
      this.previewLayer.fillStyle(color,.33);
      this.previewLayer.fillRoundedRect(cell.x*TILE+3,cell.y*TILE+3,TILE-6,TILE-6,4);
      this.previewLayer.lineStyle(3,color,.94);
      this.previewLayer.strokeRoundedRect(cell.x*TILE+3,cell.y*TILE+3,TILE-6,TILE-6,4);
    }
  }

  private updateRain():void {
    this.rainEmitter?.destroy();this.rainEmitter=null;
    if(this.weather==='clear')return;
    const camera = this.cameras.main;
    const topLeft = camera.getWorldPoint(0, 0);
    const bottomRight = camera.getWorldPoint(camera.width, camera.height);
    this.rainEmitter=this.add.particles(0,0,'campus-rain-streak',{
      // Confine weather particles to the actual camera view, not a giant
      // off-map rectangle that would make storm rain appear too sparse.
      x:{min:topLeft.x-24,max:bottomRight.x+24},
      y:{min:topLeft.y-30,max:bottomRight.y+30},
      lifespan:{min:460,max:850},speedY:{min:430,max:660},speedX:{min:-50,max:-16},
      frequency:this.weather==='heavy'?10:48,
      quantity:this.weather==='heavy'?3:1,
      alpha:{start:this.weather==='heavy' ? 0.85 : 0.55,end:.06},
      scale:{start:1,end:.7},
      tint:this.weather==='heavy'?0xb2ddff:0xdbf4ff
    }).setDepth(50);
  }

  private cellAtPointer(pointer:Phaser.Input.Pointer):GridPosition {
    // Camera coordinates, not DOM/CSS grid offsets: zoom never breaks hit testing.
    const world=this.cameras.main.getWorldPoint(pointer.x,pointer.y);
    return {x:Math.floor(world.x/TILE),y:Math.floor(world.y/TILE)};
  }

  private findSlotAt(cell:GridPosition):GameState['board']['buildSlots'][number]|undefined {
    if(!this.state)return undefined;
    const key=pkey(cell);
    return this.state.board.buildSlots
      .filter((slot)=>slot.candidateCells.some((c)=>pkey(c)===key))
      .sort((a,b)=>{
        const da=Math.abs(a.roadAnchor.x-cell.x)+Math.abs(a.roadAnchor.y-cell.y);
        const db=Math.abs(b.roadAnchor.x-cell.x)+Math.abs(b.roadAnchor.y-cell.y);
        return da-db||a.id.localeCompare(b.id);
      })[0];
  }

  private findBuildingAt(cell:GridPosition):Building|undefined {
    if(!this.state)return undefined;
    // Prefer exact logical anchor; then accept full visible sprite footprint.
    return this.state.board.buildings.find((b)=>pkey(b.position)===pkey(cell))
      ??this.state.board.buildings.find((b)=>{
        const visual=this.footprints.find((f)=>f.buildingId===b.id);
        return visual?visualFootprintContains(visual,cell):false;
      });
  }

  private handlePointerMove(pointer:Phaser.Input.Pointer):void {
    if(!this.state||this.state.phase!=='build')return;
    const cell=this.cellAtPointer(pointer);
    const slot=this.tool==='canopy'?undefined:this.findSlotAt(cell);
    const building=this.tool==='canopy'?this.findBuildingAt(cell):undefined;
    const slotId=slot?.id??null,buildingId=building?.id??null;
    if(slotId===this.hoveredSlotId&&buildingId===this.hoveredBuildingId)return;
    this.hoveredSlotId=slotId;this.hoveredBuildingId=buildingId;
    if(slotId){
      const preview=this.onSlotPreview?.(slotId);
      this.onPreviewMessage?.(preview?.message??'',preview?preview.status!=='ready':false);
    } else if(buildingId){
      const invalid=Boolean(building?.hasCanopy)||this.state.budgetRemaining<GAME_CONFIG.costs.canopy;
      this.onPreviewMessage?.(building?.hasCanopy?`${building.name}已安装遮雨棚。`:`给${building?.name}安装遮雨棚，消耗${GAME_CONFIG.costs.canopy}。`,invalid);
    } else this.onClearPreview?.();
    this.drawSlots();this.drawPreview();
  }

  private handlePointerDown(pointer:Phaser.Input.Pointer):void {
    if(!this.state||this.state.phase!=='build')return;
    const cell=this.cellAtPointer(pointer);
    if(this.tool==='canopy'){
      const building=this.findBuildingAt(cell);
      if(building)this.onBuildingAction?.(building.id);
    } else {
      const slot=this.findSlotAt(cell);
      if(slot)this.onSlotAction?.(slot.id);
    }
  }

  private clearHover():void {
    this.hoveredSlotId=null;this.hoveredBuildingId=null;
    this.onClearPreview?.();
    if(this.created){this.drawSlots();this.drawPreview();}
  }
}

export function createCampusGame(scene:CampusScene):Game {
  const container = document.getElementById('game-container');
  if (!container) throw new Error('Missing #game-container for Phaser');
  const viewWidth = Math.max(320, container.clientWidth);
  const viewHeight = Math.max(320, container.clientHeight);
  return new Game({
    type:AUTO,width:viewWidth,height:viewHeight,parent:'game-container',
    backgroundColor:'#b9d4aa',scene:[scene],
    scale:{mode:Scale.RESIZE,autoCenter:Scale.CENTER_BOTH,width:viewWidth,height:viewHeight},
    render:{antialias:false,pixelArt:true,roundPixels:true}
  });
}
