import { GAME_CONFIG } from '../config/gameConfig';
import {
  advanceChallengeRound,
  buildCanopy,
  buildFacility,
  createGameState,
  finishChallenge,
  resetBuild,
  returnToBuild,
  setBuildingAppearance,
  setChallengeTick,
  startChallenge,
  undoBuild
} from '../core/gameEngine';
import { comfortScore, previewPlacement } from '../core/placement';
import { createSeed } from '../core/rng';
import { weatherLabel } from '../core/weather';
import type { BuildTool, BuildingAppearance, FacilityKind, FacilityVariant, GameState, RoundReport } from '../model/types';
import { CampusScene } from '../scenes/CampusScene';

const TOOLS: BuildTool[] = ['broadleaf', 'pine', 'autumn', 'lawn', 'grass-tuft', 'shrub', 'drain', 'canopy'];
const FACILITY_NAMES: Record<BuildTool, string> = {
  broadleaf: '阔叶树', pine: '松树', autumn: '秋色树', lawn: '草坪', 'grass-tuft': '草丛', shrub: '矮灌木', drain: '排水口', canopy: '遮雨棚'
};

function facilitySelection(tool: BuildTool): { kind: FacilityKind; variant?: FacilityVariant } | null {
  if (tool === 'drain') return { kind: tool };
  if (tool === 'canopy') return null;
  if (tool === 'broadleaf' || tool === 'pine' || tool === 'autumn') return { kind: 'tree', variant: tool };
  return { kind: 'grass', variant: tool };
}

export class UIController {
  private state: GameState;
  private tool: BuildTool = 'broadleaf';
  private timer: number | undefined;

  constructor(private readonly scene: CampusScene, initialState: GameState) {
    this.state = initialState;
    this.scene.onSlotAction = (slotId) => this.placeAt(slotId);
    this.scene.onBuildingAction = (buildingId) => this.installAt(buildingId);
    this.scene.onSlotPreview = (slotId) => previewPlacement(this.state, slotId, facilitySelection(this.tool)?.kind ?? 'tree');
    this.scene.onPreviewMessage = (message, isError) => this.showPreview(message, isError);
    this.scene.onClearPreview = () => this.showPreview(this.defaultPreview(), false);
    this.bindControls();
    this.render();
  }

  private bindControls(): void {
    document.querySelectorAll<HTMLButtonElement>('.tool-button').forEach((button) => {
      button.addEventListener('click', () => {
        const tool = button.dataset.tool as BuildTool;
        if (!TOOLS.includes(tool) || this.state.phase !== 'build') return;
        this.tool = tool;
        this.scene.setTool(tool);
        this.render();
      });
    });
    document.querySelector<HTMLButtonElement>('#undo-button')?.addEventListener('click', () => this.apply(undoBuild(this.state)));
    document.querySelector<HTMLButtonElement>('#clear-button')?.addEventListener('click', () => this.apply(resetBuild(this.state)));
    document.querySelector<HTMLButtonElement>('#new-map-button')?.addEventListener('click', () => this.newChallenge());
    document.querySelector<HTMLButtonElement>('#new-challenge-result')?.addEventListener('click', () => this.newChallenge());
    document.querySelector<HTMLButtonElement>('#start-button')?.addEventListener('click', () => this.beginChallenge());
    document.querySelector<HTMLButtonElement>('#skip-button')?.addEventListener('click', () => this.skipAnimation());
    document.querySelector<HTMLButtonElement>('#optimize-button')?.addEventListener('click', () => this.optimize());
  }

  private apply(state: GameState): void {
    this.state = state;
    this.scene.setState(state);
    this.render(false);
  }

  private placeAt(slotId: string): void {
    const selection = facilitySelection(this.tool);
    if (!selection) return;
    this.apply(buildFacility(this.state, slotId, selection.kind, selection.variant));
  }

  private installAt(buildingId: string): void {
    this.apply(buildCanopy(this.state, buildingId));
  }

  private beginChallenge(): void {
    if (this.state.phase !== 'build') return;
    this.state = startChallenge(this.state);
    const first = this.currentReport();
    this.scene.setPresentation(first?.period ?? 'day', first?.weather ?? 'clear', {});
    this.scene.setState(this.state);
    this.scheduleTick();
    this.render(false);
  }

