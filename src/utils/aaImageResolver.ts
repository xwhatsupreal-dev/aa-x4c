import {
  isAllowedRobloxCdnUrl,
  isBlockedRobloxPlaceholderUrl,
  resolveRobloxAssetImageUrl,
} from './robloxAvatar.ts';

export type AaImageKind = 'stage' | 'unit' | 'item' | 'currency';

export interface AaImageQuery {
  kind: AaImageKind;
  name?: string;
  id?: string;
  world?: string;
  map?: string;
  assetId?: string;
}

const WIKI_API = 'https://animeadventures.fandom.com/api.php';
const ALLOWED_WIKI_IMAGE_RE =
  /^https:\/\/static\.wikia\.nocookie\.net\/animeadventures\/images\//i;
const BAD_WIKI_FILENAME_RE =
  /(?:^|\/)(?:Unknown|Placeholder|Site-logo|Wiki-wordmark|Damage_type_|No_image)/i;

const imageResolveCache = new Map<string, { url: string | null; expiresAt: number }>();

export function isAllowedAaImageUrl(raw: string): boolean {
  if (ALLOWED_WIKI_IMAGE_RE.test(raw)) return true;
  if (isAllowedRobloxCdnUrl(raw) && !isBlockedRobloxPlaceholderUrl(raw)) return true;
  return false;
}

function cleanText(raw?: string, maxLen = 96): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLen);
}

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

function uniqueList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
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

async function fetchWikiJson(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  try {
    const qs = new URLSearchParams({ action: 'query', format: 'json', ...params });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${WIKI_API}?${qs.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AAVault/2.5',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isGoodWikiImageUrl(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    ALLOWED_WIKI_IMAGE_RE.test(url) &&
    !BAD_WIKI_FILENAME_RE.test(url) &&
    !/\.svg(?:\/|\?|$)/i.test(url)
  );
}

async function queryWikiFiles(fileTitles: string[], width = 256): Promise<string | null> {
  const titles = uniqueList(fileTitles).slice(0, 12);
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
          {
            title?: string;
            missing?: string;
            imageinfo?: Array<{ thumburl?: string; url?: string }>;
          }
        >;
      }
    | undefined;
  const pages = Object.values(query?.pages || {});
  const byTitle = new Map<string, string>();

  for (const p of pages) {
    if (!p || p.missing !== undefined) continue;
    const info = p.imageinfo?.[0];
    const url = info?.thumburl || info?.url;
    if (p.title && isGoodWikiImageUrl(url)) {
      byTitle.set(p.title.toLowerCase(), url);
    }
  }

  for (const candidate of titles) {
    const hit = byTitle.get(candidate.toLowerCase());
    if (hit) return hit;
  }
  const first = byTitle.values().next().value;
  return first || null;
}

async function queryWikiPageImages(pageTitles: string[], width = 256): Promise<string | null> {
  const titles = uniqueList(pageTitles).slice(0, 8);
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

  const pages = Object.values(query?.pages || {});
  const byTitle = new Map<string, string>();

  for (const p of pages) {
    if (!p || p.missing !== undefined) continue;
    const url = p.thumbnail?.source || p.original?.source;
    if (p.title && isGoodWikiImageUrl(url)) {
      byTitle.set(p.title.toLowerCase(), url);
    }
  }

  for (const candidate of titles) {
    const hit = byTitle.get(candidate.toLowerCase());
    if (hit) return hit;
  }
  const first = byTitle.values().next().value;
  return first || null;
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
          {
            index?: number;
            title?: string;
            imageinfo?: Array<{ thumburl?: string; url?: string }>;
          }
        >;
      }
    | undefined;

  const pages = Object.values(query?.pages || {}).sort(
    (a, b) => (a.index ?? 99) - (b.index ?? 99)
  );

  for (const p of pages) {
    const url = p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url;
    if (!p.title || !isGoodWikiImageUrl(url)) continue;
    if (/\.gif(?:\/|\?|$)/i.test(url)) continue;
    const fileTokens = normalizeMatchTokens(p.title);
    const matched = targetTokens.filter((t) => fileTokens.includes(t)).length;
    if (matched >= targetTokens.length || (targetTokens.length >= 2 && matched >= targetTokens.length - 1)) {
      return url;
    }
  }
  return null;
}

const CURRENCY_FILE_MAP: Record<string, string[]> = {
  gold: ['File:Gold.png'],
  gems: ['File:Gems.png'],
  gem: ['File:Gems.png'],
  first_clear_gems: ['File:Gems.png'],
  trophies: ['File:Trophies.png'],
  trophy: ['File:Trophies.png'],
  trait_tokens: ['File:Star Remnant.png', 'File:Remnant.png'],
  trait_reroll: ['File:Star Remnant.png', 'File:Remnant.png'],
  curse_tokens: ['File:Cursed Womb.png', 'File:Curse Token.png'],
  rebirth_tokens: ['File:Rebirth Token.png'],
  resource: ['File:Holiday Stars.png', 'File:Candies.png', 'File:Pearls.png'],
};

