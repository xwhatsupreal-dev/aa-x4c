import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';

type Rarity =
  | 'Secret'
  | 'Exclusive'
  | 'Mythic'
  | 'Legendary'
  | 'Epic'
  | 'Rare'
  | 'Uncommon'
  | 'Common';

interface StageInfo {
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

interface CurrencyIcons {
  gold?: string;
  gems?: string;
  summerPearls?: string;
  traitReroll?: string;
}

interface DisconnectInfo {
  title: string;
  message: string;
  errorCode?: string;
  at: number;
}

interface ExtraStats {
  playerXp?: number;
  resource?: number;
  summerPearls?: number;
  trophies?: number;
  rebirthTokens?: number;
  behelitXp?: number;
  curseTokens?: number;
  traitTokens?: number;
  starRemnants?: number;
  starRemnantsLimited?: number;
  brokenStars?: number;
  statCubes?: number;
  perfectStatCubes?: number;
  eventResources?: Record<string, number>;
}

interface TeamUnit {
  slot: number;
  id: string;
  name: string;
  rarity: Rarity;
  level?: number;
  shiny?: boolean;
  traits?: string[];
  stats?: { dmg?: string; spa?: string; rng?: string };
}

interface InventoryItem {
  id: string;
  name: string;
  rarity: Rarity;
  group: string;
  qty: number;
  kind: 'normal' | 'unique' | 'unit';
  iconId?: string;
  tier?: string;
}

interface RewardEntry {
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

interface RewardTotal {
  kind: 'item' | 'unit' | 'currency';
  id: string;
  name: string;
  rarity: Rarity;
  qty: number;
  iconId?: string;
  tier?: string;
}

interface AccountSnapshot {
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

interface RobloxAvatarAppearance {
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

interface ShareRecord {
  shareId: string;
  createdAt: number;
  account: AccountSnapshot;
}

interface SyncPayload {
  syncKey?: string;
  username?: string;
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

type Req = IncomingMessage & { body?: unknown };

const SCRIPT_VERSION = '2.9.1';
const SCRIPT_UPDATED_AT = '22 พ.ย. 2569 · 15:00 น. (เวลาไทย)';

const RARITY_ORDER: Rarity[] = [
  'Secret',
  'Exclusive',
  'Mythic',
  'Legendary',
  'Epic',
  'Rare',
  'Uncommon',
  'Common',
];

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TMP_STORE_PATH = '/tmp/aa-vault-store.json';

interface StoredAsset {
  pngBase64: string;
  bytes: number;
  uploadedAt: number;
  label?: string;
}

interface LocalTmpStore {
  rooms: Record<string, Record<string, AccountSnapshot>>;
  shares: Record<string, ShareRecord>;
  assets?: Record<string, StoredAsset>;
}

let tmpCache: LocalTmpStore | null = null;

function loadTmpStore(): LocalTmpStore {
  if (tmpCache) return tmpCache;
  try {
    if (fs.existsSync(TMP_STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(TMP_STORE_PATH, 'utf-8')) as LocalTmpStore;
      if (parsed && typeof parsed.rooms === 'object' && typeof parsed.shares === 'object') {
        if (!parsed.assets || typeof parsed.assets !== 'object') parsed.assets = {};
        tmpCache = parsed;
        return tmpCache;
      }
    }
  } catch {
    // ignore corrupt tmp cache
  }
  tmpCache = { rooms: {}, shares: {}, assets: {} };
  return tmpCache;
}

function saveTmpStore(next: LocalTmpStore) {
  tmpCache = next;
  try {
    fs.writeFileSync(TMP_STORE_PATH, JSON.stringify(next), 'utf-8');
  } catch {
    // ignore fs write errors
  }
}

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodeRawPixelsToPng(
  width: number,
  height: number,
  channels: 3 | 4,
  rawPixels: Buffer
): Buffer {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w < 1 || h < 1 || w > 256 || h > 256) {
    throw new Error('Invalid image dimensions (must be 1..256)');
  }
  const expectedBytes = w * h * channels;
  if (rawPixels.length < expectedBytes) {
    throw new Error(`Incomplete pixel buffer: got ${rawPixels.length}, expected ${expectedBytes}`);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = w * channels;
  const scanlines = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const dstOff = y * (stride + 1);
    scanlines[dstOff] = 0;
    rawPixels.copy(scanlines, dstOff + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  return Buffer.concat([
    PNG_SIG,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const uploadedAssetCache = new Map<string, Buffer>();

async function getUploadedAssetPng(assetId: string): Promise<Buffer | null> {
  if (!/^\d{4,15}$/.test(assetId)) return null;
  const mem = uploadedAssetCache.get(assetId);
  if (mem) return mem;
  try {
    const stored = await storeGet<StoredAsset>(`asset:${assetId}`);
    if (stored && typeof stored.pngBase64 === 'string' && stored.pngBase64.length > 16) {
      const buf = Buffer.from(stored.pngBase64, 'base64');
      if (buf.length >= 32) {
        uploadedAssetCache.set(assetId, buf);
        return buf;
      }
    }
  } catch {
    // ignore storage lookup errors
  }
  return null;
}

async function saveUploadedAssetPng(
  assetId: string,
  pngBuf: Buffer,
  label?: string
): Promise<void> {
  if (!/^\d{4,15}$/.test(assetId)) return;
  uploadedAssetCache.set(assetId, pngBuf);
  const rec: StoredAsset = {
    pngBase64: pngBuf.toString('base64'),
    bytes: pngBuf.length,
    uploadedAt: Date.now(),
    label: label ? label.slice(0, 64) : undefined,
  };
  await storePut(`asset:${assetId}`, rec);
}

function sendJson(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(data));
}

function sanitizeKey(raw: unknown): string {
  if (typeof raw !== 'string') return 'main';
  return raw.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'main';
}

function normalizeRarity(input?: string): Rarity {
  if (!input) return 'Common';
  const cleaned = input.trim().toLowerCase();
  return RARITY_ORDER.find((r) => r.toLowerCase() === cleaned) ?? 'Common';
}

function formatClock(ts: number): string {
  const d = new Date(ts + 7 * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function normalizeTraits(traits: unknown): string[] {
  if (Array.isArray(traits)) {
    return traits.map((t) => String(t)).filter(Boolean);
  }
  if (typeof traits === 'string' && traits.trim()) {
    return traits
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (traits && typeof traits === 'object') {
    return Object.entries(traits as Record<string, unknown>)
      .map(([k, v]) => (typeof v === 'string' ? v : k))
      .filter(Boolean);
  }
  return [];
}

function cleanAssetId(raw: unknown): string | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  return String(raw).match(/\d{4,15}/)?.[0];
}

function optStr(raw: unknown, maxLen = 80): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  return s ? s.slice(0, maxLen) : undefined;
}

function optNum(raw: unknown): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

function sanitizeStage(raw: unknown, fallback?: StageInfo): StageInfo | undefined {
  if (!raw || typeof raw !== 'object') return fallback;
  const s = raw as Record<string, unknown>;
  const inLobby = Boolean(s.inLobby);
  return {
    inLobby,
    name: optStr(s.name, 80) || (inLobby ? 'ล็อบบี้' : 'Unknown Stage'),
    id: optStr(s.id, 64),
    world: optStr(s.world, 64),
    map: optStr(s.map, 64),
    gamemode: optStr(s.gamemode, 48),
    difficulty: optStr(s.difficulty, 48),
    locationName: optStr(s.locationName, 64),
    boss: optStr(s.boss, 64),
    wave: optNum(s.wave),
    isLastWave: Boolean(s.isLastWave),
    enemiesLeft: optStr(s.enemiesLeft, 24),
    bossLeft: optStr(s.bossLeft, 24),
    mapImageId: cleanAssetId(s.mapImageId),
  };
}

function optTier(raw: unknown, itemId?: string, itemName?: string): string | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 && raw <= 99) {
    return `Tier ${Math.floor(raw)}`;
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s) {
      const mNum = s.match(/^(?:tier\s*)?(\d{1,2})$/i);
      if (mNum) return `Tier ${Number(mNum[1])}`;
      if (/^tier\s+/i.test(s)) return s.slice(0, 24);
      if (/^[IVXS]{1,4}[+-]?$/i.test(s)) return `Tier ${s.toUpperCase()}`;
      return s.slice(0, 24);
    }
  }
  const idStr = String(itemId || '');
  const mId =
    idStr.match(/(?:charm|portal)[_-]+(\d{1,2})$/i) ||
    idStr.match(/[_-]tier[_-]*(\d{1,2})$/i) ||
    idStr.match(/[_-]t(\d{1,2})$/i);
  if (mId) return `Tier ${Number(mId[1])}`;
  const nameStr = String(itemName || '');
  const mName = nameStr.match(/\btier\s*(\d{1,2})\b/i);
  if (mName) return `Tier ${Number(mName[1])}`;
  return undefined;
}

function classifyInventoryGroup(rawGroup: string, id: string, name: string, kind: string): string {
  if (kind === 'unit') return 'Units';
  const g = (rawGroup || '').trim();
  const lowG = g.toLowerCase();
  const hay = `${id} ${name}`.toLowerCase();
  if (lowG.includes('portal') || hay.includes('portal')) return 'Portals';
  if (lowG.includes('charm') || hay.includes('charm')) return 'Charms';
  return g || 'Other';
}

function sanitizeCurrencyIcons(raw: unknown, fallback?: CurrencyIcons): CurrencyIcons | undefined {
  if (!raw || typeof raw !== 'object') return fallback;
  const s = raw as Record<string, unknown>;
  const out: CurrencyIcons = {
    gold: cleanAssetId(s.gold) || fallback?.gold,
    gems: cleanAssetId(s.gems) || fallback?.gems,
    summerPearls: cleanAssetId(s.summerPearls) || fallback?.summerPearls,
    traitReroll: cleanAssetId(s.traitReroll) || fallback?.traitReroll,
  };
  return out.gold || out.gems || out.summerPearls || out.traitReroll ? out : fallback;
}

function sanitizeDisconnectInfo(raw: unknown, now: number): DisconnectInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const message = optStr(s.message, 320);
  const title = optStr(s.title, 80) || 'Disconnected';
  const rawCode = s.errorCode;
  const codeFromField =
    typeof rawCode === 'number' && Number.isFinite(rawCode) && rawCode > 0
      ? String(Math.floor(rawCode))
      : typeof rawCode === 'string'
        ? rawCode.match(/\d{2,4}/)?.[0]
        : undefined;
  const codeFromMsg = message?.match(/Error Code:\s*(\d{2,4})/i)?.[1];
  const errorCode = codeFromField || codeFromMsg;
  if (!message && !errorCode) return null;
  const atRaw = Number(s.at);
  return {
    title,
    message: message || (errorCode ? `Disconnected (Error Code: ${errorCode})` : 'Disconnected'),
    errorCode,
    at: Number.isFinite(atRaw) && atRaw > 1_000_000_000_000 ? Math.floor(atRaw) : now,
  };
}

function sanitizeExtraStats(
  raw: unknown,
  fallback?: ExtraStats,
  preserveBagDerived = false
): ExtraStats | undefined {
  if (!raw || typeof raw !== 'object') return fallback;
  const s = raw as Record<string, unknown>;
  let eventResources: Record<string, number> | undefined;
  if (s.eventResources && typeof s.eventResources === 'object' && !Array.isArray(s.eventResources)) {
    const out: Record<string, number> = {};
    let count = 0;
    for (const [k, v] of Object.entries(s.eventResources as Record<string, unknown>)) {
      if (count >= 24) break;
      const key = String(k).trim().slice(0, 48);
      const val = optNum(v);
      if (key && val !== undefined) {
        out[key] = val;
        count++;
      }
    }
    if (count > 0) eventResources = out;
  }
  const incTrait = optNum(s.traitTokens);
  const incCurse = optNum(s.curseTokens);
  const incStarRem = optNum(s.starRemnants);
  const incStarRemLtd = optNum(s.starRemnantsLimited);
  const incBrokenStars = optNum(s.brokenStars);
  const incStatCubes = optNum(s.statCubes);
  const incPerfCubes = optNum(s.perfectStatCubes);
  return {
    playerXp: optNum(s.playerXp) ?? fallback?.playerXp,
    resource: optNum(s.resource) ?? fallback?.resource,
    summerPearls: optNum(s.summerPearls) ?? fallback?.summerPearls,
    trophies: optNum(s.trophies) ?? fallback?.trophies,
    rebirthTokens: optNum(s.rebirthTokens) ?? fallback?.rebirthTokens,
    behelitXp: optNum(s.behelitXp) ?? fallback?.behelitXp,
    curseTokens:
      preserveBagDerived && (!incCurse || incCurse === 0) && (fallback?.curseTokens ?? 0) > 0
        ? fallback?.curseTokens
        : incCurse ?? fallback?.curseTokens,
    traitTokens:
      preserveBagDerived && (!incTrait || incTrait === 0) && (fallback?.traitTokens ?? 0) > 0
        ? fallback?.traitTokens
        : incTrait ?? fallback?.traitTokens,
    starRemnants:
      preserveBagDerived && (!incStarRem || incStarRem === 0) && (fallback?.starRemnants ?? 0) > 0
        ? fallback?.starRemnants
        : incStarRem ?? fallback?.starRemnants,
    starRemnantsLimited:
      preserveBagDerived &&
      (!incStarRemLtd || incStarRemLtd === 0) &&
      (fallback?.starRemnantsLimited ?? 0) > 0
        ? fallback?.starRemnantsLimited
        : incStarRemLtd ?? fallback?.starRemnantsLimited,
    brokenStars:
      preserveBagDerived &&
      (!incBrokenStars || incBrokenStars === 0) &&
      (fallback?.brokenStars ?? 0) > 0
        ? fallback?.brokenStars
        : incBrokenStars ?? fallback?.brokenStars,
    statCubes:
      preserveBagDerived && (!incStatCubes || incStatCubes === 0) && (fallback?.statCubes ?? 0) > 0
        ? fallback?.statCubes
        : incStatCubes ?? fallback?.statCubes,
    perfectStatCubes:
      preserveBagDerived &&
      (!incPerfCubes || incPerfCubes === 0) &&
      (fallback?.perfectStatCubes ?? 0) > 0
        ? fallback?.perfectStatCubes
        : incPerfCubes ?? fallback?.perfectStatCubes,
    eventResources: eventResources ?? fallback?.eventResources,
  };
}

function buildSnapshot(payload: SyncPayload, existing?: AccountSnapshot): AccountSnapshot {
  const username = String(payload.username || 'UnknownPlayer').trim().slice(0, 64);
  const accountId = username.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'player';
  const now = Date.now();
  const isDisconnected = payload.disconnected === true;
  const disconnectInfo = isDisconnected
    ? sanitizeDisconnectInfo(payload.disconnectInfo, now) ?? {
        title: 'Disconnected',
        message: 'Disconnected from Roblox server',
        at: now,
      }
    : null;

  const incomingEquipped: TeamUnit[] | undefined = Array.isArray(payload.equipped)
    ? payload.equipped.slice(0, 6).map((u, idx) => ({
        slot: typeof u.slot === 'number' ? u.slot : idx + 1,
        id: String(u.id || `unit_${idx + 1}`),
        name: String(u.name || u.id || `Unit ${idx + 1}`),
        rarity: normalizeRarity(u.rarity),
        level: typeof u.level === 'number' ? u.level : undefined,
        shiny: Boolean(u.shiny),
        traits: normalizeTraits(u.traits),
        stats: u.stats,
      }))
    : undefined;

  const incomingInventory: InventoryItem[] | undefined = Array.isArray(payload.inventory)
    ? payload.inventory
        .filter((it) => it && it.id)
        .map((it): InventoryItem => {
          const id = String(it.id);
          const name = String(it.name || it.id);
          const kind: 'normal' | 'unique' | 'unit' =
            it.kind === 'unique' ? 'unique' : it.kind === 'unit' ? 'unit' : 'normal';
          return {
            id,
            name,
            rarity: normalizeRarity(it.rarity),
            group: classifyInventoryGroup(String(it.group || 'Other'), id, name, kind),
            qty: Math.max(0, Number(it.qty) || 0),
            kind,
            iconId: cleanAssetId(it.iconId),
            tier: optTier(it.tier, id, name),
          };
        })
        .filter((it) => it.qty > 0)
    : undefined;

  const incomingGold = typeof payload.gold === 'number' && Number.isFinite(payload.gold) ? payload.gold : undefined;
  const incomingGems = typeof payload.gems === 'number' && Number.isFinite(payload.gems) ? payload.gems : undefined;
  const incomingLevel = typeof payload.level === 'number' && Number.isFinite(payload.level) && payload.level > 0 ? payload.level : undefined;
  const incomingEx = payload.extraStats;
  const incomingHasCoreNumbers =
    (incomingGold ?? 0) > 0 ||
    (incomingGems ?? 0) > 0 ||
    (incomingLevel ?? 0) > 0 ||
    (incomingEx?.summerPearls ?? 0) > 0 ||
    (incomingEx?.traitTokens ?? 0) > 0 ||
    (incomingEx?.curseTokens ?? 0) > 0 ||
    (incomingEx?.playerXp ?? 0) > 0;

  const existingHasCoreNumbers =
    Boolean(existing) &&
    ((existing!.gold ?? 0) > 0 ||
      (existing!.gems ?? 0) > 0 ||
      (existing!.level ?? 0) > 0 ||
      (existing!.extraStats?.summerPearls ?? 0) > 0 ||
      (existing!.extraStats?.traitTokens ?? 0) > 0 ||
      (existing!.extraStats?.playerXp ?? 0) > 0);

  const preserveAll =
    Boolean(existing) &&
    (isDisconnected ||
      payload.dataReady === false ||
      (!incomingHasCoreNumbers &&
        (!incomingEquipped || incomingEquipped.length === 0) &&
        (!incomingInventory || incomingInventory.length === 0)));

  const preserveTeam =
    preserveAll ||
    (Boolean(existing?.equipped?.length) &&
      (!incomingEquipped || (incomingEquipped.length === 0 && payload.teamLoaded !== true)));

  const preserveBag =
    preserveAll ||
    (Boolean(existing?.inventory?.length) &&
      (!incomingInventory || (incomingInventory.length === 0 && payload.bagLoaded !== true)));

  const preserveStats =
    preserveAll || (existingHasCoreNumbers && !incomingHasCoreNumbers);

  const equipped: TeamUnit[] = preserveTeam ? existing!.equipped : incomingEquipped ?? existing?.equipped ?? [];
  const inventory: InventoryItem[] = preserveBag ? existing!.inventory : incomingInventory ?? existing?.inventory ?? [];

  const incomingRewards: RewardEntry[] = Array.isArray(payload.rewards)
    ? payload.rewards
        .filter((r) => r && r.id)
        .map((r): RewardEntry => {
          const hasTs = typeof r.ts === 'number' && r.ts > 0;
          const ts = hasTs ? r.ts! : now;
          const id = String(r.id);
          const name = String(r.name || r.id);
          return {
            t: hasTs ? formatClock(ts) : r.t || formatClock(ts),
            ts,
            kind: r.kind === 'unit' ? 'unit' : r.kind === 'currency' ? 'currency' : 'item',
            id,
            name,
            rarity: normalizeRarity(r.rarity),
            qty: Math.max(1, Number(r.qty) || 1),
            src: String(r.src || 'sync'),
            iconId: cleanAssetId(r.iconId),
            tier: optTier(r.tier, id, name),
            runId: optStr(r.runId, 48),
            stageName: optStr(r.stageName, 80),
            stageWorld: optStr(r.stageWorld, 64),
            stageMap: optStr(r.stageMap, 64),
            stageDifficulty: optStr(r.stageDifficulty, 48),
            stageGamemode: optStr(r.stageGamemode, 48),
            stageWaves: optStr(r.stageWaves, 32),
            stageTimer: optStr(r.stageTimer, 32),
            stageImageId: cleanAssetId(r.stageImageId),
          };
        })
    : [];

  const mergedRewards: RewardEntry[] = existing ? existing.rewards.map((r) => ({ ...r })) : [];
  const rewardSig = (r: RewardEntry) =>
    `${r.runId || r.t}|${r.kind}|${r.id}|${r.tier || ''}|${r.qty}|${r.src}`;
  const runItemKey = (r: RewardEntry) =>
    r.runId ? `${r.runId}|${r.kind}|${r.id}|${r.tier || ''}` : '';
  const seenSig = new Set(mergedRewards.map(rewardSig));
  const runKeyIndex = new Map<string, number>();
  mergedRewards.forEach((r, idx) => {
    const rk = runItemKey(r);
    if (rk) runKeyIndex.set(rk, idx);
  });
  const newlyAdded: RewardEntry[] = [];

  for (const r of incomingRewards) {
    const rk = runItemKey(r);
    if (rk && runKeyIndex.has(rk)) {
      const idx = runKeyIndex.get(rk)!;
      const cur = mergedRewards[idx];
      if (r.qty > cur.qty) cur.qty = r.qty;
      if (!cur.iconId && r.iconId) cur.iconId = r.iconId;
      if (!cur.stageImageId && r.stageImageId) cur.stageImageId = r.stageImageId;
      continue;
    }
    const sig = rewardSig(r);
    if (!seenSig.has(sig)) {
      seenSig.add(sig);
      newlyAdded.push(r);
    }
  }

  const finalRewards = pruneRewardsToMaxRuns([...newlyAdded, ...mergedRewards], MAX_DROP_HISTORY_RUNS);
  const totals = recomputeTotals(finalRewards);

  const uniqueCount = preserveBag
    ? existing!.uniqueCount
    : typeof payload.uniqueCount === 'number'
      ? payload.uniqueCount
      : inventory.filter((i) => i.kind === 'unique').reduce((sum, i) => sum + i.qty, 0);

  const normalKindCount = preserveBag
    ? existing!.normalKindCount
    : typeof payload.normalKindCount === 'number'
      ? payload.normalKindCount
      : inventory.filter((i) => i.kind === 'normal').length;

  const ownedUnitsCount = preserveBag
    ? existing!.ownedUnitsCount
    : typeof payload.ownedUnitsCount === 'number'
      ? Math.max(0, Math.floor(payload.ownedUnitsCount))
      : inventory.filter((i) => i.kind === 'unit').reduce((sum, i) => sum + i.qty, 0) ||
        existing?.ownedUnitsCount;

  return {
    accountId,
    username,
    displayName: String(payload.displayName || existing?.displayName || username),
    userId: typeof payload.userId === 'number' ? payload.userId : existing?.userId,
    avatar: payload.avatar ?? existing?.avatar,
    gold: preserveStats ? existing!.gold : incomingGold ?? existing?.gold ?? 0,
    gems: preserveStats ? existing!.gems : incomingGems ?? existing?.gems ?? 0,
    level: preserveStats ? existing!.level : incomingLevel ?? existing?.level,
    currencyIcons: sanitizeCurrencyIcons(payload.currencyIcons, existing?.currencyIcons),
    extraStats: preserveStats
      ? existing!.extraStats
      : sanitizeExtraStats(payload.extraStats, existing?.extraStats, preserveBag),
    currentStage: isDisconnected
      ? existing?.currentStage ?? sanitizeStage(payload.currentStage)
      : sanitizeStage(payload.currentStage, existing?.currentStage),
    equipped,
    inventory,
    rewards: finalRewards,
    totals,
    uniqueCount,
    normalKindCount,
    ownedUnitsCount,
    lastSyncedAt: now,
    disconnected: isDisconnected,
    disconnectInfo,
    scriptVersion:
      typeof payload.scriptVersion === 'string' && payload.scriptVersion.trim()
        ? payload.scriptVersion.trim().slice(0, 24)
        : existing?.scriptVersion,
    syncIntervalSec:
      typeof payload.syncIntervalSec === 'number' && Number.isFinite(payload.syncIntervalSec)
        ? Math.min(600, Math.max(5, Math.round(payload.syncIntervalSec)))
        : existing?.syncIntervalSec,
    source: 'lua',
  };
}

const MAX_DROP_HISTORY_RUNS = 15;

function pruneRewardsToMaxRuns(
  rewards: RewardEntry[],
  maxRuns = MAX_DROP_HISTORY_RUNS
): RewardEntry[] {
  const sorted = [...rewards].sort((a, b) => b.ts - a.ts);
  const allowedRunIds = new Set<string>();
  let runCount = 0;
  let lastLegacy: { src: string; ts: number } | null = null;
  const kept: RewardEntry[] = [];

  for (const r of sorted) {
    if (r.runId) {
      if (allowedRunIds.has(r.runId)) {
        kept.push(r);
      } else if (runCount < maxRuns) {
        allowedRunIds.add(r.runId);
        runCount += 1;
        kept.push(r);
      }
      continue;
    }
    const sameLegacy =
      lastLegacy !== null &&
      lastLegacy.src === r.src &&
      Math.abs(lastLegacy.ts - r.ts) <= 15_000;
    if (sameLegacy) {
      kept.push(r);
    } else if (runCount < maxRuns) {
      runCount += 1;
      lastLegacy = { src: r.src, ts: r.ts };
      kept.push(r);
    }
  }
  return kept;
}

function recomputeTotals(rewards: RewardEntry[]): Record<string, RewardTotal> {
  const totals: Record<string, RewardTotal> = {};
  for (const r of rewards) {
    const key = `${r.kind}|${r.id}|${r.tier || ''}`;
    if (!totals[key]) {
      totals[key] = {
        kind: r.kind,
        id: r.id,
        name: r.name,
        rarity: r.rarity,
        qty: 0,
        iconId: r.iconId,
        tier: r.tier,
      };
    } else if (!totals[key].iconId && r.iconId) {
      totals[key].iconId = r.iconId;
    }
    totals[key].qty += r.qty;
  }
  return totals;
}

const ALLOWED_RBX_CDN_RE = /^https:\/\/([a-z0-9-]+\.)?rbxcdn\.com\//i;
const BLOCKED_RBX_PLACEHOLDER_RE =
  /180DAY-(?:e5bef3179d5ce82a42fdc8ddc83a2ba9|a53354b1f60a5dedc00d0600d1491075)/i;
const ALLOWED_WIKI_IMAGE_RE =
  /^https:\/\/static\.wikia\.nocookie\.net\/animeadventures\/images\//i;
const BAD_WIKI_FILENAME_RE =
  /(?:^|\/)(?:Unknown|Placeholder|Site-logo|Wiki-wordmark|Damage_type_|No_image)/i;
const WIKI_API = 'https://animeadventures.fandom.com/api.php';

function isAllowedAaImageUrl(raw: string): boolean {
  if (ALLOWED_WIKI_IMAGE_RE.test(raw)) return true;
  if (ALLOWED_RBX_CDN_RE.test(raw) && !BLOCKED_RBX_PLACEHOLDER_RE.test(raw)) return true;
  return false;
}

const assetThumbCache = new Map<string, { url: string | null; exp: number }>();

async function resolveRobloxAssetThumb(assetId: string): Promise<string | null> {
  const now = Date.now();
  const cached = assetThumbCache.get(assetId);
  if (cached && cached.exp > now) return cached.url;
  for (const size of ['420x420', '150x150']) {
    try {
      const res = await fetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=${size}&format=Png&isCircular=false`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { data?: Array<{ state?: string; imageUrl?: string }> };
      const entry = data?.data?.[0];
      const url = entry?.state === 'Completed' ? entry.imageUrl : undefined;
      if (url && ALLOWED_RBX_CDN_RE.test(url) && !BLOCKED_RBX_PLACEHOLDER_RE.test(url)) {
        assetThumbCache.set(assetId, { url, exp: now + 60 * 60 * 1000 });
        return url;
      }
    } catch {
      // ignore thumbnail lookup errors
    }
  }
  assetThumbCache.set(assetId, { url: null, exp: now + 5 * 60 * 1000 });
  return null;
}

type AaImageKind = 'stage' | 'unit' | 'item' | 'currency';
const aaImageCache = new Map<string, { url: string | null; exp: number }>();

const CURRENCY_FILE_MAP: Record<string, string[]> = {
  gold: ['File:Gold.png'],
  gems: ['File:Gems.png'],
  gem: ['File:Gems.png'],
  first_clear_gems: ['File:Gems.png'],
  summer_pearls: ['File:Summer Pearls.png', 'File:Summer Pearl.png', 'File:Pearls.png', 'File:Pearl.png'],
  summerpearls: ['File:Summer Pearls.png', 'File:Summer Pearl.png', 'File:Pearls.png', 'File:Pearl.png'],
  'summer pearls': ['File:Summer Pearls.png', 'File:Summer Pearl.png', 'File:Pearls.png', 'File:Pearl.png'],
  pearls: ['File:Summer Pearls.png', 'File:Pearls.png', 'File:Pearl.png'],
  trophies: ['File:Trophies.png'],
  trophy: ['File:Trophies.png'],
  trait_tokens: ['File:Reroll Token.png', 'File:TraitsReroll.png'],
  trait_reroll: ['File:Reroll Token.png', 'File:TraitsReroll.png'],
  trait_reroll_tokens: ['File:Reroll Token.png', 'File:TraitsReroll.png'],
  reroll_token: ['File:Reroll Token.png', 'File:TraitsReroll.png'],
  'reroll token': ['File:Reroll Token.png', 'File:TraitsReroll.png'],
  'trait reroll': ['File:Reroll Token.png', 'File:TraitsReroll.png'],
  star_remnant: ['File:StarRemnant.png', 'File:Star Remnant.png'],
  star_remnant_limited: ['File:StarRemnant.png', 'File:Star Remnant.png'],
  'star remnant': ['File:StarRemnant.png', 'File:Star Remnant.png'],
  broken_star: ['File:Broken Star.png', 'File:StarRemnant.png', 'File:Star Remnant.png'],
  broken_star_limited: ['File:Broken Star.png', 'File:StarRemnant.png', 'File:Star Remnant.png'],
  curse_tokens: ['File:Cursed Finger.png', 'File:Cursed Womb.png'],
  curse_reroll_tokens: ['File:Cursed Finger.png', 'File:Cursed Womb.png'],
  'curse reroll': ['File:Cursed Finger.png', 'File:Cursed Womb.png'],
  'cursed token': ['File:Cursed Finger.png', 'File:Cursed Womb.png'],
  sukuna_finger: ['File:Cursed Finger.png', 'File:Cursed Womb.png'],
  sukuna_finger_permanent: ['File:Cursed Finger.png', 'File:Cursed Womb.png'],
  stat_cube: ['File:Stat Cube.png'],
  reroll_stat_all: ['File:Stat Cube.png'],
  'stat cube': ['File:Stat Cube.png'],
  perfect_stat_cube: ['File:Perfect Stat Cube.png', 'File:PerfectStatCube.png'],
  reroll_stat_specific: ['File:Perfect Stat Cube.png', 'File:PerfectStatCube.png'],
  'perfect stat cube': ['File:Perfect Stat Cube.png', 'File:PerfectStatCube.png'],
  rebirth_tokens: ['File:Rebirth Token.png'],
  resource: ['File:Summer Pearls.png', 'File:Pearls.png', 'File:Holiday Stars.png', 'File:Candies.png'],
};

function stripParens(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCaseFromId(rawId: string): string {
  const base = rawId
    .replace(/_(evolved|evo|shiny|alt|v2|portal|raid|stage|unit|skin)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!base) return '';
  return base.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const t = item.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function normalizeMatchTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/^file:/, '')
    .replace(/\.(png|jpg|jpeg|webp|gif)$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w !== 'map' && w !== 'pose' && w !== 'icon');
}

function isGoodWikiImageUrl(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    ALLOWED_WIKI_IMAGE_RE.test(url) &&
    !BAD_WIKI_FILENAME_RE.test(url) &&
    !/\.svg(?:\/|\?|$)/i.test(url)
  );
}

async function fetchWikiJson(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  try {
    const qs = new URLSearchParams({ action: 'query', format: 'json', ...params });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${WIKI_API}?${qs.toString()}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'AAVault/2.5' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function queryWikiFiles(fileTitles: string[], width = 256): Promise<string | null> {
  const titles = uniqueStrings(fileTitles).slice(0, 12);
  if (titles.length === 0) return null;
  const data = await fetchWikiJson({
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: String(width),
    redirects: '1',
  });
  const query = data?.query as
    | {
        pages?: Record<
          string,
          { title?: string; missing?: string; imageinfo?: Array<{ thumburl?: string; url?: string }> }
        >;
      }
    | undefined;
  const byTitle = new Map<string, string>();
  for (const p of Object.values(query?.pages || {})) {
    if (!p || p.missing !== undefined) continue;
    const url = p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url;
    if (p.title && isGoodWikiImageUrl(url)) byTitle.set(p.title.toLowerCase(), url);
  }
  for (const c of titles) {
    const hit = byTitle.get(c.toLowerCase());
    if (hit) return hit;
  }
  return byTitle.values().next().value || null;
}

async function queryWikiPageImages(pageTitles: string[], width = 256): Promise<string | null> {
  const titles = uniqueStrings(pageTitles).slice(0, 8);
  if (titles.length === 0) return null;
  const data = await fetchWikiJson({
    titles: titles.join('|'),
    prop: 'pageimages',
    piprop: 'thumbnail|original',
    pithumbsize: String(width),
    redirects: '1',
  });
  const query = data?.query as
    | {
        pages?: Record<
          string,
          {
            title?: string;
            missing?: string;
            thumbnail?: { source?: string };
            original?: { source?: string };
          }
        >;
      }
    | undefined;
  const byTitle = new Map<string, string>();
  for (const p of Object.values(query?.pages || {})) {
    if (!p || p.missing !== undefined) continue;
    const url = p.thumbnail?.source || p.original?.source;
    if (p.title && isGoodWikiImageUrl(url)) byTitle.set(p.title.toLowerCase(), url);
  }
  for (const c of titles) {
    const hit = byTitle.get(c.toLowerCase());
    if (hit) return hit;
  }
  return byTitle.values().next().value || null;
}

async function searchWikiFileStrict(searchText: string, width = 256): Promise<string | null> {
  const targetTokens = normalizeMatchTokens(searchText);
  if (targetTokens.length === 0) return null;
  const data = await fetchWikiJson({
    generator: 'search',
    gsrsearch: searchText,
    gsrnamespace: '6',
    gsrlimit: '4',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: String(width),
  });
  const query = data?.query as
    | {
        pages?: Record<
          string,
          { index?: number; title?: string; imageinfo?: Array<{ thumburl?: string; url?: string }> }
        >;
      }
    | undefined;
  const pages = Object.values(query?.pages || {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  for (const p of pages) {
    const url = p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url;
    if (!p.title || !isGoodWikiImageUrl(url) || /\.gif(?:\/|\?|$)/i.test(url)) continue;
    const fileTokens = normalizeMatchTokens(p.title);
    const matched = targetTokens.filter((t) => fileTokens.includes(t)).length;
    if (matched >= targetTokens.length || (targetTokens.length >= 2 && matched >= targetTokens.length - 1)) {
      return url;
    }
  }
  return null;
}

async function resolveAaImageUrl(opts: {
  kind: AaImageKind;
  name: string;
  id: string;
  world: string;
  map: string;
  assetId: string;
}): Promise<string | null> {
  const { kind, name, id, world, map, assetId } = opts;
  const cacheKey = `${kind}|${name.toLowerCase()}|${id.toLowerCase()}|${world.toLowerCase()}|${map.toLowerCase()}|${assetId}`;
  const now = Date.now();
  const cached = aaImageCache.get(cacheKey);
  if (cached && cached.exp > now) return cached.url;

  let resolved: string | null = null;
  if (assetId && /^\d{4,15}$/.test(assetId)) {
    resolved = await resolveRobloxAssetThumb(assetId);
  }

  if (!resolved) {
    const baseName = stripParens(name);
    const idTitle = titleCaseFromId(id);

    if (kind === 'currency') {
      const lowerId = id.toLowerCase();
      const lowerName = name.toLowerCase();
      const preset =
        CURRENCY_FILE_MAP[lowerId] ||
        CURRENCY_FILE_MAP[lowerName] ||
        (lowerName.includes('pearl') || lowerId.includes('pearl')
          ? ['File:Summer Pearls.png', 'File:Summer Pearl.png', 'File:Pearls.png', 'File:Pearl.png']
          : lowerName.includes('gem')
            ? ['File:Gems.png']
            : lowerName.includes('gold')
              ? ['File:Gold.png']
              : lowerName.includes('trophy')
                ? ['File:Trophies.png']
                : lowerName.includes('curse') || lowerId.includes('curse') || lowerId.includes('sukuna_finger')
                  ? ['File:Cursed Finger.png', 'File:Cursed Womb.png']
                  : lowerName.includes('remnant') || lowerId.includes('remnant') || lowerName.includes('broken star') || lowerId.includes('broken_star')
                    ? ['File:StarRemnant.png', 'File:Star Remnant.png']
                    : lowerName.includes('perfect') && lowerName.includes('cube')
                      ? ['File:Perfect Stat Cube.png', 'File:PerfectStatCube.png']
                      : lowerName.includes('stat cube') || lowerId.includes('reroll_stat_all')
                        ? ['File:Stat Cube.png']
                        : lowerName.includes('trait') || lowerName.includes('reroll') || lowerId.includes('trait_reroll')
                          ? ['File:Reroll Token.png', 'File:TraitsReroll.png']
                          : []);
      const candidates = uniqueStrings([
        ...preset,
        ...(name ? [`File:${name}.png`] : []),
        ...(baseName ? [`File:${baseName}.png`] : []),
      ]);
      resolved = await queryWikiFiles(candidates, 160);
    } else if (kind === 'stage') {
      const mapTitle = titleCaseFromId(map);
      const stageNames = uniqueStrings([name, baseName, world, mapTitle]).filter(
        (s) => s.toLowerCase() !== 'lobby' && s !== 'ล็อบบี้'
      );
      const combinedStage = [name, id, world, map].filter(Boolean).join(' ');
      const STAGE_WIKI_ALIAS_MAP: Array<[RegExp, string[]]> = [
        [/shibuya/i, ['File:Shibuya Incident UOThumbnail.png']],
        [/night[\s_-]*market/i, ['File:Night Market Thumbnail.png']],
        [/infinity[\s_-]*castle/i, ['File:Infinity Castle.png']],
        [/namak|namek/i, ['File:Map - Planet Namak.png']],
        [/marine/i, ["File:Map - Marine's Ford.png"]],
        [/clover/i, ['File:Map - Clover Kingdom.png']],
        [/sand[\s_-]*village|hidden[\s_-]*sand/i, ['File:Map - Hidden Sand Village.png']],
        [/hollow[\s_-]*invasion/i, ['File:Map - Hollow Invasion.png']],
        [/hollow|hueco/i, ['File:Map - Hollow World.png', 'File:Map - Hollow Invasion.png']],
        [/hero[\s_-]*city|midnight/i, ['File:Map - Hero City.png']],
        [/ghoul/i, ['File:Map - Ghoul City.png']],
        [/snowy/i, ['File:Map - Snowy Town.png']],
        [/undead|tomb/i, ['File:Map - Undead Tomb.png']],
        [/ant[\s_-]*kingdom/i, ['File:Map - Ant Kingdom.png']],
        [/alien|spaceship/i, ['File:Map - Alien Spaceship.png']],
        [/puppet|dressrosa/i, ['File:Map - Puppet Island.png']],
        [/virtual|dungeon|sao|aincrad/i, ['File:Map - Virtual Dungeon.png']],
        [/windhym/i, ['File:Map - Windhym.png']],
        [/fabled/i, ['File:Map - Fabled Kingdom.png']],
        [/cursed[\s_-]*academy|jujutsu/i, ['File:Map - Cursed Academy.png']],
        [/cape[\s_-]*canaveral|jojo/i, ['File:Map - Cape Canaveral.png']],
        [/magic[\s_-]*town/i, ['File:Map - Magic Town.png']],
        [/shinganshinu|aot|titan/i, ['File:Map - Shinganshinu District.png']],
      ];
      const aliasFiles: string[] = [];
      for (const [re, files] of STAGE_WIKI_ALIAS_MAP) {
        if (re.test(combinedStage)) aliasFiles.push(...files);
      }
      const fileCandidates = uniqueStrings([
        ...aliasFiles,
        ...stageNames.flatMap((s) => [
          `File:Map - ${s}.png`,
          `File:${s} UOThumbnail.png`,
          `File:${s} Thumbnail.png`,
          `File:${s}.png`,
        ]),
      ]);
      resolved = await queryWikiFiles(fileCandidates, 320);
      if (!resolved && stageNames.length > 0) {
        resolved = await searchWikiFileStrict(`Map ${stageNames[0]}`, 320);
      }
    } else if (kind === 'unit') {
      const pageCandidates = uniqueStrings([name, baseName, idTitle]);
      resolved = await queryWikiPageImages(pageCandidates, 256);
      if (!resolved) {
        const fileCandidates = uniqueStrings(
          pageCandidates.flatMap((s) => [`File:${s}.png`, `File:${s} (Pose).png`])
        );
        resolved = await queryWikiFiles(fileCandidates, 256);
      }
    } else {
      const combinedItem = `${id} ${name}`.toLowerCase();
      const ITEM_WIKI_ALIAS_MAP: Array<[RegExp, string[]]> = [
        [/sukuna[\s_-]*finger|cursed[\s_-]*token|curse[\s_-]*reroll/i, ['File:Cursed Finger.png', 'File:Cursed Womb.png']],
        [/reroll[\s_-]*stat[\s_-]*specific|perfect[\s_-]*stat[\s_-]*cube/i, ['File:Perfect Stat Cube.png', 'File:PerfectStatCube.png']],
        [/reroll[\s_-]*stat[\s_-]*all|stat[\s_-]*cube/i, ['File:Stat Cube.png']],
        [/star[\s_-]*remnant/i, ['File:StarRemnant.png', 'File:Star Remnant.png']],
        [/broken[\s_-]*star/i, ['File:Broken Star.png', 'File:StarRemnant.png', 'File:Star Remnant.png']],
        [/trait[\s_-]*reroll|reroll[\s_-]*token/i, ['File:Reroll Token.png', 'File:TraitsReroll.png']],
      ];
      const aliasFiles: string[] = [];
      for (const [re, files] of ITEM_WIKI_ALIAS_MAP) {
        if (re.test(combinedItem)) aliasFiles.push(...files);
      }
      const itemNames = uniqueStrings([name, baseName, idTitle]);
      const fileCandidates = uniqueStrings([
        ...aliasFiles,
        ...itemNames.flatMap((s) => [`File:${s}.png`, `File:${s}.webp`]),
      ]);
      resolved = await queryWikiFiles(fileCandidates, 220);
      if (!resolved && name) resolved = await searchWikiFileStrict(name, 220);
      if (!resolved && baseName && baseName !== name) resolved = await searchWikiFileStrict(baseName, 220);
    }
  }

  const finalUrl = resolved && isAllowedAaImageUrl(resolved) ? resolved : null;
  aaImageCache.set(cacheKey, {
    url: finalUrl,
    exp: now + (finalUrl ? 24 * 3600_000 : 30 * 60_000),
  });
  return finalUrl;
}

async function readBodyText(req: Req, maxBytes = 1_500_000): Promise<string> {
  if (typeof req.body === 'string') return req.body.slice(0, maxBytes);
  if (Buffer.isBuffer(req.body)) return req.body.subarray(0, maxBytes).toString('utf-8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk) => {
      const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += b.length;
      if (total > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(b);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// 1) Upstash Redis / Vercel KV (automatically available via 1-click Vercel Storage Marketplace)
function getRedisConfig() {
  const directUrl = (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  const directToken = (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ''
  ).trim();
  if (directUrl && directToken) return { url: directUrl, token: directToken };

  // Also support prefixed Marketplace env vars (e.g. STORAGE_KV_REST_API_URL / *_REDIS_REST_URL)
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (key.endsWith('_REST_API_URL')) {
      const tokenKey = key.replace(/_REST_API_URL$/, '_REST_API_TOKEN');
      const token = process.env[tokenKey]?.trim();
      const url = value.trim().replace(/\/+$/, '');
      if (url && token) return { url, token };
    }
    if (key.endsWith('_REDIS_REST_URL')) {
      const tokenKey = key.replace(/_REDIS_REST_URL$/, '_REDIS_REST_TOKEN');
      const token = process.env[tokenKey]?.trim();
      const url = value.trim().replace(/\/+$/, '');
      if (url && token) return { url, token };
    }
  }

  return null;
}

// 2) Direct Cloudflare KV REST API (if configured via Vercel Env)
function getCfKvConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (accountId && namespaceId && apiToken) {
    return { accountId, namespaceId, apiToken };
  }
  return null;
}

function detectProvider(): { name: string; persistent: boolean } {
  if (getRedisConfig()) return { name: 'vercel-kv', persistent: true };
  if (getCfKvConfig()) return { name: 'cloudflare-kv-vercel', persistent: true };
  return { name: 'vercel-builtin', persistent: false };
}

async function storeGet<T>(key: string): Promise<T | null> {
  const redis = getRedisConfig();
  if (redis) {
    const res = await fetch(redis.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redis.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['GET', key]),
    });
    if (!res.ok) throw new Error(`Redis GET failed: ${res.status}`);
    const data = (await res.json()) as { result?: string | null };
    if (!data.result) return null;
    return JSON.parse(data.result) as T;
  }

  const cf = getCfKvConfig();
  if (cf) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${cf.accountId}/storage/kv/namespaces/${cf.namespaceId}/values/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cf.apiToken}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Cloudflare KV GET failed: ${res.status}`);
    return (await res.json()) as T;
  }

  const tmp = loadTmpStore();
  if (key.startsWith('room:')) {
    return (tmp.rooms[key.slice(5)] as unknown as T) ?? null;
  }
  if (key.startsWith('share:')) {
    return (tmp.shares[key.slice(6)] as unknown as T) ?? null;
  }
  if (key.startsWith('asset:')) {
    return (tmp.assets?.[key.slice(6)] as unknown as T) ?? null;
  }
  return null;
}

async function storePut(key: string, value: unknown): Promise<void> {
  const redis = getRedisConfig();
  if (redis) {
    const res = await fetch(redis.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redis.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', key, JSON.stringify(value)]),
    });
    if (!res.ok) throw new Error(`Redis SET failed: ${res.status}`);
    return;
  }

