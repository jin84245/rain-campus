import { GAME_CONFIG } from '../config/gameConfig';
import { SeededRandom } from './rng';
import { positionKey, type Board, type Building, type GridPosition } from '../model/types';

type Orientation = 'horizontal' | 'vertical';

const inBounds = ({ x, y }: GridPosition): boolean =>
  x >= 0 && x < GAME_CONFIG.map.width && y >= 0 && y < GAME_CONFIG.map.height;

function countTurns(path: GridPosition[]): number {
  let turns = 0;
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const next = path[index + 1];
    if (!previous || !current || !next) continue;
    const incoming = { x: current.x - previous.x, y: current.y - previous.y };
    const outgoing = { x: next.x - current.x, y: next.y - current.y };
    if (incoming.x !== outgoing.x || incoming.y !== outgoing.y) turns += 1;
  }
  return turns;
}

function offsetFor(size: number, span: number, rng: SeededRandom): number {
  const lastStart = size - 1 - span;
  const padding = Math.min(2, Math.floor(lastStart / 2));
  return rng.int(padding, lastStart - padding);
}

function createRoadPath(rng: SeededRandom, turns: number, orientation: Orientation): GridPosition[] {
  const stepCount = GAME_CONFIG.map.roadCells - 1;
  const segmentCount = turns + 1;
  const lengths = Array.from({ length: segmentCount }, () => 1);
  const axes = lengths.map((_, index) =>
    index % 2 === 0 ? orientation : orientation === 'horizontal' ? 'vertical' : 'horizontal'
  );
  const maxVerticalSegment = GAME_CONFIG.map.height - 1;
  const maxHorizontalSegment = GAME_CONFIG.map.width - 1;

  let remaining = stepCount - segmentCount;
  while (remaining > 0) {
    const eligible = lengths
      .map((length, index) => ({ length, index }))
      .filter(({ length, index }) => length < (axes[index] === 'vertical' ? maxVerticalSegment : maxHorizontalSegment));
    if (eligible.length === 0) throw new Error('No valid road segment length remains.');
    const selected = eligible[rng.int(0, eligible.length - 1)];
    if (selected) {
      lengths[selected.index] = selected.length + 1;
      remaining -= 1;
    }
  }

  const moves: GridPosition[] = [];
  let horizontalSign = rng.bool() ? 1 : -1;
  let verticalSign = rng.bool() ? 1 : -1;
  let previousAxis: Orientation | null = null;

  for (let index = 0; index < segmentCount; index += 1) {
    const axis = axes[index];
    const length = lengths[index];
    if (!axis || length === undefined) continue;
    if (previousAxis === axis) {
      if (axis === 'horizontal') horizontalSign *= -1;
      else verticalSign *= -1;
    }
    const delta = axis === 'horizontal'
      ? { x: horizontalSign, y: 0 }
      : { x: 0, y: verticalSign };
    for (let step = 0; step < length; step += 1) moves.push(delta);
    previousAxis = axis;
  }

  let x = 0;
  let y = 0;
  const relative = [{ x, y }];
  for (const delta of moves) {
    x += delta.x;
    y += delta.y;
    relative.push({ x, y });
  }

  const minX = Math.min(...relative.map((point) => point.x));
  const maxX = Math.max(...relative.map((point) => point.x));
  const minY = Math.min(...relative.map((point) => point.y));
  const maxY = Math.max(...relative.map((point) => point.y));
  const shiftX = offsetFor(GAME_CONFIG.map.width, maxX - minX, rng) - minX;
  const shiftY = offsetFor(GAME_CONFIG.map.height, maxY - minY, rng) - minY;
  return relative.map((point) => ({ x: point.x + shiftX, y: point.y + shiftY }));
}

export function generateRoadPath(seed: number, forcedTurns?: number, forcedOrientation?: Orientation): GridPosition[] {
  const rng = new SeededRandom(seed);
  const turns = forcedTurns ?? rng.int(GAME_CONFIG.map.minTurns, GAME_CONFIG.map.maxTurns);
  if (turns < GAME_CONFIG.map.minTurns || turns > GAME_CONFIG.map.maxTurns) {
    throw new RangeError(`Turn count must be between ${GAME_CONFIG.map.minTurns} and ${GAME_CONFIG.map.maxTurns}.`);
  }
  const orientation = forcedOrientation ?? (turns === 0 || rng.bool() ? 'horizontal' : 'vertical');
  return createRoadPath(rng, turns, orientation);
}

