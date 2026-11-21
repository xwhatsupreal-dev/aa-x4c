export const CLOUDFLARE_WORKER_CODE = `// ============================================================
// AA Vault — Cloudflare Worker + KV Backend
// รับข้อมูลสดจากสคริปต์ Lua (Anime Adventures) และส่งให้หน้าเว็บเช็คของ
// Binding ที่ต้องตั้งใน Cloudflare: KV Namespace ชื่อ AA_VAULT_KV
// ============================================================

const RARITY_LIST = [
  'Secret',
  'Exclusive',
  'Mythic',
  'Legendary',
  'Epic',
  'Rare',
  'Uncommon',
  'Common',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

function sanitizeKey(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
}

function normalizeRarity(input) {
  if (!input) return 'Common';
  const cleaned = String(input).trim().toLowerCase();
  return RARITY_LIST.find((r) => r.toLowerCase() === cleaned) || 'Common';
}

function normalizeTraits(traits) {
  if (Array.isArray(traits)) {
    return traits.map((t) => String(t)).filter(Boolean);
  }
  if (typeof traits === 'string' && traits.trim()) {
    return traits.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (traits && typeof traits === 'object') {
    return Object.entries(traits)
      .map(([k, v]) => (typeof v === 'string' ? v : k))
      .filter(Boolean);
  }
  return [];
}

function formatClock(ts) {
  const d = new Date(ts + 7 * 3600 * 1000); // เวลาไทย UTC+7
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return \`\${hh}:\${mm}:\${ss}\`;
}

function buildSnapshot(payload, existing) {
  const username = String(payload.username || 'UnknownPlayer').trim().slice(0, 64);
  const accountId = username.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'player';
  const now = Date.now();

  const equipped = Array.isArray(payload.equipped)
    ? payload.equipped.slice(0, 6).map((u, idx) => ({
        slot: typeof u.slot === 'number' ? u.slot : idx + 1,
        id: String(u.id || \`unit_\${idx + 1}\`),
        name: String(u.name || u.id || \`Unit \${idx + 1}\`),
        rarity: normalizeRarity(u.rarity),
        level: typeof u.level === 'number' ? u.level : undefined,
        shiny: Boolean(u.shiny),
        traits: normalizeTraits(u.traits),
        stats: u.stats,
      }))
    : existing?.equipped || [];

  const inventory = Array.isArray(payload.inventory)
    ? payload.inventory
        .filter((it) => it && it.id)
        .map((it) => ({
          id: String(it.id),
          name: String(it.name || it.id),
          rarity: normalizeRarity(it.rarity),
          group: String(it.group || 'Other'),
          qty: Math.max(0, Number(it.qty) || 0),
          kind: it.kind === 'unique' ? 'unique' : 'normal',
        }))
        .filter((it) => it.qty > 0)
    : existing?.inventory || [];

  const incomingRewards = Array.isArray(payload.rewards)
    ? payload.rewards
        .filter((r) => r && r.id)
        .map((r) => {
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

  const mergedRewards = existing?.rewards ? [...existing.rewards] : [];
  const seenSig = new Set(
    mergedRewards.map((r) => \`\${r.t}|\${r.kind}|\${r.id}|\${r.qty}|\${r.src}\`)
  );
  const newlyAdded = [];

  for (const r of incomingRewards) {
    const sig = \`\${r.t}|\${r.kind}|\${r.id}|\${r.qty}|\${r.src}\`;
    if (!seenSig.has(sig)) {
      seenSig.add(sig);
      newlyAdded.push(r);
    }
  }

  const finalRewards = [...newlyAdded, ...mergedRewards]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 200);

  const totals = {};
  for (const r of finalRewards) {
    const key = \`\${r.kind}|\${r.id}\`;
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
    gold: typeof payload.gold === 'number' ? payload.gold : existing?.gold || 0,
    gems: typeof payload.gems === 'number' ? payload.gems : existing?.gems || 0,
    level: typeof payload.level === 'number' ? payload.level : existing?.level,
    equipped,
    inventory,
    rewards: finalRewards,
    totals,
    uniqueCount,
    normalKindCount,
    lastSyncedAt: now,
    scriptVersion:
      typeof payload.scriptVersion === 'string' && payload.scriptVersion.trim()
        ? payload.scriptVersion.trim().slice(0, 24)
        : existing?.scriptVersion,
    syncIntervalSec:
      typeof payload.syncIntervalSec === 'number' && Number.isFinite(payload.syncIntervalSec)
        ? Math.min(120, Math.max(5, Math.round(payload.syncIntervalSec)))
        : existing?.syncIntervalSec,
    source: 'lua',
  };
}

function randomHex(bytes = 5) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\\/+$/, '') || '/';
    const kv = env.AA_VAULT_KV;

    // 1) Health Check
    if (request.method === 'GET' && (pathname === '/' || pathname === '/api/health')) {
      return jsonResponse({
        ok: true,
        provider: 'cloudflare-worker',
        kvBound: Boolean(kv),
        timestamp: Date.now(),
      });
    }

    if (!kv) {
      return jsonResponse(
        { error: 'ยังไม่ได้ผูก KV Namespace ชื่อ AA_VAULT_KV ใน Cloudflare Worker Settings' },
        500
      );
    }

    // 2) List Accounts in Sync Key Room
    if (request.method === 'GET' && pathname === '/api/accounts') {
      const syncKey = sanitizeKey(url.searchParams.get('key'));
      if (!syncKey) return jsonResponse({ syncKey: '', accounts: [] });
      const raw = await kv.get(\`room:\${syncKey}\`, 'json');
      const room = raw && typeof raw === 'object' ? raw : {};
      const accounts = Object.values(room).sort((a, b) => b.lastSyncedAt - a.lastSyncedAt);
      return jsonResponse({ syncKey, accounts });
    }

    // 3) Sync from Roblox Lua Script
    if (request.method === 'POST' && pathname === '/api/sync') {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }
      if (!body || typeof body !== 'object') {
        return jsonResponse({ error: 'Invalid payload' }, 400);
      }
      const syncKey = sanitizeKey(body.syncKey || url.searchParams.get('key'));
      if (!syncKey) return jsonResponse({ error: 'Missing syncKey' }, 400);
      if (!body.username || typeof body.username !== 'string') {
        return jsonResponse({ error: 'Missing username' }, 400);
      }

      const raw = await kv.get(\`room:\${syncKey}\`, 'json');
      const room = raw && typeof raw === 'object' ? raw : {};
      const accountId = body.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'player';
      const existing = room[accountId];
      const prevCount = existing?.rewards?.length || 0;

      const updated = buildSnapshot(body, existing);
      room[updated.accountId] = updated;
      await kv.put(\`room:\${syncKey}\`, JSON.stringify(room));

      return jsonResponse({
        ok: true,
        provider: 'cloudflare-kv',
        syncKey,
        accountId: updated.accountId,
        lastSyncedAt: updated.lastSyncedAt,
        newRewardsCount: Math.max(0, updated.rewards.length - prevCount),
      });
    }

    // 4) Clear Drop History
    const clearMatch = pathname.match(/^\\/api\\/accounts\\/([^/]+)\\/clear-drops$/);
    if (request.method === 'POST' && clearMatch) {
      const accountId = decodeURIComponent(clearMatch[1]);
      const syncKey = sanitizeKey(url.searchParams.get('key'));
      if (!syncKey) return jsonResponse({ error: 'Missing syncKey' }, 400);
      const raw = await kv.get(\`room:\${syncKey}\`, 'json');
      const room = raw && typeof raw === 'object' ? raw : {};
      if (!room[accountId]) return jsonResponse({ error: 'Account not found' }, 404);
      room[accountId].rewards = [];
      room[accountId].totals = {};
      await kv.put(\`room:\${syncKey}\`, JSON.stringify(room));
      return jsonResponse({ ok: true, account: room[accountId] });
    }

    // 5) Delete Account
    const delMatch = pathname.match(/^\\/api\\/accounts\\/([^/]+)$/);
    if (request.method === 'DELETE' && delMatch) {
      const accountId = decodeURIComponent(delMatch[1]);
      const syncKey = sanitizeKey(url.searchParams.get('key'));
      if (!syncKey) return jsonResponse({ error: 'Missing syncKey' }, 400);
      const raw = await kv.get(\`room:\${syncKey}\`, 'json');
      const room = raw && typeof raw === 'object' ? raw : {};
      if (room[accountId]) {
        delete room[accountId];
        await kv.put(\`room:\${syncKey}\`, JSON.stringify(room));
      }
      return jsonResponse({ ok: true });
    }

    // 6) Create Read-Only Share Link
    if (request.method === 'POST' && pathname === '/api/share') {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }
      const syncKey = sanitizeKey(body?.syncKey);
      const accountId = String(body?.accountId || '');
      const raw = await kv.get(\`room:\${syncKey}\`, 'json');
      const account = raw?.[accountId];
      if (!account) {
        return jsonResponse({ error: 'ไม่พบข้อมูลบัญชีที่ต้องการแชร์' }, 404);
      }
      const shareId = randomHex(5);
      const record = { shareId, createdAt: Date.now(), account };
      await kv.put(\`share:\${shareId}\`, JSON.stringify(record));
      return jsonResponse({ ok: true, shareId, createdAt: record.createdAt });
    }

    // 7) Fetch Read-Only Share Link
    const shareMatch = pathname.match(/^\\/api\\/share\\/([^/]+)$/);
    if (request.method === 'GET' && shareMatch) {
      const shareId = decodeURIComponent(shareMatch[1]);
      const record = await kv.get(\`share:\${shareId}\`, 'json');
      if (!record) {
        return jsonResponse({ error: 'ไม่พบลิ้งค์เช็คของนี้ หรือลิ้งค์หมดอายุแล้ว' }, 404);
      }
      return jsonResponse(record);
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },
};
`;

export const WRANGLER_TOML_CODE = `name = "aa-vault"
main = "worker.js"
compatibility_date = "2026-01-01"

[[kv_namespaces]]
binding = "AA_VAULT_KV"
id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"
`;