  private scheduleTick(): void {
    this.timer = window.setTimeout(() => {
      if (this.state.phase !== 'running') return;
      const nextTick = this.state.currentTick + 1;
      this.state = setChallengeTick(this.state, nextTick);
      const report = this.currentReport();
      this.scene.setState(this.state, false);
      this.scene.setPresentation(report?.period ?? 'day', report?.weather ?? 'clear', report?.waterFrames[nextTick - 1] ?? {});
      this.render(false);
      if (nextTick >= GAME_CONFIG.tickCountPerRound) {
        this.timer = window.setTimeout(() => this.advanceRound(), 850);
      } else {
        this.scheduleTick();
      }
    }, GAME_CONFIG.tickDurationMs);
  }

  private advanceRound(): void {
    if (this.state.phase !== 'running') return;
    const nextState = advanceChallengeRound(this.state);
    this.state = nextState;
    if (nextState.phase === 'result') {
      const last = this.currentReport();
      this.scene.setPresentation(last?.period ?? 'day', last?.weather ?? 'clear', last?.waterFrames[last.waterFrames.length - 1] ?? {});
    } else {
      const report = this.currentReport();
      this.scene.setPresentation(report?.period ?? 'day', report?.weather ?? 'clear', {});
    }
    this.scene.setState(this.state, false);
    this.render(false);
    if (this.state.phase === 'running') this.scheduleTick();
  }

  private skipAnimation(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
    this.state = finishChallenge(this.state);
    const last = this.currentReport();
    this.scene.setState(this.state, false);
    this.scene.setPresentation(last?.period ?? 'day', last?.weather ?? 'clear', last?.waterFrames[last.waterFrames.length - 1] ?? {});
    this.render(false);
  }

  private optimize(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
    this.state = returnToBuild(this.state);
    this.scene.setPresentation('day', 'clear', {});
    this.scene.setState(this.state);
    this.render(false);
  }

  private newChallenge(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
    this.state = createGameState(createSeed(), createSeed());
    this.tool = 'broadleaf';
    this.scene.setTool('broadleaf');
    this.scene.setPresentation('day', 'clear', {});
    this.scene.setState(this.state);
    this.render(false);
  }

  private currentReport(): RoundReport | undefined {
    return this.state.reports[this.state.currentRoundIndex];
  }

  private defaultPreview(): string {
    return this.tool === 'canopy'
      ? '选择遮雨棚，再点击建筑安装；每栋最多安装一座。'
      : `点击${FACILITY_NAMES[this.tool]}，再点击道路操作位查看对称建设预览。`;
  }

  private showPreview(message: string, isError: boolean): void {
    const element = document.querySelector<HTMLElement>('#preview-message');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', isError);
  }

  private render(redrawScene = true): void {
    // View-only phase switching. The five-round core state machine is unchanged.
    document.body.dataset.phase = this.state.phase;
    const runPanel = document.querySelector<HTMLElement>('#run-summary');
    if (runPanel) runPanel.hidden = this.state.phase !== 'running';
    if (redrawScene) this.scene.setState(this.state);
    else this.scene.setState(this.state, false);
    this.renderHeader();
    this.renderBudget();
    this.renderTools();
    this.renderSlots();
    this.renderBuildings();
    this.renderProgress();
    this.renderResults();
  }

  private renderHeader(): void {
    const mapSeed = document.querySelector<HTMLElement>('#map-seed');
    const eventSeed = document.querySelector<HTMLElement>('#event-seed');
    if (mapSeed) {
      mapSeed.textContent = String(this.state.mapSeed);
      mapSeed.dataset.seed = String(this.state.mapSeed);
    }
    if (eventSeed) {
      eventSeed.textContent = String(this.state.eventSeed);
      eventSeed.dataset.seed = String(this.state.eventSeed);
    }
    const chip = document.querySelector<HTMLElement>('#phase-chip');
    const label = document.querySelector<HTMLElement>('#phase-label');
    const phaseText = this.state.phase === 'build' ? '建设阶段' : this.state.phase === 'running' ? '模拟进行中' : '挑战结算';
    if (chip) chip.textContent = phaseText;
    if (label) label.textContent = this.state.phase === 'build' ? '准备建设' : this.state.phase === 'running' ? '设施锁定' : '五轮完成';
  }

