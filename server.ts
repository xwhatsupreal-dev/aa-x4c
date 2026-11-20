import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { formatClock, normalizeRarity } from './src/data/aaCatalog.ts';
import type {
  AccountSnapshot,
  InventoryItem,
  RewardEntry,
  RewardTotal,
  ShareRecord,
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
          kind: it.kind === 'unique' ? 'unique' : 'normal',
        }))
        .filter((it) => it.qty > 0)
    : existing?.inventory ?? [];

  const incomingRewards: RewardEntry[] = Array.isArray(payload.rewards)
    ? payload.rewards
        .filter((r) => r && r.id)
        .map((r): RewardEntry => {
          const ts = typeof r.ts === 'number' && r.ts > 0 ? r.ts : now;
          return {
            t: r.t || formatClock(ts),
            ts,
            kind: r.kind === 'unit' ? 'unit' : 'item',
            id: String(r.id),
            name: String(r.name || r.id),
            rarity: normalizeRarity(r.rarity),
            qty: Math.max(1, Number(r.qty) || 1),
            src: String(r.src || 'sync'),
          };
        })
    : [];

  const mergedRewards: RewardEntry[] = existing ? [...existing.rewards] : [];
  const seenSig = new Set(mergedRewards.map((r) => `${r.t}|${r.kind}|${r.id}|${r.qty}|${r.src}`));
  const newlyAdded: RewardEntry[] = [];

  for (const r of incomingRewards) {
    const sig = `${r.t}|${r.kind}|${r.id}|${r.qty}|${r.src}`;
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
      };
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

  return {
    accountId,
    username,
    displayName: String(payload.displayName || existing?.displayName || username),
    userId: typeof payload.userId === 'number' ? payload.userId : existing?.userId,
    gold: typeof payload.gold === 'number' ? payload.gold : existing?.gold ?? 0,
    gems: typeof payload.gems === 'number' ? payload.gems : existing?.gems ?? 0,
    level: typeof payload.level === 'number' ? payload.level : existing?.level,
    equipped,
    inventory,
    rewards: finalRewards,
    totals,
    uniqueCount,
    normalKindCount,
    lastSyncedAt: now,
    source: 'lua',
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // Allow cross-origin POST from Roblox executors
  app.use('/api', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  app.options('/api/{*splat}', (_req, res) => {
    res.sendStatus(204);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, serverless: false, provider: 'express', timestamp: Date.now() });
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
    res.json({ syncKey, accounts });
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
    const body = req.body as SyncPayload;
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AA Vault server running on http://localhost:${PORT}`);
  });
}

startServer();
