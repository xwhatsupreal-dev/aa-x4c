// ============================================================
// AA Vault — Cloudflare Worker + KV Backend
// Deploy with: npx wrangler deploy (after creating AA_VAULT_KV namespace)
// Or paste directly into Cloudflare Dashboard -> Workers & Pages -> Edit code
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
  const d = new Date(ts + 7 * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function cleanAssetId(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const m = String(raw).match(/\d{4,15}/);
  return m ? m[0] : undefined;
}

function optStr(raw, maxLen = 80) {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  return s ? s.slice(0, maxLen) : undefined;
}

function optNum(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

function sanitizeStage(raw, fallback) {
  if (!raw || typeof raw !== 'object') return fallback;
  const inLobby = Boolean(raw.inLobby);
  return {
    inLobby,
    name: optStr(raw.name, 80) || (inLobby ? 'ล็อบบี้' : 'Unknown Stage'),
    id: optStr(raw.id, 64),
    world: optStr(raw.world, 64),
    map: optStr(raw.map, 64),
    gamemode: optStr(raw.gamemode, 48),
    difficulty: optStr(raw.difficulty, 48),
    locationName: optStr(raw.locationName, 64),
    boss: optStr(raw.boss, 64),
    wave: optNum(raw.wave),
    isLastWave: Boolean(raw.isLastWave),
    enemiesLeft: optStr(raw.enemiesLeft, 24),
    bossLeft: optStr(raw.bossLeft, 24),
    mapImageId: cleanAssetId(raw.mapImageId),
  };
}

function sanitizeExtraStats(raw, fallback) {
  if (!raw || typeof raw !== 'object') return fallback;
  return {
    playerXp: optNum(raw.playerXp),
    resource: optNum(raw.resource),
    trophies: optNum(raw.trophies),
    rebirthTokens: optNum(raw.rebirthTokens),
    behelitXp: optNum(raw.behelitXp),
    curseTokens: optNum(raw.curseTokens),
    traitTokens: optNum(raw.traitTokens),
  };
}

function buildSnapshot(payload, existing) {
  const username = String(payload.username || 'UnknownPlayer').trim().slice(0, 64);
  const accountId = username.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'player';
  const now = Date.now();

  const equipped = Array.isArray(payload.equipped)
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
          kind: it.kind === 'unique' ? 'unique' : it.kind === 'unit' ? 'unit' : 'normal',
          iconId: cleanAssetId(it.iconId),
        }))
        .filter((it) => it.qty > 0)
    : existing?.inventory || [];

  const incomingRewards = Array.isArray(payload.rewards)
    ? payload.rewards
        .filter((r) => r && r.id)
        .map((r) => {
          const hasTs = typeof r.ts === 'number' && r.ts > 0;
          const ts = hasTs ? r.ts : now;
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

  const mergedRewards = existing?.rewards ? [...existing.rewards] : [];
  const rewardSig = (r) => `${r.runId || r.t}|${r.kind}|${r.id}|${r.qty}|${r.src}`;
  const seenSig = new Set(mergedRewards.map(rewardSig));
  const newlyAdded = [];

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

  const totals = {};
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
    gold: typeof payload.gold === 'number' ? payload.gold : existing?.gold || 0,
    gems: typeof payload.gems === 'number' ? payload.gems : existing?.gems || 0,
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

    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/+$/, '') || '/';
      const kv = env.AA_VAULT_KV;

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

      if (request.method === 'GET' && pathname === '/api/accounts') {
        const syncKey = sanitizeKey(url.searchParams.get('key'));
        if (!syncKey) return jsonResponse({ syncKey: '', accounts: [] });
        const raw = await kv.get(`room:${syncKey}`, 'json');
        const room = raw && typeof raw === 'object' ? raw : {};
        const accounts = Object.values(room).sort((a, b) => b.lastSyncedAt - a.lastSyncedAt);
        return jsonResponse({ syncKey, accounts });
      }

      if (request.method === 'POST' && pathname === '/api/sync') {
        let body;
        try {
          const text = (await request.text()).trim().replace(/^AAVAULT_SYNC::/, '');
          body = JSON.parse(text);
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

        const raw = await kv.get(`room:${syncKey}`, 'json');
        const room = raw && typeof raw === 'object' ? raw : {};
        const accountId = body.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'player';
        const existing = room[accountId];
        const prevCount = existing?.rewards?.length || 0;

        const updated = buildSnapshot(body, existing);
        const newRewardsCount = Math.max(0, updated.rewards.length - prevCount);
        const minWriteGapMs = Math.min(25000, Math.floor((updated.syncIntervalSec || 120) * 500));
        const unchangedData =
          Boolean(existing) &&
          newRewardsCount === 0 &&
          existing.gold === updated.gold &&
          existing.gems === updated.gems &&
          existing.level === updated.level &&
          existing.uniqueCount === updated.uniqueCount &&
          existing.normalKindCount === updated.normalKindCount &&
          (existing.inventory?.length || 0) === updated.inventory.length &&
          (existing.equipped?.length || 0) === updated.equipped.length &&
          existing.scriptVersion === updated.scriptVersion &&
          existing.syncIntervalSec === updated.syncIntervalSec &&
          existing.currentStage?.name === updated.currentStage?.name &&
          existing.currentStage?.inLobby === updated.currentStage?.inLobby &&
          updated.lastSyncedAt - (existing.lastSyncedAt || 0) < minWriteGapMs;

        if (!unchangedData) {
          room[updated.accountId] = updated;
          await kv.put(`room:${syncKey}`, JSON.stringify(room));
        }

        return jsonResponse({
          ok: true,
          provider: 'cloudflare-kv',
          syncKey,
          accountId: updated.accountId,
          lastSyncedAt: unchangedData ? existing.lastSyncedAt : updated.lastSyncedAt,
          newRewardsCount,
          skippedWrite: unchangedData,
        });
      }

      const clearMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/clear-drops$/);
      if (request.method === 'POST' && clearMatch) {
        const accountId = decodeURIComponent(clearMatch[1]);
        const syncKey = sanitizeKey(url.searchParams.get('key'));
        if (!syncKey) return jsonResponse({ error: 'Missing syncKey' }, 400);
        const raw = await kv.get(`room:${syncKey}`, 'json');
        const room = raw && typeof raw === 'object' ? raw : {};
        if (!room[accountId]) return jsonResponse({ error: 'Account not found' }, 404);
        room[accountId].rewards = [];
        room[accountId].totals = {};
        await kv.put(`room:${syncKey}`, JSON.stringify(room));
        return jsonResponse({ ok: true, account: room[accountId] });
      }

      const delMatch = pathname.match(/^\/api\/accounts\/([^/]+)$/);
      if (request.method === 'DELETE' && delMatch) {
        const accountId = decodeURIComponent(delMatch[1]);
        const syncKey = sanitizeKey(url.searchParams.get('key'));
        if (!syncKey) return jsonResponse({ error: 'Missing syncKey' }, 400);
        const raw = await kv.get(`room:${syncKey}`, 'json');
        const room = raw && typeof raw === 'object' ? raw : {};
        if (room[accountId]) {
          delete room[accountId];
          await kv.put(`room:${syncKey}`, JSON.stringify(room));
        }
        return jsonResponse({ ok: true });
      }

      if (request.method === 'POST' && pathname === '/api/share') {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: 'Invalid JSON body' }, 400);
        }
        const syncKey = sanitizeKey(body?.syncKey);
        const accountId = String(body?.accountId || '');
        const raw = await kv.get(`room:${syncKey}`, 'json');
        const account = raw?.[accountId];
        if (!account) {
          return jsonResponse({ error: 'ไม่พบข้อมูลบัญชีที่ต้องการแชร์' }, 404);
        }
        const shareId = randomHex(5);
        const record = { shareId, createdAt: Date.now(), account };
        await kv.put(`share:${shareId}`, JSON.stringify(record));
        return jsonResponse({ ok: true, shareId, createdAt: record.createdAt });
      }

      const shareMatch = pathname.match(/^\/api\/share\/([^/]+)$/);
      if (request.method === 'GET' && shareMatch) {
        const shareId = decodeURIComponent(shareMatch[1]);
        const record = await kv.get(`share:${shareId}`, 'json');
        if (!record) {
          return jsonResponse({ error: 'ไม่พบลิ้งค์เช็คของนี้ หรือลิ้งค์หมดอายุแล้ว' }, 404);
        }
        return jsonResponse(record);
      }

      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (err) {
      const msg = String(err?.message || err || '');
      const isQuota = /limit|quota|429|put/i.test(msg);
      return jsonResponse(
        {
          ok: false,
          error: isQuota
            ? 'Cloudflare KV เต็มโควต้าเขียน 1,000 ครั้ง/วัน (แนะนำย้ายไปใช้ Upstash Redis บน Vercel หรือปรับรอบซิงค์เป็น 60 วินาที)'
            : 'Cloudflare Worker error',
          detail: msg.slice(0, 200),
        },
        isQuota ? 429 : 500
      );
    }
  },
};
