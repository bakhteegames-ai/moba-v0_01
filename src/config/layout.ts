export type ZoneCategory =
  | 'lane'
  | 'safe'
  | 'contested'
  | 'pressure'
  | 'vision'
  | 'boss'
  | 'risk'
  | 'structure';

export type WalkAreaKind = 'flat' | 'ramp-z';

export type RouteClass =
  | 'safe-access'
  | 'mid-access'
  | 'deep-invade'
  | 'pressure-return'
  | 'boss-approach'
  | 'timing-probe';

export type NodeId =
  | 'blueCore'
  | 'blueInnerTower'
  | 'blueOuterTower'
  | 'midline'
  | 'redOuterTower'
  | 'redInnerTower'
  | 'redCore'
  | 'blueSafeRamp'
  | 'blueSafePocket'
  | 'blueRiskBranch'
  | 'centralContested'
  | 'visionNode'
  | 'pressureNode'
  | 'centralConnector'
  | 'bossPocket'
  | 'redSafePocket'
  | 'redRiskBranch'
  | 'redSafeRamp'
  | 'pressureReturnLane'
  | 'midConnectorRamp'
  | 'westBossApproach'
  | 'eastBossApproach';

export interface LogicalPoint {
  x: number;
  y: number;
}

export interface Footprint {
  width: number;
  depth: number;
}

export interface LayoutNode {
  id: NodeId;
  label: string;
  category: ZoneCategory;
  position: LogicalPoint;
  size: Footprint;
  elevation: number;
  labelHeight?: number;
}

export interface WalkAreaDef {
  id: string;
  label: string;
  category: ZoneCategory;
  center: LogicalPoint;
  size: Footprint;
  kind: WalkAreaKind;
  topHeight: number;
  startHeight?: number;
  endHeight?: number;
}

export interface CollisionBlockerDef {
  id: string;
  label: string;
  center: LogicalPoint;
  size: Footprint;
}

export interface TravelTarget {
  minSeconds: number;
  maxSeconds: number;
  severity: 'hard' | 'soft';
  note?: string;
}

export interface RouteDef {
  id: string;
  label: string;
  routeClass: RouteClass;
  waypoints: LogicalPoint[];
  color: string;
  target?: TravelTarget;
}

export interface TeleportPoint {
  id: string;
  label: string;
  key: string;
  position: LogicalPoint;
}

export type ValidationBand = 'pass' | 'near miss' | 'fail';

export interface TempoBand {
  passMin: number;
  passMax: number;
  nearMin: number;
  nearMax: number;
}

export interface MapLayoutConfig {
  coordinateModel: {
    xAxis: string;
    yAxis: string;
    origin: string;
  };
  dimensions: {
    laneHalfLength: number;
    laneFullLength: number;
    lowerDepthMin: number;
    lowerDepthMax: number;
    laneWidthNormal: number;
    laneWidthMid: number;
    laneWidthInner: number;
  };
  elevations: {
    laneTop: number;
    lowerTop: number;
    floorThickness: number;
    labelLift: number;
    objectiveLift: number;
    markerLift: number;
  };
  player: {
    moveSpeed: number;
    radius: number;
    height: number;
    turnLerp: number;
    edgeBuffer: number;
  };
  tempo: {
    coefficients: {
      attackerPushPressureCoeff: number;
      defenderReclearCoeff: number;
      waveHoldDurationSeconds: number;
      lanePressureDecayWindowSeconds: number;
      offLanePunishWindowSeconds: number;
      objectiveCommitSeconds: number;
    };
    bands: {
      pressureDecayUseRatio: TempoBand;
      continuationHeadroom: TempoBand;
      innerCoreHeadroom: TempoBand;
      twoWaveClosureMargin: TempoBand;
      defenderDelayRatio: TempoBand;
      offLanePunishMargin: TempoBand;
    };
  };
  colors: Record<ZoneCategory | 'danger' | 'route' | 'routeSecondary' | 'void', string>;
  nodes: Record<NodeId, LayoutNode>;
  walkAreas: WalkAreaDef[];
  blockers: CollisionBlockerDef[];
  routes: RouteDef[];
  teleports: TeleportPoint[];
}