function sideCandidates(path: GridPosition[], index: number): GridPosition[] {
  const anchor = path[index];
  if (!anchor) return [];
  return [
    { x: anchor.x, y: anchor.y - 1 },
    { x: anchor.x + 1, y: anchor.y },
    { x: anchor.x, y: anchor.y + 1 },
    { x: anchor.x - 1, y: anchor.y }
  ];
}

function pairCandidates(path: GridPosition[], index: number): GridPosition[] {
  const anchor = path[index];
  if (!anchor) return [];
  const previous = path[index - 1];
  const next = path[index + 1];
  const perpendicular = ({ x, y }: GridPosition): GridPosition[] => [
    { x: -y, y: x },
    { x: y, y: -x }
  ];

  let offsets: GridPosition[];
  if (!previous || !next) {
    const neighbor = next ?? previous;
    if (!neighbor) return [];
    offsets = perpendicular({ x: neighbor.x - anchor.x, y: neighbor.y - anchor.y });
  } else {
    const incoming = { x: anchor.x - previous.x, y: anchor.y - previous.y };
    const outgoing = { x: next.x - anchor.x, y: next.y - anchor.y };
    offsets = incoming.x === outgoing.x && incoming.y === outgoing.y
      ? perpendicular(outgoing)
      : [incoming, { x: -outgoing.x, y: -outgoing.y }];
  }

  return offsets.map((offset) => ({ x: anchor.x + offset.x, y: anchor.y + offset.y }));
}

function selectBuildSlots(
  path: GridPosition[],
  roadKeys: Set<string>,
  occupiedBuildings: Set<string>
): Board['buildSlots'] | null {
  const candidates = path.flatMap((roadAnchor, index) => {
    const candidateCells = [...new Map(pairCandidates(path, index)
      .filter((cell) => inBounds(cell) && !roadKeys.has(positionKey(cell)) && !occupiedBuildings.has(positionKey(cell)))
      .map((cell) => [positionKey(cell), cell])).values()];
    return candidateCells.length > 0
      ? [{ index, roadAnchor, candidateCells }]
      : [];
  });
  const selected: typeof candidates = [];
  const remaining = [...candidates];

  while (selected.length < GAME_CONFIG.map.buildPairSlots && remaining.length > 0) {
    const disjoint = remaining.filter(({ candidateCells }) =>
      selected.every((slot) => candidateCells.every((cell) =>
        !slot.candidateCells.some((selectedCell) => positionKey(selectedCell) === positionKey(cell))
      ))
    );
    const pool = disjoint.length > 0 ? disjoint : remaining;
    const middle = (candidates.length - 1) / 2;
    const chosen = [...pool].sort((a, b) => {
      const distanceA = selected.length === 0
        ? -Math.abs(a.index - middle)
        : Math.min(...selected.map((slot) => Math.abs(a.index - slot.index)));
      const distanceB = selected.length === 0
        ? -Math.abs(b.index - middle)
        : Math.min(...selected.map((slot) => Math.abs(b.index - slot.index)));
      return distanceB - distanceA || b.candidateCells.length - a.candidateCells.length || a.index - b.index;
    })[0];
    if (!chosen) break;
    selected.push(chosen);
    remaining.splice(remaining.findIndex(({ index }) => index === chosen.index), 1);
  }

  if (selected.length !== GAME_CONFIG.map.buildPairSlots) return null;
  return selected
    .sort((a, b) => a.index - b.index)
    .map(({ index, ...slot }) => ({ id: `slot-${index + 1}`, ...slot }));
}

function createBoardFromPath(seed: number, path: GridPosition[], rng: SeededRandom, fallbackUsed = false): Board | null {
  const roadKeys = new Set(path.map(positionKey));
  const buildings: Building[] = [];
  const occupiedBuildings = new Set<string>();
  const entranceIndexes: number[] = [];
  const possibleEntrances = Array.from({ length: path.length - 2 }, (_, index) => index + 1);
  for (let index = possibleEntrances.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(0, index);
    [possibleEntrances[index], possibleEntrances[swapIndex]] = [possibleEntrances[swapIndex]!, possibleEntrances[index]!];
  }

  for (const definition of GAME_CONFIG.buildings) {
    let placed = false;
    for (let candidateIndex = 0; candidateIndex < possibleEntrances.length; candidateIndex += 1) {
      const roadIndex = possibleEntrances[candidateIndex];
      const entrance = roadIndex === undefined ? undefined : path[roadIndex];
      if (!entrance || entranceIndexes.includes(roadIndex!)) continue;
      const candidates = sideCandidates(path, roadIndex!).filter((cell) =>
        inBounds(cell) && !roadKeys.has(positionKey(cell)) && !occupiedBuildings.has(positionKey(cell))
      );
      if (candidates.length === 0) continue;
      const position = candidates[rng.int(0, candidates.length - 1)];
      if (!position) continue;
      entranceIndexes.push(roadIndex!);
      occupiedBuildings.add(positionKey(position));
      buildings.push({
        id: definition.type,
        type: definition.type,
        name: definition.name,
        position,
        entranceRoadCell: entrance,
        hasCanopy: false
      });
      placed = true;
      break;
    }
    if (!placed) return null;
  }

  const buildSlots = selectBuildSlots(path, roadKeys, occupiedBuildings);
  if (!buildSlots) return null;

  return {
    roadCells: path,
    buildings,
    buildSlots,
    seed: seed >>> 0,
    turns: countTurns(path),
    fallbackUsed
  };
}