export async function resolveAaImageUrl(query: AaImageQuery): Promise<string | null> {
  const kind: AaImageKind =
    query.kind === 'stage' ||
    query.kind === 'unit' ||
    query.kind === 'currency' ||
    query.kind === 'item'
      ? query.kind
      : 'item';
  const name = cleanText(query.name);
  const id = cleanText(query.id);
  const world = cleanText(query.world);
  const map = cleanText(query.map);
  const assetId = cleanText(query.assetId, 24);

  const cacheKey = `${kind}|${name.toLowerCase()}|${id.toLowerCase()}|${world.toLowerCase()}|${map.toLowerCase()}|${assetId}`;
  const cached = imageResolveCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  let resolved: string | null = null;

  // 1) Try genuine public Roblox asset thumbnail first if an assetId was provided
  if (assetId && /^\d{4,15}$/.test(assetId)) {
    resolved = await resolveRobloxAssetImageUrl(assetId);
  }

  // 2) Resolve official HD Anime Adventures Wiki artwork by kind + name + id
  if (!resolved) {
    const baseName = stripParens(name);
    const idTitle = titleCaseFromId(id);

    if (kind === 'currency') {
      const lowerId = id.toLowerCase();
      const lowerName = name.toLowerCase();
      const preset =
        CURRENCY_FILE_MAP[lowerId] ||
        CURRENCY_FILE_MAP[lowerName] ||
        (lowerName.includes('gem')
          ? ['File:Gems.png']
          : lowerName.includes('gold')
            ? ['File:Gold.png']
            : lowerName.includes('trophy')
              ? ['File:Trophies.png']
              : lowerName.includes('trait') || lowerName.includes('remnant')
                ? ['File:Star Remnant.png']
                : []);
      const candidates = uniqueList([
        ...preset,
        ...(name ? [`File:${name}.png`] : []),
        ...(baseName ? [`File:${baseName}.png`] : []),
      ]);
      resolved = await queryWikiFiles(candidates, 160);
    } else if (kind === 'stage') {
      const STAGE_WIKI_ALIAS_MAP: Array<[RegExp, string[]]> = [
        [/shibuya/i, ['File:Shibuya Incident UOThumbnail.png']],
        [/night[\s_-]*market/i, ['File:Night Market Thumbnail.png']],
        [/infinity[\s_-]*castle/i, ['File:Infinity Castle.png']],
        [/namak|namek/i, ['File:Map - Planet Namak.png']],
        [/marine/i, ["File:Map - Marine's Ford.png"]],
        [/clover/i, ['File:Map - Clover Kingdom.png']],
        [/sand[\s_-]*village|hidden[\s_-]*sand/i, ['File:Map - Hidden Sand Village.png']],
        [/hollow[\s_-]*invasion/i, ['File:Map - Hollow Invasion.png']],
        [/hollow/i, ['File:Map - Hollow World.png']],
        [/hero[\s_-]*city|midnight/i, ['File:Map - Hero City.png']],
        [/ghoul/i, ['File:Map - Ghoul City.png']],
        [/snowy/i, ['File:Map - Snowy Town.png']],
        [/undead|tomb/i, ['File:Map - Undead Tomb.png']],
        [/ant[\s_-]*kingdom/i, ['File:Map - Ant Kingdom.png']],
        [/alien|spaceship/i, ['File:Map - Alien Spaceship.png']],
        [/puppet|dressrosa/i, ['File:Map - Puppet Island.png']],
        [/virtual|dungeon/i, ['File:Map - Virtual Dungeon.png']],
        [/windhym/i, ['File:Map - Windhym.png']],
        [/fabled/i, ['File:Map - Fabled Kingdom.png']],
        [/cursed[\s_-]*academy|jujutsu/i, ['File:Map - Cursed Academy.png']],
        [/cape[\s_-]*canaveral|jojo/i, ['File:Map - Cape Canaveral.png']],
        [/magic[\s_-]*town/i, ['File:Map - Magic Town.png']],
        [/shinganshinu|aot|titan/i, ['File:Map - Shinganshinu District.png']],
      ];
      const mapTitle = titleCaseFromId(map);
      const stageNames = uniqueList([name, baseName, world, mapTitle]).filter(
        (s) => s.toLowerCase() !== 'lobby' && s !== 'ล็อบบี้'
      );
      const combinedStage = [name, id, world, map].filter(Boolean).join(' ');
      const aliasFiles: string[] = [];
      for (const [re, files] of STAGE_WIKI_ALIAS_MAP) {
        if (re.test(combinedStage)) aliasFiles.push(...files);
      }
      const fileCandidates = uniqueList([
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
      const pageCandidates = uniqueList([name, baseName, idTitle]);
      resolved = await queryWikiPageImages(pageCandidates, 256);
      if (!resolved) {
        const fileCandidates = uniqueList(
          pageCandidates.flatMap((s) => [`File:${s}.png`, `File:${s} (Pose).png`])
        );
        resolved = await queryWikiFiles(fileCandidates, 256);
      }
    } else {
      // item
      const itemNames = uniqueList([name, baseName, idTitle]);
      const fileCandidates = uniqueList(
        itemNames.flatMap((s) => [`File:${s}.png`, `File:${s}.webp`])
      );
      resolved = await queryWikiFiles(fileCandidates, 220);
      if (!resolved && name) {
        resolved = await searchWikiFileStrict(name, 220);
      }
      if (!resolved && baseName && baseName !== name) {
        resolved = await searchWikiFileStrict(baseName, 220);
      }
    }
  }

  const finalUrl = resolved && isAllowedAaImageUrl(resolved) ? resolved : null;
  imageResolveCache.set(cacheKey, {
    url: finalUrl,
    expiresAt: Date.now() + (finalUrl ? 24 * 3600_000 : 30 * 60_000),
  });
  return finalUrl;
}
