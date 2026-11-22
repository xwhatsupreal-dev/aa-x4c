export type Rarity =
  | 'Secret'
  | 'Exclusive'
  | 'Mythic'
  | 'Legendary'
  | 'Epic'
  | 'Rare'
  | 'Uncommon'
  | 'Common';

export interface StageInfo {
  inLobby: boolean;
  name: string;
  id?: string;
  world?: string;
  map?: string;
  gamemode?: string;
  difficulty?: string;
  locationName?: string;
  boss?: string;
  wave?: number;
  isLastWave?: boolean;
  enemiesLeft?: string;
  bossLeft?: string;
  mapImageId?: string;
}

export interface CurrencyIcons {
  gold?: string;
  gems?: string;
  summerPearls?: string;
  traitReroll?: string;
}

export interface DisconnectInfo {
  title: string;
  message: string;
  errorCode?: string;
  at: number;
}

export interface ExtraStats {
  playerXp?: number;
  resource?: number;
  summerPearls?: number;
  trophies?: number;
  rebirthTokens?: number;
  behelitXp?: number;
  curseTokens?: number;
  traitTokens?: number;
  starRemnants?: number;
  statCubes?: number;
  perfectStatCubes?: number;
  eventResources?: Record<string, number>;
}

export interface TeamUnit {
  slot: number;
  id: string;
  name: string;
  rarity: Rarity;
  level?: number;
  shiny?: boolean;
  traits?: string[];
  stats?: {
    dmg?: string;
    spa?: string;
    rng?: string;
  };
}

export interface InventoryItem {
  id: string;
  name: string;
  rarity: Rarity;
  group: string;
  qty: number;
  kind: 'normal' | 'unique' | 'unit';
  iconId?: string;
  tier?: string;
}

export interface RewardEntry {
  t: string;
  ts: number;
  kind: 'item' | 'unit' | 'currency';
  id: string;
  name: string;
  rarity: Rarity;
  qty: number;
  src: string;
  iconId?: string;
  tier?: string;
  runId?: string;
  stageName?: string;
  stageWorld?: string;
  stageMap?: string;
  stageDifficulty?: string;
  stageGamemode?: string;
  stageWaves?: string;
  stageTimer?: string;
  stageImageId?: string;
}

export interface RewardTotal {
  kind: 'item' | 'unit' | 'currency';
  id: string;
  name: string;
  rarity: Rarity;
  qty: number;
  iconId?: string;
  tier?: string;
}

export interface RobloxAvatarAppearance {
  avatarType?: 'R6' | 'R15';
  bodyColors?: {
    head: string;
    torso: string;
    leftArm: string;
    rightArm: string;
    leftLeg: string;
    rightLeg: string;
  };
  scales?: {
    height?: number;
    width?: number;
    head?: number;
    depth?: number;
  };
}

export interface AccountSnapshot {
  accountId: string;
  username: string;
  displayName: string;
  userId?: number;
  avatar?: RobloxAvatarAppearance;
  gold: number;
  gems: number;
  level?: number;
  currencyIcons?: CurrencyIcons;
  extraStats?: ExtraStats;
  currentStage?: StageInfo;
  equipped: TeamUnit[];
  inventory: InventoryItem[];
  rewards: RewardEntry[];
  totals: Record<string, RewardTotal>;
  uniqueCount: number;
  normalKindCount: number;
  ownedUnitsCount?: number;
  lastSyncedAt: number;
  disconnected?: boolean;
  disconnectInfo?: DisconnectInfo | null;
  scriptVersion?: string;
  syncIntervalSec?: number;
  source: 'lua';
}

export interface ShareRecord {
  shareId: string;
  createdAt: number;
  account: AccountSnapshot;
}

export interface SyncPayload {
  syncKey: string;
  username: string;
  displayName?: string;
  userId?: number;
  avatar?: RobloxAvatarAppearance;
  gold?: number;
  gems?: number;
  level?: number;
  currencyIcons?: CurrencyIcons;
  extraStats?: ExtraStats;
  currentStage?: StageInfo;
  equipped?: Array<{
    slot?: number;
    id: string;
    name?: string;
    rarity?: string;
    level?: number;
    shiny?: boolean;
    traits?: string[] | Record<string, unknown> | string;
    stats?: { dmg?: string; spa?: string; rng?: string };
  }>;
  inventory?: Array<{
    id: string;
    name?: string;
    rarity?: string;
    group?: string;
    qty?: number;
    kind?: 'normal' | 'unique' | 'unit';
    iconId?: string;
    tier?: string | number;
  }>;
  rewards?: Array<{
    t?: string;
    ts?: number;
    kind?: 'item' | 'unit' | 'currency';
    id: string;
    name?: string;
    rarity?: string;
    qty?: number;
    src?: string;
    iconId?: string;
    tier?: string | number;
    runId?: string;
    stageName?: string;
    stageWorld?: string;
    stageMap?: string;
    stageDifficulty?: string;
    stageGamemode?: string;
    stageWaves?: string;
    stageTimer?: string;
    stageImageId?: string;
  }>;
  uniqueCount?: number;
  normalKindCount?: number;
  ownedUnitsCount?: number;
  dataReady?: boolean;
  bagLoaded?: boolean;
  teamLoaded?: boolean;
  disconnected?: boolean;
  disconnectInfo?: {
    title?: string;
    message?: string;
    errorCode?: string | number;
    at?: number;
  } | null;
  scriptVersion?: string;
  syncIntervalSec?: number;
}