const v2 = (x: number, y: number): LogicalPoint => ({ x, y });
const size = (width: number, depth: number): Footprint => ({ width, depth });

const laneTop = 3.5;
const lowerTop = 0;

export const layoutConfig: MapLayoutConfig = {
  coordinateModel: {
    xAxis: 'Main lane axis',
    yAxis: 'Depth into lower macro-zone',
    origin: 'Lane midline center at (0, 0, 0)'
  },
  dimensions: {
    laneHalfLength: 100,
    laneFullLength: 200,
    lowerDepthMin: 42,
    lowerDepthMax: 48,
    laneWidthNormal: 12,
    laneWidthMid: 14,
    laneWidthInner: 10
  },
  elevations: {
    laneTop,
    lowerTop,
    floorThickness: 0.5,
    labelLift: 4.25,
    objectiveLift: 1,
    markerLift: 0.12
  },
  player: {
    moveSpeed: 4.25,
    radius: 0.9,
    height: 2.2,
    turnLerp: 14,
    edgeBuffer: 0.15
  },
  tempo: {
    coefficients: {
      attackerPushPressureCoeff: 1.08,
      defenderReclearCoeff: 1.02,
      waveHoldDurationSeconds: 8.4,
      lanePressureDecayWindowSeconds: 7.2,
      offLanePunishWindowSeconds: 11,
      objectiveCommitSeconds: 1.2
    },
    bands: {
      pressureDecayUseRatio: { passMin: 0.8, passMax: 1.15, nearMin: 0.7, nearMax: 1.3 },
      continuationHeadroom: { passMin: 1, passMax: 4.8, nearMin: 0.35, nearMax: 5.6 },
      innerCoreHeadroom: { passMin: 1.5, passMax: 4.8, nearMin: 0.6, nearMax: 5.6 },
      twoWaveClosureMargin: { passMin: 1.2, passMax: 5.5, nearMin: 0.4, nearMax: 6.6 },
      defenderDelayRatio: { passMin: 0.5, passMax: 0.78, nearMin: 0.42, nearMax: 0.84 },
      offLanePunishMargin: { passMin: 2, passMax: 6, nearMin: 1, nearMax: 7.2 }
    }
  },
  colors: {
    lane: '#6a747e',
    safe: '#48785f',
    contested: '#b38442',
    pressure: '#a24a44',
    vision: '#426ea3',
    boss: '#7f689e',
    risk: '#8d5d35',
    structure: '#8b919a',
    danger: '#df6a6a',
    route: '#f1f2f4',
    routeSecondary: '#b6becb',
    void: '#20252d'
  },
  nodes: {
    blueCore: {
      id: 'blueCore',
      label: 'Blue Core',
      category: 'structure',
      position: v2(-110, 0),
      size: size(18, 18),
      elevation: laneTop
    },
    blueInnerTower: {
      id: 'blueInnerTower',
      label: 'Blue Inner Tower',
      category: 'structure',
      position: v2(-74, 0),
      size: size(6, 6),
      elevation: laneTop
    },
    blueOuterTower: {
      id: 'blueOuterTower',
      label: 'Blue Outer Tower',
      category: 'structure',
      position: v2(-44, 0),
      size: size(6, 6),
      elevation: laneTop
    },
    midline: {
      id: 'midline',
      label: 'Lane Midline',
      category: 'lane',
      position: v2(0, 0),
      size: size(14, 14),
      elevation: laneTop
    },
    redOuterTower: {
      id: 'redOuterTower',
      label: 'Red Outer Tower',
      category: 'structure',
      position: v2(44, 0),
      size: size(6, 6),
      elevation: laneTop
    },
    redInnerTower: {
      id: 'redInnerTower',
      label: 'Red Inner Tower',
      category: 'structure',
      position: v2(74, 0),
      size: size(6, 6),
      elevation: laneTop
    },
    redCore: {
      id: 'redCore',
      label: 'Red Core',
      category: 'structure',
      position: v2(110, 0),
      size: size(18, 18),
      elevation: laneTop
    },
    blueSafeRamp: {
      id: 'blueSafeRamp',
      label: 'Blue Safe Ramp',
      category: 'safe',
      position: v2(-54, -8),
      size: size(6, 12),
      elevation: lowerTop
    },
    blueSafePocket: {
      id: 'blueSafePocket',
      label: 'Blue Safe Pocket',
      category: 'safe',
      position: v2(-58, -22),
      size: size(12, 10),
      elevation: lowerTop
    },
    blueRiskBranch: {
      id: 'blueRiskBranch',
      label: 'Blue Risk Branch',
      category: 'risk',
      position: v2(-62, -36),
      size: size(12, 9),
      elevation: lowerTop
    },
    centralContested: {
      id: 'centralContested',
      label: 'Central Contested',
      category: 'contested',
      position: v2(0, -20),
      size: size(16, 12),
      elevation: lowerTop
    },
    visionNode: {
      id: 'visionNode',
      label: 'Vision / Control',
      category: 'vision',
      position: v2(-18, -31),
      size: size(10, 8),
      elevation: lowerTop
    },
    pressureNode: {
      id: 'pressureNode',
      label: 'Pressure Node',
      category: 'pressure',
      position: v2(18, -22),
      size: size(10, 8),
      elevation: lowerTop
    },
    centralConnector: {
      id: 'centralConnector',
      label: 'Central Connector',
      category: 'contested',
      position: v2(0, -34),
      size: size(14, 10),
      elevation: lowerTop
    },
    bossPocket: {
      id: 'bossPocket',
      label: 'Boss Pocket',
      category: 'boss',
      position: v2(0, -46),
      size: size(22, 16),
      elevation: lowerTop
    },
    redSafePocket: {
      id: 'redSafePocket',
      label: 'Red Safe Pocket',
      category: 'safe',
      position: v2(58, -22),
      size: size(12, 10),
      elevation: lowerTop
    },
    redRiskBranch: {
      id: 'redRiskBranch',
      label: 'Red Risk Branch',
      category: 'risk',
      position: v2(62, -36),
      size: size(12, 9),
      elevation: lowerTop
    },
    redSafeRamp: {
      id: 'redSafeRamp',
      label: 'Red Safe Ramp',
      category: 'safe',
      position: v2(54, -8),
      size: size(6, 12),
      elevation: lowerTop
    },
    pressureReturnLane: {
      id: 'pressureReturnLane',
      label: 'Pressure Return',
      category: 'pressure',
      position: v2(36, 0),
      size: size(12, 6),
      elevation: laneTop
    },
    midConnectorRamp: {
      id: 'midConnectorRamp',
      label: 'Mid Connector Ramp',
      category: 'contested',
      position: v2(0, -8),
      size: size(8, 12),
      elevation: lowerTop
    },
    westBossApproach: {
      id: 'westBossApproach',
      label: 'Boss West Entry',
      category: 'boss',
      position: v2(-14, -44),
      size: size(12, 8),
      elevation: lowerTop
    },
    eastBossApproach: {
      id: 'eastBossApproach',
      label: 'Boss East Entry',
      category: 'boss',
      position: v2(14, -44),
      size: size(12, 8),
      elevation: lowerTop
    }
  },
  walkAreas: [
    { id: 'blue-core-area', label: 'Blue Core Area', category: 'structure', center: v2(-110, 0), size: size(20, 20), kind: 'flat', topHeight: laneTop },
    { id: 'blue-core-approach', label: 'Blue Core Approach', category: 'lane', center: v2(-87, 0), size: size(26, 12), kind: 'flat', topHeight: laneTop },
    { id: 'blue-inner-siege', label: 'Blue Inner Siege', category: 'lane', center: v2(-59, 0), size: size(30, 10), kind: 'flat', topHeight: laneTop },
    { id: 'blue-outer-lane', label: 'Blue Outer Lane', category: 'lane', center: v2(-22, 0), size: size(44, 12), kind: 'flat', topHeight: laneTop },
    { id: 'mid-lane', label: 'Mid Contest Belt', category: 'lane', center: v2(0, 0), size: size(24, 14), kind: 'flat', topHeight: laneTop },
    { id: 'red-outer-lane', label: 'Red Outer Lane', category: 'lane', center: v2(22, 0), size: size(44, 12), kind: 'flat', topHeight: laneTop },
    { id: 'red-inner-siege', label: 'Red Inner Siege', category: 'lane', center: v2(59, 0), size: size(30, 10), kind: 'flat', topHeight: laneTop },
    { id: 'red-core-approach', label: 'Red Core Approach', category: 'lane', center: v2(87, 0), size: size(26, 12), kind: 'flat', topHeight: laneTop },
    { id: 'red-core-area', label: 'Red Core Area', category: 'structure', center: v2(110, 0), size: size(20, 20), kind: 'flat', topHeight: laneTop },
    { id: 'blue-safe-ramp', label: 'Blue Safe Ramp', category: 'safe', center: v2(-54, -8), size: size(6, 12), kind: 'ramp-z', topHeight: lowerTop, startHeight: lowerTop, endHeight: laneTop },
    { id: 'red-safe-ramp', label: 'Red Safe Ramp', category: 'safe', center: v2(54, -8), size: size(6, 12), kind: 'ramp-z', topHeight: lowerTop, startHeight: lowerTop, endHeight: laneTop },
    { id: 'mid-connector-ramp', label: 'Mid Connector Ramp', category: 'contested', center: v2(0, -8), size: size(8, 12), kind: 'ramp-z', topHeight: lowerTop, startHeight: lowerTop, endHeight: laneTop },
    { id: 'blue-safe-pocket', label: 'Blue Safe Pocket', category: 'safe', center: v2(-58, -22), size: size(12, 10), kind: 'flat', topHeight: lowerTop },
    { id: 'red-safe-pocket', label: 'Red Safe Pocket', category: 'safe', center: v2(58, -22), size: size(12, 10), kind: 'flat', topHeight: lowerTop },
    { id: 'blue-safe-to-vision', label: 'Blue Safe To Vision Corridor', category: 'safe', center: v2(-37.5, -26), size: size(29, 6), kind: 'flat', topHeight: lowerTop },
    { id: 'red-safe-to-pressure', label: 'Red Safe To Pressure Corridor', category: 'safe', center: v2(37.5, -22), size: size(29, 6), kind: 'flat', topHeight: lowerTop },
    { id: 'blue-risk-branch', label: 'Blue Risk Branch', category: 'risk', center: v2(-62, -36), size: size(12, 9), kind: 'flat', topHeight: lowerTop },
    { id: 'red-risk-branch', label: 'Red Risk Branch', category: 'risk', center: v2(62, -36), size: size(12, 9), kind: 'flat', topHeight: lowerTop },
    { id: 'vision-node', label: 'Vision Node', category: 'vision', center: v2(-18, -31), size: size(10, 8), kind: 'flat', topHeight: lowerTop },
    { id: 'pressure-node', label: 'Pressure Node', category: 'pressure', center: v2(18, -22), size: size(10, 8), kind: 'flat', topHeight: lowerTop },
    { id: 'central-contested', label: 'Central Contested', category: 'contested', center: v2(0, -20), size: size(16, 12), kind: 'flat', topHeight: lowerTop },
    { id: 'vision-to-contested', label: 'Vision To Contested', category: 'vision', center: v2(-10.5, -26), size: size(7, 6), kind: 'flat', topHeight: lowerTop },
    { id: 'pressure-to-contested', label: 'Pressure To Contested', category: 'pressure', center: v2(10.5, -22), size: size(7, 6), kind: 'flat', topHeight: lowerTop },
    { id: 'central-connector-link', label: 'Contested To Connector', category: 'contested', center: v2(0, -27.5), size: size(10, 7), kind: 'flat', topHeight: lowerTop },
    { id: 'central-connector', label: 'Central Connector', category: 'contested', center: v2(0, -34), size: size(14, 10), kind: 'flat', topHeight: lowerTop },
    { id: 'vision-to-connector', label: 'Vision To Connector', category: 'vision', center: v2(-12, -31), size: size(14, 6), kind: 'flat', topHeight: lowerTop },
    { id: 'pressure-to-connector', label: 'Pressure To Connector', category: 'pressure', center: v2(12, -31), size: size(14, 6), kind: 'flat', topHeight: lowerTop },
    { id: 'blue-risk-link', label: 'Blue Risk Connector', category: 'risk', center: v2(-39.5, -36), size: size(45, 6), kind: 'flat', topHeight: lowerTop },
    { id: 'red-risk-link', label: 'Red Risk Connector', category: 'risk', center: v2(39.5, -36), size: size(45, 6), kind: 'flat', topHeight: lowerTop },
    { id: 'boss-front-approach', label: 'Boss Front Approach', category: 'boss', center: v2(0, -39.5), size: size(10, 9), kind: 'flat', topHeight: lowerTop },
    { id: 'west-boss-staging', label: 'Boss West Staging', category: 'boss', center: v2(-14, -44), size: size(14, 8), kind: 'flat', topHeight: lowerTop },
    { id: 'east-boss-staging', label: 'Boss East Staging', category: 'boss', center: v2(14, -44), size: size(14, 8), kind: 'flat', topHeight: lowerTop },
    { id: 'boss-pocket', label: 'Boss Pocket', category: 'boss', center: v2(0, -46), size: size(22, 16), kind: 'flat', topHeight: lowerTop },
    { id: 'pressure-return-east', label: 'Pressure Return Corridor', category: 'pressure', center: v2(27, -20), size: size(11, 7), kind: 'flat', topHeight: lowerTop },
    { id: 'pressure-return-ramp', label: 'Pressure Return Ramp', category: 'pressure', center: v2(31, -10), size: size(6, 16), kind: 'ramp-z', topHeight: lowerTop, startHeight: lowerTop, endHeight: laneTop },
    { id: 'pressure-return-lane', label: 'Pressure Return Lane Pad', category: 'pressure', center: v2(36, 0), size: size(12, 6), kind: 'flat', topHeight: laneTop }
  ],
  blockers: [
    { id: 'blue-outer-tower-blocker', label: 'Blue Outer Tower', center: v2(-44, 0), size: size(4, 4) },
    { id: 'blue-inner-tower-blocker', label: 'Blue Inner Tower', center: v2(-74, 0), size: size(4, 4) },
    { id: 'red-outer-tower-blocker', label: 'Red Outer Tower', center: v2(44, 0), size: size(4, 4) },
    { id: 'red-inner-tower-blocker', label: 'Red Inner Tower', center: v2(74, 0), size: size(4, 4) },
    { id: 'blue-core-blocker', label: 'Blue Core', center: v2(-110, 0), size: size(8, 8) },
    { id: 'red-core-blocker', label: 'Red Core', center: v2(110, 0), size: size(8, 8) },
    { id: 'vision-objective-blocker', label: 'Vision Objective', center: v2(-18, -31), size: size(2, 2) },
    { id: 'pressure-objective-blocker', label: 'Pressure Objective', center: v2(18, -22), size: size(2, 2) },
    { id: 'boss-north-west-wall-blocker', label: 'Boss North West Wall', center: v2(-9.5, -37), size: size(3, 2.5) },
    { id: 'boss-north-east-wall-blocker', label: 'Boss North East Wall', center: v2(9.5, -37), size: size(3, 2.5) },
    { id: 'boss-west-outer-wall-blocker', label: 'Boss West Outer Wall', center: v2(-23.5, -44), size: size(2, 12) },
    { id: 'boss-east-outer-wall-blocker', label: 'Boss East Outer Wall', center: v2(23.5, -44), size: size(2, 12) },
    { id: 'boss-south-wall-blocker', label: 'Boss South Wall', center: v2(0, -55), size: size(18, 2) },
    { id: 'boss-objective-blocker', label: 'Boss Objective', center: v2(0, -46), size: size(6, 6) }
  ],
  routes: [
    { id: 'lane-mid-to-contested', label: 'Lane Midline -> Central Contested', routeClass: 'mid-access', color: '#f1f2f4', waypoints: [v2(0, 0), v2(0, -8), v2(0, -20)], target: { minSeconds: 4.5, maxSeconds: 5.5, severity: 'hard' } },
    { id: 'outer-entry-to-pressure', label: 'Outer Lane Lower Entry -> Pressure Node', routeClass: 'timing-probe', color: '#f1f2f4', waypoints: [v2(36, 0), v2(31, -10), v2(27, -20), v2(18, -22)], target: { minSeconds: 6, maxSeconds: 8, severity: 'hard' } },
    { id: 'mid-ramp-to-boss', label: 'Mid Connector Ramp -> Boss Pocket', routeClass: 'boss-approach', color: '#f1f2f4', waypoints: [v2(0, -8), v2(0, -20), v2(0, -34), v2(0, -46)], target: { minSeconds: 7, maxSeconds: 9, severity: 'hard' } },
    { id: 'safe-pocket-to-reentry', label: 'Safe Pocket -> Nearest Lane Re-entry', routeClass: 'safe-access', color: '#f1f2f4', waypoints: [v2(-58, -22), v2(-54, -8), v2(-48, 0)], target: { minSeconds: 5, maxSeconds: 6, severity: 'hard' } },
    { id: 'inner-tower-to-boss', label: 'Inner Tower -> Boss Direct Commit', routeClass: 'timing-probe', color: '#b6becb', waypoints: [v2(-74, 0), v2(-54, -8), v2(-58, -22), v2(-18, -31), v2(0, -34), v2(0, -46)], target: { minSeconds: 11, maxSeconds: 13, severity: 'soft', note: 'Anchors preserved even though this direct commit remains longer than target.' } },
    { id: 'blue-deep-invade', label: 'Blue Deep Invade Route', routeClass: 'deep-invade', color: '#b6becb', waypoints: [v2(-58, -22), v2(-62, -36), v2(-39.5, -36), v2(-14, -44), v2(0, -46)] },
    { id: 'red-deep-invade', label: 'Red Deep Invade Route', routeClass: 'deep-invade', color: '#b6becb', waypoints: [v2(58, -22), v2(62, -36), v2(39.5, -36), v2(14, -44), v2(0, -46)] },
    { id: 'pressure-return', label: 'Pressure Return -> Lane', routeClass: 'pressure-return', color: '#f1f2f4', waypoints: [v2(18, -22), v2(27, -20), v2(31, -10), v2(36, 0)], target: { minSeconds: 5.5, maxSeconds: 7.5, severity: 'hard' } },
    { id: 'boss-west-approach', label: 'Boss West Approach', routeClass: 'boss-approach', color: '#f1f2f4', waypoints: [v2(-18, -31), v2(-20, -36), v2(-14, -44), v2(0, -46)] },
    { id: 'boss-east-approach', label: 'Boss East Approach', routeClass: 'boss-approach', color: '#f1f2f4', waypoints: [v2(18, -22), v2(20, -36), v2(14, -44), v2(0, -46)] },
    {
      id: 'anti-inner-core-push-blue',
      label: 'Anti-Turtle Blue: Inner -> Core Push',
      routeClass: 'timing-probe',
      color: '#f1f2f4',
      waypoints: [v2(-74, 0), v2(-87, 0), v2(-100, 0)],
      target: { minSeconds: 5.5, maxSeconds: 7.5, severity: 'soft', note: 'Use as push-window baseline from Inner into Core front.' }
    },
    {
      id: 'anti-two-wave-closure-blue',
      label: 'Anti-Turtle Blue: Two-Wave Closure',
      routeClass: 'timing-probe',
      color: '#f1f2f4',
      waypoints: [v2(-74, 0), v2(-92, 0), v2(-100, 0), v2(-92, 0), v2(-100, 0)],
      target: { minSeconds: 9, maxSeconds: 12, severity: 'soft', note: 'Simulates first and second siege windows near Core front.' }
    },
    {
      id: 'anti-defender-reclear-blue',
      label: 'Anti-Turtle Blue: Defender Re-clear',
      routeClass: 'timing-probe',
      color: '#b6becb',
      waypoints: [v2(-110, 0), v2(-104, 0), v2(-98, 0), v2(-104, 0), v2(-98, 0)],
      target: { minSeconds: 5, maxSeconds: 7, severity: 'soft', note: 'Repeated re-clear requires stepping into exposure marker zone.' }
    },
    {
      id: 'anti-inner-core-push-red',
      label: 'Anti-Turtle Red: Inner -> Core Push',
      routeClass: 'timing-probe',
      color: '#f1f2f4',
      waypoints: [v2(74, 0), v2(87, 0), v2(100, 0)],
      target: { minSeconds: 5.5, maxSeconds: 7.5, severity: 'soft', note: 'Mirrored push-window baseline from Inner into Core front.' }
    },
    {
      id: 'anti-two-wave-closure-red',
      label: 'Anti-Turtle Red: Two-Wave Closure',
      routeClass: 'timing-probe',
      color: '#f1f2f4',
      waypoints: [v2(74, 0), v2(92, 0), v2(100, 0), v2(92, 0), v2(100, 0)],
      target: { minSeconds: 9, maxSeconds: 12, severity: 'soft', note: 'Mirrored two-wave closure path near Core front.' }
    },
    {
      id: 'anti-defender-reclear-red',
      label: 'Anti-Turtle Red: Defender Re-clear',
      routeClass: 'timing-probe',
      color: '#b6becb',
      waypoints: [v2(110, 0), v2(104, 0), v2(98, 0), v2(104, 0), v2(98, 0)],
      target: { minSeconds: 5, maxSeconds: 7, severity: 'soft', note: 'Mirrored re-clear path to verify defender exposure repetition.' }
    }
  ],
  teleports: [
    { id: 'midline', label: 'Midline', key: '1', position: v2(0, 0) },
    { id: 'blue-outer', label: 'Blue Outer', key: '2', position: v2(-44, 0) },
    { id: 'blue-safe', label: 'Blue Safe', key: '3', position: v2(-58, -22) },
    { id: 'contested', label: 'Contested', key: '4', position: v2(0, -20) },
    { id: 'vision', label: 'Vision', key: '5', position: v2(-18, -31) },
    { id: 'pressure', label: 'Pressure', key: '6', position: v2(18, -22) },
    { id: 'boss', label: 'Boss', key: '7', position: v2(0, -46) },
    { id: 'red-safe', label: 'Red Safe', key: '8', position: v2(58, -22) },
    { id: 'red-outer', label: 'Red Outer', key: '9', position: v2(44, 0) },
    { id: 'connector', label: 'Connector', key: '0', position: v2(0, -34) },
    { id: 'blue-inner', label: 'Blue Inner', key: 'B', position: v2(-74, 0) },
    { id: 'red-inner', label: 'Red Inner', key: 'R', position: v2(74, 0) }
  ]
};

export const routeSelectionOrder = layoutConfig.routes.map((route) => route.id);
