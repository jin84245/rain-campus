export const GAME_CONFIG = {
  map: {
    width: 32,
    height: 18,
    tileSize: 32,
    roadCells: 20,
    buildPairSlots: 8,
    minTurns: 0,
    maxTurns: 3,
    buildingCount: 5,
    generationMaxAttempts: 80
  },
  buildings: [
    { type: 'library', name: '骋望楼' },
    { type: 'teaching', name: '东区主教' },
    { type: 'canteen', name: '食堂' },
    { type: 'shop', name: '地下超市' },
    { type: 'dormitory', name: '西四' }
  ],
  roundCount: 5,
  tickCountPerRound: 8,
  tickDurationMs: 350,
  dayProbability: 0.5,
  rainProbability: { day: 0.4, night: 0.65 },
  rainPerTick: { clear: 0, light: 1, heavy: 3 },
  water: {
    floodThreshold: 6,
    grassAbsorptionPerTick: 0.5,
    drainRemovalPerTick: 4,
    canopyEntranceRainReduction: 0.75,
    influenceRange: 1
  },
  budget: 30,
  costs: { tree: 2, grass: 1, drain: 3, canopy: 4 },
  comfort: { base: 15, tree: 5, grass: 2, canopy: 1 },
  safety: {
    roadAccidentProbability: { light: 0.15, heavy: 0.4 },
    roadAccidentPenalty: 6,
    heavyTreeExtraPenaltyOnAccident: 2,
    heavyGrassExtraPenaltyOnAccident: 1,
    lightTreeBonusPerUniqueTree: 1,
    lightTreeBonusCap: 5,
    buildingAccidentProbability: {
      light: { withoutCanopy: 0.2, withCanopy: 0.05 },
      heavy: { withoutCanopy: 0.5, withCanopy: 0.15 }
    },
    buildingAccidentPenalty: { light: 8, heavy: 12 }
  },
  score: {
    safetyWeight: 0.55,
    comfortWeight: 0.45,
    gradeS: 90,
    gradeA: 75,
    gradeB: 60
  }
} as const;