export function validateBoard(board: Board): boolean {
  const roadKeys = board.roadCells.map(positionKey);
  const roadSet = new Set(roadKeys);
  if (board.roadCells.length !== GAME_CONFIG.map.roadCells || roadSet.size !== roadKeys.length) return false;
  if (board.turns < GAME_CONFIG.map.minTurns || board.turns > GAME_CONFIG.map.maxTurns) return false;
  if (countTurns(board.roadCells) !== board.turns) return false;
  if (board.roadCells.some((cell) => !inBounds(cell))) return false;
  for (let index = 1; index < board.roadCells.length; index += 1) {
    const previous = board.roadCells[index - 1];
    const current = board.roadCells[index];
    if (!previous || !current || Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y) !== 1) return false;
  }
  if (board.buildings.length !== GAME_CONFIG.map.buildingCount) return false;
  const buildingKeys = board.buildings.map(({ position }) => positionKey(position));
  const entranceKeys = board.buildings.map(({ entranceRoadCell }) => positionKey(entranceRoadCell));
  if (new Set(buildingKeys).size !== board.buildings.length || new Set(entranceKeys).size !== board.buildings.length) return false;
  if (buildingKeys.some((key) => roadSet.has(key))) return false;
  for (const building of board.buildings) {
    if (!inBounds(building.position) || !roadSet.has(positionKey(building.entranceRoadCell))) return false;
    const distance = Math.abs(building.position.x - building.entranceRoadCell.x) + Math.abs(building.position.y - building.entranceRoadCell.y);
    if (distance !== 1) return false;
  }
  if (board.buildSlots.length !== GAME_CONFIG.map.buildPairSlots) return false;
  const slotAnchors = board.buildSlots.map(({ roadAnchor }) => positionKey(roadAnchor));
  if (
    new Set(board.buildSlots.map(({ id }) => id)).size !== board.buildSlots.length
    || new Set(slotAnchors).size !== board.buildSlots.length
    || slotAnchors.some((key) => !roadSet.has(key))
  ) return false;
  const candidates = board.buildSlots.flatMap(({ candidateCells }) => candidateCells);
  if (board.buildSlots.some(({ roadAnchor, candidateCells }) =>
    candidateCells.length < 1
    || candidateCells.length > 2
    || new Set(candidateCells.map(positionKey)).size !== candidateCells.length
    || candidateCells.some((cell) =>
      !inBounds(cell)
      || roadSet.has(positionKey(cell))
      || buildingKeys.includes(positionKey(cell))
      || Math.abs(cell.x - roadAnchor.x) + Math.abs(cell.y - roadAnchor.y) !== 1
    )
  )) return false;
  return candidates.length >= GAME_CONFIG.map.buildPairSlots;
}

export function generateBoard(seed: number): Board {
  const rng = new SeededRandom(seed);
  for (let attempt = 0; attempt < GAME_CONFIG.map.generationMaxAttempts; attempt += 1) {
    const turns = rng.int(GAME_CONFIG.map.minTurns, GAME_CONFIG.map.maxTurns);
    const orientation: Orientation = turns === 0 || rng.bool() ? 'horizontal' : 'vertical';
    const road = createRoadPath(rng, turns, orientation);
    const board = createBoardFromPath(seed, road, rng);
    if (board && validateBoard(board)) return board;
  }

  const fallbackRng = new SeededRandom(0x51a7c0de);
  const fallbackRoad = Array.from({ length: GAME_CONFIG.map.roadCells }, (_, index) => ({ x: 2 + index, y: Math.floor(GAME_CONFIG.map.height / 2) }));
  const fallback = createBoardFromPath(seed, fallbackRoad, fallbackRng, true);
  if (!fallback || !validateBoard(fallback)) throw new Error('Could not create a valid fallback campus board.');
  return fallback;
}