  const cf = getCfKvConfig();
  if (cf) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${cf.accountId}/storage/kv/namespaces/${cf.namespaceId}/values/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cf.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });
    if (!res.ok) throw new Error(`Cloudflare KV PUT failed: ${res.status}`);
    return;
  }

  const tmp = loadTmpStore();
  if (key.startsWith('room:')) {
    tmp.rooms[key.slice(5)] = value as Record<string, AccountSnapshot>;
  } else if (key.startsWith('share:')) {
    tmp.shares[key.slice(6)] = value as ShareRecord;
  } else if (key.startsWith('asset:')) {
    if (!tmp.assets) tmp.assets = {};
    tmp.assets[key.slice(6)] = value as StoredAsset;
  }
  saveTmpStore(tmp);
}

function buildLuaScript(
  endpointUrl: string,
  syncKey: string,
  intervalSec = 120,
  showInGameGui = true
): string {
  const endpoint = endpointUrl.trim().replace(/\/$/, '');
  const guiSection = showInGameGui
    ? `
------------------------------------------------------------------
-- 6) MAIN IN-GAME GUI (2K | ด่าน • รางวัลจบด่าน • ทีม 6 • กระเป๋า + ส่งเข้าเว็บ)
------------------------------------------------------------------
local gui = Instance.new("ScreenGui")
gui.Name = "2K_RewardTracker"
gui.ResetOnSpawn = false
gui.DisplayOrder = 85
gui.IgnoreGuiInset = false
pcall(function() gui.Parent = (gethui and gethui()) or PG end)
if not gui.Parent then gui.Parent = PG end

local stash = Instance.new("Frame")
stash.Size = UDim2.fromOffset(1, 1)
stash.BackgroundTransparency = 1
stash.Visible = false
stash.Parent = gui

local main = Instance.new("Frame")
main.Size = UDim2.fromOffset(396, 592)
main.Position = UDim2.new(0, 40, 0, 56)
main.BackgroundColor3 = Color3.fromRGB(16, 19, 25)
main.BorderSizePixel = 0
main.Active = true
main.Parent = gui
Instance.new("UICorner", main).CornerRadius = UDim.new(0, 12)
local mstroke = Instance.new("UIStroke", main)
mstroke.Color = Color3.fromRGB(48, 58, 72); mstroke.Thickness = 1

local titleBar = Instance.new("TextButton")
titleBar.Size = UDim2.new(1, 0, 0, 34)
titleBar.BackgroundColor3 = Color3.fromRGB(24, 29, 38)
titleBar.Text = "  2K | AA Vault v" .. SCRIPT_VERSION .. " (ด่าน • รางวัลจบด่าน • ทีม 6)"
titleBar.TextXAlignment = Enum.TextXAlignment.Left
titleBar.TextColor3 = Color3.fromRGB(236, 244, 248)
titleBar.Font = Enum.Font.GothamBold
titleBar.TextSize = 12
titleBar.AutoButtonColor = false
titleBar.BorderSizePixel = 0
titleBar.ZIndex = 3
titleBar.Parent = main
Instance.new("UICorner", titleBar).CornerRadius = UDim.new(0, 12)

local function topBtn(label, xo, col, cb)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(26, 26)
	b.Position = UDim2.new(1, xo, 0, 4)
	b.BackgroundColor3 = col
	b.Text = label
	b.TextSize = 13
	b.Font = Enum.Font.GothamBold
	b.TextColor3 = Color3.fromRGB(245, 245, 250)
	b.BorderSizePixel = 0
	b.ZIndex = 5
	b.Parent = main
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 6)
	b.MouseButton1Click:Connect(cb)
	return b
end
topBtn("X", -32, Color3.fromRGB(168, 62, 62), function() Hub.Stop() end)
topBtn("-", -62, Color3.fromRGB(52, 58, 76), function()
	if main.Size.Y.Offset > 40 then main.Size = UDim2.fromOffset(396, 34) else main.Size = UDim2.fromOffset(396, 592) end
end)

do
	local dragging, sp, si = false, nil, nil
	conn(titleBar.InputBegan:Connect(function(i)
		if i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch then
			dragging = true; sp = i.Position; si = main.Position
		end
	end))
	conn(UIS.InputChanged:Connect(function(i)
		if dragging and (i.UserInputType == Enum.UserInputType.MouseMovement or i.UserInputType == Enum.UserInputType.Touch) then
			local d = i.Position - sp
			main.Position = UDim2.new(si.X.Scale, si.X.Offset + d.X, si.Y.Scale, si.Y.Offset + d.Y)
		end
	end))
	conn(UIS.InputEnded:Connect(function(i)
		if i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch then dragging = false end
	end))
end

-- Stage Banner (พร้อมรูปด่านจริงจาก MapIcons)
local loc = Instance.new("Frame")
loc.Size = UDim2.new(1, -12, 0, 74)
loc.Position = UDim2.fromOffset(6, 40)
loc.BackgroundColor3 = Color3.fromRGB(24, 29, 38)
loc.BorderSizePixel = 0
loc.Parent = main
Instance.new("UICorner", loc).CornerRadius = UDim.new(0, 9)

local locImg = Instance.new("ImageLabel")
locImg.Size = UDim2.fromOffset(62, 62)
locImg.Position = UDim2.fromOffset(6, 6)
locImg.BackgroundColor3 = Color3.fromRGB(34, 40, 52)
locImg.BorderSizePixel = 0
locImg.ScaleType = Enum.ScaleType.Crop
locImg.Image = ""
locImg.Parent = loc
Instance.new("UICorner", locImg).CornerRadius = UDim.new(0, 7)

local locTitle = Instance.new("TextLabel")
locTitle.Size = UDim2.new(1, -80, 0, 20)
locTitle.Position = UDim2.fromOffset(74, 5)
locTitle.BackgroundTransparency = 1
locTitle.Font = Enum.Font.GothamBold
locTitle.TextSize = 13
locTitle.TextXAlignment = Enum.TextXAlignment.Left
locTitle.TextColor3 = Color3.fromRGB(240, 246, 250)
locTitle.Text = "กำลังตรวจด่าน..."
locTitle.TextTruncate = Enum.TextTruncate.AtEnd
locTitle.Parent = loc

local locSub = Instance.new("TextLabel")
locSub.Size = UDim2.new(1, -80, 0, 44)
locSub.Position = UDim2.fromOffset(74, 25)
locSub.BackgroundTransparency = 1
locSub.Font = Enum.Font.Gotham
locSub.TextSize = 11
locSub.TextWrapped = true
locSub.TextXAlignment = Enum.TextXAlignment.Left
locSub.TextColor3 = Color3.fromRGB(165, 178, 195)
locSub.Text = ""
locSub.Parent = loc

Hub.LocImg = locImg
Hub.LocTitle = locTitle
Hub.LocSub = locSub

-- Tabs
local tabBar = Instance.new("Frame")
tabBar.Size = UDim2.new(1, -12, 0, 26)
tabBar.Position = UDim2.fromOffset(6, 120)
tabBar.BackgroundTransparency = 1
tabBar.Parent = main
local tbl = Instance.new("UIListLayout", tabBar)
tbl.FillDirection = Enum.FillDirection.Horizontal
tbl.Padding = UDim.new(0, 5)

local tabBtns = {}
for _, def in ipairs({ { "level", "ด่านนี้" }, { "reward", "รางวัลจบด่าน" }, { "team", "ทีม 6" }, { "bag", "กระเป๋า" } }) do
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(92, 24)
	b.BackgroundColor3 = Color3.fromRGB(32, 38, 50)
	b.Text = def[2]
	b.TextColor3 = Color3.fromRGB(220, 228, 238)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 11
	b.BorderSizePixel = 0
	b.Parent = tabBar
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 7)
	b.MouseButton1Click:Connect(function() Hub.Tab = def[1]; pcall(Hub.Render) end)
	tabBtns[def[1]] = b
end

local content = Instance.new("ScrollingFrame")
content.Size = UDim2.new(1, -12, 1, -276)
content.Position = UDim2.fromOffset(6, 150)
content.BackgroundColor3 = Color3.fromRGB(20, 24, 32)
content.BorderSizePixel = 0
content.ScrollBarThickness = 5
content.CanvasSize = UDim2.new()
content.AutomaticCanvasSize = Enum.AutomaticSize.Y
content.Parent = main
Instance.new("UICorner", content).CornerRadius = UDim.new(0, 8)
local cl = Instance.new("UIListLayout", content)
cl.Padding = UDim.new(0, 5)
cl.SortOrder = Enum.SortOrder.LayoutOrder
local cpad = Instance.new("UIPadding", content)
cpad.PaddingTop = UDim.new(0, 6); cpad.PaddingLeft = UDim.new(0, 6)
cpad.PaddingRight = UDim.new(0, 6); cpad.PaddingBottom = UDim.new(0, 6)

-- Action Buttons
local actRow = Instance.new("Frame")
actRow.Size = UDim2.new(1, -12, 0, 56)
actRow.Position = UDim2.new(0, 6, 1, -122)
actRow.BackgroundTransparency = 1
actRow.Parent = main
local arl = Instance.new("UIListLayout", actRow)
arl.FillDirection = Enum.FillDirection.Horizontal
arl.Padding = UDim.new(0, 5)
arl.Wraps = true

local function act(label, w, col, cb)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(w or 92, 24)
	b.BackgroundColor3 = col or Color3.fromRGB(40, 46, 62)
	b.Text = label
	b.TextColor3 = Color3.fromRGB(230, 238, 245)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 10
	b.BorderSizePixel = 0
	b.Parent = actRow
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 6)
	b.MouseButton1Click:Connect(cb)
	return b
end

act("ซิงค์ทันที", 88, Color3.fromRGB(16, 145, 96), function()
	Hub.HttpBlocked = false
	Hub.FailNotified = false
	pcall(Hub.UpdateLocation)
	Hub.SyncToWeb(true, "manual")
end)
act("สแกนรูปเกม", 96, Color3.fromRGB(22, 118, 148), function()
	Hub.ScanAndUploadGameAssets(true)
end)
act("คัดลอกเข้าเว็บ", 100, Color3.fromRGB(36, 98, 168), function()
	Hub.CopyForWeb()
end)
act("รีเฟรช", 80, Color3.fromRGB(46, 52, 68), function()
	pcall(Hub.UpdateLocation)
	Hub.InvalidatePics()
	Hub.Team = Hub.ReadTeam()
	pcall(Hub.ReadBag)
	pcall(Hub.Render)
	pcall(function()
		Hub.Toast("info", "รีเฟรชแล้ว", tostring(Hub.Stage.name) .. " • ทีม " .. tostring(#Hub.TeamList) .. "/6", Color3.fromRGB(130, 195, 255), Hub.Stage.mapImg)
	end)
end)
local picBtn
picBtn = act("รูปทีม: ภาพนิ่ง", 126, Color3.fromRGB(46, 52, 68), function()
	Hub.Flags.Pic = (Hub.Flags.Pic == "photo") and "card" or "photo"
	picBtn.Text = "รูปทีม: " .. (Hub.Flags.Pic == "photo" and "ภาพนิ่ง" or "การ์ด 2D")
	Hub.InvalidatePics()
	Hub.PicMode = Hub.Flags.Pic
	Hub.Tab = "team"
	pcall(Hub.Render)
end)
local ntBtn
ntBtn = act("แจ้งเตือน: เปิด", 126, Color3.fromRGB(46, 52, 68), function()
	Hub.Flags.Notify = not Hub.Flags.Notify
	ntBtn.Text = "แจ้งเตือน: " .. (Hub.Flags.Notify and "เปิด" or "ปิด")
end)
act("ล้างประวัติ", 118, Color3.fromRGB(110, 46, 54), function()
	Hub.Rewards = {}
	Hub.Totals = {}
	Hub.PendingDrops = {}
	Hub.Raw = {}
	Hub.LastFinishRunId = nil
	Hub.LastFinishAt = 0
	Hub.LastFinishMeta = nil
	pcall(Hub.Render)
end)

local footer = Instance.new("TextLabel")
footer.Size = UDim2.new(1, -12, 0, 56)
footer.Position = UDim2.new(0, 6, 1, -60)
footer.BackgroundColor3 = Color3.fromRGB(24, 29, 38)
footer.BorderSizePixel = 0
footer.Font = Enum.Font.Gotham
footer.TextSize = 10
footer.TextWrapped = true
footer.TextColor3 = Color3.fromRGB(190, 205, 220)
footer.Text = "กำลังโหลด..."
footer.Parent = main
Instance.new("UICorner", footer).CornerRadius = UDim.new(0, 8)

------------------------------------------------------------------
-- THUMBS & TEAM PORTRAITS (ภาพนิ่งแคช / การ์ด 2D)
------------------------------------------------------------------
function Hub.InvalidatePics()
	for _, w in pairs(Hub.Portraits) do pcall(function() w:Destroy() end) end
	Hub.Portraits = {}
	Hub.PicMode = nil
end

local function makeModelThumb(parent, src, px, xo, yo)
	local vf = Instance.new("ViewportFrame")
	vf.Size = UDim2.fromOffset(px, px)
	vf.Position = UDim2.fromOffset(xo, yo)
	vf.BackgroundColor3 = Color3.fromRGB(34, 38, 50)
	vf.BorderSizePixel = 0
	vf.Ambient = Color3.fromRGB(190, 190, 205)
	vf.LightColor = Color3.fromRGB(255, 255, 255)
	vf.Parent = parent
	Instance.new("UICorner", vf).CornerRadius = UDim.new(0, 6)
	local ok, clone = pcall(function() return src:Clone() end)
	if not ok or not clone then return vf end
	local wm = Instance.new("WorldModel"); wm.Parent = vf
	clone.Parent = wm
	local center, size
	if clone:IsA("Model") then
		local okc, c, s = pcall(function() return clone:GetBoundingBox() end)
		if okc and c then center, size = c, s end
	else
		center, size = clone.CFrame, clone.Size
	end
	if not center then return vf end
	local md = math.max(size.X, size.Y, size.Z, 0.2)
	local dir = Vector3.new(0.55, 0.35, 0.76).Unit
	local cam = Instance.new("Camera")
	cam.FieldOfView = 40
	cam.CFrame = CFrame.lookAt(center.Position + dir * (md * 2.0 + 0.4), center.Position)
	cam.Parent = vf
	vf.CurrentCamera = cam
	return vf
end

local function thumb(parent, px, xo, yo, img, model, col, letter)
	if img and img ~= "" then
		local i = Instance.new("ImageLabel")
		i.Size = UDim2.fromOffset(px, px)
		i.Position = UDim2.fromOffset(xo, yo)
		i.BackgroundColor3 = Color3.fromRGB(36, 40, 52)
		i.Image = img
		i.ScaleType = Enum.ScaleType.Fit
		i.BorderSizePixel = 0
		i.Parent = parent
		Instance.new("UICorner", i).CornerRadius = UDim.new(0, 6)
		return i
	end
	if model then return makeModelThumb(parent, model, px, xo, yo) end
	local f = Instance.new("Frame")
	f.Size = UDim2.fromOffset(px, px)
	f.Position = UDim2.fromOffset(xo, yo)
	f.BackgroundColor3 = col or Color3.fromRGB(36, 40, 52)
	f.BackgroundTransparency = 0.55
	f.BorderSizePixel = 0
	f.Parent = parent
	Instance.new("UICorner", f).CornerRadius = UDim.new(0, 6)
	local l = Instance.new("TextLabel")
	l.Size = UDim2.fromScale(1, 1)
	l.BackgroundTransparency = 1
	l.Font = Enum.Font.GothamBold
	l.TextSize = math.max(12, math.floor(px * 0.42))
	l.TextColor3 = col or Color3.fromRGB(205, 210, 224)
	l.Text = letter or "?"
	l.Parent = f
	return f
end

local function buildPic(u, px)
	local col = rcol(u.rarity)
	local wrap = Instance.new("Frame")
	wrap.Size = UDim2.fromOffset(px, px)
	wrap.BackgroundColor3 = Color3.fromRGB(26, 30, 40)
	wrap.BorderSizePixel = 0
	wrap.Parent = stash
	Instance.new("UICorner", wrap).CornerRadius = UDim.new(0, 7)
	local stroke = Instance.new("UIStroke", wrap)
	stroke.Color = col
	stroke.Thickness = u.shiny and 2 or 1

	local useModel = Hub.Flags.Pic == "photo" and Hub.Flags.Models and u.model ~= nil
	if not useModel then
		local g = Instance.new("Frame")
		g.Size = UDim2.new(1, -2, 1, -2)
		g.Position = UDim2.fromOffset(1, 1)
		g.BackgroundColor3 = col
		g.BackgroundTransparency = 0.55
		g.BorderSizePixel = 0
		g.Parent = wrap
		Instance.new("UICorner", g).CornerRadius = UDim.new(0, 6)
		local l = Instance.new("TextLabel")
		l.Size = UDim2.fromScale(1, 1)
		l.BackgroundTransparency = 1
		l.Font = Enum.Font.GothamBold
		l.TextSize = math.floor(px * 0.42)
		l.TextColor3 = Color3.fromRGB(255, 255, 255)
		l.Text = string.upper(string.sub(tostring(u.name), 1, 1))
		l.Parent = g
		Hub.Portraits[u.uuid or tostring(u.slot)] = wrap
		return wrap
	end

	local vf = Instance.new("ViewportFrame")
	vf.Size = UDim2.new(1, -2, 1, -2)
	vf.Position = UDim2.fromOffset(1, 1)
	vf.BackgroundColor3 = Color3.fromRGB(32, 36, 48)
	vf.BorderSizePixel = 0
	vf.Ambient = Color3.fromRGB(195, 195, 210)
	vf.LightColor = Color3.fromRGB(255, 255, 255)
	vf.LightDirection = Vector3.new(-0.5, -0.8, -0.6)
	vf.Parent = wrap
	Instance.new("UICorner", vf).CornerRadius = UDim.new(0, 6)

	local ok, clone = pcall(function() return u.model:Clone() end)
	if not ok or not clone then
		Hub.Portraits[u.uuid or tostring(u.slot)] = wrap
		return wrap
	end
	for _, d in ipairs(clone:GetDescendants()) do
		if d:IsA("Sound") or d:IsA("Script") or d:IsA("LocalScript") or d:IsA("ParticleEmitter")
			or d:IsA("Trail") or d:IsA("Beam") or d:IsA("BillboardGui") then
			pcall(function() d:Destroy() end)
		end
	end
	local wm = Instance.new("WorldModel"); wm.Parent = vf
	clone.Parent = wm

	local head = clone:FindFirstChild("Head", true)
	local target, dir, dist
	if head and head:IsA("BasePart") then
		local lv = head.CFrame.LookVector
		if lv.Magnitude < 0.05 then lv = Vector3.new(0, 0, -1) end
		local hs = math.max(head.Size.X, head.Size.Y, head.Size.Z, 0.5)
		target = head.Position + Vector3.new(0, -hs * 0.35, 0)
		dir = (lv.Unit * 0.94 + Vector3.new(0, 0.22, 0)).Unit
		dist = hs * 3.4
	else
		local okc, c, s = pcall(function() return clone:GetBoundingBox() end)
		if okc and c then
			target = c.Position
			dist = math.max(s.X, s.Y, s.Z) * 2.0
			dir = Vector3.new(0.55, 0.35, 0.76).Unit
		end
	end
	if target and dir and dist then
		local cam = Instance.new("Camera")
		cam.FieldOfView = 36
		cam.CFrame = CFrame.lookAt(target + dir * dist, target)
		cam.Parent = vf
		vf.CurrentCamera = cam
	end
	Hub.Portraits[u.uuid or tostring(u.slot)] = wrap
	return wrap
end

local function clearContent()
	for _, w in pairs(Hub.Portraits) do
		if w and w.Parent ~= stash then pcall(function() w.Parent = stash end) end
	end
	for _, c in ipairs(content:GetChildren()) do
		if c:IsA("GuiObject") then c:Destroy() end
	end
end
local function addHeader(text, col)
	local l = Instance.new("TextLabel")
	l.Size = UDim2.new(1, 0, 0, 20)
	l.BackgroundTransparency = 1
	l.Font = Enum.Font.GothamBold
	l.TextSize = 11
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextColor3 = col or Color3.fromRGB(140, 155, 178)
	l.Text = "  " .. text
	l.Parent = content
	return l
end
local function addNote(text)
	local l = Instance.new("TextLabel")
	l.Size = UDim2.new(1, 0, 0, 38)
	l.BackgroundTransparency = 1
	l.Font = Enum.Font.Gotham
	l.TextSize = 11
	l.TextWrapped = true
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextColor3 = Color3.fromRGB(170, 180, 195)
	l.Text = "  " .. text
	l.Parent = content
	return l
end
local function addBox(h)
	local r = Instance.new("Frame")
	r.Size = UDim2.new(1, 0, 0, h or 42)
	r.BackgroundColor3 = Color3.fromRGB(30, 35, 45)
	r.BorderSizePixel = 0
	r.Parent = content
	Instance.new("UICorner", r).CornerRadius = UDim.new(0, 7)
	return r
end
local function twoLine(parent, title, sub, col, xo, rightText)
	local t = Instance.new("TextLabel")
	t.Size = UDim2.new(1, -(xo + 60), 0, 18)
	t.Position = UDim2.fromOffset(xo, 4)
	t.BackgroundTransparency = 1
	t.Font = Enum.Font.GothamBold
	t.TextSize = 12
	t.TextXAlignment = Enum.TextXAlignment.Left
	t.TextColor3 = col
	t.TextTruncate = Enum.TextTruncate.AtEnd
	t.Text = tostring(title)
	t.Parent = parent
	local s = Instance.new("TextLabel")
	s.Size = UDim2.new(1, -(xo + 8), 0, 16)
	s.Position = UDim2.fromOffset(xo, 22)
	s.BackgroundTransparency = 1
	s.Font = Enum.Font.Gotham
	s.TextSize = 10
	s.TextXAlignment = Enum.TextXAlignment.Left
	s.TextColor3 = Color3.fromRGB(160, 172, 188)
	s.TextTruncate = Enum.TextTruncate.AtEnd
	s.Text = tostring(sub)
	s.Parent = parent
	if rightText then
		local r = Instance.new("TextLabel")
		r.Size = UDim2.fromOffset(56, 40)
		r.Position = UDim2.new(1, -58, 0, 0)
		r.BackgroundTransparency = 1
		r.Font = Enum.Font.GothamBold
		r.TextSize = 11
		r.TextXAlignment = Enum.TextXAlignment.Right
		r.TextColor3 = Color3.fromRGB(238, 244, 248)
		r.TextTruncate = Enum.TextTruncate.AtEnd
		r.Text = tostring(rightText)
		r.Parent = parent
	end
end

function Hub.Render()
	if not Hub.Running then return end
	clearContent()
	for k, b in pairs(tabBtns) do
		b.BackgroundColor3 = (k == Hub.Tab) and Color3.fromRGB(16, 175, 118) or Color3.fromRGB(32, 38, 50)
		b.TextColor3 = (k == Hub.Tab) and Color3.fromRGB(8, 22, 16) or Color3.fromRGB(220, 228, 238)
	end

	local st = Hub.Stage
	if Hub.Tab == "level" then
		if not st or st.inLobby then
			addHeader("สถานะปัจจุบัน: อยู่ในล็อบบี้", Color3.fromRGB(140, 200, 255))
			addNote("เมื่อเข้าด่านแล้วระบบจะแสดงชื่อด่าน โลก แผนที่ โหมด ความยาก บอส Wave และรูปด่านให้อัตโนมัติ (ทั้งในเกมและบนเว็บ)")
		else
			addHeader("ด่านที่กำลังเล่น", Color3.fromRGB(16, 245, 160))
			local rows = {
				{ "ชื่อด่าน", tostring(st.name or "-") },
				{ "โลก / แผนที่", tostring(st.world or "-") .. " • " .. tostring(st.map or "-") },
				{ "โหมด / ความยาก", tostring(st.gamemode or "-") .. " • " .. tostring(st.difficulty or "-") },
				{ "สถานที่", tostring(st.locationName or "-") },
				{ "Boss", tostring(st.boss or "-") },
				{ "Wave", "รอบ " .. tostring(st.wave or 0) .. (st.isLastWave and " (สุดท้าย)" or "") },
				{ "ศัตรูเหลือ", tostring(st.enemiesLeft or "?") .. "  •  บอสเหลือ: " .. tostring(st.bossLeft or "?") },
			}
			for _, r in ipairs(rows) do
				local b = addBox(26)
				local k = Instance.new("TextLabel")
				k.Size = UDim2.new(0, 108, 1, 0); k.BackgroundTransparency = 1
				k.Font = Enum.Font.GothamBold; k.TextSize = 11
				k.TextXAlignment = Enum.TextXAlignment.Left
				k.TextColor3 = Color3.fromRGB(145, 160, 182)
				k.Text = "  " .. r[1]; k.Parent = b
				local v = Instance.new("TextLabel")
				v.Size = UDim2.new(1, -114, 1, 0); v.Position = UDim2.fromOffset(110, 0)
				v.BackgroundTransparency = 1; v.Font = Enum.Font.Gotham; v.TextSize = 11
				v.TextXAlignment = Enum.TextXAlignment.Left
				v.TextColor3 = Color3.fromRGB(238, 242, 248); v.TextTruncate = Enum.TextTruncate.AtEnd
				v.Text = r[2]; v.Parent = b
			end
		end

	elseif Hub.Tab == "reward" then
		local runSeen, runTotal = {}, 0
		for _, rw in ipairs(Hub.Rewards) do
			local rk = rw.runId and tostring(rw.runId) or tostring(rw.ts or rw.t)
			if not runSeen[rk] then runSeen[rk] = true; runTotal = runTotal + 1 end
		end
		addHeader("ประวัติของดรอปตอนจบด่าน (" .. runTotal .. "/15 รายการ)", Color3.fromRGB(16, 245, 160))
		if #Hub.Rewards == 0 then
			addNote("ระบบจะไม่แจ้งทีละชิ้นระหว่างด่านยังไม่จบ — เมื่อจบด่านแล้วจะสรุป Gold/Gems/XP/Token + ไอเทม + ยูนิตพร้อมชื่อด่านและรูปส่งเข้าเว็บทีเดียวครับ")
		end
		local budget = 12
		local lastRunId, order = nil, 0
		for i = 1, math.min(#Hub.Rewards, 120) do
			local e = Hub.Rewards[i]
			if e.runId and e.runId ~= lastRunId then
				lastRunId = e.runId
				order = order + 1
				local hb = addBox(46)
				hb.LayoutOrder = order
				hb.BackgroundColor3 = Color3.fromRGB(22, 34, 42)
				local hStroke = Instance.new("UIStroke", hb)
				hStroke.Color = Color3.fromRGB(28, 128, 96); hStroke.Thickness = 1
				thumb(hb, 36, 5, 5, e.stageImg, nil, Color3.fromRGB(16, 245, 160), "S")
				local subParts = { tostring(e.t) .. " น." }
				if e.stageDifficulty and e.stageDifficulty ~= "" then subParts[#subParts + 1] = tostring(e.stageDifficulty) end
				if e.stageWaves and e.stageWaves ~= "" then subParts[#subParts + 1] = tostring(e.stageWaves) end
				if e.stageTimer and e.stageTimer ~= "" then subParts[#subParts + 1] = tostring(e.stageTimer) end
				twoLine(hb, "จบด่าน: " .. tostring(e.stageName or "?"), table.concat(subParts, " • "), Color3.fromRGB(16, 245, 160), 48, nil)
			end
			order = order + 1
			local r = addBox(42)
			r.LayoutOrder = order
			local src = (e.kind == "item") and itemModel(e.id) or nil
			if src and budget <= 0 then src = nil end
			if src then budget = budget - 1 end
			thumb(r, 32, 5, 5, e.img, src, rcol(e.rarity), string.sub(tostring(e.name), 1, 1))
			local dispName = e.tier and (tostring(e.name) .. " [" .. tostring(e.tier) .. "]") or tostring(e.name)
			twoLine(r, dispName, tostring(e.rarity) .. " • " .. tostring(e.stageName or "จบด่าน") .. " • " .. tostring(e.t), rcol(e.rarity), 44, "+" .. tostring(e.qty))
		end

	elseif Hub.Tab == "team" then
		if Hub.PicMode ~= Hub.Flags.Pic then Hub.InvalidatePics() end
		Hub.PicMode = Hub.Flags.Pic
		local list = Hub.TeamList or {}
		addHeader("ทีมที่ใส่ (" .. #list .. "/6) • " .. (Hub.Flags.Pic == "photo" and "ภาพนิ่ง" or "การ์ด 2D"))
		if #list == 0 then addNote("ไม่พบทีม — กด 'รีเฟรช' หรือเข้าหน้าหลักของเกมก่อน") end
		for i, u in ipairs(list) do
			local r = addBox(60)
			r.LayoutOrder = i
			local key = u.uuid or tostring(u.slot)
			local pic = Hub.Portraits[key]
			if not pic or not pic.Parent then pic = buildPic(u, 50) end
			pic.Parent = r; pic.Position = UDim2.fromOffset(6, 5)
			local sub = tostring(u.rarity) .. " • ช่อง " .. tostring(u.slot) .. " • Lv." .. tostring(u.level or 1)
			if u.shiny then sub = sub .. " • Shiny" end
			if u.traits and #u.traits > 0 then sub = sub .. " • " .. table.concat(u.traits, ",") end
			twoLine(r, tostring(u.name), sub, rcol(u.rarity), 64, nil)
		end

	elseif Hub.Tab == "bag" then
		local list = Hub.Bag or {}
		addHeader("กระเป๋า (" .. #list .. " รายการ — แยก Portals / Charms + Tier)")
		if #list == 0 then addNote("กำลังอ่านกระเป๋า... หรือกดปุ่ม 'รีเฟรช'") end
		local budget = 20
		local lastCat, order = nil, 0
		for _, e in ipairs(list) do
			order = order + 1
			if e.group ~= lastCat then
				lastCat = e.group
				local hCol = (e.group == "Portals" and Color3.fromRGB(130, 220, 255))
					or (e.group == "Charms" and Color3.fromRGB(255, 195, 110))
					or Color3.fromRGB(160, 200, 255)
				local h = addHeader("▸ " .. tostring(e.group), hCol)
				h.LayoutOrder = order
				order = order + 1
			end
			local r = addBox(42)
			r.LayoutOrder = order
			local src = nil
			if e.kind ~= "unit" then
				src = itemModel(e.id)
				if src and budget <= 0 then src = nil end
				if src then budget = budget - 1 end
			end
			thumb(r, 32, 5, 5, e.img, src, rcol(e.rarity), string.sub(tostring(e.name), 1, 1))
			local dispName = e.tier and (tostring(e.name) .. " [" .. tostring(e.tier) .. "]") or tostring(e.name)
			twoLine(r, dispName, tostring(e.rarity) .. " • " .. tostring(e.group), rcol(e.rarity), 44, "x" .. tostring(e.qty))
		end
	end

	local stats = Hub.CurrentStats or {}
	local assetSuffix = (Hub.AssetStatus and Hub.AssetStatus ~= "") and (" • " .. tostring(Hub.AssetStatus)) or ""
	footer.Text = string.format("Lv.%s • Gold %s • Gems %s • Pearls %s\\nเว็บ: %s%s",
		tostring(Hub.PlayerLevel or "?"),
		tostring(math.floor(stats.gold_amount or 0)),
		tostring(math.floor(stats.gem_amount or 0)),
		tostring(math.floor(stats.summer_pearls or stats.resource or 0)),
		tostring(Hub.SyncStatus or "..."),
		assetSuffix)
end
`
    : `
function Hub.InvalidatePics() end
function Hub.Render() end
`;

  return `-- ============================================================
-- 2K | Anime Adventures — Web Auto-Sync v${SCRIPT_VERSION} (Real-Event Engine v10)
-- อัปเดตเมื่อ: ${SCRIPT_UPDATED_AT}
-- รางวัลด่านอ่านจาก event จริง 100% (game_finished / show_unit_and_item_rewards / show_drop_message / show_drop_message_custom)
-- ============================================================
local WEB_URL = "${endpoint}"
local SYNC_KEY = "${syncKey}"
local AUTO_SYNC_SEC = ${intervalSec}
local SCRIPT_VERSION = "${SCRIPT_VERSION}"

local getEnv = (type(getgenv) == "function" and getgenv) or function() return _G end
local env = getEnv()
if env.TwoKReward then pcall(function() env.TwoKReward.Stop() end) end
if env.TwoK then pcall(function() env.TwoK.Stop() end) end

local Hub = {
	Running = true,
	Conns = {},
	Rewards = {},
	Totals = {},
	PendingDrops = {},
	Raw = {},
	Tab = "level",
	Team = {},
	TeamList = {},
	Bag = {},
	Flags = { Notify = true, WebSync = true, Models = true, Pic = "photo" },
	Portraits = {},
	PicMode = nil,
	Stage = { inLobby = true, name = "ล็อบบี้", wave = 0 },
	CurrentStats = {},
	LastFinish = nil,
	LastFinishAt = 0,
	LastFinishRunId = nil,
	LastFinishMeta = nil,
	RunSeq = 0,
	PlayerLevel = nil,
	LastSync = 0,
	SyncInFlight = false,
	SyncStartedAt = 0,
	SyncCount = 0,
	FailStreak = 0,
	FailNotified = false,
	UpdateNotified = false,
	LatestVersion = SCRIPT_VERSION,
	SyncStatus = "v" .. SCRIPT_VERSION .. " • กำลังเชื่อมต่อ...",
	SyncOk = false,
	HttpBlocked = false,
	Disconnected = false,
	DisconnectInfo = nil,
	DisconnectSentKey = nil,
	Profile = nil,
	CurrencyIcons = {
		gold = "rbxassetid://100751534594369",
		gems = "rbxassetid://71405874061254",
		summerPearls = nil,
		traitReroll = nil,
	},
	UploadedAssets = {},
	UploadTried = {},
	AssetStatus = "",
	AssetUploadCount = 0,
	AssetScanBusy = false,
}
env.TwoKReward = Hub

local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local UIS = game:GetService("UserInputService")
local HttpService = game:GetService("HttpService")
local TweenService = game:GetService("TweenService")
local AssetService = game:GetService("AssetService")
local ContentProvider = game:GetService("ContentProvider")
local GuiService = game:GetService("GuiService")
local CoreGui = nil
pcall(function() CoreGui = game:GetService("CoreGui") end)
local LP = Players.LocalPlayer
local PG = LP:WaitForChild("PlayerGui")

local function conn(c) Hub.Conns[#Hub.Conns + 1] = c; return c end
local function clock()
	local ok, t = pcall(os.date, "!%H:%M:%S", os.time() + 7 * 3600)
	if ok and t then return t end
	return "--:--:--"
end
local function safeNum(v) return tonumber(v) or 0 end
local function parseQty(v)
	if type(v) == "number" then return math.floor(v) end
	if type(v) ~= "string" then return 0 end
	local clean = v:gsub(",", ""):match("(%d+)")
	return tonumber(clean) or 0
end
local function extractAssetId(raw)
	if type(raw) ~= "string" and type(raw) ~= "number" then return nil end
	return tostring(raw):match("(%d%d%d%d+)")
end

local function idx(root, path)
	if not root then return nil end
	local cur = root
	for part in string.gmatch(path, "[^%.]+") do
		if not cur then return nil end
		cur = cur:FindFirstChild(part)
	end
	return cur
end
local function txt(root, path)
	local i = idx(root, path)
	if i and (i:IsA("TextLabel") or i:IsA("TextButton")) then return i.Text end
	return nil
end
local function imgOf(root, path)
	local i = idx(root, path)
	if i and (i:IsA("ImageLabel") or i:IsA("ImageButton")) and i.Image ~= "" then return i.Image end
	return nil
end
local function isGuiVisible(inst, stopAt)
	if not inst then return false end
	local cur = inst
	while cur and cur ~= stopAt do
		if cur:IsA("GuiObject") and cur.Visible == false then return false end
		cur = cur.Parent
	end
	return true
end

local httpRequest =
	(type(request) == "function" and request)
	or (type(http_request) == "function" and http_request)
	or (type(syn) == "table" and type(syn.request) == "function" and syn.request)
	or (type(fluxus) == "table" and type(fluxus.request) == "function" and fluxus.request)
	or (type(http) == "table" and type(http.request) == "function" and http.request)
	or nil

local getGC = (type(getgc) == "function" and getgc) or nil
local copyClip = setclipboard or toclipboard or (syn and syn.write_clipboard) or nil
local saveFile = writefile or nil
local BASE_API = WEB_URL:gsub("/api/sync.*$", "")

local B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local nativeB64 =
	(type(crypt) == "table" and (type(crypt.base64encode) == "function" and crypt.base64encode or type(crypt.base64_encode) == "function" and crypt.base64_encode))
	or (type(base64_encode) == "function" and base64_encode)
	or (type(base64encode) == "function" and base64encode)
	or (type(syn) == "table" and type(syn.crypt) == "table" and type(syn.crypt.base64) == "table" and type(syn.crypt.base64.encode) == "function" and syn.crypt.base64.encode)
	or nil

local function b64Encode(data)
	if nativeB64 then
		local ok, res = pcall(nativeB64, data)
		if ok and type(res) == "string" and #res > 0 then return res end
	end
	local len = #data
	local out = table.create(math.ceil(len / 3) * 4)
	local oi = 0
	for i = 1, len, 3 do
		local a = string.byte(data, i) or 0
		local b = string.byte(data, i + 1)
		local c = string.byte(data, i + 2)
		local n = bit32.lshift(a, 16) + bit32.lshift(b or 0, 8) + (c or 0)
		local c1 = bit32.extract(n, 18, 6) + 1
		local c2 = bit32.extract(n, 12, 6) + 1
		local c3 = bit32.extract(n, 6, 6) + 1
		local c4 = bit32.extract(n, 0, 6) + 1
		oi = oi + 1; out[oi] = string.sub(B64_CHARS, c1, c1)
		oi = oi + 1; out[oi] = string.sub(B64_CHARS, c2, c2)
		oi = oi + 1; out[oi] = b and string.sub(B64_CHARS, c3, c3) or "="
		oi = oi + 1; out[oi] = c and string.sub(B64_CHARS, c4, c4) or "="
	end
	return table.concat(out)
end

------------------------------------------------------------------
-- 1) GAME DATA & ASSETS (Items, Units, MapIcons, Resource Icons)
------------------------------------------------------------------
local DataFolder = idx(RS, "src.Data")
local function req(name)
	local m = DataFolder and DataFolder:FindFirstChild(name)
	if not m then return {} end
	local ok, r = pcall(require, m)
	if ok and type(r) == "table" then return r end
	return {}
end
local Items, Units = req("Items"), req("Units")

local Assets = idx(RS, "packages.assets")
local ItemModels = Assets and Assets:FindFirstChild("ItemModels")
local MapIcons = Assets and Assets:FindFirstChild("MapIcons")
local GuiAs = Assets and Assets:FindFirstChild("gui")
local OverrideIcons = GuiAs and GuiAs:FindFirstChild("_OverrideItemIcons")

local RES_ICON = {}
local RES_ICON_LOW = {}
pcall(function()
	local res = GuiAs and GuiAs:FindFirstChild("_Resource")
	if res then
		for _, c in ipairs(res:GetChildren()) do
			for _, d in ipairs(c:GetDescendants()) do
				if (d:IsA("ImageLabel") or d:IsA("ImageButton")) and d.Image ~= "" then
					RES_ICON[c.Name] = d.Image
					RES_ICON_LOW[c.Name:lower():gsub("[^a-z0-9]", "")] = d.Image
					break
				end
			end
		end
	end
end)

local RCOL = {
	Common = Color3.fromRGB(160, 160, 172), Uncommon = Color3.fromRGB(110, 200, 120),
	Rare = Color3.fromRGB(90, 160, 255), Epic = Color3.fromRGB(180, 110, 255),
	Legendary = Color3.fromRGB(255, 190, 80), Mythic = Color3.fromRGB(255, 120, 90),
	Secret = Color3.fromRGB(255, 100, 165), Exclusive = Color3.fromRGB(130, 220, 235),
}
local function rcol(r) return RCOL[tostring(r)] or Color3.fromRGB(160, 165, 180) end

local function itemDef(id) return type(Items) == "table" and Items[id] or nil end
local function unitDef(id) return type(Units) == "table" and Units[id] or nil end
local function iName(id) local d = itemDef(id); return (type(d) == "table" and d.name) or tostring(id) end
local function iRarity(id) local d = itemDef(id); return (type(d) == "table" and d.rarity) or "Common" end
local function iGroup(id) local d = itemDef(id); return (type(d) == "table" and d.item_group) or "Other" end
local function uName(id) local d = unitDef(id); return (type(d) == "table" and d.name) or tostring(id) end
local function uRarity(id) local d = unitDef(id); return (type(d) == "table" and d.rarity) or "Common" end

local function classifyItemGroup(rawGroup, id, name)
	local g = tostring(rawGroup or "")
	local lg = g:lower()
	local hay = (tostring(id or "") .. " " .. tostring(name or "")):lower()
	if lg:find("portal", 1, true) or hay:find("portal", 1, true) then return "Portals" end
	if lg:find("charm", 1, true) or hay:find("charm", 1, true) then return "Charms" end
	return (g ~= "" and g) or "Other"
end

local function normalizeTierVal(v)
	if type(v) == "number" then
		local n = math.floor(v)
		if n >= 1 and n <= 99 then return "Tier " .. tostring(n) end
	elseif type(v) == "string" then
		local s = v:match("^%s*(.-)%s*$")
		if s and s ~= "" then
			local n1 = s:lower():match("^tier%s*(%d+)$") or s:match("^(%d+)$")
			if n1 then
				local num = tonumber(n1)
				if num and num >= 1 and num <= 99 then return "Tier " .. tostring(math.floor(num)) end
			end
			if s:lower():sub(1, 5) == "tier " then return s:sub(1, 20) end
			if s:match("^[IVXS]+[%+%-]?$") and #s <= 4 then return "Tier " .. s end
		end
	end
	return nil
end

local function tierOrderNum(tierStr)
	if type(tierStr) ~= "string" then return 0 end
	local n = tierStr:match("(%d+)")
	return tonumber(n) or 0
end

local TIER_DIRECT_KEYS = {
	"_portal_tier", "portal_tier", "portalTier", "tier", "_tier", "Tier",
	"charm_tier", "_charm_tier", "charmTier", "item_tier", "_item_tier",
}

local function extractItemTier(u, itemId)
	if type(u) == "table" then
		for _, k in ipairs(TIER_DIRECT_KEYS) do
			local t = normalizeTierVal(rawget(u, k))
			if t then return t end
		end
		local visited = {}
		local function walkTier(tbl, depth)
			if depth > 3 or visited[tbl] then return nil end
			visited[tbl] = true
			for k, v in pairs(tbl) do
				if type(k) == "string" then
					local lk = k:lower()
					if lk:find("tier", 1, true) then
						local t = normalizeTierVal(v)
						if t then return t end
					end
				end
			end
			for _, v in pairs(tbl) do
				if type(v) == "table" then
					local t = walkTier(v, depth + 1)
					if t then return t end
				end
			end
			return nil
		end
		local deep = walkTier(u, 0)
		if deep then return deep end
	end
	local def = itemId and itemDef(itemId) or nil
	if type(def) == "table" then
		for _, k in ipairs(TIER_DIRECT_KEYS) do
			local t = normalizeTierVal(def[k])
			if t then return t end
		end
		if type(def.name) == "string" then
			local mn = def.name:lower():match("tier%s*(%d+)")
			if mn then return "Tier " .. tostring(tonumber(mn)) end
		end
	end
	if type(itemId) == "string" then
		local lid = itemId:lower()
		local m = lid:match("charm[_%-]+(%d+)$")
			or lid:match("portal[_%-]+(%d+)$")
			or lid:match("[_%-]tier[_%-]*(%d+)$")
			or lid:match("[_%-]t(%d+)$")
		if m then return "Tier " .. tostring(tonumber(m)) end
		-- ตามต้นฉบับ 2K v10: ถ้าเป็น Portal และไม่มีตัวเลข tier ให้ใช้ rarity เป็น Tier
		if type(def) == "table" and def.rarity ~= nil then
			local grp = tostring(def.item_group or ""):lower()
			if lid:find("portal", 1, true) or grp:find("portal", 1, true) then
				return tostring(def.rarity)
			end
		end
	end
	return nil
end

local function itemImg(id)
	if not id then return nil end
	if OverrideIcons then
		local l = OverrideIcons:FindFirstChild(tostring(id))
		if l then
			for _, x in ipairs(l:GetDescendants()) do
				if (x:IsA("ImageLabel") or x:IsA("ImageButton")) and x.Image ~= "" then return x.Image end
			end
		end
	end
	local d = itemDef(id)
	if type(d) == "table" then
		for _, k in ipairs({ "icon", "image", "_icon", "_resource_icon" }) do
			local v = d[k]
			if type(v) == "string" and v ~= "" then return v end
		end
	end
	return nil
end

local function scanGuiCurrencyIcon(keywords)
	local guiCandidates = { "ResultsUI", "HUD", "MainUI", "Currencies", "TopBar", "spawn_units", "LevelRewards" }
	for _, gn in ipairs(guiCandidates) do
		local g = PG:FindFirstChild(gn)
		if g then
			for _, d in ipairs(g:GetDescendants()) do
				if (d:IsA("ImageLabel") or d:IsA("ImageButton")) and d.Image ~= "" and extractAssetId(d.Image) then
					local nm = (d.Name .. " " .. (d.Parent and d.Parent.Name or "") .. " " .. (d.Parent and d.Parent.Parent and d.Parent.Parent.Name or "")):lower()
					for _, kw in ipairs(keywords) do
						if nm:find(kw, 1, true) then return d.Image end
					end
				end
			end
		end
	end
	return nil
end

local function resolveCurrencyIcon(key)
	local k = tostring(key or "")
	local lk = k:lower():gsub("[^a-z0-9]", "")
	if RES_ICON[k] then return RES_ICON[k] end
	if RES_ICON_LOW[lk] then return RES_ICON_LOW[lk] end
	local isPearl = lk:find("pearl", 1, true) or lk:find("summer", 1, true)
	local isGold = lk:find("gold", 1, true)
	local isGem = lk:find("gem", 1, true)

	if isPearl then
		for rn, rimg in pairs(RES_ICON) do
			local lrn = rn:lower()
			if lrn:find("pearl", 1, true) or lrn:find("summer", 1, true) or lrn:find("shell", 1, true) then
				return rimg
			end
		end
		for _, cand in ipairs({ "SummerPearls", "summer_pearls", "Summer_Pearls", "SummerPearl", "summer_pearl", "Pearls", "pearls", "summer2_currency", "summer_currency" }) do
			local im = itemImg(cand)
			if im then return im end
		end
		if type(Items) == "table" then
			for iid, def in pairs(Items) do
				local hay = (tostring(iid) .. " " .. tostring(type(def) == "table" and def.name or "")):lower()
				if hay:find("pearl", 1, true) then
					local im = itemImg(iid)
					if im then return im end
				end
			end
		end
		local hudImg = scanGuiCurrencyIcon({ "pearl", "summerpearl", "summer_pearl" })
		if hudImg then return hudImg end
		if Hub.CurrencyIcons.summerPearls then return Hub.CurrencyIcons.summerPearls end
	elseif isGold then
		return RES_ICON.Gold or RES_ICON_LOW.gold or scanGuiCurrencyIcon({ "goldreward", "gold" }) or "rbxassetid://100751534594369"
	elseif isGem then
		return RES_ICON.Gems or RES_ICON_LOW.gems or RES_ICON_LOW.gem or scanGuiCurrencyIcon({ "gemreward", "gem" }) or "rbxassetid://71405874061254"
	end
	local directItem = itemImg(k)
	if directItem then return directItem end
	for rn, rimg in pairs(RES_ICON) do
		local lrn = rn:lower():gsub("[^a-z0-9]", "")
		if #lrn >= 3 and (lk:find(lrn, 1, true) or lrn:find(lk, 1, true)) then
			return rimg
		end
	end
	return nil
end

function Hub.RefreshCurrencyIcons()
	local gImg = resolveCurrencyIcon("gold")
	local gmImg = resolveCurrencyIcon("gems")
	local spImg = resolveCurrencyIcon("summer_pearls")
	if gImg then Hub.CurrencyIcons.gold = gImg end
	if gmImg then Hub.CurrencyIcons.gems = gmImg end
	if spImg then Hub.CurrencyIcons.summerPearls = spImg end
end

local function itemModel(id)
	if not (ItemModels and id) then return nil end
	local d = itemDef(id)
	local key = (type(d) == "table" and d._use_item_model) or id
	local m = ItemModels:FindFirstChild(tostring(key))
	if m and (m:IsA("Model") or m:IsA("BasePart")) then return m end
	return nil
end

local function firstImageInside(inst)
	if not inst then return nil end
	if (inst:IsA("ImageLabel") or inst:IsA("ImageButton")) and inst.Image ~= "" then return inst.Image end
	for _, d in ipairs(inst:GetDescendants()) do
		if (d:IsA("ImageLabel") or d:IsA("ImageButton")) and d.Image ~= "" then return d.Image end
	end
	return nil
end

local function normKey(s)
	return tostring(s or ""):lower():gsub("[^a-z0-9]", "")
end

local function mapImage(mapId, world, stageName, stageId, isLobby)
	if MapIcons then
		local directKeys = isLobby and { "lobby" } or { mapId, world, stageId, stageName }
		for _, key in ipairs(directKeys) do
			if key and tostring(key) ~= "" then
				local f = MapIcons:FindFirstChild(tostring(key))
				local img = firstImageInside(f)
				if img then return img end
			end
		end
		if not isLobby then
			local wanted = {}
			for _, key in ipairs({ mapId, world, stageId, stageName }) do
				local nk = normKey(key)
				if #nk >= 3 then wanted[#wanted + 1] = nk end
			end
			if #wanted > 0 then
				for _, child in ipairs(MapIcons:GetChildren()) do
					local cn = normKey(child.Name)
					if #cn >= 3 and cn ~= "lobby" then
						for _, w in ipairs(wanted) do
							if cn == w or w:find(cn, 1, true) or cn:find(w, 1, true) then
								local img = firstImageInside(child)
								if img then return img end
							end
						end
					end
				end
			end
		end
	end
	-- Fallback: ตรวจรูปด่านจาก ResultsUI / GameLevelInfo ใน PlayerGui
	if not isLobby then
		for _, guiName in ipairs({ "ResultsUI", "GameLevelInfo" }) do
			local g = PG:FindFirstChild(guiName)
			if g then
				for _, d in ipairs(g:GetDescendants()) do
					if (d:IsA("ImageLabel") or d:IsA("ImageButton")) and d.Image ~= "" then
						local dn = d.Name:lower()
						if (dn:find("map") or dn:find("stage") or dn:find("level") or dn:find("banner") or dn:find("thumb")) and extractAssetId(d.Image) then
							return d.Image
						end
					end
				end
			end
		end
	end
	return nil
end

------------------------------------------------------------------
-- 1B) REAL IN-GAME TEXTURE SCANNER & AUTO-UPLOADER (v2.6.0)
------------------------------------------------------------------
local function openEditableImageSafe(assetId)
	local candidates = {}
	local hasContent = (type(Content) == "table" or type(Content) == "userdata") and type(Content.fromUri) == "function"
	local uriAsset = "rbxassetid://" .. assetId
	local uriThumb = "rbxthumb://type=Asset&id=" .. assetId .. "&w=420&h=420"
	if hasContent then
		local okC, cObj = pcall(Content.fromUri, uriAsset)
		if okC and cObj then candidates[#candidates + 1] = cObj end
	end
	candidates[#candidates + 1] = uriAsset
	if hasContent then
		local okT, tObj = pcall(Content.fromUri, uriThumb)
		if okT and tObj then candidates[#candidates + 1] = tObj end
	end
	candidates[#candidates + 1] = uriThumb

	local lastErr = "unsupported"
	for _, cand in ipairs(candidates) do
		local ok, ei = pcall(function()
			return AssetService:CreateEditableImageAsync(cand)
		end)
		if ok and ei then return ei, nil end
		lastErr = tostring(ei)
	end
	return nil, lastErr
end

function Hub.UploadGameAsset(imgUri, kind, label, maxDim, useAlpha)
	local assetId = extractAssetId(imgUri)
	if not assetId then return false, "no_id" end
	if not httpRequest or Hub.HttpBlocked then return false, "no_http" end
	if Hub.UploadedAssets[assetId] then return true, "cached" end
	if Hub.UploadTried[assetId] then return false, "tried" end
	Hub.UploadTried[assetId] = true

	-- 1) เช็คก่อนว่าเซิร์ฟเวอร์มีรูปนี้แล้วหรือยัง (จะได้ไม่อัปซ้ำและประหยัดโควต้า)
	local okChk, chkRes = pcall(function()
		return httpRequest({
			Url = BASE_API .. "/api/asset-exists?id=" .. assetId,
			Method = "GET",
			Headers = { ["Accept"] = "application/json" },
		})
	end)
	if okChk and chkRes then
		local chkBody = tostring(chkRes.Body or chkRes.body or "")
		if chkBody:find('"exists":true') then
			Hub.UploadedAssets[assetId] = true
			return true, "exists"
		end
	end

	-- 2) Preload รูปในเกมก่อนดึงพิกเซลจริง
	pcall(function() ContentProvider:PreloadAsync({ "rbxassetid://" .. assetId }) end)

	-- 3) อ่านรูปจริงจาก Roblox Client ด้วย AssetService:CreateEditableImageAsync
	local ei, openErr = openEditableImageSafe(assetId)
	if not ei then
		local low = tostring(openErr):lower()
		if low:find("permission") or low:find("owned") or low:find("not permitted") or low:find("denied") or low:find("access") then
			Hub.AssetStatus = "Roblox ล็อกอ่านรูป (" .. tostring(label or assetId):sub(1, 14) .. ")"
		else
			Hub.AssetStatus = "ดึงรูปไม่ได้: " .. tostring(openErr):gsub("[%c]+", " "):sub(1, 24)
		end
		pcall(Hub.Render)
		return false, "locked:" .. tostring(openErr)
	end

	local okRead, rawBytes, tw, th, channels = pcall(function()
		local sz = ei.Size
		local sw = math.max(1, math.floor(sz.X))
		local sh = math.max(1, math.floor(sz.Y))
		local cap = maxDim or 128
		local scale = math.min(1, cap / math.max(sw, sh))
		local dstW = math.max(1, math.floor(sw * scale + 0.5))
		local dstH = math.max(1, math.floor(sh * scale + 0.5))
		local ch = useAlpha and 4 or 3

		local pixBuf, pixTbl = nil, nil
		if type(ei.ReadPixelsBuffer) == "function" then
			local okB, b = pcall(function() return ei:ReadPixelsBuffer(Vector2.zero, sz) end)
			if okB and b then pixBuf = b end
		end
		if not pixBuf and type(ei.ReadPixels) == "function" then
			local okT, t = pcall(function() return ei:ReadPixels(Vector2.zero, sz) end)
			if okT and type(t) == "table" then pixTbl = t end
		end
		if not pixBuf and not pixTbl then error("no_pixel_reader") end

		local chunks = table.create(dstW * dstH)
		local ci = 0
		if pixBuf then
			for y = 0, dstH - 1 do
				local sy = math.min(sh - 1, math.floor((y + 0.5) * sh / dstH))
				local rowOff = sy * sw * 4
				for x = 0, dstW - 1 do
					local sx = math.min(sw - 1, math.floor((x + 0.5) * sw / dstW))
					local off = rowOff + sx * 4
					local r = buffer.readu8(pixBuf, off)
					local g = buffer.readu8(pixBuf, off + 1)
					local b = buffer.readu8(pixBuf, off + 2)
					ci = ci + 1
					if ch == 4 then
						local a = buffer.readu8(pixBuf, off + 3)
						chunks[ci] = string.char(r, g, b, a)
					else
						chunks[ci] = string.char(r, g, b)
					end
				end
			end
		else
			for y = 0, dstH - 1 do
				local sy = math.min(sh - 1, math.floor((y + 0.5) * sh / dstH))
				local rowOff = sy * sw * 4
				for x = 0, dstW - 1 do
					local sx = math.min(sw - 1, math.floor((x + 0.5) * sw / dstW))
					local off = rowOff + sx * 4
					local r = math.clamp(math.floor((pixTbl[off + 1] or 0) * 255 + 0.5), 0, 255)
					local g = math.clamp(math.floor((pixTbl[off + 2] or 0) * 255 + 0.5), 0, 255)
					local b = math.clamp(math.floor((pixTbl[off + 3] or 0) * 255 + 0.5), 0, 255)
					ci = ci + 1
					if ch == 4 then
						local a = math.clamp(math.floor((pixTbl[off + 4] or 1) * 255 + 0.5), 0, 255)
						chunks[ci] = string.char(r, g, b, a)
					else
						chunks[ci] = string.char(r, g, b)
					end
				end
			end
		end
		return table.concat(chunks), dstW, dstH, ch
	end)

	pcall(function() ei:Destroy() end)
	if not okRead or type(rawBytes) ~= "string" or #rawBytes == 0 then
		Hub.AssetStatus = "อ่านพิกเซลไม่สำเร็จ"
		pcall(Hub.Render)
		return false, "read_failed"
	end

	-- 4) เข้ารหัส Base64 แล้วส่งให้เว็บแปลงเป็น PNG แท้เก็บถาวร
	local payloadJson = HttpService:JSONEncode({
		assetId = assetId,
		kind = kind or "stage",
		label = tostring(label or assetId):sub(1, 64),
		width = tw,
		height = th,
		channels = channels,
		data = b64Encode(rawBytes),
	})

	local okPost, res = pcall(function()
		return httpRequest({
			Url = BASE_API .. "/api/asset-upload",
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["Accept"] = "application/json",
			},
			Body = payloadJson,
		})
	end)
	if not okPost or not res then
		Hub.AssetStatus = "อัปรูปไม่สำเร็จ (เครือข่าย)"
		pcall(Hub.Render)
		return false, "post_error"
	end
	local code = tonumber(res.StatusCode or res.status_code or res.Status or res.status) or 0
	local body = tostring(res.Body or res.body or "")
	if code >= 200 and code < 300 and body:find('"ok":true') then
		Hub.UploadedAssets[assetId] = true
		Hub.AssetUploadCount = Hub.AssetUploadCount + 1
		Hub.AssetStatus = "อัปรูปเกมแล้ว " .. tostring(Hub.AssetUploadCount) .. " รูป"
		if kind == "stage" and Hub.Flags.Notify then
			pcall(function()
				Hub.Toast("info", "อัปรูปด่านจริงเข้าเว็บแล้ว", tostring(label or assetId) .. " (" .. tostring(tw) .. "x" .. tostring(th) .. ")", Color3.fromRGB(56, 210, 230), imgUri)
			end)
		end
		pcall(Hub.Render)
		return true, "uploaded"
	end
	Hub.AssetStatus = "อัปรูป HTTP " .. tostring(code)
	pcall(Hub.Render)
	return false, "http_" .. tostring(code)
end

function Hub.ScanAndUploadGameAssets(force)
	if not Hub.Running or not httpRequest or Hub.HttpBlocked then return end
	if Hub.AssetScanBusy then return end
	Hub.AssetScanBusy = true
	if force then
		for k in pairs(Hub.UploadTried) do
			if not Hub.UploadedAssets[k] then Hub.UploadTried[k] = nil end
		end
		Hub.AssetStatus = "กำลังสแกนรูปจากเกม..."
		pcall(Hub.Render)
	end

	task.spawn(function()
		local uploaded, already, locked = 0, 0, 0
		pcall(function()
			local queue = {}
			local queuedId = {}
			local function enqueue(imgUri, kind, label, maxDim, useAlpha)
				local aid = extractAssetId(imgUri)
				if not aid or queuedId[aid] or #queue >= 42 then return end
				queuedId[aid] = true
				queue[#queue + 1] = { aid = aid, uri = imgUri, kind = kind, label = label, maxDim = maxDim, useAlpha = useAlpha }
			end

			pcall(Hub.RefreshCurrencyIcons)

			-- 1) รูปด่านปัจจุบัน + ไอคอนสกุลเงินหลัก (Gold / Gems / Summer Pearls) ความสำคัญสูงสุด
			if Hub.Stage and Hub.Stage.mapImg then
				enqueue(Hub.Stage.mapImg, "stage", Hub.Stage.name or Hub.Stage.map or "Stage", 160, false)
			end
			if Hub.CurrencyIcons.summerPearls then
				enqueue(Hub.CurrencyIcons.summerPearls, "currency", "Summer Pearls", 72, true)
			end
			if Hub.CurrencyIcons.gold then
				enqueue(Hub.CurrencyIcons.gold, "currency", "Gold", 72, true)
			end
			if Hub.CurrencyIcons.gems then
				enqueue(Hub.CurrencyIcons.gems, "currency", "Gems", 72, true)
			end
			if Hub.CurrencyIcons.traitReroll then
				enqueue(Hub.CurrencyIcons.traitReroll, "currency", "Reroll Token", 72, true)
			end
			-- 2) รูปด่าน + ไอคอนของรางวัลในประวัติจบด่านล่าสุด
			for i = 1, math.min(#Hub.Rewards, 24) do
				local rw = Hub.Rewards[i]
				if rw.stageImg then enqueue(rw.stageImg, "stage", rw.stageName or rw.stageMap or "Stage", 160, false) end
				if rw.img then enqueue(rw.img, rw.kind or "item", rw.name or rw.id, 72, true) end
			end
			-- 3) ไอคอนสกุลเงิน/ทรัพยากรในเกม (_Resource)
			for resName, resUri in pairs(RES_ICON) do
				enqueue(resUri, "currency", resName, 72, true)
			end
			-- 4) ไอคอนไอเทมสาย Reroll (Star Remnant, Limited, Broken Star, Stat Cube, Cursed Token) + ไอเทมในกระเป๋า
			for _, it in ipairs(Hub.Bag or {}) do
				if it.img then
					local hay = (tostring(it.id or "") .. " " .. tostring(it.name or "")):lower()
					if hay:find("remnant", 1, true) or hay:find("broken_star", 1, true) or hay:find("reroll", 1, true) or hay:find("stat_cube", 1, true) or hay:find("stat cube", 1, true) or hay:find("sukuna_finger", 1, true) or hay:find("cursed token", 1, true) then
						enqueue(it.img, "item", it.name or it.id, 72, true)
					end
				end
			end
			local itemCount = 0
			for _, it in ipairs(Hub.Bag or {}) do
				if it.img and itemCount < 16 then
					itemCount = itemCount + 1
					enqueue(it.img, "item", it.name or it.id, 72, true)
				end
			end
			-- 5) รูปด่านอื่นๆ ใน MapIcons (สูงสุดรวม 42 รูป)
			if MapIcons then
				for _, child in ipairs(MapIcons:GetChildren()) do
					if #queue >= 42 then break end
					local img = firstImageInside(child)
					if img then enqueue(img, "stage", child.Name, 160, false) end
				end
			end

			-- เช็คหลาย ID พร้อมกันทีเดียวเพื่อข้ามรูปที่เคยอัปแล้วโดยไม่เปลือง Request
			for startIdx = 1, #queue, 24 do
				local idsBatch = {}
				for j = startIdx, math.min(#queue, startIdx + 23) do
					local aid = queue[j].aid
					if not Hub.UploadedAssets[aid] then idsBatch[#idsBatch + 1] = aid end
				end
				if #idsBatch > 0 then
					local okB, bRes = pcall(function()
						return httpRequest({
							Url = BASE_API .. "/api/asset-exists?ids=" .. table.concat(idsBatch, ","),
							Method = "GET",
							Headers = { ["Accept"] = "application/json" },
						})
					end)
					if okB and bRes then
						local decOk, dec = pcall(function()
							return HttpService:JSONDecode(tostring(bRes.Body or bRes.body or ""))
						end)
						if decOk and type(dec) == "table" and type(dec.existing) == "table" then
							for _, exId in ipairs(dec.existing) do
								Hub.UploadedAssets[tostring(exId)] = true
							end
						end
					end
				end
			end

			for _, job in ipairs(queue) do
				if not Hub.Running then break end
				if Hub.UploadedAssets[job.aid] then
					already = already + 1
				else
					local _, status = Hub.UploadGameAsset(job.uri, job.kind, job.label, job.maxDim, job.useAlpha)
					if status == "uploaded" then
						uploaded = uploaded + 1
						task.wait(0.4)
					elseif status == "exists" or status == "cached" then
						already = already + 1
					else
						locked = locked + 1
						if locked >= 3 and uploaded == 0 and tostring(status):find("locked:") then
							break
						end
						task.wait(0.25)
					end
				end
			end
		end)

		Hub.AssetScanBusy = false
		if uploaded > 0 then
			Hub.AssetStatus = "อัปรูปเกมแล้ว " .. tostring(Hub.AssetUploadCount) .. " รูป"
		elseif already > 0 and locked == 0 then
			Hub.AssetStatus = "รูปเกมครบแล้ว (" .. tostring(already) .. " รูป)"
		end
		if force then
			local msg
			if uploaded > 0 then
				msg = "อัปโหลดใหม่ " .. tostring(uploaded) .. " รูป • มีแล้ว " .. tostring(already) .. " รูป"
			elseif already > 0 and locked == 0 then
				msg = "รูปด่านและไอคอนที่มีอยู่ถูกอัปขึ้นเว็บครบแล้ว (" .. tostring(already) .. " รูป)"
			else
				msg = "Roblox ล็อกสิทธิ์ EditableImage บน Asset เกมนี้ (ใช้รูป Wiki/ไอคอนแทน)"
			end
			pcall(function()
				Hub.Toast("info", "สแกนรูปจากเกมเสร็จแล้ว", msg, uploaded > 0 and Color3.fromRGB(16, 245, 160) or Color3.fromRGB(255, 190, 80), Hub.Stage and Hub.Stage.mapImg)
			end)
		end
		pcall(Hub.Render)
	end)
end

------------------------------------------------------------------
-- 2) PROFILE (scoreProfile แม่นยำ) + STATS + TEAM + BAG + STAGE
------------------------------------------------------------------
local function scoreProfile(o)
	local s = 0
	local col = rawget(o, "collection")
	if type(col) == "table" then
		s = s + 1
		if type(rawget(col, "owned_units")) == "table" then s = s + 3 end
		if type(rawget(col, "equipped_units")) == "table" then s = s + 2 end
	end
	local inv = rawget(o, "inventory")
	if type(inv) == "table" then
		s = s + 1
		if type(rawget(inv, "normal_items")) == "table" then s = s + 2 end
	end
	if type(rawget(o, "loadouts_v2")) == "table" then s = s + 2 end
	if type(rawget(o, "gold_amount")) == "number" then s = s + 1 end
	return s
end

local function findProfile()
	if Hub.Profile and scoreProfile(Hub.Profile) >= 9 then return Hub.Profile end
	if type(getGC) ~= "function" then return Hub.Profile end
	local okGc, list = pcall(getGC, true)
	if not okGc or type(list) ~= "table" then return Hub.Profile end
	local best, bestScore = nil, 0
	for _, o in ipairs(list) do
		if type(o) == "table" then
			local ok, sc = pcall(scoreProfile, o)
			if ok and sc > bestScore then best, bestScore = o, sc end
		end
	end
	if best and bestScore >= 6 then
		Hub.Profile = best
		return best
	end
	return Hub.Profile
end

function Hub.SnapStats()
	local t = { _res = {} }
	local s = LP:FindFirstChild("_stats")
	if s then
		for _, c in ipairs(s:GetChildren()) do
			if c:IsA("ValueBase") then
				local ok, v = pcall(function() return c.Value end)
				if ok and type(v) == "number" then
					local nm = c.Name
					local low = nm:lower()
					t[nm] = v
					if low:sub(1, 9) == "_resource" and #nm > 9 then
						local rk = nm:sub(10)
						t._res[rk] = v
					elseif low:find("pearl", 1, true) or low:find("summer", 1, true) then
						t._res[nm] = v
					end
				end
			end
		end
	end
	local p = findProfile()
	if p then
		local scalarFields = {
			"gold_amount", "gem_amount", "player_xp", "trophies",
			"rebirth_tokens", "trait_reroll_tokens", "curse_reroll_tokens", "behelit_xp",
		}
		for _, sf in ipairs(scalarFields) do
			local pv = rawget(p, sf)
			if type(pv) == "number" and (t[sf] == nil or pv > t[sf]) then
				t[sf] = pv
			end
		end
		for _, resField in ipairs({ "resources", "_resources" }) do
			local rTbl = rawget(p, resField)
			if type(rTbl) == "table" then
				for rk, rv in pairs(rTbl) do
					if type(rv) == "number" then
						local keyStr = tostring(rk)
						if t._res[keyStr] == nil or rv > t._res[keyStr] then
							t._res[keyStr] = rv
						end
					end
				end
			end
		end
		local inv = rawget(p, "inventory")
		local ni = type(inv) == "table" and rawget(inv, "normal_items") or nil
		if type(ni) == "table" then
			for id, amt in pairs(ni) do
				if type(id) == "string" and type(amt) == "number" and amt > 0 then
					local lid = id:lower()
					if lid:find("pearl", 1, true) then
						if t._res[id] == nil or amt > t._res[id] then t._res[id] = amt end
					end
				end
			end
		end
	end

	-- หาค่า Summer Pearls จริงจาก _stats._resource* / profile.resources / fallback stats.resource
	local pearlVal = nil
	for rk, rv in pairs(t._res) do
		local lrk = rk:lower()
		if lrk:find("pearl", 1, true) then
			pearlVal = rv
			break
		end
	end
	if pearlVal == nil then
		for rk, rv in pairs(t._res) do
			local lrk = rk:lower()
			if lrk:find("summer", 1, true) then
				pearlVal = rv
				break
			end
		end
	end
	if pearlVal == nil and type(t.resource) == "number" then
		pearlVal = t.resource
	end
	t.summer_pearls = pearlVal or 0

	pcall(Hub.RefreshCurrencyIcons)
	Hub.CurrentStats = t
	local lvNum = parseQty(txt(PG:FindFirstChild("spawn_units"), "Main.Desc.Level"))
	if lvNum <= 0 then
		lvNum = safeNum(t.player_level or t.level or t.Level)
	end
	if lvNum <= 0 then
		local ls = LP:FindFirstChild("leaderstats")
		if ls then
			local lvObj = ls:FindFirstChild("Level") or ls:FindFirstChild("Lvl") or ls:FindFirstChild("level")
			if lvObj and lvObj:IsA("ValueBase") then lvNum = parseQty(lvObj.Value) end
		end
	end
	if lvNum <= 0 and p then
		lvNum = safeNum(rawget(p, "level") or rawget(p, "player_level"))
	end
	if lvNum > 0 then Hub.PlayerLevel = math.floor(lvNum) end
	return t
end

local function guiUnitModels()
	local map = {}
	local su = PG:FindFirstChild("spawn_units")
	local uf = su and idx(su, "Lives.Frame.Units")
	if uf then
		for _, slot in ipairs(uf:GetChildren()) do
			local sn = tonumber(slot.Name)
			if sn then
				local view = slot:FindFirstChild("View", true)
				local wm = view and view:FindFirstChildOfClass("WorldModel")
				local mdl = wm and wm:FindFirstChildOfClass("Model")
				if mdl then map[sn] = mdl end
			end
		end
	end
	return map
end

local function extractTraits(u)
	local traits = u and (u.traits or u._traits or u.trait)
	local out = {}
	if type(traits) == "table" then
		for tk, tv in pairs(traits) do
			if type(tv) == "string" and tv ~= "" then out[#out + 1] = tv
			elseif tv == true then out[#out + 1] = tostring(tk) end
		end
	elseif type(traits) == "string" and traits ~= "" then
		out[1] = traits
	end
	return out
end

function Hub.ReadTeam()
	local out = {}
	local p = findProfile()
	if not p then Hub.Team = {}; Hub.TeamList = {}; return out end
	local col = rawget(p, "collection")
	local ou = type(col) == "table" and rawget(col, "owned_units") or nil
	if type(ou) ~= "table" then Hub.Team = {}; Hub.TeamList = {}; return out end
	local models = guiUnitModels()
	local ingLv = type(col) == "table" and rawget(col, "unit_ingame_levels") or nil

	local function push(slot, uuid)
		local u = ou[uuid]
		if type(u) ~= "table" then return end
		local uid = tostring(u.unit_id or u.id or "")
		if uid == "" then return end
		local lv = safeNum(u.level or u._level or u.xp_level)
		if lv <= 0 and type(ingLv) == "table" and type(ingLv[uuid]) == "number" then
			lv = math.floor(ingLv[uuid])
		end
		if lv <= 0 then lv = 1 end
		out[slot] = {
			slot = slot,
			uuid = tostring(uuid),
			id = uid,
			name = uName(uid),
			rarity = uRarity(uid),
			shiny = u.shiny == true,
			level = lv,
			traits = extractTraits(u),
			model = models[slot],
		}
	end

	local eq = rawget(col, "equipped_units")
	if type(eq) == "table" then
		for slot, uuid in pairs(eq) do
			local sn = tonumber(slot)
			if sn and type(uuid) == "string" then push(sn, uuid) end
		end
	end
	if next(out) == nil then
		for uuid, u in pairs(ou) do
			if type(u) == "table" and type(u.equipped_slot) == "number" then
				push(u.equipped_slot, uuid)
			end
		end
	end
	if next(out) == nil and type(rawget(p, "loadouts_v2")) == "table" then
		for _, ld in pairs(rawget(p, "loadouts_v2")) do
			if type(ld) == "table" then
				for slot, uuid in pairs(ld) do
					local sn = tonumber(slot)
					if sn and type(uuid) == "string" and ou[uuid] then push(sn, uuid) end
				end
				if next(out) ~= nil then break end
			end
		end
	end

	local list = {}
	for slot = 1, 6 do
		if out[slot] then list[#list + 1] = out[slot] end
	end
	Hub.Team = out
	Hub.TeamList = list
	return out
end

function Hub.ReadBag()
	local out = {}
	local p = findProfile()
	if not p then Hub.Bag = {}; return out, 0, 0, 0 end
	local uTotal, nKinds, ownedUnitsCount = 0, 0, 0

	local inv = rawget(p, "inventory")
	if type(inv) == "table" then
		local ni = rawget(inv, "normal_items")
		if type(ni) == "table" then
			for id, amt in pairs(ni) do
				local q = safeNum(amt)
				if type(id) == "string" and q > 0 then
					nKinds = nKinds + 1
					local img = itemImg(id)
					local nm = iName(id)
					local grp = classifyItemGroup(iGroup(id), id, nm)
					out[#out + 1] = {
						kind = "normal", id = id, qty = q,
						name = nm, rarity = iRarity(id), group = grp,
						tier = extractItemTier(nil, id),
						img = img, iconId = extractAssetId(img),
					}
				end
			end
		end
		local ui = rawget(inv, "unique_items")
		if type(ui) == "table" then
			local agg, order = {}, {}
			for _, u in pairs(ui) do
				if type(u) == "table" and type(u.item_id) == "string" then
					uTotal = uTotal + 1
					local iid = u.item_id
					local tier = extractItemTier(u, iid)
					local key = iid .. "|" .. tostring(tier or "")
					if not agg[key] then
						agg[key] = { id = iid, tier = tier, qty = 0 }
						order[#order + 1] = key
					end
					agg[key].qty = agg[key].qty + 1
				end
			end
			for _, key in ipairs(order) do
				local rec = agg[key]
				local iid = rec.id
				local img = itemImg(iid)
				local nm = iName(iid)
				local grp = classifyItemGroup(iGroup(iid), iid, nm)
				out[#out + 1] = {
					kind = "unique", id = iid, qty = rec.qty,
					name = nm, rarity = iRarity(iid), group = grp,
					tier = rec.tier,
					img = img, iconId = extractAssetId(img),
				}
			end
		end
	end

	local col = rawget(p, "collection")
	local ou = type(col) == "table" and rawget(col, "owned_units") or nil
	if type(ou) == "table" then
		local agg, order = {}, {}
		for _, u in pairs(ou) do
			if type(u) == "table" and type(u.unit_id) == "string" then
				ownedUnitsCount = ownedUnitsCount + 1
				if not agg[u.unit_id] then agg[u.unit_id] = 0; order[#order + 1] = u.unit_id end
				agg[u.unit_id] = agg[u.unit_id] + 1
			end
		end
		for _, uid in ipairs(order) do
			out[#out + 1] = {
				kind = "unit", id = uid, qty = agg[uid],
				name = uName(uid), rarity = uRarity(uid), group = "Units",
				img = nil, iconId = nil,
			}
		end
	end

	local GROUP_PRIORITY = { Portals = 1, Charms = 2 }
	table.sort(out, function(a, b)
		if a.group ~= b.group then
			local pa = GROUP_PRIORITY[a.group] or 99
			local pb = GROUP_PRIORITY[b.group] or 99
			if pa ~= pb then return pa < pb end
			return tostring(a.group) < tostring(b.group)
		end
		local ta, tb = tierOrderNum(a.tier), tierOrderNum(b.tier)
		if ta ~= tb then return ta > tb end
		return tostring(a.name) < tostring(b.name)
	end)
	Hub.Bag = out
	Hub.BagCounts = { uTotal = uTotal, nKinds = nKinds, ownedUnits = ownedUnitsCount }
	return out, uTotal, nKinds, ownedUnitsCount
end

local lastStageSignature = nil
function Hub.UpdateLocation()
	local isLobby = false
	local raw = nil
	local mc = workspace:FindFirstChild("_MAP_CONFIG")
	if mc then
		local isL = mc:FindFirstChild("IsLobby")
		if isL and isL:IsA("BoolValue") then isLobby = isL.Value == true end
		local gld = mc:FindFirstChild("GetLevelData")
		if gld and gld:IsA("RemoteFunction") then
			local ok, d = pcall(function() return gld:InvokeServer() end)
			if ok and type(d) == "table" then raw = d end
		end
	end
	local wave = 0
	local wv = workspace:FindFirstChild("_wave_num")
	if wv and wv:IsA("ValueBase") then wave = tonumber(wv.Value) or 0 end
	local isLast = false
	local il = workspace:FindFirstChild("_is_last_wave")
	if il and il:IsA("ValueBase") then isLast = il.Value == true end

	local enemiesLeft, bossLeft = nil, nil
	local gi = PG:FindFirstChild("GameLevelInfo")
	if gi then
		enemiesLeft = txt(gi, "List_rg.inner.scroll.EnemiesLeft.List.normal.remaining")
		bossLeft = txt(gi, "List_rg.inner.scroll.EnemiesLeft.List.boss.remaining")
	end

	local st
	if isLobby or not raw then
		local mImg = mapImage(nil, nil, nil, nil, true)
		st = {
			inLobby = true,
			name = "ล็อบบี้",
			id = "lobby",
			world = "Lobby",
			map = "lobby",
			wave = 0,
			isLastWave = false,
			mapImg = mImg,
			mapImageId = extractAssetId(mImg),
		}
	else
		local mImg = mapImage(raw.map, raw.world, raw.name, raw.id, false)
		st = {
			inLobby = false,
			name = tostring(raw.name or raw.id or "Unknown Stage"),
			id = raw.id and tostring(raw.id) or nil,
			world = raw.world and tostring(raw.world) or nil,
			map = raw.map and tostring(raw.map) or nil,
			gamemode = raw._gamemode and tostring(raw._gamemode) or nil,
			difficulty = raw._difficulty and tostring(raw._difficulty) or nil,
			locationName = raw._location_name and tostring(raw._location_name) or nil,
			boss = raw.boss and tostring(raw.boss) or nil,
			wave = wave,
			isLastWave = isLast,
			enemiesLeft = enemiesLeft,
			bossLeft = bossLeft,
			mapImg = mImg,
			mapImageId = extractAssetId(mImg),
		}
	end
	Hub.Stage = st

	-- อัปโหลดรูปด่านจริงจากเกมขึ้นเว็บอัตโนมัติ (อัปครั้งเดียวต่อ 1 Asset ID)
	if st.mapImg and st.mapImageId and not Hub.UploadedAssets[st.mapImageId] and not Hub.UploadTried[st.mapImageId] then
		task.spawn(function()
			pcall(Hub.UploadGameAsset, st.mapImg, "stage", st.name or st.map, 160, false)
		end)
	end

	-- อัปเดตแถบด่านใน GUI ในเกม
	if Hub.LocTitle then
		if st.inLobby then
			Hub.LocTitle.Text = "ล็อบบี้"
			Hub.LocSub.Text = "ยังไม่ได้อยู่ในด่าน\\nเข้าด่านแล้วระบบจะโชว์ชื่อด่านและรูปอัตโนมัติ"
		else
			Hub.LocTitle.Text = tostring(st.name) .. (st.world and (" • " .. tostring(st.world)) or "")
			Hub.LocSub.Text = "แผนที่ " .. tostring(st.map or "-") .. " • " .. tostring(st.difficulty or st.gamemode or "-") ..
				"\\nBoss " .. tostring(st.boss or "-") .. " • Wave " .. tostring(st.wave or 0) ..
				(st.enemiesLeft and (" • เหลือ " .. tostring(st.enemiesLeft)) or "")
		end
		if Hub.LocImg then Hub.LocImg.Image = st.mapImg or "" end
	end

	-- เมื่อเปลี่ยนด่านให้ล้างบัฟเฟอร์ของด่านเก่า (ไม่ยิง sync แทรก รอตามรอบเวลา AUTO_SYNC_SEC หรือเมื่อจบด่าน)
	local sig = tostring(st.inLobby) .. "|" .. tostring(st.name) .. "|" .. tostring(st.difficulty or "")
	if lastStageSignature ~= nil and sig ~= lastStageSignature then
		if not st.inLobby then
			Hub.PendingDrops = {}
			Hub.LastFinishRunId = nil
			Hub.LastFinishMeta = nil
		end
	end
	lastStageSignature = sig
	return st
end

------------------------------------------------------------------
-- 3) PAYLOAD BUILDER + WEB SYNC (HTTP + CLIPBOARD + FILE)
------------------------------------------------------------------
local function buildPayloadJson()
	pcall(Hub.SnapStats)
	pcall(Hub.ReadTeam)
	local bagList, uTotal, nKinds, ownedUnitsCount = {}, 0, 0, 0
	pcall(function()
		bagList, uTotal, nKinds, ownedUnitsCount = Hub.ReadBag()
	end)

	local teamOut = {}
	for _, u in ipairs(Hub.TeamList or {}) do
		teamOut[#teamOut + 1] = {
			slot = u.slot,
			id = u.id,
			name = u.name,
			rarity = u.rarity,
			level = u.level,
			shiny = u.shiny == true,
			traits = u.traits or {},
		}
	end

	local invOut = {}
	for _, it in ipairs(bagList) do
		invOut[#invOut + 1] = {
			id = it.id,
			name = it.name,
			rarity = it.rarity,
			group = it.group,
			qty = it.qty,
			kind = it.kind,
			iconId = it.iconId,
			tier = it.tier,
		}
	end

	local recentRewards = {}
	for i = 1, math.min(#Hub.Rewards, 120) do
		local r = Hub.Rewards[i]
		recentRewards[#recentRewards + 1] = {
			t = r.t,
			ts = r.ts,
			kind = r.kind,
			id = r.id,
			name = r.name,
			rarity = r.rarity,
			qty = r.qty,
			src = r.src,
			iconId = r.iconId,
			tier = r.tier,
			runId = r.runId,
			stageName = r.stageName,
			stageWorld = r.stageWorld,
			stageMap = r.stageMap,
			stageDifficulty = r.stageDifficulty,
			stageGamemode = r.stageGamemode,
			stageWaves = r.stageWaves,
			stageTimer = r.stageTimer,
			stageImageId = r.stageImageId,
		}
	end

	local st = Hub.Stage or { inLobby = true, name = "ล็อบบี้" }
	local stats = Hub.CurrentStats or {}
	local eventResOut = {}
	local hasEventRes = false
	if type(stats._res) == "table" then
		for rk, rv in pairs(stats._res) do
			if type(rv) == "number" and rv > 0 then
				eventResOut[tostring(rk)] = math.floor(rv)
				hasEventRes = true
			end
		end
	end

	-- นับไอเทมสาย Reroll ครบทุกแบบ (Trait Reroll Token, Star Remnant, Star Remnant Limited, Broken Star, Cursed Token, Stat Cube, Perfect Stat Cube)
	local traitTokens = safeNum(stats.trait_reroll_tokens)
	local curseTokens = safeNum(stats.curse_reroll_tokens)
	local starRemnants, starRemnantsLimited, brokenStars = 0, 0, 0
	local statCubes, perfectStatCubes = 0, 0
	local bagTraitTokens, bagCurseTokens = 0, 0
	for _, it in ipairs(bagList) do
		local q = safeNum(it.qty)
		if q > 0 and it.kind ~= "unit" then
			local idLow = tostring(it.id or ""):lower()
			local hay = (idLow .. " " .. tostring(it.name or "")):lower()
			if idLow == "star_remnant_limited" or ((hay:find("star_remnant", 1, true) or hay:find("star remnant", 1, true)) and hay:find("limited", 1, true)) then
				starRemnantsLimited = starRemnantsLimited + q
			elseif idLow == "star_remnant" or hay:find("star_remnant", 1, true) or hay:find("star remnant", 1, true) or hay == "remnant" then
				starRemnants = starRemnants + q
			elseif idLow:find("broken_star", 1, true) or hay:find("broken star", 1, true) then
				brokenStars = brokenStars + q
			elseif idLow == "reroll_stat_specific" or (hay:find("perfect", 1, true) and (hay:find("stat_cube", 1, true) or hay:find("stat cube", 1, true) or hay:find("cube", 1, true))) then
				perfectStatCubes = perfectStatCubes + q
			elseif idLow == "reroll_stat_all" or hay:find("stat_cube", 1, true) or hay:find("stat cube", 1, true) or hay:find("stat_reroll", 1, true) then
				statCubes = statCubes + q
			elseif hay:find("trait_reroll", 1, true) or hay:find("trait reroll", 1, true) or hay:find("reroll_token", 1, true) or hay:find("reroll token", 1, true) then
				bagTraitTokens = bagTraitTokens + q
				if not Hub.CurrencyIcons.traitReroll and it.img then
					Hub.CurrencyIcons.traitReroll = it.img
				end
			elseif idLow:find("sukuna_finger", 1, true) or hay:find("curse_reroll", 1, true) or hay:find("curse reroll", 1, true) or hay:find("curse_token", 1, true) or hay:find("curse token", 1, true) or hay:find("cursed token", 1, true) then
				bagCurseTokens = bagCurseTokens + q
			end
		end
	end
	if traitTokens <= 0 and bagTraitTokens > 0 then traitTokens = bagTraitTokens end
	if bagCurseTokens > curseTokens then curseTokens = bagCurseTokens end
	if not Hub.CurrencyIcons.traitReroll and RES_ICON._Trait then
		Hub.CurrencyIcons.traitReroll = RES_ICON._Trait
	end

	local goldVal = safeNum(stats.gold_amount)
	local gemsVal = safeNum(stats.gem_amount)
	local levelVal = (Hub.PlayerLevel and Hub.PlayerLevel > 0) and Hub.PlayerLevel or nil
	local bagLoaded = (#invOut > 0)
	local teamLoaded = (#teamOut > 0)
	local statsLoaded = (goldVal > 0 or gemsVal > 0 or (levelVal ~= nil and levelVal > 0) or safeNum(stats.summer_pearls) > 0 or traitTokens > 0 or curseTokens > 0 or safeNum(stats.player_xp) > 0)
	local dataReady = statsLoaded or bagLoaded or teamLoaded

	local payload = {
		syncKey = SYNC_KEY,
		username = LP.Name,
		displayName = LP.DisplayName,
		userId = LP.UserId,
		gold = goldVal,
		gems = gemsVal,
		level = levelVal,
		currencyIcons = {
			gold = extractAssetId(Hub.CurrencyIcons.gold),
			gems = extractAssetId(Hub.CurrencyIcons.gems),
			summerPearls = extractAssetId(Hub.CurrencyIcons.summerPearls),
			traitReroll = extractAssetId(Hub.CurrencyIcons.traitReroll),
		},
		extraStats = {
			playerXp = safeNum(stats.player_xp),
			resource = safeNum(stats.resource),
			summerPearls = safeNum(stats.summer_pearls),
			trophies = safeNum(stats.trophies),
			rebirthTokens = safeNum(stats.rebirth_tokens),
			behelitXp = safeNum(stats.behelit_xp),
			curseTokens = curseTokens,
			traitTokens = traitTokens,
			starRemnants = starRemnants,
			starRemnantsLimited = starRemnantsLimited,
			brokenStars = brokenStars,
			statCubes = statCubes,
			perfectStatCubes = perfectStatCubes,
			eventResources = hasEventRes and eventResOut or nil,
		},
		currentStage = {
			inLobby = st.inLobby == true,
			name = tostring(st.name or "ล็อบบี้"),
			id = st.id,
			world = st.world,
			map = st.map,
			gamemode = st.gamemode,
			difficulty = st.difficulty,
			locationName = st.locationName,
			boss = st.boss,
			wave = safeNum(st.wave),
			isLastWave = st.isLastWave == true,
			enemiesLeft = st.enemiesLeft,
			bossLeft = st.bossLeft,
			mapImageId = st.mapImageId,
		},
		equipped = teamOut,
		inventory = invOut,
		rewards = recentRewards,
		uniqueCount = uTotal,
		normalKindCount = nKinds,
		ownedUnitsCount = ownedUnitsCount,
		dataReady = dataReady,
		bagLoaded = bagLoaded,
		teamLoaded = teamLoaded,
		disconnected = Hub.Disconnected == true,
		disconnectInfo = Hub.DisconnectInfo,
		scriptVersion = SCRIPT_VERSION,
		syncIntervalSec = AUTO_SYNC_SEC,
	}

	return HttpService:JSONEncode(payload), #teamOut, #invOut
end

function Hub.CopyForWeb()
	local ok, json, teamCount, invCount = pcall(buildPayloadJson)
	if not ok then
		Hub.SyncStatus = "สร้างข้อมูลล้มเหลว: " .. tostring(json):sub(1, 50)
		pcall(Hub.Render)
		return
	end
	local packet = "AAVAULT_SYNC::" .. json
	local didClip = copyClip and pcall(copyClip, packet) or false
	local fileName = "AAVault_" .. LP.Name .. ".json"
	if saveFile then pcall(saveFile, fileName, json) end
	if didClip then
		Hub.SyncStatus = "คัดลอกแล้ว (" .. teamCount .. " ตัว, " .. invCount .. " รายการ) — กด Ctrl+V บนเว็บได้เลย"
		pcall(function() Hub.Toast("info", "คัดลอกข้อมูลเข้าเว็บแล้ว", "กด Ctrl+V บนหน้าเว็บ AA Vault ได้เลย", Color3.fromRGB(255, 190, 80), Hub.Stage.mapImg) end)
	elseif saveFile then
		Hub.SyncStatus = "บันทึกไฟล์ workspace/" .. fileName .. " แล้ว"
	else
		Hub.SyncStatus = "ตัวรันไม่รองรับ setclipboard / writefile"
	end
	pcall(Hub.Render)
end

function Hub.SyncToWeb(force, reason)
	if not Hub.Running or not Hub.Flags.WebSync then return end
	local isDisconnect = (reason == "disconnected")
	if Hub.Disconnected and not isDisconnect then return end
	if Hub.HttpBlocked and not force then return end
	if not httpRequest then
		Hub.SyncStatus = "ตัวรันไม่รองรับ HTTP — กดปุ่ม 'คัดลอกเข้าเว็บ'"
		if not Hub.FailNotified then
			Hub.FailNotified = true
			pcall(function() Hub.Toast("info", "ตัวรันไม่รองรับ request()", "กดปุ่ม 'คัดลอกเข้าเว็บ' ในหน้าต่างแทน", Color3.fromRGB(180, 110, 255), nil) end)
		end
		pcall(Hub.Render)
		return
	end
	local isUrgent = (reason == "stage_clear" or reason == "game_finished" or reason == "teleport_flush" or isDisconnect)
	if not isUrgent and Hub.SyncInFlight and (os.clock() - Hub.SyncStartedAt) < 20 then
		return
	end
	if not force and not isUrgent and (os.clock() - Hub.LastSync) < AUTO_SYNC_SEC then return end

	if not isUrgent then
		Hub.SyncInFlight = true
		Hub.SyncStartedAt = os.clock()
	end
	Hub.LastSync = os.clock()

	local buildOk, prebuiltJson = pcall(buildPayloadJson)
	if not buildOk then
		if not isUrgent then Hub.SyncInFlight = false end
		Hub.SyncStatus = "Err: " .. tostring(prebuiltJson):gsub("[%c]+", " "):sub(1, 44)
		pcall(Hub.Render)
		return
	end

	task.spawn(function()
		local ok, err = pcall(function()
			local json = prebuiltJson
			if saveFile then pcall(saveFile, "AAVault_" .. LP.Name .. ".json", json) end
			local res = httpRequest({
				Url = WEB_URL,
				Method = "POST",
				Headers = {
					["Content-Type"] = "application/json",
					["Accept"] = "application/json",
				},
				Body = json,
			})
			local rawCode = res and (res.StatusCode or res.status_code or res.Status or res.status)
			local code = tonumber(rawCode) or 0
			local body = res and tostring(res.Body or res.body or "") or ""
			local successFlag = res and (res.Success == true or res.success == true)
			local bodyOk = body:find('"ok"') ~= nil
			if (code >= 200 and code < 300 and bodyOk) or (successFlag and bodyOk) then
				Hub.SyncOk = true
				Hub.HttpBlocked = false
				Hub.FailStreak = 0
				Hub.FailNotified = false
				Hub.SyncCount = Hub.SyncCount + 1
				if isDisconnect then
					local errCodeStr = Hub.DisconnectInfo and Hub.DisconnectInfo.errorCode
					Hub.SyncStatus = "แจ้งหลุดเกมแล้ว (" .. (errCodeStr and ("Code " .. tostring(errCodeStr)) or "ออฟไลน์") .. ") • " .. clock()
					return
				end
				local latestVer = SCRIPT_VERSION
				local decOk, decoded = pcall(function() return HttpService:JSONDecode(body) end)
				if decOk and type(decoded) == "table" and type(decoded.latestScriptVersion) == "string" and decoded.latestScriptVersion ~= "" then
					latestVer = decoded.latestScriptVersion
				end
				Hub.LatestVersion = latestVer
				if latestVer ~= SCRIPT_VERSION then
					Hub.SyncStatus = "ออนไลน์ (v" .. SCRIPT_VERSION .. " เก่ากว่า v" .. latestVer .. ") • " .. clock()
					if not Hub.UpdateNotified then
						Hub.UpdateNotified = true
						pcall(function() Hub.Toast("info", "มีสคริปต์ใหม่ v" .. latestVer, "รันคำสั่ง 1 บรรทัดใหม่ได้เลย", Color3.fromRGB(255, 100, 165), nil) end)
					end
				else
					Hub.SyncStatus = "ออนไลน์ • เช็คทุก " .. AUTO_SYNC_SEC .. " วิ (#" .. Hub.SyncCount .. " • " .. clock() .. ")"
				end
			elseif code == 302 or code == 401 or code == 403 or body:find("cookie_check") or body:find("accounts.google.com") then
				Hub.SyncOk = false
				Hub.HttpBlocked = true
				Hub.SyncStatus = "ติดล็อก Preview/Auth (HTTP " .. tostring(code) .. ") — ใช้ลิงก์ Vercel จริง"
				pcall(function() Hub.Toast("info", "ติดล็อก Preview (HTTP " .. tostring(code) .. ")", "ใช้ลิงก์ Vercel จริงหรือกดปุ่มคัดลอก", Color3.fromRGB(180, 110, 255), nil) end)
			else
				Hub.SyncOk = false
				Hub.FailStreak = Hub.FailStreak + 1
				local serverErr = nil
				local decOk, decoded = pcall(function() return HttpService:JSONDecode(body) end)
				if decOk and type(decoded) == "table" and type(decoded.error) == "string" and decoded.error ~= "" then
					serverErr = decoded.error
				end
				local isQuotaOrServer = code >= 500 or code == 429 or body:find("Error 1101") ~= nil
				local toastSub = serverErr and serverErr:sub(1, 70)
					or (isQuotaOrServer and "เซิร์ฟเวอร์ขัดข้อง — เช็ค Upstash Redis / โควต้า KV บน Vercel" or "เช็ค URL หรือกดปุ่มคัดลอกเข้าเว็บ")
				Hub.SyncStatus = "HTTP " .. tostring(code) .. " • ลองใหม่ใน " .. AUTO_SYNC_SEC .. " วิ"
				if not Hub.FailNotified then
					Hub.FailNotified = true
					pcall(function() Hub.Toast("info", "ส่งเข้าเว็บไม่สำเร็จ HTTP " .. tostring(code), toastSub, Color3.fromRGB(255, 120, 90), nil) end)
				end
			end
		end)
		if not ok then
			Hub.SyncOk = false
			Hub.FailStreak = Hub.FailStreak + 1
			Hub.SyncStatus = "Err: " .. tostring(err):gsub("[%c]+", " "):sub(1, 44)
		end
		if not isUrgent then Hub.SyncInFlight = false end
		pcall(Hub.Render)
	end)
end

------------------------------------------------------------------
-- 4) REAL-EVENT REWARD CAPTURE (2K v10 — เลิกเดา diff, อ่านจาก event จริง 100%)
--    game_finished / show_unit_and_item_rewards / show_drop_message / show_drop_message_custom
------------------------------------------------------------------
local function prettyKey(k)
	local s = tostring(k):gsub("^_resource", ""):gsub("_", " "):match("^%s*(.-)%s*$") or tostring(k)
	if s == "" then s = tostring(k) end
	s = s:gsub("(%a)([%w]*)", function(a, b) return a:upper() .. b end)
	return s
end

local function isSummerStage(stageName, stageId, stageWorld)
	local hay = (tostring(stageName or "") .. " " .. tostring(stageId or "") .. " " .. tostring(stageWorld or "")):lower()
	return hay:find("summer", 1, true) ~= nil or hay:find("pearl", 1, true) ~= nil
end

local function mapCurrencyMeta(rawKey, stageName, stageId, stageWorld)
	local raw = tostring(rawKey or "")
	local lk = raw:lower():gsub("[^a-z0-9]", "")
	if lk:find("gold", 1, true) then
		return "gold", "Gold", "Legendary", Hub.CurrencyIcons.gold or resolveCurrencyIcon("gold")
	end
	if lk:find("gem", 1, true) then
		return "gems", "Gems", "Rare", Hub.CurrencyIcons.gems or resolveCurrencyIcon("gems")
	end
	if lk:find("xp", 1, true) and not lk:find("behelit", 1, true) then
		return "player_xp", "XP", "Epic", RES_ICON.Jewels or resolveCurrencyIcon("xp")
	end
	if lk:find("troph", 1, true) then
		return "trophies", "Trophies", "Mythic", RES_ICON.HolidayStars or resolveCurrencyIcon("trophies")
	end
	if lk:find("pearl", 1, true) or lk:find("summer", 1, true)
		or ((lk == "resource" or lk == "event" or lk == "") and isSummerStage(stageName, stageId, stageWorld)) then
		local ic = resolveCurrencyIcon("summer_pearls")
		if ic then Hub.CurrencyIcons.summerPearls = ic end
		return "summer_pearls", "Summer Pearls", "Mythic", ic
	end
	if lk:find("rebirth", 1, true) then
		return "rebirth_tokens", "Rebirth Token", "Secret", RES_ICON._Trait or resolveCurrencyIcon(raw)
	end
	if lk:find("trait", 1, true) then
		return "trait_tokens", "Trait Token", "Epic", RES_ICON._Trait or resolveCurrencyIcon(raw)
	end
	if lk:find("curse", 1, true) then
		return "curse_tokens", "Curse Token", "Epic", RES_ICON._Trait or resolveCurrencyIcon(raw)
	end
	if lk:find("behelit", 1, true) then
		return "behelit_xp", "Behelit XP", "Mythic", resolveCurrencyIcon(raw)
	end
	return raw, prettyKey(raw), "Mythic", RES_ICON[raw] or resolveCurrencyIcon(raw)
end

-- 2K v10: ดึงค่าตัวเลขรางวัลจริงจากตาราง payload ของ game_finished
local NUMTAGS = { "gold", "gem", "troph", "xp", "resource", "token", "pearl", "star", "point", "currency" }
local STAT_SKIP = { stats = true, waves_completed = true, time_taken = true, total_damage = true, damage = true, kills = true, takedowns = true, wave = true }
local function extractNums(t, out, seen, depth, budget)
	if type(t) ~= "table" or depth > 4 then return end
	for k, v in pairs(t) do
		budget.n = budget.n + 1
		if budget.n > 900 then return end
		if type(k) == "string" then
			local kl = k:lower()
			if not STAT_SKIP[kl] then
				if type(v) == "number" then
					if v > 0 and not Items[k] and not Units[k] then
						for _, tag in ipairs(NUMTAGS) do
							if string.find(kl, tag, 1, true) then
								if not seen[k] then
									seen[k] = true
									out[#out + 1] = { key = k, val = math.floor(v) }
								end
								break
							end
						end
					end
				elseif type(v) == "table" then
					local isMap, cnt = true, 0
					for k2, v2 in pairs(v) do
						cnt = cnt + 1
						if type(k2) ~= "string" or type(v2) ~= "number" then isMap = false; break end
					end
					if isMap and cnt > 0 then
						for k2, v2 in pairs(v) do
							local k2l = k2:lower()
							if v2 > 0 and not seen[k2] and not STAT_SKIP[k2l] and not Items[k2] and not Units[k2] then
								seen[k2] = true
								out[#out + 1] = { key = k2, val = math.floor(v2), parent = k }
							end
						end
					else
						extractNums(v, out, seen, depth + 1, budget)
					end
				end
			end
		end
	end
end

-- 2K v10: ดึง item id + จำนวน + Tier จากอากิวเมนต์ event แบบไม่ต้องเดาลำดับ
local function idsFromPacked(packed)
	local found = {}
	local function add(id, n, tier)
		if type(id) ~= "string" or not Items[id] then return end
		local qty = math.max(1, math.floor(tonumber(n) or 1))
		local t = tier or extractItemTier(nil, id)
		for _, f in ipairs(found) do
			if f.id == id and f.tier == t then
				f.n = f.n + qty
				return
			end
		end
		found[#found + 1] = { id = id, n = qty, tier = t }
	end
	local function rec(v, depth)
		if depth > 3 then return end
		local tv = type(v)
		if tv == "string" then
			add(v, 1, nil)
		elseif tv == "number" then
			if #found > 0 and v > 0 then found[#found].n = math.floor(v) end
		elseif tv == "table" then
			local id = rawget(v, "item_id") or rawget(v, "id")
			if type(id) == "string" and Items[id] then
				add(id, rawget(v, "amount") or rawget(v, "quantity") or rawget(v, "qty") or 1, extractItemTier(v, id))
			end
			for k, val in pairs(v) do
				if type(k) == "string" and Items[k] and type(val) == "number" and val > 0 then
					add(k, val, nil)
				elseif type(val) == "table" or type(val) == "string" then
					rec(val, depth + 1)
				end
			end
		end
	end
	if type(packed) == "table" then
		local count = tonumber(packed.n) or #packed
		if count > 0 then
			for i = 1, count do rec(packed[i], 0) end
		else
			rec(packed, 0)
		end
	end
	return found
end

-- 2K v10: ดึงยูนิตที่ได้รับจริงจากอากิวเมนต์ event
local function unitsFromPacked(packed)
	local found = {}
	local function addUnit(uid, n)
		if type(uid) ~= "string" or not Units[uid] then return end
		local qty = math.max(1, math.floor(tonumber(n) or 1))
		for _, f in ipairs(found) do
			if f.id == uid then f.n = f.n + qty; return end
		end
		found[#found + 1] = { id = uid, n = qty }
	end
	local function rec(v, depth)
		if depth > 3 or type(v) ~= "table" then return end
		local uid = rawget(v, "unit_id")
		if type(uid) == "string" and Units[uid] then
			addUnit(uid, rawget(v, "amount") or rawget(v, "quantity") or 1)
		end
		for k, val in pairs(v) do
			if type(k) == "string" and Units[k] then
				addUnit(k, (type(val) == "number" and val > 0) and val or 1)
			elseif type(val) == "table" then
				rec(val, depth + 1)
			elseif type(val) == "string" and Units[val] then
				addUnit(val, 1)
			end
		end
	end
	rec(packed, 0)
	return found
end

-- เก็บประวัติของดรอปไว้ไม่เกิน 15 รอบล่าสุด ส่วนอันเก่าที่เกินลบออกทันที
local function pruneRewardsTo15()
	local keptRewards, seenRuns, runCount = {}, {}, 0
	for _, rw in ipairs(Hub.Rewards) do
		local rk = rw.runId and tostring(rw.runId) or (tostring(rw.ts or rw.t) .. "|" .. tostring(rw.id))
		if seenRuns[rk] then
			keptRewards[#keptRewards + 1] = rw
		elseif runCount < 15 then
			seenRuns[rk] = true
			runCount = runCount + 1
			keptRewards[#keptRewards + 1] = rw
		end
	end
	Hub.Rewards = keptRewards
	Hub.Totals = {}
	for _, rw in ipairs(Hub.Rewards) do
		local tk = tostring(rw.kind) .. "|" .. tostring(rw.id) .. "|" .. tostring(rw.tier or "")
		Hub.Totals[tk] = (Hub.Totals[tk] or 0) + (tonumber(rw.qty) or 0)
	end
end

local function uploadBundleAssetsAsync(st, stageName, bundle)
	if not httpRequest or Hub.HttpBlocked then return end
	local stageImgCopy = st and st.mapImg or nil
	local stageIdCopy = st and st.mapImageId or nil
	local stageLblCopy = stageName or (st and st.map) or nil
	local bundleCopy = {}
	for _, b in ipairs(bundle) do
		bundleCopy[#bundleCopy + 1] = { img = b.img, iconId = b.iconId, kind = b.kind, name = b.name, id = b.id }
	end
	task.spawn(function()
		if stageImgCopy and stageIdCopy and not Hub.UploadedAssets[stageIdCopy] then
			Hub.UploadTried[stageIdCopy] = nil
			pcall(Hub.UploadGameAsset, stageImgCopy, "stage", stageLblCopy, 160, false)
		end
		local uploadedThisClear = 0
		for _, b in ipairs(bundleCopy) do
			if b.img and b.iconId and not Hub.UploadedAssets[b.iconId] and uploadedThisClear < 10 then
				Hub.UploadTried[b.iconId] = nil
				local okUp = pcall(Hub.UploadGameAsset, b.img, b.kind or "item", b.name or b.id, 72, true)
				if okUp then uploadedThisClear = uploadedThisClear + 1 end
			end
		end
	end)
end

local function pushRaw(tag, data)
	Hub.Raw[#Hub.Raw + 1] = { tag = tag, t = clock(), data = data }
	while #Hub.Raw > 12 do table.remove(Hub.Raw, 1) end
end

local function bufferEventDrop(kind, id, name, rarity, qty, img, tier)
	local q = math.floor(tonumber(qty) or 0)
	if q <= 0 then return end
	local cleanTier = tier or (kind == "item" and extractItemTier(nil, id) or nil)
	local k = kind .. "|" .. tostring(id) .. "|" .. tostring(cleanTier or "")
	local cur = Hub.PendingDrops[k]
	if cur then
		cur.qty = cur.qty + q
		if not cur.img and img then cur.img = img; cur.iconId = extractAssetId(img) end
	else
		Hub.PendingDrops[k] = {
			kind = kind,
			id = tostring(id),
			name = tostring(name),
			rarity = rarity or "Common",
			qty = q,
			tier = cleanTier,
			img = img,
			iconId = extractAssetId(img),
		}
	end
end

local function onRealItemOrDropEvent(tag, packed)
	pushRaw(tag, packed)
	local items = idsFromPacked(packed)
	local units = unitsFromPacked(packed)
	if #items == 0 and #units == 0 then return end

	local extracted = {}
	for _, it in ipairs(items) do
		local img = itemImg(it.id)
		extracted[#extracted + 1] = {
			kind = "item",
			id = it.id,
			name = iName(it.id),
			rarity = iRarity(it.id),
			qty = it.n,
			tier = it.tier,
			img = img,
			iconId = extractAssetId(img),
		}
	end
	for _, u in ipairs(units) do
		extracted[#extracted + 1] = {
			kind = "unit",
			id = u.id,
			name = uName(u.id),
			rarity = uRarity(u.id),
			qty = u.n,
			tier = nil,
			img = nil,
			iconId = nil,
		}
	end

	-- หากเพิ่งจบด่านไม่เกิน 6 วินาที ให้แนบเข้า run ล่าสุดทันทีแล้วซิงค์ขึ้นเว็บเลย (กัน event ของรางวัลตามหลัง game_finished)
	if Hub.LastFinishRunId and (os.clock() - Hub.LastFinishAt) <= 6 and Hub.LastFinishMeta then
		local meta = Hub.LastFinishMeta
		local addedAny = false
		for _, b in ipairs(extracted) do
			local merged = false
			for _, rw in ipairs(Hub.Rewards) do
				if rw.runId == Hub.LastFinishRunId and rw.kind == b.kind and rw.id == b.id and rw.tier == b.tier then
					rw.qty = math.max(rw.qty, b.qty)
					merged = true
					break
				end
			end
			if not merged then
				addedAny = true
				table.insert(Hub.Rewards, 1, {
					t = meta.t,
					ts = meta.ts,
					kind = b.kind,
					id = b.id,
					name = b.name,
					rarity = b.rarity,
					qty = b.qty,
					src = "stage_clear",
					img = b.img,
					iconId = b.iconId,
					tier = b.tier,
					runId = Hub.LastFinishRunId,
					stageName = meta.stageName,
					stageWorld = meta.stageWorld,
					stageMap = meta.stageMap,
					stageDifficulty = meta.stageDifficulty,
					stageGamemode = meta.stageGamemode,
					stageWaves = meta.stageWaves,
					stageTimer = meta.stageTimer,
					stageImg = meta.stageImg,
					stageImageId = meta.stageImageId,
				})
			end
		end
		if addedAny then
			pruneRewardsTo15()
			pcall(Hub.Render)
			Hub.SyncToWeb(true, "game_finished")
			uploadBundleAssetsAsync(Hub.Stage, meta.stageName, extracted)
		end
		return
	end

	-- ระหว่างด่าน: บัฟเฟอร์เงียบๆ รอรวมส่งทีเดียวตอน game_finished
	for _, b in ipairs(extracted) do
		bufferEventDrop(b.kind, b.id, b.name, b.rarity, b.qty, b.img, b.tier)
	end
end

local function onGameFinished(payload)
	Hub.LastFinish = payload
	pushRaw("game_finished", payload)
	if type(payload) ~= "table" then return end

	pcall(function()
		pcall(Hub.SnapStats)
		local st = Hub.Stage or {}

		local stageName = (type(payload.title) == "string" and payload.title ~= "" and payload.title)
			or (type(payload.level) == "string" and payload.level ~= "" and payload.level)
			or st.name or "Unknown Stage"
		if st.name and st.name ~= "ล็อบบี้" and st.name ~= "?" and (stageName == "Victory" or stageName == "Defeat" or stageName == "VICTORY" or stageName == "DEFEAT") then
			stageName = st.name
		end

		local win = payload.victory
		if win == nil and payload.title then
			win = not string.find(string.lower(tostring(payload.title)), "fail", 1, true)
				and not string.find(string.lower(tostring(payload.title)), "defeat", 1, true)
		end
		local resultTag = (win == false) and "DEFEAT" or "VICTORY"

		local pStats = type(payload.stats) == "table" and payload.stats or nil
		local stageWaves = (pStats and pStats.waves_completed and ("Wave " .. tostring(pStats.waves_completed)))
			or ((st.wave and st.wave > 0) and ("Wave " .. tostring(st.wave)) or nil)
		local stageTimer = nil
		if pStats and pStats.time_taken then
			local sec = math.floor(tonumber(pStats.time_taken) or 0)
			stageTimer = string.format("%02d:%02d", math.floor(sec / 60), sec % 60)
		end

		local bundle, seenKey = {}, {}
		local function addBundle(kind, id, name, rarity, qty, img, tier)
			local q = math.floor(tonumber(qty) or 0)
			if q <= 0 then return end
			local key = kind .. "|" .. tostring(id) .. "|" .. tostring(tier or "")
			if seenKey[key] then
				if q > seenKey[key].qty then seenKey[key].qty = q end
				if not seenKey[key].img and img then
					seenKey[key].img = img
					seenKey[key].iconId = extractAssetId(img)
				end
				return
			end
			local entry = {
				kind = kind,
				id = tostring(id),
				name = tostring(name),
				rarity = rarity or "Common",
				qty = q,
				tier = tier,
				img = img,
				iconId = extractAssetId(img),
			}
			seenKey[key] = entry
			bundle[#bundle + 1] = entry
		end

		local rows, seenNum = {}, {}
		extractNums(payload, rows, seenNum, 0, { n = 0 })
		table.sort(rows, function(a, b) return a.val > b.val end)
		for _, r in ipairs(rows) do
			local cid, cname, crar, cimg = mapCurrencyMeta(r.key, stageName, st.id, st.world)
			addBundle("currency", cid, cname, crar, r.val, cimg, nil)
		end

		for _, it in ipairs(idsFromPacked(payload)) do
			addBundle("item", it.id, iName(it.id), iRarity(it.id), it.n, itemImg(it.id), it.tier)
		end
		for _, u in ipairs(unitsFromPacked(payload)) do
			addBundle("unit", u.id, uName(u.id), uRarity(u.id), u.n, nil, nil)
		end

		for _, pDrop in pairs(Hub.PendingDrops) do
			addBundle(pDrop.kind, pDrop.id, pDrop.name, pDrop.rarity, pDrop.qty, pDrop.img, pDrop.tier)
		end
		Hub.PendingDrops = {}

		Hub.RunSeq = Hub.RunSeq + 1
		local runId = tostring(os.time()) .. "_" .. tostring(Hub.RunSeq)
		local nowClock = clock()
		local nowMs = os.time() * 1000
		local gamemodeLabel = st.gamemode and (resultTag .. " • " .. tostring(st.gamemode)) or resultTag

		Hub.LastFinishAt = os.clock()
		Hub.LastFinishRunId = runId
		Hub.LastFinishMeta = {
			t = nowClock,
			ts = nowMs,
			stageName = stageName,
			stageWorld = st.world,
			stageMap = st.map,
			stageDifficulty = st.difficulty,
			stageGamemode = gamemodeLabel,
			stageWaves = stageWaves,
			stageTimer = stageTimer,
			stageImg = st.mapImg,
			stageImageId = st.mapImageId,
		}

		if #bundle > 0 then
			for idxItem = #bundle, 1, -1 do
				local b = bundle[idxItem]
				table.insert(Hub.Rewards, 1, {
					t = nowClock,
					ts = nowMs,
					kind = b.kind,
					id = b.id,
					name = b.name,
					rarity = b.rarity,
					qty = b.qty,
					src = "stage_clear",
					img = b.img,
					iconId = b.iconId,
					tier = b.tier,
					runId = runId,
					stageName = stageName,
					stageWorld = st.world,
					stageMap = st.map,
					stageDifficulty = st.difficulty,
					stageGamemode = gamemodeLabel,
					stageWaves = stageWaves,
					stageTimer = stageTimer,
					stageImg = st.mapImg,
					stageImageId = st.mapImageId,
				})
			end
			pruneRewardsTo15()

			if Hub.Flags.Notify then
				local summaryParts = {}
				for i = 1, math.min(#bundle, 3) do
					local label = bundle[i].tier and (bundle[i].name .. " [" .. bundle[i].tier .. "]") or bundle[i].name
					summaryParts[#summaryParts + 1] = label .. " +" .. tostring(bundle[i].qty)
				end
				local subText = table.concat(summaryParts, " • ")
				if #bundle > 3 then subText = subText .. " (+" .. tostring(#bundle - 3) .. " อื่นๆ)" end
				local toastCol = (win == false) and Color3.fromRGB(255, 110, 120) or Color3.fromRGB(16, 245, 160)
				pcall(function()
					Hub.Toast("clear", resultTag .. " — " .. tostring(stageName), subText, toastCol, st.mapImg)
				end)
			end

			Hub.Tab = "reward"
			pcall(Hub.Render)

			Hub.SyncToWeb(true, "game_finished")
			uploadBundleAssetsAsync(st, stageName, bundle)
		end
	end)
end

pcall(function()
	conn(LP.OnTeleport:Connect(function(state)
		if state == Enum.TeleportState.Started or state == Enum.TeleportState.InProgress then
			if next(Hub.PendingDrops) ~= nil then
				local st = Hub.Stage or {}
				Hub.RunSeq = Hub.RunSeq + 1
				local runId = tostring(os.time()) .. "_" .. tostring(Hub.RunSeq)
				local nowClock = clock()
				local nowMs = os.time() * 1000
				for _, pDrop in pairs(Hub.PendingDrops) do
					table.insert(Hub.Rewards, 1, {
						t = nowClock,
						ts = nowMs,
						kind = pDrop.kind,
						id = pDrop.id,
						name = pDrop.name,
						rarity = pDrop.rarity,
						qty = pDrop.qty,
						src = "stage_clear",
						img = pDrop.img,
						iconId = pDrop.iconId,
						tier = pDrop.tier,
						runId = runId,
						stageName = st.name or "Unknown Stage",
						stageWorld = st.world,
						stageMap = st.map,
						stageDifficulty = st.difficulty,
						stageGamemode = st.gamemode,
						stageWaves = (st.wave and st.wave > 0) and ("Wave " .. tostring(st.wave)) or nil,
						stageImg = st.mapImg,
						stageImageId = st.mapImageId,
					})
				end
				Hub.PendingDrops = {}
				pruneRewardsTo15()
				Hub.SyncToWeb(true, "teleport_flush")
			end
		end
	end))
end)

------------------------------------------------------------------
-- 4.5) DISCONNECT / ERROR PROMPT DETECTOR (แจ้งเว็บ + ออฟไลน์ทันที!)
------------------------------------------------------------------
local function parseErrorCodeFromText(msg)
	if type(msg) ~= "string" then return nil end
	return msg:match("Error Code:%s*(%d+)") or msg:match("Code:%s*(%d+)")
end

local function triggerDisconnect(title, msg, code)
	local cleanMsg = tostring(msg or ""):gsub("^%s+", ""):gsub("%s+$", "")
	local cleanTitle = tostring(title or "Disconnected"):gsub("^%s+", ""):gsub("%s+$", "")
	if cleanTitle == "" then cleanTitle = "Disconnected" end
	local cleanCode = code and tostring(code):match("(%d+)") or parseErrorCodeFromText(cleanMsg)
	if cleanMsg == "" and not cleanCode then return end
	if cleanMsg == "" then
		cleanMsg = "Disconnected (Error Code: " .. tostring(cleanCode) .. ")"
	end
	local key = cleanTitle .. "|" .. cleanMsg .. "|" .. tostring(cleanCode or "")
	if Hub.DisconnectSentKey == key then return end
	Hub.DisconnectSentKey = key
	Hub.Disconnected = true
	Hub.DisconnectInfo = {
		title = cleanTitle,
		message = cleanMsg,
		errorCode = cleanCode,
		at = os.time() * 1000,
	}
	Hub.SyncStatus = "หลุดจากเกม (" .. (cleanCode and ("Code " .. cleanCode) or "Disconnected") .. ")"
	pcall(Hub.Render)
	Hub.SyncToWeb(true, "disconnected")
end

local function checkDisconnectPrompt()
	local okG, gMsg = pcall(function() return GuiService:GetErrorMessage() end)
	local okC, gCode = pcall(function() return GuiService:GetErrorCode() end)
	local codeNum = nil
	if okC and gCode and gCode ~= Enum.ConnectionError.OK then
		local cStr = tostring(gCode)
		codeNum = cStr:match("(%d+)")
		if not codeNum and type(gCode.Value) == "number" and gCode.Value > 0 then
			codeNum = tostring(gCode.Value)
		end
	end
	if okG and type(gMsg) == "string" and gMsg:match("%S") then
		triggerDisconnect("Disconnected", gMsg, codeNum or parseErrorCodeFromText(gMsg))
		return true
	end

	if CoreGui then
		local rpg = CoreGui:FindFirstChild("RobloxPromptGui")
		local overlay = rpg and rpg:FindFirstChild("promptOverlay")
		if overlay then
			for _, child in ipairs(overlay:GetChildren()) do
				if child.Name == "ErrorPrompt" or child:FindFirstChild("MessageArea", true) then
					local titleLbl = idx(child, "TitleFrame.ErrorTitle") or child:FindFirstChild("ErrorTitle", true)
					local msgLbl = idx(child, "MessageArea.ErrorFrame.ErrorMessage") or child:FindFirstChild("ErrorMessage", true)
					local tText = (titleLbl and titleLbl:IsA("TextLabel")) and titleLbl.Text or "Disconnected"
					local mText = (msgLbl and msgLbl:IsA("TextLabel")) and msgLbl.Text or ""
					if mText == "" then
						for _, d in ipairs(child:GetDescendants()) do
							if d:IsA("TextLabel") and d.Text and #d.Text > #mText and d.Text ~= tText and d.Text ~= "Leave" and d.Text ~= "Reconnect" then
								mText = d.Text
							end
						end
					end
					if mText ~= "" then
						triggerDisconnect(tText, mText, parseErrorCodeFromText(mText) or codeNum)
						return true
					end
				end
			end
		end
	end
	return false
end

pcall(function()
	conn(GuiService.ErrorMessageChanged:Connect(function(msg)
		if type(msg) == "string" and msg:match("%S") then
			triggerDisconnect("Disconnected", msg, parseErrorCodeFromText(msg))
		else
			pcall(checkDisconnectPrompt)
		end
	end))
end)

local function watchPromptOverlay(overlay)
	if not overlay then return end
	local function inspectPrompt(node)
		task.defer(function()
			pcall(checkDisconnectPrompt)
		end)
		pcall(function()
			local msgLbl = node:FindFirstChild("ErrorMessage", true)
			if msgLbl and msgLbl:IsA("TextLabel") then
				conn(msgLbl:GetPropertyChangedSignal("Text"):Connect(function()
					pcall(checkDisconnectPrompt)
				end))
			end
		end)
	end
	for _, ch in ipairs(overlay:GetChildren()) do inspectPrompt(ch) end
	conn(overlay.ChildAdded:Connect(inspectPrompt))
end

pcall(function()
	if CoreGui then
		local rpg = CoreGui:FindFirstChild("RobloxPromptGui")
		if rpg then
			local ov = rpg:FindFirstChild("promptOverlay")
			if ov then watchPromptOverlay(ov) end
			conn(rpg.ChildAdded:Connect(function(ch)
				if ch.Name == "promptOverlay" then watchPromptOverlay(ch) end
			end))
		else
			conn(CoreGui.ChildAdded:Connect(function(ch)
				if ch.Name == "RobloxPromptGui" then
					local ov = ch:FindFirstChild("promptOverlay") or ch:WaitForChild("promptOverlay", 5)
					if ov then watchPromptOverlay(ov) end
				end
			end))
		end
	end
end)

-- Hook 4 RemoteEvent จริงของเกม (2K v10 — ไม่มีเดา diff ไม่มีสแกน ResultsUI)
local endpoints = RS:FindFirstChild("endpoints")
local S2C = endpoints and endpoints:FindFirstChild("server_to_client")
local function hookEvent(name, fn)
	if not S2C then return end
	local ev = S2C:FindFirstChild(name)
	if ev and ev:IsA("RemoteEvent") then
		conn(ev.OnClientEvent:Connect(function(...)
			local args = table.pack(...)
			pcall(fn, args)
		end))
	end
end

hookEvent("game_finished", function(args)
	onGameFinished(args[1] or args[2])
end)
hookEvent("show_unit_and_item_rewards", function(args)
	onRealItemOrDropEvent("show_unit_and_item_rewards", args)
end)
hookEvent("show_drop_message", function(args)
	onRealItemOrDropEvent("show_drop_message", args)
end)
hookEvent("show_drop_message_custom", function(args)
	onRealItemOrDropEvent("show_drop_message_custom", args)
end)

------------------------------------------------------------------
-- 5) TOAST NOTIFICATION (แสดงพร้อมรูปด่าน/ไอเทมจริง)
------------------------------------------------------------------
local toastGui = Instance.new("ScreenGui")
toastGui.Name = "2K_RewardToasts"
toastGui.ResetOnSpawn = false
toastGui.DisplayOrder = 90
pcall(function() toastGui.Parent = (gethui and gethui()) or PG end)
if not toastGui.Parent then toastGui.Parent = PG end

local toastHolder = Instance.new("Frame")
toastHolder.Size = UDim2.new(0, 324, 1, -40)
toastHolder.Position = UDim2.new(1, -338, 0, 20)
toastHolder.BackgroundTransparency = 1
toastHolder.Parent = toastGui
local tlist = Instance.new("UIListLayout", toastHolder)
tlist.Padding = UDim.new(0, 6)
tlist.SortOrder = Enum.SortOrder.LayoutOrder
tlist.VerticalAlignment = Enum.VerticalAlignment.Top

function Hub.Toast(_kind, title, sub, col, img)
	local accent = typeof(col) == "Color3" and col or rcol(col)
	local f = Instance.new("Frame")
	f.Size = UDim2.new(1, 0, 0, 50)
	f.BackgroundColor3 = Color3.fromRGB(18, 22, 30)
	f.BackgroundTransparency = 0.05
	f.BorderSizePixel = 0
	f.Parent = toastHolder
	Instance.new("UICorner", f).CornerRadius = UDim.new(0, 8)
	local st = Instance.new("UIStroke", f)
	st.Color = accent; st.Thickness = 1.5

	local tx = 12
	if img and img ~= "" then
		tx = 52
		local ic = Instance.new("ImageLabel")
		ic.Size = UDim2.fromOffset(36, 36)
		ic.Position = UDim2.fromOffset(8, 7)
		ic.BackgroundColor3 = Color3.fromRGB(32, 36, 48)
		ic.Image = img
		ic.ScaleType = Enum.ScaleType.Crop
		ic.BorderSizePixel = 0
		ic.Parent = f
		Instance.new("UICorner", ic).CornerRadius = UDim.new(0, 6)
	end

	local t1 = Instance.new("TextLabel")
	t1.Size = UDim2.new(1, -tx - 8, 0, 19)
	t1.Position = UDim2.fromOffset(tx, 5)
	t1.BackgroundTransparency = 1
	t1.Font = Enum.Font.GothamBold
	t1.TextSize = 12
	t1.TextXAlignment = Enum.TextXAlignment.Left
	t1.TextColor3 = accent
	t1.TextTruncate = Enum.TextTruncate.AtEnd
	t1.Text = tostring(title)
	t1.Parent = f

	local t2 = Instance.new("TextLabel")
	t2.Size = UDim2.new(1, -tx - 8, 0, 18)
	t2.Position = UDim2.fromOffset(tx, 25)
	t2.BackgroundTransparency = 1
	t2.Font = Enum.Font.Gotham
	t2.TextSize = 10
	t2.TextXAlignment = Enum.TextXAlignment.Left
	t2.TextColor3 = Color3.fromRGB(175, 185, 200)
	t2.TextTruncate = Enum.TextTruncate.AtEnd
	t2.Text = tostring(sub or "") .. " • " .. clock()
	t2.Parent = f

	task.spawn(function()
		task.wait(4.2)
		pcall(function() TweenService:Create(f, TweenInfo.new(0.35), { BackgroundTransparency = 1 }):Play() end)
		pcall(function() TweenService:Create(t1, TweenInfo.new(0.35), { TextTransparency = 1 }):Play() end)
		pcall(function() TweenService:Create(t2, TweenInfo.new(0.35), { TextTransparency = 1 }):Play() end)
		task.wait(0.4)
		pcall(function() f:Destroy() end)
	end)
end
${guiSection}
function Hub.Stop()
	Hub.Running = false
	for _, c in ipairs(Hub.Conns) do pcall(function() c:Disconnect() end) end
	pcall(function() Hub.InvalidatePics() end)
	pcall(function() if gui then gui:Destroy() end end)
	pcall(function() toastGui:Destroy() end)
end

------------------------------------------------------------------
-- 7) LOOP (ตรวจด่าน + Heartbeat ตามรอบ AUTO_SYNC_SEC)
------------------------------------------------------------------
pcall(Hub.SnapStats)
pcall(Hub.ReadTeam)
pcall(Hub.ReadBag)
pcall(Hub.UpdateLocation)
Hub.PicMode = Hub.Flags.Pic
pcall(Hub.Render)

-- ลูป 1: อัปเดตด่านที่กำลังเล่น + ตรวจหน้าต่างหลุดเกมทุก 1 วิ + ค่าเงิน/ทีมในเครื่อง
task.spawn(function()
	local tickCount = 0
	while Hub.Running do
		pcall(checkDisconnectPrompt)
		if not Hub.Disconnected then
			if tickCount % 3 == 0 then
				pcall(Hub.UpdateLocation)
			end
			if tickCount % 5 == 0 then
				pcall(Hub.SnapStats)
				pcall(Hub.ReadTeam)
				if Hub.Tab == "level" then pcall(Hub.Render) end
			end
		end
		tickCount = tickCount + 1
		task.wait(1)
	end
end)

-- ลูป 2: รอให้ข้อมูลโหลดเสร็จก่อนส่งครั้งแรก (กันเวลาย้ายเซิฟรีเป็น 0) + Heartbeat ตามรอบ AUTO_SYNC_SEC
task.spawn(function()
	local waitedLoad = 0
	while Hub.Running and not Hub.Disconnected and waitedLoad < 12 do
		pcall(Hub.SnapStats)
		pcall(Hub.ReadTeam)
		local bList = {}
		pcall(function() bList = Hub.ReadBag() end)
		local stCur = Hub.CurrentStats or {}
		local ready = (#Hub.TeamList > 0) or (#bList > 0) or (safeNum(stCur.gold_amount) > 0) or (safeNum(stCur.gem_amount) > 0)
		if ready then break end
		task.wait(0.5)
		waitedLoad = waitedLoad + 0.5
	end
	if Hub.Running and not Hub.Disconnected then
		pcall(Hub.UpdateLocation)
		pcall(Hub.Render)
		Hub.SyncToWeb(true, "startup")
	end
	task.delay(4, function()
		if Hub.Running and not Hub.Disconnected then pcall(Hub.ScanAndUploadGameAssets, false) end
	end)
	while Hub.Running do
		task.wait(5)
		if not Hub.Running then break end
		if Hub.Disconnected then break end
		if not Hub.HttpBlocked and (os.clock() - Hub.LastSync) >= AUTO_SYNC_SEC then
			pcall(Hub.SyncToWeb, true, "heartbeat")
		end
	end
end)

Hub.Toast("info", "2K AA Vault v" .. SCRIPT_VERSION .. " พร้อมทำงาน", tostring(Hub.Stage.name) .. " • ทีม " .. tostring(#Hub.TeamList) .. "/6 • เช็คทุก " .. AUTO_SYNC_SEC .. " วิ (จบด่านส่งทันที)", Color3.fromRGB(16, 245, 160), Hub.Stage.mapImg)
`;
}

export default async function handler(req: Req, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const rewritePath = (parsedUrl.searchParams.get('__path') || '').replace(/^\/+/, '');
  const resolvedPath =
    rewritePath && (parsedUrl.pathname === '/api/index' || parsedUrl.pathname === '/api')
      ? `/api/${rewritePath}`
      : parsedUrl.pathname;
  const pathname = resolvedPath.replace(/\/+$/, '') || '/';

  // Serve raw hosted Lua script so users only need a 1-line loadstring(game:HttpGet(...))()
  if (req.method === 'GET' && (pathname === '/api/script' || pathname === '/api/script.lua')) {
    const proto = String(req.headers['x-forwarded-proto'] || 'https')
      .split(',')[0]
      .trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim();
    const origin = host ? `${proto}://${host}` : '';
    const syncKey = sanitizeKey(parsedUrl.searchParams.get('key'));
    const rawInterval = Number(parsedUrl.searchParams.get('interval'));
    const intervalSec = Number.isFinite(rawInterval)
      ? Math.min(600, Math.max(5, Math.round(rawInterval)))
      : 120;
    const guiParam = parsedUrl.searchParams.get('gui');
    const showGui = guiParam !== '0' && guiParam !== 'false';
    const rawEndpoint = (parsedUrl.searchParams.get('endpoint') || '').trim();
    const safeEndpoint = /^https?:\/\/[^\s"'\\]+$/.test(rawEndpoint)
      ? rawEndpoint
      : `${origin}/api/sync`;

    const luaText = buildLuaScript(safeEndpoint, syncKey, intervalSec, showGui);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    });
    res.end(luaText);
    return;
  }