  private renderBudget(): void {
    const comfort = comfortScore(this.state);
    const remaining = document.querySelector<HTMLElement>('#budget-remaining');
    const comfortElement = document.querySelector<HTMLElement>('#comfort-estimate');
    const meter = document.querySelector<HTMLElement>('#budget-meter');
    const note = document.querySelector<HTMLElement>('#budget-note');
    if (remaining) remaining.textContent = String(this.state.budgetRemaining);
    if (comfortElement) comfortElement.textContent = String(comfort);
    if (meter) meter.style.width = `${(this.state.budgetRemaining / GAME_CONFIG.budget) * 100}%`;
    if (note) note.textContent = `每局预算 ${GAME_CONFIG.budget}，设施在五轮间保留。`;
    const undo = document.querySelector<HTMLButtonElement>('#undo-button');
    const clear = document.querySelector<HTMLButtonElement>('#clear-button');
    const newMap = document.querySelector<HTMLButtonElement>('#new-map-button');
    const start = document.querySelector<HTMLButtonElement>('#start-button');
    const canClear = this.state.facilities.length > 0 || this.state.board.buildings.some(({ hasCanopy }) => hasCanopy);
    if (undo) undo.disabled = this.state.phase !== 'build' || this.state.history.length === 0;
    if (clear) clear.disabled = this.state.phase !== 'build' || !canClear;
    if (newMap) newMap.disabled = this.state.phase !== 'build';
    if (start) start.disabled = this.state.phase !== 'build';
    const skip = document.querySelector<HTMLButtonElement>('#skip-button');
    if (skip) skip.hidden = this.state.phase !== 'running';
    const panel = document.querySelector<HTMLElement>('#result-panel');
    if (panel) panel.hidden = this.state.phase !== 'result';
  }

  private renderTools(): void {
    document.querySelectorAll<HTMLButtonElement>('.tool-button').forEach((button) => {
      const selected = button.dataset.tool === this.tool;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = this.state.phase !== 'build';
      const costLabel = button.querySelector<HTMLElement>('.tool-cost');
      if (!costLabel) return;
      const tool = button.dataset.tool as BuildTool;
      const kind = facilitySelection(tool)?.kind;
      const cost = GAME_CONFIG.costs[kind ?? 'canopy'];
      const unit = kind === 'tree' ? '棵' : kind === 'grass' ? '块' : kind === 'drain' ? '个' : '栋';
      costLabel.textContent = `${cost} / ${unit}`;
    });
    if (this.state.phase === 'build') this.showPreview(this.defaultPreview(), false);
  }

  private renderSlots(): void {
    const list = document.querySelector<HTMLElement>('#slot-list');
    if (!list) return;
    list.replaceChildren();
    this.state.board.buildSlots.forEach((slot, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot-button';
      button.dataset.slot = slot.id;
      button.textContent = `点位 ${index + 1}`;
      button.title = `${slot.candidateCells.length} 个可用候选格`;
      button.disabled = this.state.phase !== 'build' || this.tool === 'canopy';
      button.addEventListener('click', () => this.placeAt(slot.id));
      list.append(button);
    });
  }

