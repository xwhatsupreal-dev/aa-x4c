export type Rarity =
  | 'Secret'
  | 'Exclusive'
  | 'Mythic'
  | 'Legendary'
  | 'Epic'
  | 'Rare'
  | 'Uncommon'
  | 'Common';

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
  kind: 'normal' | 'unique';
}

export interface RewardEntry {
  t: string;
  ts: number;
  kind: 'item' | 'unit';
  id: string;
  name: string;
  rarity: Rarity;
  qty: number;
  src: string;
}

export interface RewardTotal {
  kind: 'item' | 'unit';
  id: string;
  name: string;
  rarity: Rarity;
  qty: number;
}

export interface AccountSnapshot {
  accountId: string;
  username: string;
  displayName: string;
  userId?: number;
  gold: number;
  gems: number;
  level?: number;
  equipped: TeamUnit[];
  inventory: InventoryItem[];
  rewards: RewardEntry[];
  totals: Record<string, RewardTotal>;
  uniqueCount: number;
  normalKindCount: number;
  lastSyncedAt: number;
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
  gold?: number;
  gems?: number;
  level?: number;
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
    kind?: 'normal' | 'unique';
  }>;
  rewards?: Array<{
    t?: string;
    ts?: number;
    kind?: 'item' | 'unit';
    id: string;
    name?: string;
    rarity?: string;
    qty?: number;
    src?: string;
  }>;
  uniqueCount?: number;
  normalKindCount?: number;
}
