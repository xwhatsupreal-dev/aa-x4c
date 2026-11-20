import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { formatClock, normalizeRarity } from '../src/data/aaCatalog.ts';
import type {
  AccountSnapshot,
  InventoryItem,
  RewardEntry,
  RewardTotal,
  ShareRecord,
  SyncPayload,
  TeamUnit,
} from '../src/types.ts';

type Req = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Warm-instance fallback store when neither Cloudflare Worker nor Cloudflare KV REST env vars are configured
const memoryRooms: Record<string, Record<string, AccountSnapshot>> = {};
const memoryShares: Record<string, ShareRecord> = {};

function sendJson(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(data));
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

function buildSnapshot(payload: SyncPayload, existing?: AccountSnapshot): AccountSnapshot {
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
  const seenSig = new Set(
    mergedRewards.map((r) => `${r.t}|${r.kind}|${r.id}|${r.qty}|${r.src}`)
  );
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

async function readBodyText(req: Req): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// Direct Cloudflare KV REST API adapter (when CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_KV_NAMESPACE_ID + CLOUDFLARE_API_TOKEN are set on Vercel)
function getCfKvConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (accountId && namespaceId && apiToken) {
    return { accountId, namespaceId, apiToken };
  }
  return null;
}

async function kvGet<T>(key: string): Promise<T | null> {
  const cf = getCfKvConfig();
  if (!cf) {
    if (key.startsWith('room:')) {
      return (memoryRooms[key.slice(5)] as unknown as T) ?? null;
    }
    if (key.startsWith('share:')) {
      return (memoryShares[key.slice(6)] as unknown as T) ?? null;
    }
    return null;
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${cf.accountId}/storage/kv/namespaces/${cf.namespaceId}/values/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cf.apiToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Cloudflare KV GET failed: ${res.status}`);
  return (await res.json()) as T;
}

async function kvPut(key: string, value: unknown): Promise<void> {
  const cf = getCfKvConfig();
  if (!cf) {
    if (key.startsWith('room:')) {
      memoryRooms[key.slice(5)] = value as Record<string, AccountSnapshot>;
    } else if (key.startsWith('share:')) {
      memoryShares[key.slice(6)] = value as ShareRecord;
    }
    return;
  }
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
}

export default async function handler(req: Req, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

  // Mode 1: Proxy to configured Cloudflare Worker URL if CLOUDFLARE_WORKER_URL env var is set on Vercel
  const workerProxyBase = (
    process.env.CLOUDFLARE_WORKER_URL || process.env.VITE_CLOUDFLARE_WORKER_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');

  if (workerProxyBase) {
    try {
      const targetUrl = `${workerProxyBase}${pathname}${parsedUrl.search}`;
      const bodyText =
        req.method !== 'GET' && req.method !== 'HEAD' ? await readBodyText(req) : undefined;
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers: bodyText ? { 'Content-Type': 'application/json' } : undefined,
        body: bodyText || undefined,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        ...CORS_HEADERS,
      });
      res.end(text);
    } catch {
      sendJson(res, { error: 'ไม่สามารถเชื่อมต่อไปยัง Cloudflare Worker ปลายทางได้' }, 502);
    }
    return;
  }

  const hasDirectCfKv = Boolean(getCfKvConfig());

  try {
    // GET /api/health
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, {
        ok: true,
        serverless: true,
        provider: hasDirectCfKv ? 'cloudflare-kv-vercel' : 'vercel-ephemeral',
        kvBound: hasDirectCfKv,
        timestamp: Date.now(),
      });
      return;
    }

    // GET /api/accounts?key=...
    if (req.method === 'GET' && pathname === '/api/accounts') {
      const syncKey = sanitizeKey(parsedUrl.searchParams.get('key'));
      if (!syncKey) {
        sendJson(res, { syncKey: '', accounts: [] });
        return;
      }
      const room = (await kvGet<Record<string, AccountSnapshot>>(`room:${syncKey}`)) || {};
      const accounts = Object.values(room).sort((a, b) => b.lastSyncedAt - a.lastSyncedAt);
      sendJson(res, { syncKey, accounts });
      return;
    }

    // POST /api/sync
    if (req.method === 'POST' && pathname === '/api/sync') {
      const rawBody = await readBodyText(req);
      let body: SyncPayload;
      try {
        body = JSON.parse(rawBody) as SyncPayload;
      } catch {
        sendJson(res, { error: 'Invalid JSON body' }, 400);
        return;
      }
      const syncKey = sanitizeKey(body?.syncKey || parsedUrl.searchParams.get('key'));
      if (!syncKey) {
        sendJson(res, { error: 'Missing syncKey' }, 400);
        return;
      }
      if (!body?.username || typeof body.username !== 'string') {
        sendJson(res, { error: 'Missing username' }, 400);
        return;
      }

      const room = (await kvGet<Record<string, AccountSnapshot>>(`room:${syncKey}`)) || {};
      const accountId =
        body.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'player';
      const existing = room[accountId];
      const prevCount = existing?.rewards.length ?? 0;

      const updated = buildSnapshot(body, existing);
      room[updated.accountId] = updated;
      await kvPut(`room:${syncKey}`, room);

      sendJson(res, {
        ok: true,
        provider: hasDirectCfKv ? 'cloudflare-kv-vercel' : 'vercel-ephemeral',
        syncKey,
        accountId: updated.accountId,
        lastSyncedAt: updated.lastSyncedAt,
        newRewardsCount: Math.max(0, updated.rewards.length - prevCount),
      });
      return;
    }

    // POST /api/accounts/:accountId/clear-drops
    const clearMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/clear-drops$/);
    if (req.method === 'POST' && clearMatch) {
      const accountId = decodeURIComponent(clearMatch[1]);
      const syncKey = sanitizeKey(parsedUrl.searchParams.get('key'));
      if (!syncKey) {
        sendJson(res, { error: 'Missing syncKey' }, 400);
        return;
      }
      const room = (await kvGet<Record<string, AccountSnapshot>>(`room:${syncKey}`)) || {};
      if (!room[accountId]) {
        sendJson(res, { error: 'Account not found' }, 404);
        return;
      }
      room[accountId].rewards = [];
      room[accountId].totals = {};
      await kvPut(`room:${syncKey}`, room);
      sendJson(res, { ok: true, account: room[accountId] });
      return;
    }

    // DELETE /api/accounts/:accountId
    const delMatch = pathname.match(/^\/api\/accounts\/([^/]+)$/);
    if (req.method === 'DELETE' && delMatch) {
      const accountId = decodeURIComponent(delMatch[1]);
      const syncKey = sanitizeKey(parsedUrl.searchParams.get('key'));
      if (!syncKey) {
        sendJson(res, { error: 'Missing syncKey' }, 400);
        return;
      }
      const room = (await kvGet<Record<string, AccountSnapshot>>(`room:${syncKey}`)) || {};
      if (room[accountId]) {
        delete room[accountId];
        await kvPut(`room:${syncKey}`, room);
      }
      sendJson(res, { ok: true });
      return;
    }

    // POST /api/share
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
      const room = (await kvGet<Record<string, AccountSnapshot>>(`room:${syncKey}`)) || {};
      const account = room[accountId];
      if (!account) {
        sendJson(res, { error: 'ไม่พบข้อมูลบัญชีที่ต้องการแชร์' }, 404);
        return;
      }
      const shareId = crypto.randomBytes(5).toString('hex');
      const record: ShareRecord = { shareId, createdAt: Date.now(), account };
      await kvPut(`share:${shareId}`, record);
      sendJson(res, { ok: true, shareId, createdAt: record.createdAt });
      return;
    }

    // GET /api/share/:shareId
    const shareMatch = pathname.match(/^\/api\/share\/([^/]+)$/);
    if (req.method === 'GET' && shareMatch) {
      const shareId = decodeURIComponent(shareMatch[1]);
      const record = await kvGet<ShareRecord>(`share:${shareId}`);
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
    sendJson(res, { error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' }, 500);
  }
}
