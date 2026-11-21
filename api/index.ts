import crypto from 'node:crypto';
import fs from 'node:fs';
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
  kind: 'normal' | 'unique';
}

interface RewardEntry {
  t: string;
  ts: number;
  kind: 'item' | 'unit';
  id: string;
  name: string;
  rarity: Rarity;
  qty: number;
  src: string;
}

interface RewardTotal {
  kind: 'item' | 'unit';
  id: string;
  name: string;
  rarity: Rarity;
  qty: number;
}

interface AccountSnapshot {
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

type Req = IncomingMessage & { body?: unknown };

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

interface LocalTmpStore {
  rooms: Record<string, Record<string, AccountSnapshot>>;
  shares: Record<string, ShareRecord>;
}

let tmpCache: LocalTmpStore | null = null;

function loadTmpStore(): LocalTmpStore {
  if (tmpCache) return tmpCache;
  try {
    if (fs.existsSync(TMP_STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(TMP_STORE_PATH, 'utf-8')) as LocalTmpStore;
      if (parsed && typeof parsed.rooms === 'object' && typeof parsed.shares === 'object') {
        tmpCache = parsed;
        return tmpCache;
      }
    }
  } catch {
    // ignore corrupt tmp cache
  }
  tmpCache = { rooms: {}, shares: {} };
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
  }
  saveTmpStore(tmp);
}