  private renderBuildings(): void {
    const list = document.querySelector<HTMLElement>('#building-list');
    if (!list) return;
    list.replaceChildren();
    this.state.board.buildings.forEach((building) => {
      const row = document.createElement('div');
      row.className = 'building-row';
      const name = document.createElement('span');
      name.textContent = building.name;
      const status = document.createElement('span');
      status.textContent = building.hasCanopy ? '已遮雨' : '未遮雨';
      const appearance = document.createElement('select');
      appearance.className = 'building-appearance';
      appearance.setAttribute('aria-label', `${building.name}外观`);
      const options: [BuildingAppearance, string][] = [['campus', '校园原色'], ['brick', '砖红外墙'], ['blue', '蓝灰外墙']];
      options.forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        appearance.append(option);
      });
      appearance.value = building.appearance ?? 'campus';
      appearance.disabled = this.state.phase !== 'build';
      appearance.addEventListener('change', () => this.apply(setBuildingAppearance(this.state, building.id, appearance.value as BuildingAppearance)));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot-button';
      button.textContent = building.hasCanopy ? '已安装' : '安装遮雨棚';
      button.disabled = this.state.phase !== 'build' || building.hasCanopy || this.state.budgetRemaining < GAME_CONFIG.costs.canopy;
      button.addEventListener('click', () => this.installAt(building.id));
      row.append(name, status, appearance, button);
      list.append(row);
    });
  }

  private renderProgress(): void {
    const roundCaption = document.querySelector<HTMLElement>('#round-caption');
    const weatherBadge = document.querySelector<HTMLElement>('#weather-badge');
    const message = document.querySelector<HTMLElement>('#event-message');
    const tickLabel = document.querySelector<HTMLElement>('#tick-label');
    const round = this.currentReport();
    const runRound = document.querySelector<HTMLElement>('#run-round');
    const runWeather = document.querySelector<HTMLElement>('#run-weather');
    const runFlood = document.querySelector<HTMLElement>('#run-flood');
    const runMeter = document.querySelector<HTMLElement>('#run-progress-meter');
    if (this.state.phase === 'running' && round) {
      if (runRound) runRound.textContent = `第 ${round.roundIndex + 1} / ${GAME_CONFIG.roundCount} 轮`;
      if (runWeather) runWeather.textContent = weatherLabel(round.period, round.weather);
      if (runMeter) runMeter.style.width = `${Math.round(this.state.currentTick / GAME_CONFIG.tickCountPerRound * 100)}%`;
      const frame = round.waterFrames[Math.max(0, this.state.currentTick - 1)] ?? {};
      const flooded = Object.values(frame).filter((amount) => amount >= GAME_CONFIG.water.floodThreshold).length;
      if (runFlood) runFlood.textContent = `当前道路积水：${flooded} 格 · 第 ${this.state.currentTick} / ${GAME_CONFIG.tickCountPerRound} 步`;
    }
    if (this.state.phase === 'build') {
      if (roundCaption) roundCaption.textContent = '布置设施，规划雨天通行';
      if (weatherBadge) weatherBadge.textContent = '晴天 · 白天';
      if (message) message.textContent = this.state.message;
      if (tickLabel) tickLabel.textContent = '待开始';
      return;
    }
    if (this.state.phase === 'running' && round) {
      const weather = weatherLabel(round.period, round.weather);
      if (roundCaption) roundCaption.textContent = `第 ${round.roundIndex + 1} / ${GAME_CONFIG.roundCount} 轮 · ${round.period === 'day' ? '白天' : '夜间'} · ${weather}`;
      if (weatherBadge) weatherBadge.textContent = `${weather} · ${round.period === 'day' ? '白天' : '夜间'}`;
      if (tickLabel) tickLabel.textContent = `步数 ${this.state.currentTick} / ${GAME_CONFIG.tickCountPerRound}`;
      if (message) {
        message.textContent = this.state.currentTick >= GAME_CONFIG.tickCountPerRound
          ? this.roundMessage(round)
          : `第 ${round.roundIndex + 1} 轮积水演进中 · ${this.state.currentTick} / ${GAME_CONFIG.tickCountPerRound} 步`;
      }
      return;
    }
    const last = this.state.reports[this.state.reports.length - 1];
    if (roundCaption) roundCaption.textContent = '五轮挑战完成 · 可以优化方案或重新开始';
    if (weatherBadge) weatherBadge.textContent = last ? `${weatherLabel(last.period, last.weather)} · 最后一轮` : '挑战完成';
    if (message) message.textContent = last ? this.roundMessage(last) : '未发生安全事故。';
    if (tickLabel) tickLabel.textContent = '结算完成';
  }

  private roundMessage(round: RoundReport): string {
    const parts = [`第 ${round.roundIndex + 1} 轮`, round.period === 'day' ? '白天' : '夜间', weatherLabel(round.period, round.weather)];
    if (round.roadAccidents.length > 0) parts.push(`道路积水事故 ×${round.roadAccidents.length}`);
    if (round.buildingAccidents.length > 0) parts.push(`建筑入口风险 ×${round.buildingAccidents.length}`);
    if (round.roadAccidents.length === 0 && round.buildingAccidents.length === 0) parts.push('未发生安全事故');
    return parts.join(' · ');
  }

  private renderResults(): void {
    if (this.state.phase !== 'result' || !this.state.summary) return;
    const summary = this.state.summary;
    const set = (selector: string, value: string): void => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) element.textContent = value;
    };
    set('#result-grade', summary.grade);
    set('#total-score', String(summary.totalScore));
    set('#avg-safety', summary.averageSafety.toFixed(1));
    set('#avg-comfort', summary.averageComfort.toFixed(1));
    set('#spent-budget', String(GAME_CONFIG.budget - this.state.budgetRemaining));
    set('#remaining-budget', String(this.state.budgetRemaining));
    const rows = document.querySelector<HTMLElement>('#round-results');
    if (!rows) return;
    rows.replaceChildren();
    summary.rounds.forEach((round) => {
      const tr = document.createElement('tr');
      const values = [
        `第 ${round.roundIndex + 1} 轮`,
        `${round.period === 'day' ? '白天' : '夜间'} · ${weatherLabel(round.period, round.weather)}`,
        String(round.roadAccidents.length),
        String(round.buildingAccidents.length),
        String(round.safetyScore)
      ];
      values.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        tr.append(cell);
      });
      rows.append(tr);
    });
  }
}


