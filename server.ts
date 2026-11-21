import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  formatClock,
  normalizeRarity,
  SCRIPT_UPDATED_AT,
  SCRIPT_VERSION,
} from './src/data/aaCatalog.ts';
import { generateWebSyncLuaScript } from './src/utils/luaGenerator.ts';
import {
  isAllowedAaImageUrl,
  resolveAaImageUrl,
  type AaImageKind,
} from './src/utils/aaImageResolver.ts';
import {
  fetchRobloxAvatarInfo,
  isAllowedRobloxCdnUrl,
  isBlockedRobloxPlaceholderUrl,
  resolveRobloxAssetImageUrl,
} from './src/utils/robloxAvatar.ts';
import type {
  AccountSnapshot,
  ExtraStats,
  InventoryItem,
  RewardEntry,
  RewardTotal,
  ShareRecord,
  StageInfo,
  SyncPayload,
  TeamUnit,
} from './src/types.ts';

interface VaultStore {
  rooms: Record<string, Record<string, AccountSnapshot>>;
  shares: Record<string, ShareRecord>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'vault-store.json');

function loadStore(): VaultStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as VaultStore;
      if (parsed && typeof parsed.rooms === 'object' && typeof parsed.shares === 'object') {
        // Strip any legacy demo room if present
        delete parsed.rooms['demo-aa-2k'];
        return parsed;
      }
    }
  } catch {
    // Fall back to clean empty store
  }
  return {
    rooms: {},
    shares: {},
  };
}

let store: VaultStore = loadStore();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist vault store:', err);
    }
  }, 300);
}

// SSE client registry by syncKey
const sseClients = new Map<string, Set<Response>>();