function buildLuaScript(
  endpointUrl: string,
  syncKey: string,
  intervalSec = 10,
  showInGameGui = true
): string {
  const endpoint = endpointUrl.trim().replace(/\/$/, '');
  const guiSection = showInGameGui
    ? `
------------------------------------------------------------------
-- 6) MAIN IN-GAME GUI (2K | รางวัล • กระเป๋า • ทีม + ส่งเข้าเว็บ)
------------------------------------------------------------------
local gui = Instance.new("ScreenGui")
gui.Name = "2K_RewardTracker"
gui.ResetOnSpawn = false
gui.DisplayOrder = 85
gui.IgnoreGuiInset = false
pcall(function() gui.Parent = (gethui and gethui()) or PG end)
if not gui.Parent then gui.Parent = PG end

local main = Instance.new("Frame")
main.Size = UDim2.fromOffset(400, 540)
main.Position = UDim2.new(0, 40, 0, 90)
main.BackgroundColor3 = Color3.fromRGB(20, 20, 26)
main.BorderSizePixel = 0
main.Active = true
main.Parent = gui
Instance.new("UICorner", main).CornerRadius = UDim.new(0, 12)
local mstroke = Instance.new("UIStroke", main)
mstroke.Color = Color3.fromRGB(58, 58, 78); mstroke.Thickness = 1

local titleBar = Instance.new("TextButton")
titleBar.Size = UDim2.new(1, 0, 0, 34)
titleBar.BackgroundColor3 = Color3.fromRGB(31, 31, 42)
titleBar.Text = "  2K | รางวัล • กระเป๋า • ทีม • AA Vault"
titleBar.TextXAlignment = Enum.TextXAlignment.Left
titleBar.TextColor3 = Color3.fromRGB(236, 236, 248)
titleBar.Font = Enum.Font.GothamBold
titleBar.TextSize = 13
titleBar.AutoButtonColor = false
titleBar.BorderSizePixel = 0
titleBar.ZIndex = 3
titleBar.Parent = main
Instance.new("UICorner", titleBar).CornerRadius = UDim.new(0, 12)

local function mkBtn(text, xoff, col, cb)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(26, 26)
	b.Position = UDim2.new(1, xoff, 0, 4)
	b.BackgroundColor3 = col
	b.Text = text
	b.TextColor3 = Color3.fromRGB(245, 245, 252)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 14
	b.BorderSizePixel = 0
	b.ZIndex = 5
	b.Parent = main
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 6)
	b.MouseButton1Click:Connect(cb)
	return b
end
mkBtn("X", -32, Color3.fromRGB(168, 62, 62), function() Hub.Stop() end)
mkBtn("-", -62, Color3.fromRGB(58, 58, 82), function()
	main.Size = main.Size == UDim2.fromOffset(400, 540) and UDim2.fromOffset(400, 34) or UDim2.fromOffset(400, 540)
end)

-- drag
do
	local dragging, startPos, startIn
	titleBar.InputBegan:Connect(function(i)
		if i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch then
			dragging = true; startPos = i.Position; startIn = main.Position
		end
	end)
	game:GetService("UserInputService").InputChanged:Connect(function(i)
		if dragging and (i.UserInputType == Enum.UserInputType.MouseMovement or i.UserInputType == Enum.UserInputType.Touch) then
			local d = i.Position - startPos
			main.Position = UDim2.new(startIn.X.Scale, startIn.X.Offset + d.X, startIn.Y.Scale, startIn.Y.Offset + d.Y)
		end
	end)
	game:GetService("UserInputService").InputEnded:Connect(function(i)
		if i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch then dragging = false end
	end)
end

local tabBar = Instance.new("Frame")
tabBar.Size = UDim2.new(1, -12, 0, 30)
tabBar.Position = UDim2.fromOffset(6, 40)
tabBar.BackgroundTransparency = 1
tabBar.Parent = main
local tl = Instance.new("UIListLayout", tabBar)
tl.FillDirection = Enum.FillDirection.Horizontal
tl.Padding = UDim.new(0, 6)

local tabBtns = {}
local function mkTab(key, label)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(88, 28)
	b.BackgroundColor3 = Color3.fromRGB(38, 38, 52)
	b.Text = label
	b.TextColor3 = Color3.fromRGB(220, 220, 235)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 12
	b.BorderSizePixel = 0
	b.Parent = tabBar
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 7)
	b.MouseButton1Click:Connect(function() Hub.Tab = key; Hub.Render() end)
	tabBtns[key] = b
	return b
end
mkTab("team", "ทีม 6 ตัว")
mkTab("drops", "ของที่ได้")
mkTab("bag", "กระเป๋า")

local content = Instance.new("ScrollingFrame")
content.Size = UDim2.new(1, -12, 1, -150)
content.Position = UDim2.fromOffset(6, 74)
content.BackgroundColor3 = Color3.fromRGB(26, 26, 34)
content.BorderSizePixel = 0
content.ScrollBarThickness = 5
content.CanvasSize = UDim2.new(0, 0, 0, 0)
content.AutomaticCanvasSize = Enum.AutomaticSize.Y
content.Parent = main
Instance.new("UICorner", content).CornerRadius = UDim.new(0, 8)
local cl = Instance.new("UIListLayout", content)
cl.Padding = UDim.new(0, 5)
cl.SortOrder = Enum.SortOrder.LayoutOrder
local cp = Instance.new("UIPadding", content)
cp.PaddingTop = UDim.new(0, 6); cp.PaddingLeft = UDim.new(0, 6)
cp.PaddingRight = UDim.new(0, 6); cp.PaddingBottom = UDim.new(0, 6)

local webRow = Instance.new("Frame")
webRow.Size = UDim2.new(1, -12, 0, 28)
webRow.Position = UDim2.new(0, 6, 1, -108)
webRow.BackgroundTransparency = 1
webRow.Parent = main
local wrl = Instance.new("UIListLayout", webRow)
wrl.FillDirection = Enum.FillDirection.Horizontal
wrl.Padding = UDim.new(0, 6)

local function mkWebBtn(label, w, bg, cb)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(w, 26)
	b.BackgroundColor3 = bg
	b.Text = label
	b.TextColor3 = Color3.fromRGB(255, 255, 255)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 11
	b.BorderSizePixel = 0
	b.Parent = webRow
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 6)
	b.MouseButton1Click:Connect(cb)
	return b
end

mkWebBtn("คัดลอกข้อมูลเข้าเว็บ (1 คลิก)", 230, Color3.fromRGB(79, 110, 247), function()
	Hub.CopyForWeb()
end)
mkWebBtn("ส่ง HTTP สด", 152, Color3.fromRGB(48, 56, 82), function()
	Hub.HttpBlocked = false
	Hub.SyncToWeb(true)
end)

local actRow = Instance.new("Frame")
actRow.Size = UDim2.new(1, -12, 0, 26)
actRow.Position = UDim2.new(0, 6, 1, -76)
actRow.BackgroundTransparency = 1
actRow.Parent = main
local arl = Instance.new("UIListLayout", actRow)
arl.FillDirection = Enum.FillDirection.Horizontal
arl.Padding = UDim.new(0, 6)

local function mkAct(label, w, cb)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(w, 24)
	b.BackgroundColor3 = Color3.fromRGB(45, 45, 62)
	b.Text = label
	b.TextColor3 = Color3.fromRGB(225, 225, 240)
	b.Font = Enum.Font.GothamBold
	b.TextSize = 11
	b.BorderSizePixel = 0
	b.Parent = actRow
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 6)
	b.MouseButton1Click:Connect(cb)
	return b
end
mkAct("สแกนใหม่", 118, function() Hub.Profile = nil; Hub.IconLookups = 0; if Hub.ResetInvBaseline then Hub.ResetInvBaseline() end; Hub.Refresh(true) end)
local notifyBtn
notifyBtn = mkAct("แจ้งเตือน: เปิด", 136, function()
	Hub.Flags.Notify = not Hub.Flags.Notify
	notifyBtn.Text = "แจ้งเตือน: " .. (Hub.Flags.Notify and "เปิด" or "ปิด")
end)
mkAct("ล้างประวัติ", 122, function() Hub.Rewards = {}; Hub.Totals = {}; Hub.Render() end)

local footer = Instance.new("TextLabel")
footer.Size = UDim2.new(1, -12, 0, 40)
footer.Position = UDim2.new(0, 6, 1, -46)
footer.BackgroundColor3 = Color3.fromRGB(30, 30, 40)
footer.BorderSizePixel = 0
footer.Font = Enum.Font.Gotham
footer.TextSize = 10
footer.TextWrapped = true
footer.TextColor3 = Color3.fromRGB(200, 200, 215)
footer.Text = "..."
footer.Parent = main
Instance.new("UICorner", footer).CornerRadius = UDim.new(0, 8)

local function clearContent()
	for _, c in ipairs(content:GetChildren()) do
		if c:IsA("Frame") or c:IsA("TextLabel") or c:IsA("TextButton") then c:Destroy() end
	end
end

local function row(parent, h)
	local r = Instance.new("Frame")
	r.Size = UDim2.new(1, 0, 0, h)
	r.BackgroundColor3 = Color3.fromRGB(34, 34, 45)
	r.BorderSizePixel = 0
	r.Parent = parent
	Instance.new("UICorner", r).CornerRadius = UDim.new(0, 7)
	return r
end

local function header(parent, text, col)
	local l = Instance.new("TextLabel")
	l.Size = UDim2.new(1, 0, 0, 22)
	l.BackgroundTransparency = 1
	l.Font = Enum.Font.GothamBold
	l.TextSize = 12
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextColor3 = col or Color3.fromRGB(140, 140, 165)
	l.Text = "  " .. text
	l.Parent = parent
	return l
end

function Hub.Render()
	if not Hub.Running then return end
	clearContent()
	for k, b in pairs(tabBtns) do
		b.BackgroundColor3 = (k == Hub.Tab) and Color3.fromRGB(70, 90, 190) or Color3.fromRGB(38, 38, 52)
	end

	if Hub.Tab == "team" then
		local unitMap = buildUnitMap()
		local team = findEquipped(unitMap)
		Hub.Equipped = team
		header(content, "ทีมที่ใส่ในด่าน (" .. #team .. "/6)")
		if #team == 0 then
			local l = Instance.new("TextLabel")
			l.Size = UDim2.new(1, 0, 0, 44)
			l.BackgroundTransparency = 1
			l.Font = Enum.Font.Gotham
			l.TextSize = 12
			l.TextColor3 = Color3.fromRGB(180, 180, 195)
			l.Text = "ยังตรวจไม่พบทีม — เข้าไปที่ Collection > Teams เลือกทีม 1 ครั้ง\\nแล้วกด 'สแกนใหม่'"
			l.Parent = content
		end
		for i, u in ipairs(team) do
			local r = row(content, 52)
			r.LayoutOrder = i
			local n = Instance.new("TextLabel")
			n.Size = UDim2.new(1, -20, 0, 20)
			n.Position = UDim2.fromOffset(10, 5)
			n.BackgroundTransparency = 1
			n.Font = Enum.Font.GothamBold
			n.TextSize = 13
			n.TextXAlignment = Enum.TextXAlignment.Left
			n.TextColor3 = rcol(u.rarity)
			n.Text = i .. ". " .. u.name .. (u.shiny and "  ✦" or "")
			n.Parent = r
			local s = Instance.new("TextLabel")
			s.Size = UDim2.new(1, -20, 0, 18)
			s.Position = UDim2.fromOffset(10, 26)
			s.BackgroundTransparency = 1
			s.Font = Enum.Font.Gotham
			s.TextSize = 11
			s.TextXAlignment = Enum.TextXAlignment.Left
			s.TextColor3 = Color3.fromRGB(175, 175, 190)
			local traitTxt = (#u.traits > 0) and (" • " .. table.concat(u.traits, ",")) or ""
			s.Text = tostring(u.rarity) .. (u.level and (" • Lv." .. tostring(u.level)) or "") .. traitTxt
			s.Parent = r
		end
	elseif Hub.Tab == "drops" then
		header(content, "ของที่ได้ล่าสุด (" .. #Hub.Rewards .. " รายการ)")
		for i = 1, math.min(#Hub.Rewards, 60) do
			local e = Hub.Rewards[i]
			local r = row(content, 40)
			r.LayoutOrder = i
			local n = Instance.new("TextLabel")
			n.Size = UDim2.new(1, -20, 0, 18)
			n.Position = UDim2.fromOffset(10, 3)
			n.BackgroundTransparency = 1
			n.Font = Enum.Font.GothamBold
			n.TextSize = 12
			n.TextXAlignment = Enum.TextXAlignment.Left
			n.TextColor3 = rcol(e.rarity)
			n.Text = e.name .. ((e.qty or 1) > 1 and (" x" .. e.qty) or "")
			n.Parent = r
			local s = Instance.new("TextLabel")
			s.Size = UDim2.new(1, -20, 0, 16)
			s.Position = UDim2.fromOffset(10, 20)
			s.BackgroundTransparency = 1
			s.Font = Enum.Font.Gotham
			s.TextSize = 10
			s.TextXAlignment = Enum.TextXAlignment.Left
			s.TextColor3 = Color3.fromRGB(160, 160, 178)
			s.Text = e.t .. " • " .. e.rarity .. " • " .. (e.kind == "unit" and "UNIT" or "ITEM")
			s.Parent = r
		end
	else
		local normal, unique = getInventory()
		local grouped = {}
		local function push(id, qty)
			local g = iGroup(id)
			grouped[g] = grouped[g] or {}
			grouped[g][id] = (grouped[g][id] or 0) + (qty or 1)
		end
		for k, v in pairs(normal) do push(tostring(k), tonumber(v) or 1) end
		for _, v in pairs(unique) do
			if type(v) == "table" and v.item_id then push(tostring(v.item_id), 1) end
		end
		local cats = {}
		for g in pairs(grouped) do cats[#cats + 1] = g end
		table.sort(cats)
		local order = 0
		for _, g in ipairs(cats) do
			local total = 0
			for _, q in pairs(grouped[g]) do total = total + q end
			order = order + 1
			local h = header(content, g .. "  (" .. total .. ")")
			h.LayoutOrder = order
			local ids = {}
			for id in pairs(grouped[g]) do ids[#ids + 1] = id end
			table.sort(ids, function(a, b) return (grouped[g][a] or 0) > (grouped[g][b] or 0) end)
			for i = 1, math.min(#ids, 40) do
				local id = ids[i]
				order = order + 1
				local r = row(content, 34)
				r.LayoutOrder = order
				local n = Instance.new("TextLabel")
				n.Size = UDim2.new(1, -70, 1, 0)
				n.Position = UDim2.fromOffset(10, 0)
				n.BackgroundTransparency = 1
				n.Font = Enum.Font.GothamBold
				n.TextSize = 12
				n.TextXAlignment = Enum.TextXAlignment.Left
				n.TextColor3 = rcol(iRarity(id))
				n.Text = iName(id)
				n.Parent = r
				local q = Instance.new("TextLabel")
				q.Size = UDim2.fromOffset(52, 34)
				q.Position = UDim2.new(1, -56, 0, 0)
				q.BackgroundTransparency = 1
				q.Font = Enum.Font.GothamBold
				q.TextSize = 12
				q.TextColor3 = Color3.fromRGB(235, 235, 245)
				q.Text = "x" .. tostring(grouped[g][id])
				q.Parent = r
			end
		end
	end

	local pd = findProfile()
	local gold = pd and tonumber(pd.gold_amount) or 0
	local gem = pd and tonumber(pd.gem_amount) or 0
	local normal, unique = getInventory()
	local ucount, ncount = 0, 0
	for _ in pairs(unique) do ucount = ucount + 1 end
	for _ in pairs(normal) do ncount = ncount + 1 end
	footer.Text = "Gold " .. tostring(math.floor(gold)) .. " • Gem " .. tostring(math.floor(gem)) ..
		" • Unique " .. ucount .. " • Item " .. ncount .. "\\nWeb: " .. tostring(Hub.SyncStatus)
end

function Hub.Stop()
	Hub.Running = false
	for _, c in ipairs(Hub.Conns) do pcall(function() c:Disconnect() end) end
	Hub.Conns = {}
	pcall(function() gui:Destroy() end)
	pcall(function() toastGui:Destroy() end)
end
`
    : `
function Hub.Render() end

function Hub.Stop()
	Hub.Running = false
	for _, c in ipairs(Hub.Conns) do pcall(function() c:Disconnect() end) end
	Hub.Conns = {}
	pcall(function() toastGui:Destroy() end)
end
`;

  return `-- ============================================================
-- 2K | Anime Adventures — AA Vault Web Sync (Hosted Loader)
-- ============================================================
if getgenv().TwoK then pcall(function() getgenv().TwoK.Stop() end) end

local WEB_URL = "${endpoint}"
local SYNC_KEY = "${syncKey}"
local AUTO_SYNC_SEC = ${intervalSec}

local Hub = {
	Running = true,
	Conns = {},
	Rewards = {},
	Totals = {},
	Tab = "team",
	Equipped = {},
	IconLookups = 0,
	LastSync = 0,
	SyncOk = false,
	HttpBlocked = false,
	SyncStatus = "กำลังเชื่อมต่อ...",
}
Hub.Flags = {Notify = true, Icons = true, MaxIcons = 45, WebSync = true}
getgenv().TwoK = Hub

local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")
local LP = Players.LocalPlayer
local PG = LP:WaitForChild("PlayerGui")

local httpRequest = request or http_request or httprequest or (syn and syn.request) or (fluxus and fluxus.request) or (http and http.request)
local copyClip = setclipboard or toclipboard or set_clipboard or (Clipboard and Clipboard.set)
local saveFile = writefile

local function conn(c) if c then Hub.Conns[#Hub.Conns + 1] = c end end
local function clock() local ok, s = pcall(os.date, "%H:%M:%S") if ok and s then return s end return "--:--:--" end
local function safeNum(v)
	local n = tonumber(v) or 0
	if n ~= n or n == math.huge or n == -math.huge then return 0 end
	return n
end

------------------------------------------------------------------
-- 1) DATA (ReplicatedStorage.src.Data)
------------------------------------------------------------------
local Items, Units = {}, {}
pcall(function() Items = require(RS.src.Data.Items) or {} end)
pcall(function() Units = require(RS.src.Data.Units) or {} end)
if type(Items) ~= "table" then Items = {} end
if type(Units) ~= "table" then Units = {} end

local function itemDef(id) local d = Items[id]; if type(d) == "table" then return d end end
local function unitDef(id) local d = Units[id]; if type(d) == "table" then return d end end
local function iName(id) local d = itemDef(id) return d and tostring(d.name or id) or tostring(id) end
local function iRarity(id) local d = itemDef(id) return d and tostring(d.rarity or "Common") or "Common" end
local function iGroup(id) local d = itemDef(id) return d and tostring(d.item_group or "Other") or "Other" end
local function uName(id) local d = unitDef(id) return d and tostring(d.name or id) or tostring(id) end
local function uRarity(id) local d = unitDef(id) return d and tostring(d.rarity or "Common") or "Common" end

local RCOL = {
	Common = Color3.fromRGB(160,160,172), Uncommon = Color3.fromRGB(110,200,120),
	Rare = Color3.fromRGB(90,160,255), Epic = Color3.fromRGB(180,110,255),
	Legendary = Color3.fromRGB(255,190,80), Mythic = Color3.fromRGB(255,120,90),
	Secret = Color3.fromRGB(255,100,165), Exclusive = Color3.fromRGB(130,220,235),
}
local function rcol(r) return RCOL[tostring(r)] or Color3.fromRGB(150,150,165) end

------------------------------------------------------------------
-- 2) PROFILE / INVENTORY / TEAM RESOLVERS
------------------------------------------------------------------
local function findProfile()
	if Hub.Profile then return Hub.Profile end
	for _, o in ipairs(getgc(true)) do
		if type(o) == "table" then
			local ok, inv = pcall(rawget, o, "inventory")
			if ok and type(inv) == "table" then
				local ok2, pd = pcall(rawget, o, "profile_data")
				if ok2 and type(pd) == "table" then
					Hub.Profile = pd
					Hub.Session = o
					return pd
				end
			end
		end
	end
	return nil
end

local function getInventory()
	local pd = findProfile()
	local inv = pd and pd.inventory
	if type(inv) ~= "table" then return {}, {} end
	local normal = type(inv.normal_items) == "table" and inv.normal_items or {}
	local unique = type(inv.unique_items) == "table" and inv.unique_items or {}
	return normal, unique
end

local function isUuid(s) return type(s) == "string" and #s >= 30 and s:sub(1,1) == "{" end

local function buildUnitMap()
	local map = {}
	local function harvest(t)
		if type(t) ~= "table" then return end
		for k, v in pairs(t) do
			if isUuid(k) and type(v) == "table" then
				local id = v.id or v.unit_id or v.item_id
				if type(id) == "string" and unitDef(id) then map[k] = v end
			end
		end
	end
	local pd = findProfile()
	if pd then
		harvest(pd.units); harvest(pd.inventory); harvest(pd.collection)
	end
	if next(map) == nil then
		for _, o in ipairs(getgc(true)) do
			if type(o) == "table" then harvest(o) end
		end
	end
	return map
end

local function findEquipped(unitMap)
	local pd = findProfile()
	local cands = {}
	if type(Hub.EquippedRaw) == "table" then cands[#cands + 1] = Hub.EquippedRaw end
	if pd then
		for _, key in ipairs({"equipped_units", "team_units", "units_equipped", "equipped"}) do
			local v = rawget(pd, key)
			if type(v) == "table" then cands[#cands + 1] = v end
		end
		if type(pd.loadouts_v2) == "table" then
			for _, v in pairs(pd.loadouts_v2) do
				if type(v) == "table" then
					cands[#cands + 1] = v
					for _, vv in pairs(v) do if type(vv) == "table" then cands[#cands + 1] = vv end end
				end
			end
		end
	end
	for _, t in ipairs(cands) do
		local out, ok, n = {}, true, 0
		for k, v in pairs(t) do
			n = n + 1
			if type(k) == "number" and (isUuid(v) or (type(v) == "table" and (unitDef(v.id) or unitDef(v.unit_id)))) then
				out[#out + 1] = {key = k, ref = v}
			else
				ok = false
			end
		end
		if ok and n > 0 and n <= 8 then
			table.sort(out, function(a, b) return a.key < b.key end)
			local res = {}
			for idx, e in ipairs(out) do
				local id, lvl, shiny, traits
				if isUuid(e.ref) then
					local u = unitMap and unitMap[e.ref]
					if u then id = u.id or u.unit_id; lvl = u.level or u.ingame_level; shiny = u.shiny; traits = u.traits or u._traits end
					if not id then id = tostring(e.ref) end
				else
					id = e.ref.id or e.ref.unit_id; lvl = e.ref.level; shiny = e.ref.shiny; traits = e.ref.traits or e.ref._traits
				end
				local traitList = {}
				if type(traits) == "table" then
					for tk, tv in pairs(traits) do
						if type(tv) == "string" then traitList[#traitList + 1] = tv
						else traitList[#traitList + 1] = tostring(tk) end
					end
				elseif type(traits) == "string" and traits ~= "" then
					traitList[1] = traits
				end
				res[#res + 1] = {
					slot = idx,
					id = tostring(id),
					name = uName(id),
					rarity = uRarity(id),
					level = safeNum(lvl or 1),
					shiny = shiny == true,
					traits = traitList,
				}
			end
			return res
		end
	end
	return {}
end

------------------------------------------------------------------
-- 3) BUILD REAL PAYLOAD + WEB SYNC (HTTP + CLIPBOARD + FILE)
------------------------------------------------------------------
local function buildPayloadJson()
	local pd = findProfile()
	local normal, unique = getInventory()
	local unitMap = buildUnitMap()
	local team = findEquipped(unitMap)

	local invList = {}
	local uniqueCounts = {}
	local uTotal = 0
	local nKinds = 0

	for k, v in pairs(normal) do
		local id = tostring(k)
		local qty = safeNum(v)
		if qty > 0 then
			nKinds = nKinds + 1
			invList[#invList + 1] = {
				id = id,
				name = iName(id),
				rarity = iRarity(id),
				group = iGroup(id),
				qty = qty,
				kind = "normal",
			}
		end
	end

	for _, v in pairs(unique) do
		if type(v) == "table" and v.item_id then
			local id = tostring(v.item_id)
			uniqueCounts[id] = (uniqueCounts[id] or 0) + 1
			uTotal = uTotal + 1
		end
	end
	for id, qty in pairs(uniqueCounts) do
		invList[#invList + 1] = {
			id = id,
			name = iName(id),
			rarity = iRarity(id),
			group = iGroup(id),
			qty = qty,
			kind = "unique",
		}
	end

	local recentRewards = {}
	for i = 1, math.min(#Hub.Rewards, 80) do
		local r = Hub.Rewards[i]
		recentRewards[#recentRewards + 1] = {
			t = tostring(r.t),
			ts = safeNum(r.ts),
			kind = tostring(r.kind),
			id = tostring(r.id),
			name = tostring(r.name),
			rarity = tostring(r.rarity),
			qty = safeNum(r.qty),
			src = tostring(r.src),
		}
	end

	local payload = {
		syncKey = SYNC_KEY,
		username = LP.Name,
		displayName = LP.DisplayName,
		userId = LP.UserId,
		gold = pd and safeNum(pd.gold_amount) or 0,
		gems = pd and safeNum(pd.gem_amount) or 0,
		level = pd and safeNum(pd.level or pd.player_level) or nil,
		equipped = team,
		inventory = invList,
		rewards = recentRewards,
		uniqueCount = uTotal,
		normalKindCount = nKinds,
	}

	return HttpService:JSONEncode(payload), #team, #invList
end

function Hub.CopyForWeb()
	local ok, json, teamCount, invCount = pcall(buildPayloadJson)
	if not ok then
		Hub.SyncStatus = "สร้างข้อมูลล้มเหลว"
		pcall(Hub.Render)
		return
	end
	local packet = "AAVAULT_SYNC::" .. json
	local didClip = false
	if copyClip then
		didClip = pcall(copyClip, packet)
	end
	local fileName = "AAVault_" .. LP.Name .. ".json"
	if saveFile then
		pcall(saveFile, fileName, json)
	end
	if didClip then
		Hub.SyncStatus = "คัดลอกแล้ว (" .. teamCount .. " ตัว, " .. invCount .. " ไอเทม) — กด Ctrl+V บนเว็บได้เลย"
		pcall(function()
			Hub.Toast("info", "คัดลอกข้อมูลจริงแล้ว! กลับไปกด Ctrl+V บนเว็บ AA Vault", "Legendary", 1)
		end)
	elseif saveFile then
		Hub.SyncStatus = "บันทึกไฟล์ workspace/" .. fileName .. " แล้ว"
		pcall(function()
			Hub.Toast("info", "บันทึกไฟล์ " .. fileName .. " ใน workspace แล้ว", "Legendary", 1)
		end)
	else
		Hub.SyncStatus = "ตัวรันไม่รองรับ setclipboard / writefile"
	end
	pcall(Hub.Render)
end

function Hub.SyncToWeb(force)
	if not Hub.Running or not Hub.Flags.WebSync then return end
	if Hub.HttpBlocked and not force then return end
	if not httpRequest then
		Hub.SyncStatus = "ตัวรันไม่รองรับ HTTP — กดปุ่ม 'คัดลอกข้อมูลเข้าเว็บ'"
		pcall(Hub.Render)
		return
	end
	if not force and (os.clock() - Hub.LastSync) < AUTO_SYNC_SEC then return end
	Hub.LastSync = os.clock()

	task.spawn(function()
		local ok, err = pcall(function()
			local json = buildPayloadJson()
			if saveFile then
				pcall(saveFile, "AAVault_" .. LP.Name .. ".json", json)
			end
			local res = httpRequest({
				Url = WEB_URL,
				Method = "POST",
				Headers = { ["Content-Type"] = "application/json" },
				Body = json,
			})
			local code = res and tonumber(res.StatusCode) or 0
			local body = res and tostring(res.Body or "") or ""
			if code == 200 and body:find('"ok"') then
				Hub.SyncOk = true
				Hub.HttpBlocked = false
				Hub.SyncStatus = "ซิงค์สดสำเร็จ (" .. clock() .. ")"
			elseif code == 302 or code == 401 or code == 403 or body:find("cookie_check") or body:find("accounts.google.com") then
				Hub.SyncOk = false
				Hub.HttpBlocked = true
				Hub.SyncStatus = "ติดล็อก Preview (HTTP " .. tostring(code) .. ") — กดปุ่ม 'คัดลอกข้อมูลเข้าเว็บ' ด้านบน"
				pcall(function()
					Hub.Toast("info", "เว็บติดล็อก Preview — กด 'คัดลอกข้อมูลเข้าเว็บ' แล้ว Ctrl+V บนเว็บ", "Epic", 1)
				end)
			else
				Hub.SyncOk = false
				Hub.SyncStatus = "HTTP Error " .. tostring(code) .. " — กดปุ่ม 'คัดลอกข้อมูลเข้าเว็บ'"
			end
		end)
		if not ok then
			Hub.SyncOk = false
			Hub.SyncStatus = "Sync Error — กดปุ่ม 'คัดลอกข้อมูลเข้าเว็บ'"
			warn("[2K WebSync] Sync error:", err)
		end
		pcall(Hub.Render)
	end)
end

------------------------------------------------------------------
-- 4) REWARD CAPTURE
------------------------------------------------------------------
local function addReward(kind, id, qty, source)
	local name = kind == "unit" and uName(id) or iName(id)
	local rarity = kind == "unit" and uRarity(id) or iRarity(id)
	local key = kind .. "|" .. tostring(id)
	Hub.Totals[key] = (Hub.Totals[key] or 0) + (qty or 1)
	local entry = {
		t = clock(),
		ts = os.time() * 1000,
		kind = kind,
		id = tostring(id),
		name = name,
		rarity = rarity,
		qty = qty or 1,
		src = source or "",
	}
	table.insert(Hub.Rewards, 1, entry)
	if #Hub.Rewards > 200 then table.remove(Hub.Rewards, 200) end
	if Hub.Flags.Notify then
		pcall(function() Hub.Toast(kind, name, rarity, qty) end)
	end
	Hub.SyncToWeb(false)
end

local function scanPayload(payload, source)
	local seen = {}
	local function walk(v, depth)
		if depth > 4 then return end
		if type(v) == "string" then
			if not seen[v] then
				if Items[v] then seen[v] = true; addReward("item", v, 1, source)
				elseif Units[v] then seen[v] = true; addReward("unit", v, 1, source) end
			end
		elseif type(v) == "table" then
			for k, vv in pairs(v) do
				if type(k) == "string" and (Items[k] or Units[k]) then
					if not seen[k] then
						seen[k] = true
						local qty = (type(vv) == "number" and vv) or 1
						addReward(Items[k] and "item" or "unit", k, qty, source)
					end
				else
					walk(vv, depth + 1)
				end
			end
		end
	end
	walk(payload, 0)
end

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

for _, n in ipairs({"show_unit_and_item_rewards", "unit_added", "unique_item_added", "normal_item_added"}) do
	hookEvent(n, function(args) scanPayload(args, n) end)
end
hookEvent("game_finished", function()
	pcall(function() Hub.Toast("info", "จบด่านแล้ว — อัปเดตข้อมูลแล้ว", "Legendary", 1) end)
	Hub.SyncToWeb(false)
end)

local lastUuids, lastNormal, invReadyAt = nil, nil, 0
function Hub.ResetInvBaseline()
	lastUuids = nil
	lastNormal = nil
	invReadyAt = 0
end

local function diffInventory(baselineOnly)
	local pd = findProfile()
	if not pd or type(pd.inventory) ~= "table" then return end
	local normal, unique = getInventory()
	local uset = {}
	local entryCount = 0
	for _, v in pairs(unique) do
		if type(v) == "table" and v.uuid then
			uset[tostring(v.uuid)] = tostring(v.item_id)
			entryCount = entryCount + 1
		end
	end
	local nset = {}
	for k, v in pairs(normal) do
		local q = tonumber(v) or 0
		nset[tostring(k)] = q
		if q > 0 then entryCount = entryCount + 1 end
	end

	-- รอจนกว่ากระเป๋าจะโหลดเสร็จจริง และเก็บเป็นฐานเริ่มต้นโดยไม่ส่งเข้า "ของดรอป"
	if not lastUuids then
		if entryCount > 0 then
			lastUuids, lastNormal = uset, nset
			invReadyAt = os.clock()
		end
		return
	end

	-- ช่วงอุ่นเครื่อง 5 วินาทีแรกหลังโหลดกระเป๋า ให้อัปเดตฐานเฉยๆ ไม่นับเป็นของดรอป
	if baselineOnly or (os.clock() - invReadyAt) < 5 then
		lastUuids, lastNormal = uset, nset
		return
	end

	local pending = {}
	local uCount = {}
	for u, id in pairs(uset) do
		if not lastUuids[u] then uCount[id] = (uCount[id] or 0) + 1 end
	end
	for id, q in pairs(uCount) do
		pending[#pending + 1] = { id = id, qty = q }
	end
	for id, q in pairs(nset) do
		local old = lastNormal[id] or 0
		if q > old then
			pending[#pending + 1] = { id = id, qty = q - old }
		end
	end

	lastUuids, lastNormal = uset, nset

	-- กันกรณีรีโหลดโปรไฟล์ทั้งกระเป๋าพร้อมกัน (โผล่ทีเดียวเกิน 12 ชนิด)
	if #pending > 12 then return end
	for _, d in ipairs(pending) do
		addReward("item", d.id, d.qty, "inventory")
	end
end

------------------------------------------------------------------
-- 5) TOAST NOTIFICATION
------------------------------------------------------------------
local toastGui = Instance.new("ScreenGui")
toastGui.Name = "2K_RewardToasts"
toastGui.ResetOnSpawn = false
toastGui.DisplayOrder = 90
pcall(function() toastGui.Parent = (gethui and gethui()) or PG end)
if not toastGui.Parent then toastGui.Parent = PG end

local toastHolder = Instance.new("Frame")
toastHolder.Size = UDim2.new(0, 320, 1, -40)
toastHolder.Position = UDim2.new(1, -335, 0, 20)
toastHolder.BackgroundTransparency = 1
toastHolder.Parent = toastGui
local tlist = Instance.new("UIListLayout", toastHolder)
tlist.Padding = UDim.new(0, 6)
tlist.SortOrder = Enum.SortOrder.LayoutOrder
tlist.VerticalAlignment = Enum.VerticalAlignment.Top

function Hub.Toast(kind, name, rarity, qty)
	local f = Instance.new("Frame")
	f.Size = UDim2.new(1, 0, 0, 44)
	f.BackgroundColor3 = Color3.fromRGB(20, 24, 34)
	f.BackgroundTransparency = 0.08
	f.BorderSizePixel = 0
	f.Parent = toastHolder
	Instance.new("UICorner", f).CornerRadius = UDim.new(0, 8)
	local st = Instance.new("UIStroke", f)
	st.Color = rcol(rarity); st.Thickness = 1.5
	local t1 = Instance.new("TextLabel")
	t1.Size = UDim2.new(1, -18, 0, 20)
	t1.Position = UDim2.fromOffset(10, 3)
	t1.BackgroundTransparency = 1
	t1.Font = Enum.Font.GothamBold
	t1.TextSize = 12
	t1.TextXAlignment = Enum.TextXAlignment.Left
	t1.TextColor3 = rcol(rarity)
	local prefix = kind == "unit" and "+ UNIT  " or (kind == "item" and "+ ITEM  " or "")
	t1.Text = prefix .. name .. ((qty or 1) > 1 and (" x" .. qty) or "")
	t1.Parent = f
	local t2 = Instance.new("TextLabel")
	t2.Size = UDim2.new(1, -18, 0, 14)
	t2.Position = UDim2.fromOffset(10, 24)
	t2.BackgroundTransparency = 1
	t2.Font = Enum.Font.Gotham
	t2.TextSize = 10
	t2.TextXAlignment = Enum.TextXAlignment.Left
	t2.TextColor3 = Color3.fromRGB(165, 175, 195)
	t2.Text = tostring(rarity) .. "  •  " .. clock()
	t2.Parent = f
	task.spawn(function()
		task.wait(3.5)
		local T = game:GetService("TweenService")
		pcall(function() T:Create(f, TweenInfo.new(0.35), {BackgroundTransparency = 1}):Play() end)
		pcall(function() T:Create(t1, TweenInfo.new(0.35), {TextTransparency = 1}):Play() end)
		pcall(function() T:Create(t2, TweenInfo.new(0.35), {TextTransparency = 1}):Play() end)
		task.wait(0.4)
		pcall(function() f:Destroy() end)
	end)
end
${guiSection}
------------------------------------------------------------------
-- 7) LOOP
------------------------------------------------------------------
function Hub.Refresh(forceRender)
	if not Hub.Running then return end
	diffInventory()
	if forceRender or true then pcall(Hub.Render) end
end

task.spawn(function()
	pcall(diffInventory, true)
	Hub.SyncToWeb(true)
	while Hub.Running do
		pcall(Hub.Refresh)
		Hub.SyncToWeb(false)
		task.wait(2)
	end
end)

pcall(Hub.Render)
Hub.Toast("info", "2K AA Vault เริ่มทำงานแล้ว — ซิงค์ข้อมูลอัตโนมัติ", "Legendary", 1)
`;
}

