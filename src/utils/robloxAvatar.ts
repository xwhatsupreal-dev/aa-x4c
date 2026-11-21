import type { RobloxAvatarAppearance } from '../types.ts';

// Standard Roblox BrickColor ID -> Hex lookup for common avatar skin & body colors
const BRICK_COLORS: Record<number, string> = {
  1: '#F2F3F3',
  5: '#D7C59A',
  9: '#E8BAC8',
  11: '#80BBDB',
  12: '#CB8442',
  18: '#CC8E69',
  21: '#C4281C',
  22: '#C470A0',
  23: '#0D69AC',
  24: '#F5CD30',
  25: '#624732',
  26: '#1B2A35',
  28: '#287F47',
  29: '#A1C48C',
  37: '#4B974B',
  38: '#A05F35',
  45: '#B4D2E4',
  101: '#DA867A',
  102: '#6E99CA',
  104: '#6B327C',
  105: '#E29B40',
  106: '#DA8541',
  107: '#008F9C',
  119: '#A4BD47',
  125: '#EAB892',
  135: '#74869D',
  141: '#27462D',
  151: '#789082',
  153: '#957977',
  192: '#694028',
  194: '#A3A2A5',
  199: '#635F62',
  208: '#E5E4DF',
  217: '#7C5C46',
  226: '#FDEA8D',
  301: '#506D54',
  302: '#5B5D69',
  305: '#527CAE',
  306: '#335882',
  307: '#102A4C',
  310: '#5A4C42',
  312: '#3E3C39',
  314: '#1F801D',
  315: '#665242',
  317: '#7C9C6B',
  320: '#A75E9B',
  321: '#A75E9B',
  327: '#970000',
  330: '#FF98DC',
  331: '#FF5959',
  332: '#750000',
  333: '#EFB838',
  334: '#F8D96D',
  335: '#E7E7EC',
  336: '#C7D4E4',
  337: '#FF9494',
  338: '#BE6862',
  339: '#562424',
  340: '#F1E7C7',
  341: '#FEF3BB',
  342: '#E0B2D0',
  343: '#D490BD',
  344: '#965555',
  345: '#8F4C2A',
  346: '#D3BE96',
  347: '#E2DCBC',
  348: '#EDEAEA',
  349: '#E9DADA',
  350: '#883E3E',
  351: '#BC9B5D',
  352: '#C7AC78',
  353: '#CABFA3',
  354: '#BBB3B2',
  355: '#6C584B',
  356: '#A0844F',
  357: '#958988',
  358: '#ABA89E',
  359: '#AF9483',
  360: '#966766',
  361: '#564236',
  362: '#7E683F',
  363: '#69665C',
  364: '#5A4C42',
  365: '#6A3909',
  1001: '#F8F8F8',
  1002: '#CDCDCD',
  1003: '#111111',
  1004: '#FF0000',
  1005: '#FFB000',
  1006: '#B480FF',
  1007: '#A34B4B',
  1008: '#C1BE42',
  1009: '#FFFF00',
  1010: '#0000FF',
  1011: '#002060',
  1012: '#2154B9',
  1013: '#04AFEC',
  1014: '#AA5500',
  1015: '#AA00AA',
  1016: '#FF66CC',
  1017: '#FFAF00',
  1018: '#12EED4',
  1019: '#00FFFF',
  1020: '#00FF00',
  1021: '#3A7D15',
  1022: '#7F8E64',
  1023: '#8C5B9F',
  1024: '#AFDDFF',
  1025: '#FFC9C9',
  1026: '#B1A7FF',
  1027: '#9FF3E9',
  1028: '#CCFFCC',
  1029: '#FFFFCC',
  1030: '#FFCC99',
  1031: '#6225D1',
  1032: '#FF00BF',
};

export function brickColorToHex(id: unknown, fallback = '#D7C59A'): string {
  const n = Number(id);
  if (Number.isFinite(n) && BRICK_COLORS[n]) return BRICK_COLORS[n];
  return fallback;
}

export interface RobloxAvatarInfo {
  ok: boolean;
  userId: number | null;
  imageUrl: string | null;
  headshotUrl: string | null;
  avatarType: 'R6' | 'R15';
  bodyColors: NonNullable<RobloxAvatarAppearance['bodyColors']>;
  scales: {
    height: number;
    width: number;
    head: number;
    depth: number;
  };
  assets: Array<{ id: number; name: string; type: string }>;
}

const ALLOWED_RBX_CDN = /^https:\/\/([a-z0-9-]+\.)?rbxcdn\.com\//i;

export function isAllowedRobloxCdnUrl(raw: string): boolean {
  return ALLOWED_RBX_CDN.test(raw);
}