  // Resolve real Roblox character avatar + bodyColors + rig + assets (supports userId OR username)
  const avatarIdMatch = pathname.match(/^\/api\/avatar\/(\d{1,15})$/);
  if (req.method === 'GET' && (pathname === '/api/avatar' || avatarIdMatch)) {
    const rawUserId = avatarIdMatch ? avatarIdMatch[1] : parsedUrl.searchParams.get('userId') || '';
    const rawUsername = (parsedUrl.searchParams.get('username') || '').trim();
    const BRICK_MAP: Record<number, string> = {
      1: '#F2F3F3', 5: '#D7C59A', 9: '#E8BAC8', 11: '#80BBDB', 12: '#CB8442', 18: '#CC8E69',
      21: '#C4281C', 22: '#C470A0', 23: '#0D69AC', 24: '#F5CD30', 25: '#624732', 26: '#1B2A35',
      28: '#287F47', 37: '#4B974B', 38: '#A05F35', 45: '#B4D2E4', 101: '#DA867A', 102: '#6E99CA',
      104: '#6B327C', 105: '#E29B40', 106: '#DA8541', 107: '#008F9C', 125: '#EAB892', 135: '#74869D',
      192: '#694028', 194: '#A3A2A5', 199: '#635F62', 208: '#E5E4DF', 217: '#7C5C46', 226: '#FDEA8D',
      305: '#527CAE', 307: '#102A4C', 312: '#3E3C39', 327: '#970000', 330: '#FF98DC', 331: '#FF5959',
      334: '#F8D96D', 335: '#E7E7EC', 340: '#F1E7C7', 345: '#8F4C2A', 346: '#D3BE96', 348: '#EDEAEA',
      351: '#BC9B5D', 352: '#C7AC78', 353: '#CABFA3', 355: '#6C584B', 359: '#AF9483', 361: '#564236',
      1001: '#F8F8F8', 1002: '#CDCDCD', 1003: '#111111', 1004: '#FF0000', 1005: '#FFB000',
      1006: '#B480FF', 1009: '#FFFF00', 1010: '#0000FF', 1012: '#2154B9', 1013: '#04AFEC',
      1016: '#FF66CC', 1018: '#12EED4', 1020: '#00FF00', 1024: '#AFDDFF', 1026: '#B1A7FF',
      1030: '#FFCC99', 1031: '#6225D1', 1032: '#FF00BF',
    };
    const toHex = (id: unknown, fb: string) => {
      const n = Number(id);
      return Number.isFinite(n) && BRICK_MAP[n] ? BRICK_MAP[n] : fb;
    };
    const fetchThumb = async (url: string): Promise<string | null> => {
      for (let i = 0; i < 2; i++) {
        try {
          const r = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!r.ok) return null;
          const d = (await r.json()) as { data?: Array<{ state?: string; imageUrl?: string }> };
          const e = d?.data?.[0];
          if (e?.state === 'Completed' && e.imageUrl) return e.imageUrl;
          if (e?.state === 'Pending' && i === 0) {
            await new Promise((resolve) => setTimeout(resolve, 450));
            continue;
          }
          return null;
        } catch {
          return null;
        }
      }
      return null;
    };