export default async function handler(req: Req, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

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
      ? Math.min(120, Math.max(5, Math.round(rawInterval)))
      : 10;
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

  // Proxy Roblox 3D full-body avatar thumbnail URL for the account profile stage
  const avatarMatch = pathname.match(/^\/api\/avatar\/(\d{1,15})$/);
  if (req.method === 'GET' && avatarMatch) {
    const userId = avatarMatch[1];
    try {
      const upstream = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`,
        { headers: { Accept: 'application/json' } }
      );
      if (!upstream.ok) {
        sendJson(res, { ok: false, imageUrl: null }, 200);
        return;
      }
      const data = (await upstream.json()) as {
        data?: Array<{ state?: string; imageUrl?: string }>;
      };
      const entry = data?.data?.[0];
      const imageUrl =
        entry?.state === 'Completed' && typeof entry.imageUrl === 'string' && entry.imageUrl
          ? entry.imageUrl
          : null;
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=600',
        ...CORS_HEADERS,
      });
      res.end(JSON.stringify({ ok: Boolean(imageUrl), imageUrl }));
    } catch {
      sendJson(res, { ok: false, imageUrl: null }, 200);
    }
    return;
  }

  // Optional transparent proxy to Cloudflare Worker if set in Vercel Environment Variables
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
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      });
      res.end(text);
    } catch {
      sendJson(res, { error: 'ไม่สามารถเชื่อมต่อไปยัง Cloudflare Worker ปลายทางได้' }, 502);
    }
    return;
  }

  const provider = detectProvider();

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
        timestamp: Date.now(),
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/accounts') {
      const syncKey = sanitizeKey(parsedUrl.searchParams.get('key'));
      const room = (await storeGet<Record<string, AccountSnapshot>>(`room:${syncKey}`)) || {};
      const accounts = Object.values(room).sort((a, b) => b.lastSyncedAt - a.lastSyncedAt);
      sendJson(res, { syncKey, accounts, provider: provider.name });
      return;
    }

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
      if (!body?.username || typeof body.username !== 'string') {
        sendJson(res, { error: 'Missing username' }, 400);
        return;
      }

      const room = (await storeGet<Record<string, AccountSnapshot>>(`room:${syncKey}`)) || {};
      const accountId =
        body.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'player';
      const existing = room[accountId];
      const prevCount = existing?.rewards.length ?? 0;

      const updated = buildSnapshot(body, existing);
      room[updated.accountId] = updated;
      await storePut(`room:${syncKey}`, room);

      sendJson(res, {
        ok: true,
        provider: provider.name,
        syncKey,
        accountId: updated.accountId,
        lastSyncedAt: updated.lastSyncedAt,
        newRewardsCount: Math.max(0, updated.rewards.length - prevCount),
      });
      return;
    }

    const clearMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/clear-drops$/);
    if (req.method === 'POST' && clearMatch) {
      const accountId = decodeURIComponent(clearMatch[1]);
      const syncKey = sanitizeKey(parsedUrl.searchParams.get('key'));
      const room = (await storeGet<Record<string, AccountSnapshot>>(`room:${syncKey}`)) || {};
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
      const room = (await storeGet<Record<string, AccountSnapshot>>(`room:${syncKey}`)) || {};
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
      const room = (await storeGet<Record<string, AccountSnapshot>>(`room:${syncKey}`)) || {};
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
    sendJson(res, { error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' }, 500);
  }
}