async function resolveUserIdByUsername(username: string): Promise<number | null> {
  const clean = username.trim();
  if (!clean) return null;
  try {
    const res = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ usernames: [clean], excludeBannedUsers: false }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ id?: number }> };
    const id = Number(data?.data?.[0]?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

async function fetchThumbnailWithRetry(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        data?: Array<{ state?: string; imageUrl?: string }>;
      };
      const entry = data?.data?.[0];
      if (entry?.state === 'Completed' && entry.imageUrl) {
        return entry.imageUrl;
      }
      if (entry?.state === 'Pending' && attempt === 0) {
        await new Promise((r) => setTimeout(r, 450));
        continue;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function fetchRobloxAvatarInfo(
  rawUserId?: string | number | null,
  rawUsername?: string | null
): Promise<RobloxAvatarInfo> {
  let uid: number | null = null;
  if (rawUserId !== undefined && rawUserId !== null && /^\d{1,15}$/.test(String(rawUserId))) {
    const parsed = Number(rawUserId);
    if (Number.isFinite(parsed) && parsed > 0) uid = parsed;
  }
  if (!uid && rawUsername) {
    uid = await resolveUserIdByUsername(rawUsername);
  }

  const defaultInfo: RobloxAvatarInfo = {
    ok: false,
    userId: uid,
    imageUrl: null,
    headshotUrl: null,
    avatarType: 'R15',
    bodyColors: {
      head: '#EAB892',
      torso: '#0D69AC',
      leftArm: '#EAB892',
      rightArm: '#EAB892',
      leftLeg: '#263238',
      rightLeg: '#263238',
    },
    scales: { height: 1, width: 1, head: 1, depth: 1 },
    assets: [],
  };

  if (!uid) return defaultInfo;

  const [imageUrl, headshotUrl, avatarJson] = await Promise.all([
    fetchThumbnailWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${uid}&size=720x720&format=Png&isCircular=false`
    ),
    fetchThumbnailWithRetry(
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
  const bodyColors = {
    head: brickColorToHex(bc?.headColorId, '#EAB892'),
    torso: brickColorToHex(bc?.torsoColorId, '#0D69AC'),
    leftArm: brickColorToHex(bc?.leftArmColorId, '#EAB892'),
    rightArm: brickColorToHex(bc?.rightArmColorId, '#EAB892'),
    leftLeg: brickColorToHex(bc?.leftLegColorId, '#263238'),
    rightLeg: brickColorToHex(bc?.rightLegColorId, '#263238'),
  };

  const sc = raw?.scales;
  const scales = {
    height: Math.min(1.25, Math.max(0.8, Number(sc?.height) || 1)),
    width: Math.min(1.25, Math.max(0.7, Number(sc?.width) || 1)),
    head: Math.min(1.2, Math.max(0.85, Number(sc?.head) || 1)),
    depth: Math.min(1.2, Math.max(0.75, Number(sc?.depth) || 1)),
  };

  const assets = Array.isArray(raw?.assets)
    ? raw.assets
        .filter((a) => a && a.name)
        .slice(0, 16)
        .map((a) => ({
          id: Number(a.id) || 0,
          name: String(a.name),
          type: String(a.assetType?.name || 'Item'),
        }))
    : [];

  return {
    ok: Boolean(imageUrl || headshotUrl || raw),
    userId: uid,
    imageUrl,
    headshotUrl,
    avatarType: raw?.playerAvatarType === 'R6' ? 'R6' : 'R15',
    bodyColors,
    scales,
    assets,
  };
}

const BLOCKED_RBX_PLACEHOLDER_RE =
  /180DAY-(?:e5bef3179d5ce82a42fdc8ddc83a2ba9|a53354b1f60a5dedc00d0600d1491075)/i;

export function isBlockedRobloxPlaceholderUrl(raw: string): boolean {
  return BLOCKED_RBX_PLACEHOLDER_RE.test(raw);
}

const assetThumbCache = new Map<string, { url: string | null; expiresAt: number }>();

export function extractRobloxAssetId(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const match = String(raw).match(/(\d{4,15})/);
  return match ? match[1] : null;
}

export async function resolveRobloxAssetImageUrl(rawId: string): Promise<string | null> {
  const id = extractRobloxAssetId(rawId);
  if (!id) return null;

  const cached = assetThumbCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  for (const size of ['420x420', '150x150']) {
    const url = await fetchThumbnailWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${id}&size=${size}&format=Png&isCircular=false`
    );
    if (url && isAllowedRobloxCdnUrl(url) && !isBlockedRobloxPlaceholderUrl(url)) {
      assetThumbCache.set(id, { url, expiresAt: Date.now() + 3600_000 });
      return url;
    }
  }

  assetThumbCache.set(id, { url: null, expiresAt: Date.now() + 300_000 });
  return null;
}