    let uid: number | null = /^\d{1,15}$/.test(rawUserId) ? Number(rawUserId) : null;
    if ((!uid || uid <= 0) && rawUsername) {
      try {
        const uRes = await fetch('https://users.roblox.com/v1/usernames/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ usernames: [rawUsername], excludeBannedUsers: false }),
        });
        if (uRes.ok) {
          const uData = (await uRes.json()) as { data?: Array<{ id?: number }> };
          const found = Number(uData?.data?.[0]?.id);
          if (Number.isFinite(found) && found > 0) uid = found;
        }
      } catch {
        // ignore username lookup error
      }
    }

    if (!uid || uid <= 0) {
      sendJson(res, { ok: false, userId: null, imageUrl: null, proxyImageUrl: null }, 200);
      return;
    }

    const [imageUrl, headshotUrl, avatarJson] = await Promise.all([
      fetchThumb(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${uid}&size=720x720&format=Png&isCircular=false`
      ),
      fetchThumb(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${uid}&size=420x420&format=Png&isCircular=false`
      ),
      fetch(`https://avatar.roblox.com/v1/users/${uid}/avatar`, {
        headers: { Accept: 'application/json' },
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    const raw = avatarJson as {
      playerAvatarType?: string;
      scales?: { height?: number; width?: number; head?: number; depth?: number };
      bodyColors?: {
        headColorId?: number;
        torsoColorId?: number;
        leftArmColorId?: number;
        rightArmColorId?: number;
        leftLegColorId?: number;
        rightLegColorId?: number;
      };
      assets?: Array<{ id?: number; name?: string; assetType?: { name?: string } }>;
    } | null;

    const bc = raw?.bodyColors;
    const sc = raw?.scales;
    const payload = {
      ok: Boolean(imageUrl || headshotUrl || raw),
      userId: uid,
      imageUrl,
      proxyImageUrl: imageUrl ? `/api/avatar-image?url=${encodeURIComponent(imageUrl)}` : null,
      headshotUrl,
      proxyHeadshotUrl: headshotUrl
        ? `/api/avatar-image?url=${encodeURIComponent(headshotUrl)}`
        : null,
      avatarType: raw?.playerAvatarType === 'R6' ? 'R6' : 'R15',
      bodyColors: {
        head: toHex(bc?.headColorId, '#EAB892'),
        torso: toHex(bc?.torsoColorId, '#0D69AC'),
        leftArm: toHex(bc?.leftArmColorId, '#EAB892'),
        rightArm: toHex(bc?.rightArmColorId, '#EAB892'),
        leftLeg: toHex(bc?.leftLegColorId, '#263238'),
        rightLeg: toHex(bc?.rightLegColorId, '#263238'),
      },
      scales: {
        height: Math.min(1.25, Math.max(0.8, Number(sc?.height) || 1)),
        width: Math.min(1.25, Math.max(0.7, Number(sc?.width) || 1)),
        head: Math.min(1.2, Math.max(0.85, Number(sc?.head) || 1)),
        depth: Math.min(1.2, Math.max(0.75, Number(sc?.depth) || 1)),
      },
      assets: Array.isArray(raw?.assets)
        ? raw.assets
            .filter((a) => a && a.name)
            .slice(0, 16)
            .map((a) => ({
              id: Number(a.id) || 0,
              name: String(a.name),
              type: String(a.assetType?.name || 'Item'),
            }))
        : [],
    };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
      ...CORS_HEADERS,
    });
    res.end(JSON.stringify(payload));
    return;
  }

  // Same-origin PNG proxy strictly restricted to official Roblox CDN hosts (*.rbxcdn.com)
  if (req.method === 'GET' && pathname === '/api/avatar-image') {
    const rawUrl = (parsedUrl.searchParams.get('url') || '').trim();
    if (!rawUrl || !/^https:\/\/([a-z0-9-]+\.)?rbxcdn\.com\//i.test(rawUrl)) {
      res.writeHead(400, CORS_HEADERS);
      res.end('Invalid Roblox CDN URL');
      return;
    }
    try {
      const upstream = await fetch(rawUrl);
      if (!upstream.ok) {
        res.writeHead(upstream.status, CORS_HEADERS);
        res.end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': upstream.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=3600',
        ...CORS_HEADERS,
      });
      res.end(buf);
    } catch {
      res.writeHead(502, CORS_HEADERS);
      res.end();
    }
    return;
  }

  // Check whether the server already has real in-game uploaded texture(s) to avoid duplicate uploads
  if (req.method === 'GET' && pathname === '/api/asset-exists') {
    const rawSingle = (parsedUrl.searchParams.get('id') || '').trim();
    const rawMulti = (parsedUrl.searchParams.get('ids') || '').trim();
    const ids = `${rawSingle},${rawMulti}`
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d{4,15}$/.test(s))
      .slice(0, 32);
    const checks = await Promise.all(
      ids.map(async (id) => ((await getUploadedAssetPng(id)) ? id : null))
    );
    const existing = checks.filter((id): id is string => Boolean(id));
    sendJson(res, { ok: true, existing, exists: existing.length > 0 });
    return;
  }

  // Receive real in-game pixel/PNG captures scanned by the Lua script inside Roblox
  if (req.method === 'POST' && pathname === '/api/asset-upload') {
    let body: Record<string, unknown>;
    try {
      const rawText = await readBodyText(req, 600_000);
      body = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      sendJson(res, { ok: false, error: 'Invalid or oversized JSON payload' }, 400);
      return;
    }

    const rawAssetId = body?.assetId ?? body?.id;
    const assetId =
      typeof rawAssetId === 'string' || typeof rawAssetId === 'number'
        ? String(rawAssetId).match(/\d{4,15}/)?.[0] || ''
        : '';
    if (!assetId) {
      sendJson(res, { ok: false, error: 'Invalid assetId' }, 400);
      return;
    }

    try {
      let pngBuf: Buffer | null = null;

      if (typeof body?.pngBase64 === 'string' && body.pngBase64.length > 16) {
        if (body.pngBase64.length > 320_000) {
          sendJson(res, { ok: false, error: 'PNG payload too large' }, 400);
          return;
        }
        const raw = Buffer.from(body.pngBase64, 'base64');
        const isPng =
          raw.length >= 8 &&
          raw[0] === 0x89 &&
          raw[1] === 0x50 &&
          raw[2] === 0x4e &&
          raw[3] === 0x47 &&
          raw[4] === 0x0d &&
          raw[5] === 0x0a &&
          raw[6] === 0x1a &&
          raw[7] === 0x0a;
        if (!isPng) {
          sendJson(res, { ok: false, error: 'Invalid PNG header' }, 400);
          return;
        }
        pngBuf = raw;
      } else if (typeof body?.data === 'string' && body.data.length > 0) {
        if (body.data.length > 380_000) {
          sendJson(res, { ok: false, error: 'Raw pixel payload too large' }, 400);
          return;
        }
        const width = Math.floor(Number(body.width) || 0);
        const height = Math.floor(Number(body.height) || 0);
        const channels = Number(body.channels) === 4 ? 4 : 3;
        if (width < 1 || height < 1 || width > 256 || height > 256) {
          sendJson(res, { ok: false, error: 'Invalid dimensions (1..256)' }, 400);
          return;
        }
        const rawPixels = Buffer.from(body.data, 'base64');
        pngBuf = encodeRawPixelsToPng(width, height, channels, rawPixels);
      }

      if (!pngBuf || pngBuf.length < 32 || pngBuf.length > 220_000) {
        sendJson(res, { ok: false, error: 'Invalid or oversized image payload' }, 400);
        return;
      }

      const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 64) : undefined;
      await saveUploadedAssetPng(assetId, pngBuf, label);
      sendJson(res, {
        ok: true,
        assetId,
        bytes: pngBuf.length,
        url: `/api/asset-image?id=${assetId}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Encoding failed';
      sendJson(res, { ok: false, error: msg }, 400);
    }
    return;
  }

  // Same-origin Roblox asset thumbnail proxy (Priority 1: real in-game uploaded PNG -> Priority 2: public Roblox thumb)
  if (req.method === 'GET' && pathname === '/api/asset-image') {
    const rawId = (parsedUrl.searchParams.get('id') || '').trim();
    if (!/^\d{4,15}$/.test(rawId)) {
      res.writeHead(400, CORS_HEADERS);
      res.end('Invalid Roblox asset ID');
      return;
    }
    const uploaded = await getUploadedAssetPng(rawId);
    if (uploaded) {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        ...CORS_HEADERS,
      });
      res.end(uploaded);
      return;
    }
    try {
      const imageUrl = await resolveRobloxAssetThumb(rawId);
      if (!imageUrl || !ALLOWED_RBX_CDN_RE.test(imageUrl) || BLOCKED_RBX_PLACEHOLDER_RE.test(imageUrl)) {
        res.writeHead(404, { 'Cache-Control': 'no-store', ...CORS_HEADERS });
        res.end();
        return;
      }
      const upstream = await fetch(imageUrl);
      if (!upstream.ok) {
        res.writeHead(upstream.status, CORS_HEADERS);
        res.end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': upstream.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        ...CORS_HEADERS,
      });
      res.end(buf);
    } catch {
      res.writeHead(502, CORS_HEADERS);
      res.end();
    }
    return;
  }

  // Same-origin Anime Adventures artwork proxy (1: real in-game uploaded PNG -> 2: public Roblox thumb -> 3: official AA Wiki)
  if (req.method === 'GET' && pathname === '/api/aa-image') {
    const rawKind = (parsedUrl.searchParams.get('kind') || 'item').trim().toLowerCase();
    const kind: AaImageKind =
      rawKind === 'stage' || rawKind === 'unit' || rawKind === 'currency' || rawKind === 'item'
        ? rawKind
        : 'item';
    const name = (parsedUrl.searchParams.get('name') || '').trim().slice(0, 96);
    const id = (parsedUrl.searchParams.get('id') || '').trim().slice(0, 64);
    const world = (parsedUrl.searchParams.get('world') || '').trim().slice(0, 64);
    const map = (parsedUrl.searchParams.get('map') || '').trim().slice(0, 64);
    const assetId = (parsedUrl.searchParams.get('assetId') || '').trim().slice(0, 24);

    if (!name && !id && !world && !map && !assetId) {
      res.writeHead(400, CORS_HEADERS);
      res.end('Missing image query');
      return;
    }

    // Priority #1: Real in-game texture captured & uploaded by the Lua script!
    const cleanId = assetId.match(/\d{4,15}/)?.[0] || '';
    if (cleanId) {
      const uploaded = await getUploadedAssetPng(cleanId);
      if (uploaded) {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
          ...CORS_HEADERS,
        });
        res.end(uploaded);
        return;
      }
    }

    try {
      const imageUrl = await resolveAaImageUrl({ kind, name, id, world, map, assetId });
      if (!imageUrl || !isAllowedAaImageUrl(imageUrl)) {
        res.writeHead(404, {
          'Cache-Control': cleanId ? 'no-store' : 'public, max-age=1800',
          ...CORS_HEADERS,
        });
        res.end();
        return;
      }
      const upstream = await fetch(imageUrl, { headers: { 'User-Agent': 'AAVault/2.6' } });
      if (!upstream.ok) {
        res.writeHead(404, { 'Cache-Control': 'public, max-age=600', ...CORS_HEADERS });
        res.end();
        return;
      }
      const ct = upstream.headers.get('content-type') || 'image/png';
      if (!/^image\//i.test(ct) || /svg/i.test(ct)) {
        res.writeHead(404, CORS_HEADERS);
        res.end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        ...CORS_HEADERS,
      });
      res.end(buf);
    } catch {
      res.writeHead(502, CORS_HEADERS);
      res.end();
    }
    return;
  }

  // Detect persistent Vercel storage (Upstash Redis / direct Cloudflare KV REST) FIRST.
  // If Upstash Redis is connected on Vercel, always use it directly instead of forwarding
  // to a legacy CLOUDFLARE_WORKER_URL (which can hit Cloudflare KV free 1,000 writes/day Error 1101).
  const provider = detectProvider();
  const workerProxyBase = (
    process.env.CLOUDFLARE_WORKER_URL || process.env.VITE_CLOUDFLARE_WORKER_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');

  // Helper: best-effort one-time migration from legacy Cloudflare Worker into Upstash Redis
  async function loadRoomWithMigration(syncKey: string): Promise<Record<string, AccountSnapshot>> {
    const existingRoom = await storeGet<Record<string, AccountSnapshot>>(`room:${syncKey}`);
    if (existingRoom && typeof existingRoom === 'object') {
      return existingRoom;
    }
    if (provider.persistent && workerProxyBase && syncKey) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(
          `${workerProxyBase}/api/accounts?key=${encodeURIComponent(syncKey)}`,
          { signal: controller.signal }
        );
        clearTimeout(timer);
        if (res.ok) {
          const data = (await res.json()) as { accounts?: AccountSnapshot[] };
          if (Array.isArray(data?.accounts) && data.accounts.length > 0) {
            const migrated: Record<string, AccountSnapshot> = {};
            for (const acc of data.accounts) {
              if (acc && acc.accountId) {
                migrated[acc.accountId] = acc;
              }
            }
            if (Object.keys(migrated).length > 0) {
              await storePut(`room:${syncKey}`, migrated).catch(() => {});
              return migrated;
            }
          }
        }
      } catch {
        // Legacy worker unreachable or timed out — start fresh in Upstash Redis
      }
    }
    return {};
  }

  // Fallback transparent proxy to Cloudflare Worker ONLY when no persistent storage is configured on Vercel
  if (!provider.persistent && workerProxyBase) {
    try {
      const fwdParams = new URLSearchParams(parsedUrl.searchParams);
      fwdParams.delete('__path');
      const fwdSearch = fwdParams.toString();
      const targetUrl = `${workerProxyBase}${pathname}${fwdSearch ? `?${fwdSearch}` : ''}`;
      const bodyText =
        req.method !== 'GET' && req.method !== 'HEAD' ? await readBodyText(req) : undefined;
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers: bodyText ? { 'Content-Type': 'application/json' } : undefined,
        body: bodyText || undefined,
      });
      const text = await upstream.text();
      const contentType = upstream.headers.get('content-type') || '';

      // Detect Cloudflare Worker runtime crash (Error 1101 — commonly KV free 1,000 writes/day limit)
      if (
        upstream.status >= 500 &&
        (contentType.includes('text/html') ||
          text.includes('Error 1101') ||
          text.includes('Worker threw exception'))
      ) {
        sendJson(
          res,
          {
            ok: false,
            error:
              'Cloudflare Worker Error 1101 (เต็มโควต้าเขียน 1,000 ครั้ง/วันของ Cloudflare KV ฟรี) — แนะนำเชื่อมต่อ Upstash Redis ใน Vercel Storage แล้วกด Redeploy หรือลบตัวแปร CLOUDFLARE_WORKER_URL',
            provider: 'cloudflare-worker',
            upstreamStatus: upstream.status,
          },
          503
        );
        return;
      }

      if (
        req.method === 'GET' &&
        (pathname === '/api' || pathname === '/api/index' || pathname === '/api/health') &&
        upstream.ok
      ) {
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          sendJson(res, {
            ...parsed,
            latestScriptVersion: SCRIPT_VERSION,
            scriptUpdatedAt: SCRIPT_UPDATED_AT,
            redisConfigured: false,
            legacyWorkerProxy: true,
          });
          return;
        } catch {
          // fall through to raw pass-through
        }
      }

      res.writeHead(upstream.status, {
        'Content-Type': contentType || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      });
      res.end(text);
    } catch {
      sendJson(res, { error: 'ไม่สามารถเชื่อมต่อไปยัง Cloudflare Worker ปลายทางได้' }, 502);
    }
    return;
  }

  try {
    if (
      req.method === 'GET' &&
      (pathname === '/api' || pathname === '/api/index' || pathname === '/api/health')
    ) {
      sendJson(res, {
        ok: true,
        serverless: true,
        provider: provider.name,
        persistent: provider.persistent,
        kvBound: provider.persistent,
        redisConfigured: Boolean(getRedisConfig()),
        legacyWorkerEnvPresent: Boolean(workerProxyBase),
        latestScriptVersion: SCRIPT_VERSION,
        scriptUpdatedAt: SCRIPT_UPDATED_AT,
        timestamp: Date.now(),
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/accounts') {
      const syncKey = sanitizeKey(parsedUrl.searchParams.get('key'));
      const room = await loadRoomWithMigration(syncKey);
      const accounts = Object.values(room)
        .map((acc) => {
          const pruned = pruneRewardsToMaxRuns(acc.rewards || [], MAX_DROP_HISTORY_RUNS);
          if (pruned.length !== (acc.rewards?.length ?? 0)) {
            return { ...acc, rewards: pruned, totals: recomputeTotals(pruned) };
          }
          return acc;
        })
        .sort((a, b) => b.lastSyncedAt - a.lastSyncedAt);
      sendJson(res, {
        syncKey,
        accounts,
        provider: provider.name,
        latestScriptVersion: SCRIPT_VERSION,
        scriptUpdatedAt: SCRIPT_UPDATED_AT,
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/sync') {
      const rawBody = (await readBodyText(req)).trim().replace(/^AAVAULT_SYNC::/, '');
      let body: SyncPayload;
      try {
        body = JSON.parse(rawBody) as SyncPayload;
      } catch {
        sendJson(res, { error: 'Invalid JSON body' }, 400);
        return;
      }
      const syncKey = sanitizeKey(body?.syncKey || parsedUrl.searchParams.get('key'));
      if (!body?.username || typeof body.username !== 'string') {
        sendJson(res, { error: 'Missing username' }, 400);
        return;
      }

      const room = await loadRoomWithMigration(syncKey);
      const accountId =
        body.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'player';
      const existing = room[accountId];
      const prevSigs = new Set(
        (existing?.rewards || []).map(
          (r) => `${r.runId || r.t}|${r.kind}|${r.id}|${r.tier || ''}|${r.qty}|${r.src}`
        )
      );

      const updated = buildSnapshot(body, existing);
      const newRewardsCount = updated.rewards.filter(
        (r) => !prevSigs.has(`${r.runId || r.t}|${r.kind}|${r.id}|${r.tier || ''}|${r.qty}|${r.src}`)
      ).length;
      const minWriteGapMs = Math.min(25_000, Math.floor((updated.syncIntervalSec || 120) * 500));
      const unchangedData =
        Boolean(existing) &&
        newRewardsCount === 0 &&
        Boolean(existing!.disconnected) === Boolean(updated.disconnected) &&
        (existing!.disconnectInfo?.message || '') === (updated.disconnectInfo?.message || '') &&
        existing!.rewards.length === updated.rewards.length &&
        existing!.gold === updated.gold &&
        existing!.gems === updated.gems &&
        existing!.level === updated.level &&
        existing!.uniqueCount === updated.uniqueCount &&
        existing!.normalKindCount === updated.normalKindCount &&
        existing!.inventory.length === updated.inventory.length &&
        existing!.equipped.length === updated.equipped.length &&
        existing!.scriptVersion === updated.scriptVersion &&
        existing!.syncIntervalSec === updated.syncIntervalSec &&
        existing!.currentStage?.name === updated.currentStage?.name &&
        existing!.currentStage?.inLobby === updated.currentStage?.inLobby &&
        updated.lastSyncedAt - existing!.lastSyncedAt < minWriteGapMs;

      if (!unchangedData) {
        room[updated.accountId] = updated;
        await storePut(`room:${syncKey}`, room);
      }

      sendJson(res, {
        ok: true,
        provider: provider.name,
        syncKey,
        accountId: updated.accountId,
        lastSyncedAt: unchangedData ? existing!.lastSyncedAt : updated.lastSyncedAt,
        newRewardsCount,
        skippedWrite: unchangedData,
        latestScriptVersion: SCRIPT_VERSION,
        scriptUpdatedAt: SCRIPT_UPDATED_AT,
        updateAvailable: updated.scriptVersion !== SCRIPT_VERSION,
      });
      return;
    }

    const clearMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/clear-drops$/);
    if (req.method === 'POST' && clearMatch) {
      const accountId = decodeURIComponent(clearMatch[1]);
      const syncKey = sanitizeKey(parsedUrl.searchParams.get('key'));
      const room = await loadRoomWithMigration(syncKey);
      if (!room[accountId]) {
        sendJson(res, { error: 'Account not found' }, 404);
        return;
      }
      room[accountId].rewards = [];
      room[accountId].totals = {};
      await storePut(`room:${syncKey}`, room);
      sendJson(res, { ok: true, account: room[accountId] });
      return;
    }

    const delMatch = pathname.match(/^\/api\/accounts\/([^/]+)$/);
    if (req.method === 'DELETE' && delMatch) {
      const accountId = decodeURIComponent(delMatch[1]);
      const syncKey = sanitizeKey(parsedUrl.searchParams.get('key'));
      const room = await loadRoomWithMigration(syncKey);
      if (room[accountId]) {
        delete room[accountId];
        await storePut(`room:${syncKey}`, room);
      }
      sendJson(res, { ok: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/share') {
      const rawBody = await readBodyText(req);
      let body: { syncKey?: string; accountId?: string };
      try {
        body = JSON.parse(rawBody) as { syncKey?: string; accountId?: string };
      } catch {
        sendJson(res, { error: 'Invalid JSON body' }, 400);
        return;
      }
      const syncKey = sanitizeKey(body?.syncKey);
      const accountId = String(body?.accountId || '');
      const room = await loadRoomWithMigration(syncKey);
      const account = room[accountId];
      if (!account) {
        sendJson(res, { error: 'ไม่พบข้อมูลบัญชีที่ต้องการแชร์' }, 404);
        return;
      }
      const shareId = crypto.randomBytes(5).toString('hex');
      const record: ShareRecord = { shareId, createdAt: Date.now(), account };
      await storePut(`share:${shareId}`, record);
      sendJson(res, { ok: true, shareId, createdAt: record.createdAt });
      return;
    }

    const shareMatch = pathname.match(/^\/api\/share\/([^/]+)$/);
    if (req.method === 'GET' && shareMatch) {
      const shareId = decodeURIComponent(shareMatch[1]);
      const record = await storeGet<ShareRecord>(`share:${shareId}`);
      if (!record) {
        sendJson(res, { error: 'ไม่พบลิ้งค์เช็คของนี้ หรือลิ้งค์หมดอายุแล้ว' }, 404);
        return;
      }
      sendJson(res, record);
      return;
    }

    sendJson(res, { error: 'Not Found' }, 404);
  } catch (err) {
    console.error('Vercel API error:', err);
    const detail = err instanceof Error ? err.message : 'Unknown error';
    sendJson(
      res,
      {
        error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์',
        provider: provider.name,
        detail,
      },
      500
    );
  }
}