function broadcastRoomUpdate(syncKey: string, eventType: string, data: unknown) {
  const clients = sseClients.get(syncKey);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function sanitizeKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
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

function sanitizeExtraStats(raw: unknown, fallback?: ExtraStats): ExtraStats | undefined {
  if (!raw || typeof raw !== 'object') return fallback;
  const s = raw as Record<string, unknown>;
  return {
    playerXp: optNum(s.playerXp),
    resource: optNum(s.resource),
    trophies: optNum(s.trophies),
    rebirthTokens: optNum(s.rebirthTokens),
    behelitXp: optNum(s.behelitXp),
    curseTokens: optNum(s.curseTokens),
    traitTokens: optNum(s.traitTokens),
  };
}

function buildSnapshotFromPayload(payload: SyncPayload, existing?: AccountSnapshot): AccountSnapshot {
  const username = String(payload.username || 'UnknownPlayer').trim().slice(0, 64);
  const accountId = username.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'player';
  const now = Date.now();

  const equipped: TeamUnit[] = Array.isArray(payload.equipped)
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
    : existing?.equipped ?? [];

  const inventory: InventoryItem[] = Array.isArray(payload.inventory)
    ? payload.inventory
        .filter((it) => it && it.id)
        .map((it): InventoryItem => ({
          id: String(it.id),
          name: String(it.name || it.id),
          rarity: normalizeRarity(it.rarity),
          group: String(it.group || 'Other'),
          qty: Math.max(0, Number(it.qty) || 0),
          kind: it.kind === 'unique' ? 'unique' : it.kind === 'unit' ? 'unit' : 'normal',
          iconId: cleanAssetId(it.iconId),
        }))
        .filter((it) => it.qty > 0)
    : existing?.inventory ?? [];

  const incomingRewards: RewardEntry[] = Array.isArray(payload.rewards)
    ? payload.rewards
        .filter((r) => r && r.id)
        .map((r): RewardEntry => {
          const hasTs = typeof r.ts === 'number' && r.ts > 0;
          const ts = hasTs ? r.ts! : now;
          return {
            t: hasTs ? formatClock(ts) : r.t || formatClock(ts),
            ts,
            kind: r.kind === 'unit' ? 'unit' : r.kind === 'currency' ? 'currency' : 'item',
            id: String(r.id),
            name: String(r.name || r.id),
            rarity: normalizeRarity(r.rarity),
            qty: Math.max(1, Number(r.qty) || 1),
            src: String(r.src || 'sync'),
            iconId: cleanAssetId(r.iconId),
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

  const mergedRewards: RewardEntry[] = existing ? [...existing.rewards] : [];
  const rewardSig = (r: RewardEntry) => `${r.runId || r.t}|${r.kind}|${r.id}|${r.qty}|${r.src}`;
  const seenSig = new Set(mergedRewards.map(rewardSig));
  const newlyAdded: RewardEntry[] = [];

  for (const r of incomingRewards) {
    const sig = rewardSig(r);
    if (!seenSig.has(sig)) {
      seenSig.add(sig);
      newlyAdded.push(r);
    }
  }

  const finalRewards = [...newlyAdded, ...mergedRewards]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 200);

  const totals: Record<string, RewardTotal> = {};
  for (const r of finalRewards) {
    const key = `${r.kind}|${r.id}`;
    if (!totals[key]) {
      totals[key] = {
        kind: r.kind,
        id: r.id,
        name: r.name,
        rarity: r.rarity,
        qty: 0,
        iconId: r.iconId,
      };
    } else if (!totals[key].iconId && r.iconId) {
      totals[key].iconId = r.iconId;
    }
    totals[key].qty += r.qty;
  }

  const uniqueCount =
    typeof payload.uniqueCount === 'number'
      ? payload.uniqueCount
      : inventory.filter((i) => i.kind === 'unique').reduce((sum, i) => sum + i.qty, 0);

  const normalKindCount =
    typeof payload.normalKindCount === 'number'
      ? payload.normalKindCount
      : inventory.filter((i) => i.kind === 'normal').length;

  const ownedUnitsCount =
    typeof payload.ownedUnitsCount === 'number'
      ? Math.max(0, Math.floor(payload.ownedUnitsCount))
      : inventory.filter((i) => i.kind === 'unit').reduce((sum, i) => sum + i.qty, 0) ||
        existing?.ownedUnitsCount;

  return {
    accountId,
    username,
    displayName: String(payload.displayName || existing?.displayName || username),
    userId: typeof payload.userId === 'number' ? payload.userId : existing?.userId,
    avatar: payload.avatar ?? existing?.avatar,
    gold: typeof payload.gold === 'number' ? payload.gold : existing?.gold ?? 0,
    gems: typeof payload.gems === 'number' ? payload.gems : existing?.gems ?? 0,
    level: typeof payload.level === 'number' ? payload.level : existing?.level,
    extraStats: sanitizeExtraStats(payload.extraStats, existing?.extraStats),
    currentStage: sanitizeStage(payload.currentStage, existing?.currentStage),
    equipped,
    inventory,
    rewards: finalRewards,
    totals,
    uniqueCount,
    normalKindCount,
    ownedUnitsCount,
    lastSyncedAt: now,
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb', type: ['application/json', 'application/*+json'] }));
  app.use(express.text({ limit: '5mb', type: ['text/plain', 'application/x-www-form-urlencoded', '*/*'] }));

  // Allow cross-origin POST from Roblox executors
  app.use('/api', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  app.options(/^\/api\/.*/, (_req, res) => {
    res.sendStatus(204);
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      serverless: false,
      provider: 'express',
      latestScriptVersion: SCRIPT_VERSION,
      scriptUpdatedAt: SCRIPT_UPDATED_AT,
      timestamp: Date.now(),
    });
  });

  // Resolve real Roblox character avatar + bodyColors + rig + assets (supports userId OR username)
  app.get(['/api/avatar', '/api/avatar/:userId'], async (req, res) => {
    const rawUserId =
      typeof req.params.userId === 'string' && req.params.userId
        ? req.params.userId
        : typeof req.query.userId === 'string'
          ? req.query.userId
          : '';
    const rawUsername = typeof req.query.username === 'string' ? req.query.username : '';
    const info = await fetchRobloxAvatarInfo(rawUserId, rawUsername);
    const proxyImageUrl = info.imageUrl
      ? `/api/avatar-image?url=${encodeURIComponent(info.imageUrl)}`
      : null;
    const proxyHeadshotUrl = info.headshotUrl
      ? `/api/avatar-image?url=${encodeURIComponent(info.headshotUrl)}`
      : null;
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.json({
      ...info,
      proxyImageUrl,
      proxyHeadshotUrl,
    });
  });

  // Same-origin PNG proxy strictly restricted to official Roblox CDN hosts (*.rbxcdn.com)
  app.get('/api/avatar-image', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl || !isAllowedRobloxCdnUrl(rawUrl)) {
      res.status(400).end('Invalid Roblox CDN URL');
      return;
    }
    try {
      const upstream = await fetch(rawUrl);
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  });

  // Same-origin Roblox asset thumbnail proxy (rejects private Roblox blocked placeholders)
  app.get('/api/asset-image', async (req, res) => {
    const rawId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    if (!/^\d{4,15}$/.test(rawId)) {
      res.status(400).end('Invalid Roblox asset ID');
      return;
    }
    try {
      const imageUrl = await resolveRobloxAssetImageUrl(rawId);
      if (!imageUrl || !isAllowedRobloxCdnUrl(imageUrl) || isBlockedRobloxPlaceholderUrl(imageUrl)) {
        res.setHeader('Cache-Control', 'public, max-age=1800');
        res.status(404).end();
        return;
      }
      const upstream = await fetch(imageUrl);
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  });

  // Same-origin Anime Adventures artwork proxy (public Roblox thumb -> official AA Wiki artwork)
  app.get('/api/aa-image', async (req, res) => {
    const rawKind = typeof req.query.kind === 'string' ? req.query.kind.trim().toLowerCase() : 'item';
    const kind: AaImageKind =
      rawKind === 'stage' || rawKind === 'unit' || rawKind === 'currency' || rawKind === 'item'
        ? rawKind
        : 'item';
    const name = typeof req.query.name === 'string' ? req.query.name.trim().slice(0, 96) : '';
    const id = typeof req.query.id === 'string' ? req.query.id.trim().slice(0, 64) : '';
    const world = typeof req.query.world === 'string' ? req.query.world.trim().slice(0, 64) : '';
    const map = typeof req.query.map === 'string' ? req.query.map.trim().slice(0, 64) : '';
    const assetId = typeof req.query.assetId === 'string' ? req.query.assetId.trim().slice(0, 24) : '';

    if (!name && !id && !world && !map && !assetId) {
      res.status(400).end('Missing image query');
      return;
    }

    try {
      const imageUrl = await resolveAaImageUrl({ kind, name, id, world, map, assetId });
      if (!imageUrl || !isAllowedAaImageUrl(imageUrl)) {
        res.setHeader('Cache-Control', 'public, max-age=1800');
        res.status(404).end();
        return;
      }
      const upstream = await fetch(imageUrl, {
        headers: { 'User-Agent': 'AAVault/2.5' },
      });
      if (!upstream.ok) {
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.status(404).end();
        return;
      }
      const ct = upstream.headers.get('content-type') || 'image/png';
      if (!/^image\//i.test(ct) || /svg/i.test(ct)) {
        res.status(404).end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  });

  // Raw Lua loader endpoint so Roblox executors can run a 1-line loadstring(game:HttpGet(...))()
  app.get(['/api/script', '/api/script.lua'], (req, res) => {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
      .split(',')[0]
      .trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim();
    const origin = host ? `${proto}://${host}` : '';
    const syncKey = sanitizeKey(req.query.key) || 'main';
    const rawInterval = Number(req.query.interval);
    const intervalSec = Number.isFinite(rawInterval)
      ? Math.min(600, Math.max(5, Math.round(rawInterval)))
      : 120;
    const showGui = req.query.gui !== '0' && req.query.gui !== 'false';
    const rawEndpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint.trim() : '';
    const safeEndpoint =
      /^https?:\/\/[^\s"'\\]+$/.test(rawEndpoint) ? rawEndpoint : `${origin}/api/sync`;

    const script = generateWebSyncLuaScript(safeEndpoint, syncKey, intervalSec, showGui);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(script);
  });

  // List synced accounts for a specific Sync Key
  app.get('/api/accounts', (req, res) => {
    const syncKey = sanitizeKey(req.query.key);
    if (!syncKey) {
      res.json({ syncKey: '', accounts: [] });
      return;
    }
    const room = store.rooms[syncKey] || {};
    const accounts = Object.values(room).sort((a, b) => b.lastSyncedAt - a.lastSyncedAt);
    res.json({
      syncKey,
      accounts,
      latestScriptVersion: SCRIPT_VERSION,
      scriptUpdatedAt: SCRIPT_UPDATED_AT,
    });
  });

  // Live SSE endpoint for real-time updates when Roblox Lua posts to /api/sync
  app.get('/api/events', (req, res) => {
    const syncKey = sanitizeKey(req.query.key);
    if (!syncKey) {
      res.status(400).end();
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ syncKey, ts: Date.now() })}\n\n`);

    let set = sseClients.get(syncKey);
    if (!set) {
      set = new Set();
      sseClients.set(syncKey, set);
    }
    set.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      set?.delete(res);
    });
  });

  // Primary endpoint called directly by the running Roblox Lua script
  app.post('/api/sync', (req, res) => {
    let body: SyncPayload | null = null;
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body.replace(/^AAVAULT_SYNC::/, '')) as SyncPayload;
      } catch {
        res.status(400).json({ error: 'Invalid JSON payload' });
        return;
      }
    } else if (req.body && typeof req.body === 'object') {
      body = req.body as SyncPayload;
    }

    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid JSON payload' });
      return;
    }

    const syncKey = sanitizeKey(body.syncKey || req.query.key);
    if (!syncKey) {
      res.status(400).json({ error: 'Missing syncKey' });
      return;
    }
    if (!body.username || typeof body.username !== 'string') {
      res.status(400).json({ error: 'Missing username' });
      return;
    }

    if (!store.rooms[syncKey]) {
      store.rooms[syncKey] = {};
    }

    const tempUsername = body.username.trim();
    const accountId = tempUsername.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'player';
    const existing = store.rooms[syncKey][accountId];
    const prevRewardCount = existing?.rewards.length ?? 0;

    const updated = buildSnapshotFromPayload(body, existing);
    store.rooms[syncKey][updated.accountId] = updated;
    schedulePersist();

    const addedRewards =
      updated.rewards.length > prevRewardCount
        ? updated.rewards.slice(0, updated.rewards.length - prevRewardCount)
        : [];

    broadcastRoomUpdate(syncKey, 'sync', {
      account: updated,
      newRewards: addedRewards,
    });

    res.json({
      ok: true,
      syncKey,
      accountId: updated.accountId,
      lastSyncedAt: updated.lastSyncedAt,
      newRewardsCount: addedRewards.length,
      latestScriptVersion: SCRIPT_VERSION,
      scriptUpdatedAt: SCRIPT_UPDATED_AT,
      updateAvailable: updated.scriptVersion !== SCRIPT_VERSION,
    });
  });

  // Clear reward drop history for an account
  app.post('/api/accounts/:accountId/clear-drops', (req, res) => {
    const syncKey = sanitizeKey(req.query.key || req.body?.syncKey);
    const { accountId } = req.params;
    const room = store.rooms[syncKey];
    if (!room || !room[accountId]) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    room[accountId].rewards = [];
    room[accountId].totals = {};
    schedulePersist();

    broadcastRoomUpdate(syncKey, 'sync', {
      account: room[accountId],
      newRewards: [],
    });

    res.json({ ok: true, account: room[accountId] });
  });

  // Delete an account from room
  app.delete('/api/accounts/:accountId', (req, res) => {
    const syncKey = sanitizeKey(req.query.key);
    const { accountId } = req.params;
    const room = store.rooms[syncKey];
    if (room && room[accountId]) {
      delete room[accountId];
      schedulePersist();
      broadcastRoomUpdate(syncKey, 'delete', { accountId });
    }
    res.json({ ok: true });
  });

  // Create read-only share snapshot link
  app.post('/api/share', (req, res) => {
    const syncKey = sanitizeKey(req.body?.syncKey);
    const accountId = String(req.body?.accountId || '');
    const account = store.rooms[syncKey]?.[accountId];
    if (!account) {
      res.status(404).json({ error: 'ไม่พบข้อมูลบัญชีที่ต้องการแชร์' });
      return;
    }
    const shareId = crypto.randomBytes(5).toString('hex');
    const record: ShareRecord = {
      shareId,
      createdAt: Date.now(),
      account: JSON.parse(JSON.stringify(account)) as AccountSnapshot,
    };
    store.shares[shareId] = record;
    schedulePersist();
    res.json({ ok: true, shareId, createdAt: record.createdAt });
  });

  // Fetch read-only shared snapshot
  app.get('/api/share/:shareId', (req, res) => {
    const share = store.shares[req.params.shareId];
    if (!share) {
      res.status(404).json({ error: 'ไม่พบลิ้งค์เช็คของนี้ หรือลิ้งค์หมดอายุแล้ว' });
      return;
    }
    res.json(share);
  });

  let viteServer: Awaited<ReturnType<typeof createViteServer>> | null = null;

  if (process.env.NODE_ENV !== 'production') {
    viteServer = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`AA Vault server running on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    if (viteServer) {
      await viteServer.close().catch(() => {});
    }
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start AA Vault server:', err);
  process.exit(1);
});
