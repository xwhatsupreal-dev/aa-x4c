import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Code2,
  Coins,
  Copy,
  Dices,
  Download,
  Gem,
  History,
  LayoutGrid,
  List,
  MapPin,
  Monitor,
  Package,
  Search,
  Share2,
  Sparkles,
  Swords,
  Trash2,
  Trophy,
  WifiOff,
  X,
} from 'lucide-react';
import {
  formatClock,
  formatCompact,
  formatNumber,
  formatRelativeTime,
  formatThaiDateTime,
  getDisconnectHintTh,
  isAccountOnline,
  isScriptOutdated,
  RARITY_META,
  RARITY_ORDER,
  RARITY_RANK,
  SCRIPT_UPDATED_AT,
  SCRIPT_VERSION,
} from '../data/aaCatalog.ts';
import type {
  AccountSnapshot,
  Rarity,
  RewardEntry,
  TeamUnit,
} from '../types.ts';
import { ItemEmblem } from './ItemEmblem.tsx';
import { RobloxAssetThumb } from './RobloxAssetThumb.tsx';
import { RobloxAvatarStage } from './RobloxAvatarStage.tsx';
import { RobloxHeadshot } from './RobloxHeadshot.tsx';

export type DashboardTab = 'drops' | 'obtained' | 'inventory';

interface AccountDashboardProps {
  account: AccountSnapshot;
  nowTs: number;
  syncKey: string;
  storageLabel: string;
  isReadOnly: boolean;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onOpenSync?: () => void;
  onOpenShare?: () => void;
  onClearDrops: () => Promise<void>;
}

interface DropBatch {
  id: string;
  ts: number;
  timeLabel: string;
  src: string;
  srcLabel: string;
  srcShort: string;
  topRarity: Rarity;
  totalQty: number;
  entries: RewardEntry[];
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

const SOURCE_INFO: Record<string, { label: string; short: string }> = {
  stage_clear: { label: 'รางวัลจบด่าน', short: 'จบด่าน' },
  show_unit_and_item_rewards: { label: 'รางวัลจบด่าน', short: 'จบด่าน' },
  unit_added: { label: 'ได้รับยูนิตใหม่', short: 'ยูนิต' },
  unique_item_added: { label: 'ได้รับไอเทม Unique', short: 'Unique' },
  normal_item_added: { label: 'ได้รับไอเทมใหม่', short: 'ไอเทม' },
  inventory: { label: 'ได้รับเข้ากระเป๋า', short: 'กระเป๋า' },
  sync: { label: 'อัปเดตจากเกม', short: 'ซิงค์' },
};

type InventorySort = 'rarity' | 'qty' | 'name';

function shortTrait(trait: string): string {
  const clean = trait.trim();
  if (!clean) return '';
  if (clean.length <= 6) return clean;
  return clean.slice(0, 5) + '…';
}

function getUnitInitials(name: string): string {
  const parts = name
    .replace(/[^a-zA-Z0-9ก-๙\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'AA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const DEFAULT_GOLD_ICON_ID = '100751534594369';
const DEFAULT_GEMS_ICON_ID = '71405874061254';
const DEFAULT_SUMMER_PEARLS_ICON_ID = '128058918644138';
const DEFAULT_REROLL_TOKEN_ICON_ID = '99186363801156';

function inferItemTier(tier?: string, id?: string, name?: string): string | undefined {
  if (tier && tier.trim()) return tier.trim();
  const idStr = String(id || '');
  const mId =
    idStr.match(/(?:charm|portal)[_-]+(\d{1,2})$/i) ||
    idStr.match(/[_-]tier[_-]*(\d{1,2})$/i) ||
    idStr.match(/[_-]t(\d{1,2})$/i);
  if (mId) return `Tier ${Number(mId[1])}`;
  const nameStr = String(name || '');
  const mName = nameStr.match(/\btier\s*(\d{1,2})\b/i);
  if (mName) return `Tier ${Number(mName[1])}`;
  return undefined;
}

function tierRankValue(tier?: string): number {
  if (!tier) return 0;
  const m = tier.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function normalizeBagGroup(group: string, id: string, name: string, kind: string): string {
  if (kind === 'unit') return 'Units';
  const lowG = (group || '').toLowerCase();
  const hay = `${id} ${name}`.toLowerCase();
  if (lowG.includes('portal') || hay.includes('portal')) return 'Portals';
  if (lowG.includes('charm') || hay.includes('charm')) return 'Charms';
  return group || 'Other';
}

function resolveCurrencyIconId(
  id: string,
  name: string,
  explicitIconId?: string,
  currencyIcons?: AccountSnapshot['currencyIcons']
): string | undefined {
  if (explicitIconId) return explicitIconId;
  const hay = `${id} ${name}`.toLowerCase();
  if (hay.includes('pearl') || hay.includes('summer')) {
    return currencyIcons?.summerPearls;
  }
  if (hay.includes('gold')) {
    return currencyIcons?.gold || DEFAULT_GOLD_ICON_ID;
  }
  if (hay.includes('gem')) {
    return currencyIcons?.gems || DEFAULT_GEMS_ICON_ID;
  }
  return undefined;
}

export function AccountDashboard({
  account,
  nowTs,
  syncKey,
  storageLabel,
  isReadOnly,
  activeTab,
  onTabChange,
  onOpenSync,
  onOpenShare,
  onClearDrops,
}: AccountDashboardProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [clearingDrops, setClearingDrops] = useState(false);

  // Drops filter state
  const [dropSearch, setDropSearch] = useState('');
  const [dropRarity, setDropRarity] = useState<Rarity | 'ALL'>('ALL');

  // Inventory filter state
  const [invSearch, setInvSearch] = useState('');
  const [invGroup, setInvGroup] = useState<string>('ALL');
  const [invRarity, setInvRarity] = useState<Rarity | 'ALL'>('ALL');
  const [invSort, setInvSort] = useState<InventorySort>('rarity');
  const [invView, setInvView] = useState<'grid' | 'table'>('grid');
  const [copiedSummary, setCopiedSummary] = useState(false);

  const online = isAccountOnline(
    account.lastSyncedAt,
    nowTs,
    account.syncIntervalSec,
    account.disconnected
  );
  const isDisconnected = Boolean(account.disconnected);
  const scriptOutdated = isScriptOutdated(account.scriptVersion);

  // Fixed 6 team slots
  const slots: Array<{ slot: number; unit: TeamUnit | null }> = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const slotNum = i + 1;
        const found =
          account.equipped.find((u) => u.slot === slotNum) ??
          account.equipped[i] ??
          null;
        return { slot: slotNum, unit: found };
      }),
    [account.equipped]
  );

  const activeUnit =
    selectedSlot !== null
      ? slots.find((s) => s.slot === selectedSlot)?.unit ?? null
      : null;

  const shinyCount = useMemo(
    () => account.equipped.filter((u) => u.shiny).length,
    [account.equipped]
  );
  const secretCount = useMemo(
    () => account.equipped.filter((u) => u.rarity === 'Secret').length,
    [account.equipped]
  );
  const totalInventoryPieces = useMemo(
    () => account.inventory.reduce((sum, it) => sum + it.qty, 0),
    [account.inventory]
  );

  // Group stage-clear drops by runId (1 completed stage run = 1 bundled row), capped at 15 latest entries
  const MAX_DROP_HISTORY_RUNS = 15;

  const allDropBatches = useMemo<DropBatch[]>(() => {
    const batches: DropBatch[] = [];
    const runMap = new Map<string, DropBatch>();

    for (const r of account.rewards) {
      if (r.runId) {
        const existingBatch = runMap.get(r.runId);
        if (existingBatch) {
          existingBatch.entries.push(r);
          existingBatch.totalQty += r.qty;
          if (RARITY_RANK[r.rarity] > RARITY_RANK[existingBatch.topRarity]) {
            existingBatch.topRarity = r.rarity;
          }
          if (!existingBatch.stageImageId && r.stageImageId) {
            existingBatch.stageImageId = r.stageImageId;
          }
          continue;
        }
        if (batches.length >= MAX_DROP_HISTORY_RUNS) continue;
        const info = SOURCE_INFO[r.src] || { label: 'รางวัลจบด่าน', short: 'จบด่าน' };
        const batch: DropBatch = {
          id: `run-${r.runId}`,
          ts: r.ts,
          timeLabel: r.ts > 0 ? `${formatClock(r.ts)} น.` : r.t,
          src: r.src,
          srcLabel: info.label,
          srcShort: info.short,
          topRarity: r.rarity,
          totalQty: r.qty,
          entries: [r],
          runId: r.runId,
          stageName: r.stageName,
          stageWorld: r.stageWorld,
          stageMap: r.stageMap,
          stageDifficulty: r.stageDifficulty,
          stageGamemode: r.stageGamemode,
          stageWaves: r.stageWaves,
          stageTimer: r.stageTimer,
          stageImageId: r.stageImageId,
        };
        runMap.set(r.runId, batch);
        batches.push(batch);
        continue;
      }

      const prev = batches[batches.length - 1];
      const sameWindow =
        prev &&
        !prev.runId &&
        prev.src === r.src &&
        Math.abs(prev.ts - r.ts) <= 15_000;

      if (sameWindow) {
        prev.entries.push(r);
        prev.totalQty += r.qty;
        if (RARITY_RANK[r.rarity] > RARITY_RANK[prev.topRarity]) {
          prev.topRarity = r.rarity;
        }
      } else {
        if (batches.length >= MAX_DROP_HISTORY_RUNS) continue;
        const info = SOURCE_INFO[r.src] || {
          label: r.src || 'ได้รับไอเทม',
          short: 'ดรอป',
        };
        batches.push({
          id: `${r.ts}-${r.src}-${batches.length}`,
          ts: r.ts,
          timeLabel: r.ts > 0 ? `${formatClock(r.ts)} น.` : r.t,
          src: r.src,
          srcLabel: info.label,
          srcShort: info.short,
          topRarity: r.rarity,
          totalQty: r.qty,
          entries: [r],
          stageName: r.stageName,
          stageWorld: r.stageWorld,
          stageMap: r.stageMap,
          stageDifficulty: r.stageDifficulty,
          stageGamemode: r.stageGamemode,
          stageWaves: r.stageWaves,
          stageTimer: r.stageTimer,
          stageImageId: r.stageImageId,
        });
      }
    }
    return batches.slice(0, MAX_DROP_HISTORY_RUNS);
  }, [account.rewards]);

  const dropBatches = useMemo<DropBatch[]>(() => {
    const q = dropSearch.trim().toLowerCase();
    if (!q && dropRarity === 'ALL') return allDropBatches;
    const out: DropBatch[] = [];
    for (const batch of allDropBatches) {
      const matched = batch.entries.filter((r) => {
        if (dropRarity !== 'ALL' && r.rarity !== dropRarity) return false;
        if (q) {
          const tierText = inferItemTier(r.tier, r.id, r.name)?.toLowerCase() ?? '';
          return (
            r.name.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q) ||
            r.src.toLowerCase().includes(q) ||
            tierText.includes(q) ||
            (r.stageName?.toLowerCase().includes(q) ?? false) ||
            (r.stageWorld?.toLowerCase().includes(q) ?? false) ||
            (r.stageDifficulty?.toLowerCase().includes(q) ?? false)
          );
        }
        return true;
      });
      if (matched.length > 0) {
        let topRarity = matched[0].rarity;
        let totalQty = 0;
        for (const m of matched) {
          totalQty += m.qty;
          if (RARITY_RANK[m.rarity] > RARITY_RANK[topRarity]) topRarity = m.rarity;
        }
        out.push({ ...batch, entries: matched, topRarity, totalQty });
      }
    }
    return out;
  }, [allDropBatches, dropSearch, dropRarity]);

  const stage = account.currentStage;
  const summerPearlsVal = useMemo(() => {
    const ex = account.extraStats;
    if (!ex) return 0;
    if (typeof ex.summerPearls === 'number') return ex.summerPearls;
    if (ex.eventResources) {
      for (const [k, v] of Object.entries(ex.eventResources)) {
        if (/pearl|summer/i.test(k) && typeof v === 'number') return v;
      }
    }
    return ex.resource ?? 0;
  }, [account.extraStats]);

  const rerollSummary = useMemo(() => {
    const ex = account.extraStats;
    const hasBag = account.inventory.length > 0;
    let bagTrait = 0;
    let bagCurse = 0;
    let bagStarRemnants = 0;
    let bagStarRemnantsLimited = 0;
    let bagBrokenStars = 0;
    let bagStatCubes = 0;
    let bagPerfectCubes = 0;

    let traitIconId = account.currencyIcons?.traitReroll || DEFAULT_REROLL_TOKEN_ICON_ID;
    let curseIconId: string | undefined;
    let starIconId: string | undefined;
    let starLimitedIconId: string | undefined;
    let brokenStarIconId: string | undefined;
    let statCubeIconId: string | undefined;
    let perfectCubeIconId: string | undefined;

    let starRemnantItemId = 'star_remnant';
    let starRemnantLimitedItemId = 'star_remnant_limited';
    let brokenStarItemId = 'broken_star_limited';
    let curseItemId = 'sukuna_finger';
    let statCubeItemId = 'reroll_stat_all';
    let perfectCubeItemId = 'reroll_stat_specific';

    for (const it of account.inventory) {
      if (it.kind === 'unit') continue;
      const idLow = it.id.toLowerCase();
      const hay = `${idLow} ${it.name.toLowerCase()}`;

      if (
        idLow === 'star_remnant_limited' ||
        ((hay.includes('star_remnant') || hay.includes('star remnant')) && hay.includes('limited'))
      ) {
        bagStarRemnantsLimited += it.qty;
        starRemnantLimitedItemId = it.id;
        if (!starLimitedIconId && it.iconId) starLimitedIconId = it.iconId;
      } else if (
        idLow === 'star_remnant' ||
        hay.includes('star_remnant') ||
        hay.includes('star remnant') ||
        idLow === 'remnant'
      ) {
        bagStarRemnants += it.qty;
        starRemnantItemId = it.id;
        if (!starIconId && it.iconId) starIconId = it.iconId;
      } else if (idLow.includes('broken_star') || hay.includes('broken star')) {
        bagBrokenStars += it.qty;
        brokenStarItemId = it.id;
        if (!brokenStarIconId && it.iconId) brokenStarIconId = it.iconId;
      } else if (
        idLow === 'reroll_stat_specific' ||
        (hay.includes('perfect') && (hay.includes('stat_cube') || hay.includes('stat cube') || hay.includes('cube')))
      ) {
        bagPerfectCubes += it.qty;
        perfectCubeItemId = it.id;
        if (!perfectCubeIconId && it.iconId) perfectCubeIconId = it.iconId;
      } else if (
        idLow === 'reroll_stat_all' ||
        hay.includes('stat_cube') ||
        hay.includes('stat cube')
      ) {
        bagStatCubes += it.qty;
        statCubeItemId = it.id;
        if (!statCubeIconId && it.iconId) statCubeIconId = it.iconId;
      } else if (
        (hay.includes('trait') && (hay.includes('reroll') || hay.includes('token'))) ||
        hay.includes('reroll_token') ||
        hay.includes('reroll token')
      ) {
        bagTrait += it.qty;
        if (it.iconId) traitIconId = it.iconId;
      } else if (
        idLow.includes('sukuna_finger') ||
        (hay.includes('curse') && (hay.includes('reroll') || hay.includes('token')))
      ) {
        bagCurse += it.qty;
        curseItemId = it.id;
        if (!curseIconId && it.iconId) curseIconId = it.iconId;
      }
    }

    return {
      traitTokens: Math.max(ex?.traitTokens ?? 0, bagTrait),
      starRemnants: hasBag ? bagStarRemnants : (ex?.starRemnants ?? 0),
      starRemnantsLimited: hasBag ? bagStarRemnantsLimited : (ex?.starRemnantsLimited ?? 0),
      brokenStars: hasBag ? bagBrokenStars : (ex?.brokenStars ?? 0),
      curseTokens: Math.max(ex?.curseTokens ?? 0, bagCurse),
      statCubes: hasBag ? bagStatCubes : (ex?.statCubes ?? 0),
      perfectStatCubes: hasBag ? bagPerfectCubes : (ex?.perfectStatCubes ?? 0),
      rebirthTokens: ex?.rebirthTokens ?? 0,
      traitIconId,
      curseIconId,
      starIconId,
      starLimitedIconId,
      brokenStarIconId,
      statCubeIconId,
      perfectCubeIconId,
      starRemnantItemId,
      starRemnantLimitedItemId,
      brokenStarItemId,
      curseItemId,
      statCubeItemId,
      perfectCubeItemId,
    };
  }, [account.extraStats, account.inventory, account.currencyIcons?.traitReroll]);

  const extraStatPills = useMemo(() => {
    const items: Array<{
      key: string;
      label: string;
      fullName: string;
      thumbKind: 'currency' | 'item';
      thumbName: string;
      itemId: string;
      value: number;
      accent: string;
      iconId?: string;
      alwaysShow?: boolean;
      iconKind?: 'pearl' | 'reroll' | 'sparkle';
    }> = [
      {
        key: 'trait_reroll',
        label: 'Reroll Token',
        fullName: 'Trait Reroll Token (1 เหรียญ = 1 โรลทุกแรงก์)',
        thumbKind: 'currency',
        thumbName: 'Reroll Token',
        itemId: 'trait_reroll_tokens',
        value: rerollSummary.traitTokens,
        accent: '#10F5A0',
        iconId: rerollSummary.traitIconId,
        alwaysShow: true,
        iconKind: 'reroll',
      },
      {
        key: 'star_remnant',
        label: 'Star Remnant',
        fullName: 'Star Remnant (ถาวร)',
        thumbKind: 'item',
        thumbName: 'Star Remnant',
        itemId: rerollSummary.starRemnantItemId,
        value: rerollSummary.starRemnants,
        accent: '#fbbf24',
        iconId: rerollSummary.starIconId,
        alwaysShow: true,
        iconKind: 'sparkle',
      },
      {
        key: 'star_remnant_limited',
        label: 'Remnant (Ltd)',
        fullName: 'Star Remnant (Limited)',
        thumbKind: 'item',
        thumbName: 'Star Remnant (Limited)',
        itemId: rerollSummary.starRemnantLimitedItemId,
        value: rerollSummary.starRemnantsLimited,
        accent: '#f59e0b',
        iconId: rerollSummary.starLimitedIconId,
        alwaysShow: true,
        iconKind: 'sparkle',
      },
      {
        key: 'summer_pearls',
        label: 'Summer Pearls',
        fullName: 'Summer Pearls',
        thumbKind: 'currency',
        thumbName: 'Summer Pearls',
        itemId: 'summer_pearls',
        value: summerPearlsVal,
        accent: '#67e8f9',
        iconId: account.currencyIcons?.summerPearls || DEFAULT_SUMMER_PEARLS_ICON_ID,
        alwaysShow: true,
        iconKind: 'pearl',
      },
      {
        key: 'curse_reroll',
        label: 'Curse Reroll',
        fullName: 'Cursed Token (Curse Reroll)',
        thumbKind: 'item',
        thumbName: 'Cursed Finger',
        itemId: rerollSummary.curseItemId,
        value: rerollSummary.curseTokens,
        accent: '#c084fc',
        iconId: rerollSummary.curseIconId,
        alwaysShow: true,
        iconKind: 'reroll',
      },
      {
        key: 'stat_cube',
        label: 'Stat Cube',
        fullName: 'Stat Cube (รีสเตตัสทั้งหมด)',
        thumbKind: 'item',
        thumbName: 'Stat Cube',
        itemId: rerollSummary.statCubeItemId,
        value: rerollSummary.statCubes,
        accent: '#60a5fa',
        iconId: rerollSummary.statCubeIconId,
        iconKind: 'sparkle',
      },
      {
        key: 'perfect_cube',
        label: 'Perfect Cube',
        fullName: 'Perfect Stat Cube (รีสเตตัสเลือกช่อง)',
        thumbKind: 'item',
        thumbName: 'Perfect Stat Cube',
        itemId: rerollSummary.perfectCubeItemId,
        value: rerollSummary.perfectStatCubes,
        accent: '#f472b6',
        iconId: rerollSummary.perfectCubeIconId,
        iconKind: 'sparkle',
      },
      {
        key: 'broken_star',
        label: 'Broken Star',
        fullName: 'Broken Star (Limited · กดใช้ได้ 20x Star Remnant Limited)',
        thumbKind: 'item',
        thumbName: 'Broken Star (Limited)',
        itemId: rerollSummary.brokenStarItemId,
        value: rerollSummary.brokenStars,
        accent: '#fde047',
        iconId: rerollSummary.brokenStarIconId,
        iconKind: 'sparkle',
      },
      {
        key: 'rebirth',
        label: 'Rebirth',
        fullName: 'Rebirth Token',
        thumbKind: 'currency',
        thumbName: 'Rebirth Token',
        itemId: 'rebirth_tokens',
        value: rerollSummary.rebirthTokens,
        accent: '#fb7185',
        iconKind: 'sparkle',
      },
    ];
    return items.filter((item) => item.alwaysShow || item.value > 0);
  }, [account.currencyIcons?.summerPearls, summerPearlsVal, rerollSummary]);

  // Sorted aggregated totals (for "ไอเท็มที่ได้รับ" tab)
  const sortedTotals = useMemo(() => {
    return Object.values(account.totals).sort(
      (a, b) =>
        RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] ||
        tierRankValue(inferItemTier(b.tier, b.id, b.name)) -
          tierRankValue(inferItemTier(a.tier, a.id, a.name)) ||
        b.qty - a.qty
    );
  }, [account.totals]);

  // Normalized inventory items with guaranteed group separation (Portals / Charms) and inferred Tier
  const normalizedInventory = useMemo(() => {
    return account.inventory.map((it) => ({
      ...it,
      group: normalizeBagGroup(it.group, it.id, it.name, it.kind),
      tier: inferItemTier(it.tier, it.id, it.name),
    }));
  }, [account.inventory]);

  // Inventory groups — pin Portals & Charms right at the front!
  const invGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of normalizedInventory) {
      map.set(it.group, (map.get(it.group) ?? 0) + it.qty);
    }
    const pinnedOrder: Record<string, number> = { Portals: 1, Charms: 2 };
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => {
        const pa = pinnedOrder[a.name] ?? 99;
        const pb = pinnedOrder[b.name] ?? 99;
        if (pa !== pb) return pa - pb;
        return b.total - a.total;
      });
  }, [normalizedInventory]);

  const filteredInventory = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    const list = normalizedInventory.filter((it) => {
      if (invGroup !== 'ALL' && it.group !== invGroup) return false;
      if (invRarity !== 'ALL' && it.rarity !== invRarity) return false;
      if (q) {
        return (
          it.name.toLowerCase().includes(q) ||
          it.id.toLowerCase().includes(q) ||
          it.group.toLowerCase().includes(q) ||
          (it.tier?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
    return [...list].sort((a, b) => {
      if (invSort === 'qty') {
        return (
          b.qty - a.qty ||
          tierRankValue(b.tier) - tierRankValue(a.tier) ||
          RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]
        );
      }
      if (invSort === 'rarity') {
        return (
          RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] ||
          tierRankValue(b.tier) - tierRankValue(a.tier) ||
          b.qty - a.qty
        );
      }
      return a.name.localeCompare(b.name) || tierRankValue(b.tier) - tierRankValue(a.tier);
    });
  }, [normalizedInventory, invGroup, invRarity, invSearch, invSort]);

  // Separate Portals & Charms into dedicated sections when viewing ALL in Grid mode
  const separatedBagSections = useMemo(() => {
    const portals = filteredInventory
      .filter((it) => it.group === 'Portals')
      .sort(
        (a, b) =>
          tierRankValue(b.tier) - tierRankValue(a.tier) ||
          RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] ||
          b.qty - a.qty
      );
    const charms = filteredInventory
      .filter((it) => it.group === 'Charms')
      .sort(
        (a, b) =>
          tierRankValue(b.tier) - tierRankValue(a.tier) ||
          RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] ||
          b.qty - a.qty
      );
    const others = filteredInventory.filter(
      (it) => it.group !== 'Portals' && it.group !== 'Charms'
    );
    return { portals, charms, others };
  }, [filteredInventory]);

  const handleClearDropsClick = async () => {
    if (clearingDrops || account.rewards.length === 0) return;
    setClearingDrops(true);
    try {
      await onClearDrops();
    } catch {
      // Error feedback is handled by parent toast
    } finally {
      setClearingDrops(false);
    }
  };

  const handleCopyTradeSummary = async () => {
    const lines: string[] = [
      `=== เช็คของ Anime Adventures: ${account.displayName} (@${account.username}) ===`,
      `Gold: ${formatNumber(account.gold)} | Gems: ${formatNumber(account.gems)} | Summer Pearls: ${formatNumber(summerPearlsVal)} | Reroll Token: ${formatNumber(rerollSummary.traitTokens)} | Star Remnant: ${formatNumber(rerollSummary.starRemnants)} | Remnant (Ltd): ${formatNumber(rerollSummary.starRemnantsLimited)}${rerollSummary.curseTokens > 0 ? ` | Curse Reroll: ${formatNumber(rerollSummary.curseTokens)}` : ''}${account.level ? ` | Lv.${account.level}` : ''}`,
      '',
      `[ทีม 6 ตัว]`,
      ...account.equipped.map((u, i) => {
        const traitStr = u.traits?.length ? ` [${u.traits.join(', ')}]` : '';
        return `${i + 1}. ${u.name}${u.shiny ? ' ✦Shiny' : ''} (${u.rarity}${u.level ? ` Lv.${u.level}` : ''})${traitStr}`;
      }),
      '',
      `[ไอเทมในกระเป๋า (${filteredInventory.length} รายการ)]`,
      ...filteredInventory
        .slice(0, 40)
        .map(
          (it) =>
            `- ${it.name}${it.tier ? ` [${it.tier}]` : ''} (${it.rarity}) x${formatNumber(it.qty)}`
        ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleExportCsv = () => {
    const header = ['Item ID', 'Name', 'Tier', 'Group', 'Rarity', 'Type', 'Quantity'];
    const rows = filteredInventory.map((it) => [
      it.id,
      `"${it.name.replace(/"/g, '""')}"`,
      it.tier || '',
      it.group,
      it.rarity,
      it.kind,
      String(it.qty),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${account.username}_aa_inventory.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[21.5rem_minmax(0,1fr)] lg:items-start">
      {/* =====================================================================
          LEFT COLUMN: ACCOUNT PROFILE & CHARACTER STAGE (RollinShop Display Format)
         ===================================================================== */}
      <aside
        aria-label="ข้อมูลไอดี"
        className="relative flex flex-col overflow-hidden rounded-3xl bg-[#0B0E11] border border-white/[0.08] lg:sticky lg:top-24"
      >
        {/* Top Stage Backdrop + Status Bar + Real Roblox 3D Character Avatar */}
        <div className="relative flex flex-col">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-56"
            style={{
              background: isDisconnected
                ? 'radial-gradient(ellipse 85% 70% at 50% 10%, rgba(244, 63, 94, 0.18), rgba(11, 14, 17, 0) 75%)'
                : online
                  ? 'radial-gradient(ellipse 85% 70% at 50% 10%, rgba(16, 245, 160, 0.14), rgba(11, 14, 17, 0) 75%)'
                  : 'radial-gradient(ellipse 85% 70% at 50% 10%, rgba(148, 163, 184, 0.10), rgba(11, 14, 17, 0) 75%)',
            }}
          />

          {/* Top Action & Online Status Overlay */}
          <div className="relative z-10 flex items-center justify-between px-4 pt-3.5">
            {!isReadOnly && onOpenShare ? (
              <button
                type="button"
                onClick={onOpenShare}
                title="แชร์ลิงก์เช็คของ"
                aria-label="แชร์ลิงก์เช็คของ"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#12161B]/90 border border-white/[0.10] text-xs font-medium text-zinc-200 hover:border-[#10F5A0]/45 hover:text-[#10F5A0] transition-colors cursor-pointer"
              >
                <Share2 size={13} />
                <span>แชร์</span>
              </button>
            ) : (
              <span className="inline-flex items-center h-8 px-3 rounded-full bg-[#12161B]/90 border border-white/[0.08] text-[11px] font-medium text-zinc-400">
                โหมดดูอย่างเดียว
              </span>
            )}

            <span
              className={`inline-flex items-center gap-2 rounded-full py-1 pl-2.5 pr-3 text-xs font-semibold border ${
                isDisconnected
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : online
                    ? 'bg-[#10F5A0]/12 border-[#10F5A0]/35 text-[#10F5A0]'
                    : 'bg-[#12161B]/90 border-white/[0.10] text-zinc-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isDisconnected
                    ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                    : online
                      ? 'bg-[#10F5A0] shadow-[0_0_8px_#10F5A0]'
                      : 'bg-zinc-500'
                }`}
              />
              <span>
                {isDisconnected
                  ? account.disconnectInfo?.errorCode
                    ? `หลุดเกม (Code ${account.disconnectInfo.errorCode})`
                    : 'หลุดเกม (ออฟไลน์)'
                  : online
                    ? account.syncIntervalSec
                      ? `ออนไลน์ · เช็คทุก ${account.syncIntervalSec} วิ`
                      : 'ออนไลน์'
                    : 'ออฟไลน์'}
              </span>
            </span>
          </div>

          {/* Real Roblox Full-Body Character Stage */}
          <RobloxAvatarStage
            userId={account.userId}
            username={account.username}
            online={online}
          />
        </div>

        {/* Account Identity */}
        <div className="px-5 pb-4">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white truncate">
            {account.displayName}
          </h2>
          <div className="mt-2 flex items-center gap-2.5">
            <RobloxHeadshot
              userId={account.userId}
              username={account.username}
              size="md"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100 truncate">
                @{account.username}
              </p>
              <p className="text-xs text-zinc-400 truncate font-mono tabular-nums">
                Anime Adventures{account.userId ? ` · ID ${account.userId}` : ''}
              </p>
            </div>
          </div>

          {/* Roblox Disconnect / Error Prompt Alert Card */}
          {isDisconnected && (
            <div className="mt-3.5 rounded-2xl bg-rose-500/[0.10] border border-rose-500/35 p-3">
              <div className="flex items-start gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-400/35 text-rose-300 flex items-center justify-center shrink-0">
                  <WifiOff size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-xs font-bold text-rose-200">
                      {account.disconnectInfo?.title || 'Disconnected'}
                    </span>
                    {account.disconnectInfo?.errorCode && (
                      <span className="px-1.5 py-0.5 rounded-md bg-rose-500/25 border border-rose-400/40 text-[10px] font-mono font-bold text-rose-200">
                        Error Code: {account.disconnectInfo.errorCode}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-rose-100 leading-snug">
                    {getDisconnectHintTh(
                      account.disconnectInfo?.errorCode,
                      account.disconnectInfo?.message
                    )}
                  </p>
                  {account.disconnectInfo?.message && (
                    <p className="mt-1.5 rounded-lg bg-black/35 border border-rose-500/20 px-2 py-1.5 text-[10px] font-mono text-rose-200/85 break-words leading-relaxed">
                      {account.disconnectInfo.message}
                    </p>
                  )}
                  <p className="mt-1.5 text-[10px] font-mono text-rose-300/75 tabular-nums">
                    ตรวจพบเมื่อ{' '}
                    {formatClock(account.disconnectInfo?.at || account.lastSyncedAt)} น. ·{' '}
                    {formatRelativeTime(
                      account.disconnectInfo?.at || account.lastSyncedAt,
                      nowTs
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Current Stage Card with Real Roblox MapIcons Artwork */}
          {stage && (
            <div className="mt-3.5 rounded-2xl bg-[#10151A] border border-white/[0.08] p-2.5 flex items-center gap-3">
              <div className="relative w-16 h-14 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#16212C] to-[#0E1319] border border-white/[0.10]">
                <RobloxAssetThumb
                  kind="stage"
                  name={stage.name}
                  itemId={stage.id}
                  world={stage.world}
                  map={stage.map}
                  assetId={stage.mapImageId}
                  alt={stage.name}
                  className="w-full h-full object-cover"
                  fallback={
                    <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-zinc-400">
                      {stage.inLobby ? (
                        <MapPin size={20} className="text-zinc-400" />
                      ) : (
                        <Swords size={19} className="text-[#10F5A0]" />
                      )}
                    </div>
                  }
                />
                {!stage.inLobby && (stage.wave ?? 0) > 0 && (
                  <span className="absolute bottom-0.5 inset-x-0.5 text-center rounded bg-black/80 px-1 py-px text-[9px] font-mono font-bold tabular-nums text-[#10F5A0] truncate">
                    W{stage.wave}
                    {stage.isLastWave ? '!' : ''}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      !stage.inLobby && online
                        ? 'bg-[#10F5A0] shadow-[0_0_6px_#10F5A0]'
                        : 'bg-zinc-500'
                    }`}
                  />
                  <span className="text-[10px] font-semibold tracking-wide text-zinc-400">
                    {stage.inLobby ? 'อยู่ในล็อบบี้' : 'ด่านที่กำลังเล่น'}
                  </span>
                </div>
                <p
                  className="mt-0.5 text-sm font-bold text-white truncate"
                  title={stage.name}
                >
                  {stage.name}
                </p>
                {stage.inLobby ? (
                  <p className="text-[11px] text-zinc-500 truncate">
                    รอเข้าด่าน — อัปเดตชื่อด่านและรูปอัตโนมัติ
                  </p>
                ) : (
                  <p className="text-[11px] text-zinc-400 truncate">
                    {[
                      stage.world,
                      stage.difficulty || stage.gamemode,
                      stage.boss ? `Boss: ${stage.boss}` : null,
                      stage.enemiesLeft ? `เหลือ ${stage.enemiesLeft}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Segmented Progress Bar Block (Team Slots & Vault Overview) */}
        <div className="border-t border-white/[0.08] px-5 py-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-zinc-400">ทีมที่สวมใส่</span>
            <span className="text-xs font-mono tabular-nums text-zinc-400">
              <span className="text-base font-bold text-white">
                {account.equipped.length}
              </span>{' '}
              / 6 ช่อง
            </span>
          </div>

          {/* 6-Segment Neon Mint Progress Bar (RollinShop segmented meter pattern) */}
          <div
            role="progressbar"
            aria-valuenow={account.equipped.length}
            aria-valuemin={0}
            aria-valuemax={6}
            aria-label="จำนวนช่องทีมที่สวมใส่"
            className="mt-2.5 flex h-2.5 gap-1.5"
          >
            {slots.map(({ slot, unit }) => (
              <span
                key={slot}
                className="relative flex-1 overflow-hidden rounded-[3px] bg-white/[0.07]"
              >
                <span
                  className="absolute inset-0 transition-opacity duration-200"
                  style={{
                    opacity: unit ? 1 : 0,
                    backgroundColor: unit ? '#10F5A0' : 'transparent',
                  }}
                />
              </span>
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-zinc-400 tabular-nums">
            <span>
              Shiny <strong className="text-zinc-200">{shinyCount}</strong> · Secret{' '}
              <strong className="text-zinc-200">{secretCount}</strong>
            </span>
            <span>
              กระเป๋า{' '}
              <strong className="text-[#10F5A0]">
                {formatCompact(totalInventoryPieces)}
              </strong>{' '}
              ชิ้น
            </span>
          </div>
        </div>

        {/* 3-Column Divided Stat Grid (Level / Gems / Gold with real in-game icons) */}
        <div className="grid grid-cols-3 divide-x divide-white/[0.08] border-t border-white/[0.08]">
          <div className="min-w-0 px-3.5 py-3.5 first:pl-5">
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              <Trophy size={12} className="shrink-0 text-zinc-500" />
              <span className="truncate">เลเวล</span>
            </span>
            <span
              className="mt-1 block truncate text-base font-bold font-mono tabular-nums text-white"
              title={account.level ? `Lv.${account.level}` : 'ไม่มีข้อมูลเลเวล'}
            >
              {account.level ? account.level : '-'}
            </span>
          </div>

          <div className="min-w-0 px-3.5 py-3.5">
            <span className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                <RobloxAssetThumb
                  kind="currency"
                  name="Gems"
                  itemId="gems"
                  assetId={account.currencyIcons?.gems || DEFAULT_GEMS_ICON_ID}
                  alt="Gems"
                  className="w-4 h-4 object-contain"
                  fallback={<Gem size={13} className="shrink-0 text-[#10F5A0]" />}
                />
              </span>
              <span className="truncate">เพชร</span>
            </span>
            <span
              className="mt-1 block truncate text-base font-bold font-mono tabular-nums text-[#10F5A0]"
              title={`${formatNumber(account.gems)} Gems`}
            >
              {formatCompact(account.gems)}
            </span>
          </div>

          <div className="min-w-0 px-3.5 py-3.5 last:pr-5">
            <span className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                <RobloxAssetThumb
                  kind="currency"
                  name="Gold"
                  itemId="gold"
                  assetId={account.currencyIcons?.gold || DEFAULT_GOLD_ICON_ID}
                  alt="Gold"
                  className="w-4 h-4 object-contain"
                  fallback={<Coins size={13} className="shrink-0 text-amber-300" />}
                />
              </span>
              <span className="truncate">ทอง</span>
            </span>
            <span
              className="mt-1 block truncate text-base font-bold font-mono tabular-nums text-amber-300"
              title={`${formatNumber(account.gold)} Gold`}
            >
              {formatCompact(account.gold)}
            </span>
          </div>
        </div>

        {/* Compact Extra Stats Strip (3 Trait Rerolls + Summer Pearls + Curse & Stat Rerolls with real icons) */}
        {extraStatPills.length > 0 && (
          <div className="border-t border-white/[0.08] px-4 py-2.5 grid grid-cols-3 gap-x-2 gap-y-2.5 bg-white/[0.015]">
            {extraStatPills.map((stat) => (
              <div key={stat.key} className="min-w-0" title={`${stat.fullName}: ${formatNumber(stat.value)}`}>
                <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                    <RobloxAssetThumb
                      kind={stat.thumbKind}
                      name={stat.thumbName}
                      itemId={stat.itemId}
                      assetId={stat.iconId}
                      alt={stat.label}
                      className="w-4 h-4 object-contain"
                      fallback={
                        stat.iconKind === 'reroll' ? (
                          <Dices size={12} style={{ color: stat.accent }} />
                        ) : (
                          <Sparkles size={12} style={{ color: stat.accent }} />
                        )
                      }
                    />
                  </span>
                  <span className="truncate">{stat.label}</span>
                </span>
                <span
                  className="mt-0.5 block text-xs font-bold font-mono tabular-nums truncate"
                  style={{ color: stat.accent }}
                >
                  {formatCompact(stat.value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Script Update Notice when account synced from an older Lua script */}
        {!isReadOnly && scriptOutdated && onOpenSync && (
          <div className="border-t border-amber-400/20 bg-amber-400/[0.06] px-4 py-2.5 flex items-center justify-between gap-2.5">
            <div className="flex items-start gap-2 min-w-0">
              <AlertCircle size={14} className="text-amber-300 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-amber-200 truncate">
                  สคริปต์เก่า ({account.scriptVersion ? `v${account.scriptVersion}` : 'รุ่นก่อน'}) · ล่าสุด v{SCRIPT_VERSION}
                </p>
                <p className="text-[10px] text-amber-300/75 truncate">
                  อัปเดตเมื่อ {SCRIPT_UPDATED_AT}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSync}
              className="px-2.5 py-1 rounded-lg bg-amber-400/20 border border-amber-300/40 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              อัปเดต
            </button>
          </div>
        )}

        {/* Bottom Meta Footer Bar */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-white/[0.08] bg-white/[0.02] px-5 py-2.5 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
            <Monitor size={13} className="shrink-0 text-zinc-500" />
            <span className="truncate font-mono text-[11px]">
              {account.scriptVersion ? `v${account.scriptVersion}` : storageLabel}
              {account.syncIntervalSec ? ` · เช็คทุก ${account.syncIntervalSec} วิ` : ` · ${syncKey}`}
            </span>
          </span>
          <span
            className="inline-flex items-center gap-1.5 shrink-0 tabular-nums font-mono text-[11px]"
            title={`ซิงค์ล่าสุด (เวลาไทย): ${formatThaiDateTime(account.lastSyncedAt)}`}
          >
            <Clock size={13} className="shrink-0 text-zinc-500" />
            <span>
              {formatClock(account.lastSyncedAt)} น. · {formatRelativeTime(account.lastSyncedAt, nowTs)}
            </span>
          </span>
        </div>
      </aside>

      {/* =====================================================================
          RIGHT COLUMN: UNIFIED LIVE DASHBOARD PANEL (RollinShop Display Format)
         ===================================================================== */}
      <section className="flex min-w-0 flex-col overflow-hidden rounded-3xl bg-[#0B0E11] border border-white/[0.08]">
        {/* TOP STRIP: Compact 6-Unit Equipped Team Portraits + Counter Box */}
        <div className="border-b border-white/[0.08] px-4 py-4 sm:px-5 bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            {/* Left: Status Header + 6 Square Unit Tiles */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isDisconnected
                        ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                        : online
                          ? 'bg-[#10F5A0] shadow-[0_0_8px_#10F5A0]'
                          : 'bg-zinc-600'
                    }`}
                  />
                  <span className="font-semibold text-white">
                    ทีมที่ใส่ในด่าน ({account.equipped.length}/6)
                  </span>
                  <span className="text-zinc-500 hidden sm:inline">
                    · แตะที่ยูนิตเพื่อดูรายละเอียด Trait และ Stat
                  </span>
                </div>
                {activeUnit && (
                  <button
                    type="button"
                    onClick={() => setSelectedSlot(null)}
                    className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X size={13} />
                    <span>ปิดรายละเอียด</span>
                  </button>
                )}
              </div>

              {/* 6-Unit Compact Portrait Strip (exact RollinShop layout!) */}
              <div className="grid grid-cols-6 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                {slots.map(({ slot, unit }) => {
                  if (!unit) {
                    return (
                      <div
                        key={slot}
                        title={`ช่องที่ ${slot} ว่าง`}
                        className="relative aspect-square w-full sm:size-14 sm:shrink-0 rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02] flex items-center justify-center font-mono text-[11px] tabular-nums text-zinc-600"
                      >
                        0{slot}
                      </div>
                    );
                  }

                  const meta = RARITY_META[unit.rarity];
                  const isSelected = selectedSlot === slot;
                  const firstTrait = unit.traits?.[0];

                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(isSelected ? null : slot)}
                      title={`${unit.name} · ${unit.rarity}${unit.level ? ` · Lv.${unit.level}` : ''}${unit.traits?.length ? ` · ${unit.traits.join(', ')}` : ''}`}
                      className={`group relative aspect-square w-full sm:size-14 sm:shrink-0 overflow-hidden rounded-xl transition-transform duration-150 hover:scale-[1.04] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10F5A0] ${
                        isSelected ? 'ring-2 ring-[#10F5A0] scale-[1.04]' : ''
                      }`}
                      style={{
                        background: `radial-gradient(circle at 50% 35%, ${meta.hex}36, rgba(11,14,17,0.95) 78%)`,
                        boxShadow: isSelected
                          ? `inset 0 0 0 1.5px #10F5A0`
                          : `inset 0 0 0 1.5px ${meta.border}`,
                      }}
                    >
                      {/* Real Anime Adventures Unit Portrait with Rarity Monogram Fallback */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <RobloxAssetThumb
                          kind="unit"
                          name={unit.name}
                          itemId={unit.id}
                          alt={unit.name}
                          className="w-full h-full object-cover object-top"
                          fallback={
                            <span
                              className="pb-2 font-display text-sm sm:text-base font-extrabold tracking-tight drop-shadow"
                              style={{ color: meta.text }}
                            >
                              {getUnitInitials(unit.name)}
                            </span>
                          }
                        />
                      </div>

                      {/* Top-left Trait micro-badge */}
                      {firstTrait && (
                        <span
                          title={unit.traits?.join(', ')}
                          className="absolute left-1 top-1 max-w-[calc(100%-1.25rem)] truncate rounded bg-black/75 px-1 py-px text-[8px] font-semibold leading-none text-[#10F5A0]"
                        >
                          {shortTrait(firstTrait)}
                        </span>
                      )}

                      {/* Top-right Shiny Star */}
                      {unit.shiny && (
                        <span
                          title="Shiny Unit"
                          className="absolute right-1 top-0.5 text-[10px] font-bold text-amber-300 drop-shadow"
                        >
                          ✦
                        </span>
                      )}

                      {/* Bottom center Level pill (matching RollinShop Lv.XX overlay) */}
                      <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1 py-px text-[9px] font-mono font-bold leading-none tabular-nums text-white">
                        Lv.{unit.level ?? 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Highlight Counter Box (Wave Box when in-stage + Stage Clears counter) */}
            <div className="flex shrink-0 gap-2">
              {stage && !stage.inLobby && (stage.wave ?? 0) > 0 && (
                <div className="flex h-14 min-w-[4.5rem] flex-col justify-center rounded-2xl bg-[#10151A] border border-[#10F5A0]/30 px-3 text-center">
                  <span className="text-[11px] font-medium text-zinc-400 whitespace-nowrap">
                    {stage.isLastWave ? 'Last Wave' : 'Wave'}
                  </span>
                  <span className="mt-0.5 block text-2xl font-display font-extrabold leading-none tabular-nums text-[#10F5A0]">
                    {stage.wave}
                  </span>
                </div>
              )}
              <div className="flex h-14 min-w-[4.75rem] flex-col justify-center rounded-2xl bg-[#10151A] border border-white/[0.09] px-3.5 text-center">
                <span className="text-[11px] font-medium text-zinc-400 whitespace-nowrap">
                  รอบจบด่าน
                </span>
                <span className="mt-0.5 block text-2xl font-display font-extrabold leading-none tabular-nums text-white">
                  {allDropBatches.length}
                </span>
              </div>
            </div>
          </div>

          {/* Inline Expanded Unit Detail Bar when clicking one of the 6 unit portraits */}
          {activeUnit && (
            <div className="mt-3 rounded-2xl bg-[#10151A] border border-[#10F5A0]/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                  style={{
                    backgroundColor: RARITY_META[activeUnit.rarity].softBg,
                    border: `1px solid ${RARITY_META[activeUnit.rarity].border}`,
                  }}
                >
                  <RobloxAssetThumb
                    kind="unit"
                    name={activeUnit.name}
                    itemId={activeUnit.id}
                    alt={activeUnit.name}
                    className="w-full h-full object-cover object-top"
                    fallback={
                      <ItemEmblem
                        kind="unit"
                        rarity={activeUnit.rarity}
                        name={activeUnit.name}
                        shiny={activeUnit.shiny}
                        size="md"
                      />
                    }
                  />
                </div>
                <div className="min-w-0">
                  <p
                    className="text-sm font-bold truncate"
                    style={{ color: RARITY_META[activeUnit.rarity].text }}
                  >
                    {activeUnit.name}
                    {activeUnit.shiny ? ' ✦ Shiny' : ''}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-500 truncate">
                    ช่องที่ 0{selectedSlot} · ID: {activeUnit.id}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-zinc-400">
                  ระดับ:{' '}
                  <strong style={{ color: RARITY_META[activeUnit.rarity].text }}>
                    {activeUnit.rarity}
                  </strong>
                </span>
                <span className="text-zinc-400 font-mono tabular-nums">
                  Lv.<strong className="text-white">{activeUnit.level ?? 1}</strong>
                </span>
                <span className="text-zinc-400">
                  Trait:{' '}
                  <strong className="text-[#10F5A0]">
                    {activeUnit.traits?.length
                      ? activeUnit.traits.join(', ')
                      : 'ไม่มี'}
                  </strong>
                </span>
                {activeUnit.stats && (
                  <span className="text-zinc-400 font-mono tabular-nums">
                    DMG <strong className="text-white">{activeUnit.stats.dmg ?? '-'}</strong> / SPA{' '}
                    <strong className="text-white">{activeUnit.stats.spa ?? '-'}</strong> / RNG{' '}
                    <strong className="text-white">{activeUnit.stats.rng ?? '-'}</strong>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* MIDDLE: BIG-NUMBER METRIC TAB BAR (RollinShop 4-Tab Grid Pattern) */}
        <div className="px-4 pt-4 sm:px-5">
          <nav
            role="tablist"
            aria-label="หมวดข้อมูลบัญชี"
            className={`grid gap-1.5 sm:gap-2 ${
              isReadOnly || !onOpenSync ? 'grid-cols-3' : 'grid-cols-4'
            }`}
          >
            {/* Tab 1: ประวัติของดรอป */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'drops'}
              onClick={() => onTabChange('drops')}
              className={`relative flex min-w-0 cursor-pointer flex-col items-center gap-0.5 overflow-hidden rounded-2xl px-1.5 py-2 text-center transition-colors sm:flex-row sm:gap-3 sm:px-3 sm:py-2.5 sm:text-left ${
                activeTab === 'drops'
                  ? 'bg-[#10F5A0]/14 border border-[#10F5A0]/55'
                  : 'bg-[#101418] border border-white/[0.07] hover:border-white/[0.15]'
              }`}
            >
              <span className="flex items-center gap-1 sm:hidden">
                <History
                  size={13}
                  className={activeTab === 'drops' ? 'text-[#10F5A0]' : 'text-zinc-400'}
                />
                <span className="text-base font-bold leading-tight font-mono tabular-nums text-white">
                  {allDropBatches.length}
                </span>
              </span>
              <span
                className={`text-[10px] leading-tight sm:hidden truncate w-full ${
                  activeTab === 'drops' ? 'text-[#10F5A0] font-semibold' : 'text-zinc-400'
                }`}
              >
                ประวัติของดรอป
              </span>

              <span
                className={`hidden size-9 shrink-0 place-items-center rounded-xl sm:grid ${
                  activeTab === 'drops'
                    ? 'bg-[#10F5A0] text-[#04150E]'
                    : 'bg-white/[0.05] text-zinc-400'
                }`}
              >
                <History size={17} />
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block text-lg font-bold leading-tight font-mono tabular-nums text-white">
                  {allDropBatches.length}
                </span>
                <span
                  className={`block truncate text-xs ${
                    activeTab === 'drops' ? 'text-zinc-100 font-medium' : 'text-zinc-400'
                  }`}
                >
                  ประวัติของดรอป
                </span>
              </span>
            </button>

            {/* Tab 2: ไอเท็มที่ได้รับ */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'obtained'}
              onClick={() => onTabChange('obtained')}
              className={`relative flex min-w-0 cursor-pointer flex-col items-center gap-0.5 overflow-hidden rounded-2xl px-1.5 py-2 text-center transition-colors sm:flex-row sm:gap-3 sm:px-3 sm:py-2.5 sm:text-left ${
                activeTab === 'obtained'
                  ? 'bg-[#10F5A0]/14 border border-[#10F5A0]/55'
                  : 'bg-[#101418] border border-white/[0.07] hover:border-white/[0.15]'
              }`}
            >
              <span className="flex items-center gap-1 sm:hidden">
                <Sparkles
                  size={13}
                  className={activeTab === 'obtained' ? 'text-[#10F5A0]' : 'text-zinc-400'}
                />
                <span className="text-base font-bold leading-tight font-mono tabular-nums text-white">
                  {sortedTotals.length}
                </span>
              </span>
              <span
                className={`text-[10px] leading-tight sm:hidden truncate w-full ${
                  activeTab === 'obtained' ? 'text-[#10F5A0] font-semibold' : 'text-zinc-400'
                }`}
              >
                ไอเท็มที่ได้รับ
              </span>

              <span
                className={`hidden size-9 shrink-0 place-items-center rounded-xl sm:grid ${
                  activeTab === 'obtained'
                    ? 'bg-[#10F5A0] text-[#04150E]'
                    : 'bg-white/[0.05] text-zinc-400'
                }`}
              >
                <Sparkles size={17} />
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block text-lg font-bold leading-tight font-mono tabular-nums text-white">
                  {sortedTotals.length}
                </span>
                <span
                  className={`block truncate text-xs ${
                    activeTab === 'obtained' ? 'text-zinc-100 font-medium' : 'text-zinc-400'
                  }`}
                >
                  ไอเท็มที่ได้รับ
                </span>
              </span>
            </button>

            {/* Tab 3: กระเป๋า */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'inventory'}
              onClick={() => onTabChange('inventory')}
              className={`relative flex min-w-0 cursor-pointer flex-col items-center gap-0.5 overflow-hidden rounded-2xl px-1.5 py-2 text-center transition-colors sm:flex-row sm:gap-3 sm:px-3 sm:py-2.5 sm:text-left ${
                activeTab === 'inventory'
                  ? 'bg-[#10F5A0]/14 border border-[#10F5A0]/55'
                  : 'bg-[#101418] border border-white/[0.07] hover:border-white/[0.15]'
              }`}
            >
              <span className="flex items-center gap-1 sm:hidden">
                <Package
                  size={13}
                  className={activeTab === 'inventory' ? 'text-[#10F5A0]' : 'text-zinc-400'}
                />
                <span className="text-base font-bold leading-tight font-mono tabular-nums text-white">
                  {account.inventory.length}
                </span>
              </span>
              <span
                className={`text-[10px] leading-tight sm:hidden truncate w-full ${
                  activeTab === 'inventory' ? 'text-[#10F5A0] font-semibold' : 'text-zinc-400'
                }`}
              >
                กระเป๋า
              </span>

              <span
                className={`hidden size-9 shrink-0 place-items-center rounded-xl sm:grid ${
                  activeTab === 'inventory'
                    ? 'bg-[#10F5A0] text-[#04150E]'
                    : 'bg-white/[0.05] text-zinc-400'
                }`}
              >
                <Package size={17} />
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block text-lg font-bold leading-tight font-mono tabular-nums text-white">
                  {account.inventory.length}
                </span>
                <span
                  className={`block truncate text-xs ${
                    activeTab === 'inventory' ? 'text-zinc-100 font-medium' : 'text-zinc-400'
                  }`}
                >
                  กระเป๋า
                </span>
              </span>
            </button>

            {/* Tab 4: สคริปต์ซิงค์ (quick access, hidden in Share mode) */}
            {!isReadOnly && onOpenSync && (
              <button
                type="button"
                onClick={onOpenSync}
                className={`relative flex min-w-0 cursor-pointer flex-col items-center gap-0.5 overflow-hidden rounded-2xl px-1.5 py-2 text-center transition-colors sm:flex-row sm:gap-3 sm:px-3 sm:py-2.5 sm:text-left bg-[#101418] border ${
                  scriptOutdated
                    ? 'border-amber-400/45 hover:border-amber-300/70'
                    : 'border-white/[0.07] hover:border-[#10F5A0]/45'
                }`}
              >
                <span
                  className={`flex items-center gap-1 sm:hidden ${
                    scriptOutdated ? 'text-amber-300' : 'text-[#10F5A0]'
                  }`}
                >
                  <Code2 size={14} />
                  <span className="text-xs font-mono font-bold leading-tight text-white">
                    v{SCRIPT_VERSION}
                  </span>
                </span>
                <span
                  className={`text-[10px] leading-tight sm:hidden truncate w-full ${
                    scriptOutdated ? 'text-amber-300 font-semibold' : 'text-zinc-400'
                  }`}
                >
                  {scriptOutdated ? 'มีอัปเดต' : 'สคริปต์'}
                </span>

                <span
                  className={`hidden size-9 shrink-0 place-items-center rounded-xl sm:grid ${
                    scriptOutdated
                      ? 'bg-amber-400/15 text-amber-300'
                      : 'bg-white/[0.05] text-[#10F5A0]'
                  }`}
                >
                  <Code2 size={17} />
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block text-sm font-mono font-bold leading-tight text-white">
                    v{SCRIPT_VERSION}
                  </span>
                  <span
                    className={`block truncate text-xs ${
                      scriptOutdated ? 'text-amber-300 font-medium' : 'text-zinc-400'
                    }`}
                  >
                    {scriptOutdated ? 'อัปเดตสคริปต์' : 'สคริปต์ซิงค์'}
                  </span>
                </span>
              </button>
            )}
          </nav>
        </div>

        {/* ===================================================================
            TAB 1: ประวัติของดรอป (RollinShop Match / Reward History Feed Style)
           =================================================================== */}
        {activeTab === 'drops' && (
          <>
            {/* Context Sub-header & Search */}
            <div className="border-b border-white/[0.07] px-4 py-3 sm:px-5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-zinc-400 tabular-nums">
                  <strong className="text-white font-semibold">
                    {dropBatches.length}
                  </strong>{' '}
                  / {MAX_DROP_HISTORY_RUNS} รายการล่าสุด
                  {account.rewards[0]
                    ? ` · ล่าสุด ${
                        account.rewards[0].ts > 0
                          ? `${formatClock(account.rewards[0].ts)} น.`
                          : account.rewards[0].t
                      }`
                    : ''}
                </span>

                {!isReadOnly && account.rewards.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearDropsClick}
                    disabled={clearingDrops}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#12161B] border border-white/[0.08] text-xs text-zinc-300 hover:text-rose-300 hover:border-rose-500/35 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <Trash2 size={12} />
                    <span>ล้างประวัติ</span>
                  </button>
                )}
              </div>

              {account.rewards.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="relative flex-1">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={dropSearch}
                      onChange={(e) => setDropSearch(e.target.value)}
                      placeholder="ค้นหาของที่ดรอป..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-[#101418] border border-white/[0.08] text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#10F5A0]/50"
                    />
                  </div>
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5 sm:pb-0">
                    <button
                      type="button"
                      onClick={() => setDropRarity('ALL')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap shrink-0 cursor-pointer ${
                        dropRarity === 'ALL'
                          ? 'bg-white/[0.12] text-white'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      ทุกระดับ
                    </button>
                    {RARITY_ORDER.map((r) => {
                      const meta = RARITY_META[r];
                      const active = dropRarity === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setDropRarity(active ? 'ALL' : r)}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                          style={{
                            backgroundColor: active ? meta.softBg : 'transparent',
                            color: active ? meta.text : '#9CA3AF',
                            border: active
                              ? `1px solid ${meta.border}`
                              : '1px solid transparent',
                          }}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Feed Rows */}
            <div className="min-h-[20rem] lg:max-h-[38rem] overflow-y-auto px-4 py-2 sm:px-5">
              {dropBatches.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-[#10F5A0]/10 border border-[#10F5A0]/25 flex items-center justify-center text-[#10F5A0]">
                    <History size={22} />
                  </div>
                  <p className="mt-4 font-display text-base font-bold text-white">
                    ยังไม่มีรายการของดรอปใหม่
                  </p>
                  <p className="mt-1.5 text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                    เมื่อเล่นจบด่านหรือได้รับของใหม่ในเกม Anime Adventures
                    รายการจะเรียงแสดงเป็นรอบพร้อมชิปไอเทมที่นี่อัตโนมัติ
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {dropBatches.map((batch) => {
                    const topMeta = RARITY_META[batch.topRarity];
                    const headlineItem = batch.entries[0];
                    const isStageRun = Boolean(batch.stageName);
                    const compactWaves = batch.stageWaves
                      ? batch.stageWaves.replace(/^Waves?\s*Completed:\s*/i, 'Wave ').trim()
                      : undefined;
                    const compactTimer = batch.stageTimer
                      ? batch.stageTimer.replace(/^Total\s*Time:\s*/i, '').trim()
                      : undefined;
                    const metaParts = [
                      batch.stageWorld,
                      batch.stageDifficulty || batch.stageGamemode,
                      compactWaves,
                      compactTimer,
                    ].filter(Boolean);

                    return (
                      <li
                        key={batch.id}
                        className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-x-3 py-3.5 sm:grid-cols-[7.75rem_minmax(0,1fr)]"
                      >
                        {/* Left Stage Thumbnail Card with Real In-Game Uploaded / Wiki Stage Artwork */}
                        <div
                          className="relative row-span-1 flex flex-col justify-between aspect-[16/10] w-full self-start overflow-hidden rounded-xl p-2 sm:row-span-2 sm:aspect-auto sm:min-h-[5.25rem] sm:self-stretch"
                          style={{
                            background: `linear-gradient(145deg, ${topMeta.hex}24, rgba(16, 20, 24, 0.96) 75%)`,
                            boxShadow: `inset 0 0 0 1px ${topMeta.border}`,
                          }}
                        >
                          {(batch.stageName || batch.stageWorld || batch.stageMap || batch.stageImageId) ? (
                            <>
                              <RobloxAssetThumb
                                kind="stage"
                                name={batch.stageName}
                                world={batch.stageWorld}
                                map={batch.stageMap}
                                assetId={batch.stageImageId}
                                alt={batch.stageName || batch.srcShort}
                                className="absolute inset-0 w-full h-full object-cover"
                                fallback={
                                  <div className="absolute inset-0 flex items-center justify-center text-white/15">
                                    <Swords size={24} />
                                  </div>
                                }
                              />
                              <div
                                aria-hidden="true"
                                className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30 pointer-events-none"
                              />
                            </>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-white/15 pointer-events-none">
                              <Sparkles size={22} />
                            </div>
                          )}
                          <span
                            className="relative z-10 inline-flex self-start rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-mono font-bold tabular-nums"
                            style={{ color: isStageRun ? '#10F5A0' : topMeta.text }}
                          >
                            {batch.entries.length > 1
                              ? `${batch.entries.length} รายการ`
                              : `+${formatNumber(batch.totalQty)}`}
                          </span>
                          <span className="relative z-10 truncate text-[10px] font-bold leading-tight text-white drop-shadow">
                            {compactTimer || compactWaves || batch.srcShort}
                          </span>
                        </div>

                        {/* Top Row: Stage Name + Right-Aligned Clock */}
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-x-2">
                            <span className="shrink-0 text-sm font-extrabold text-[#10F5A0]">
                              {isStageRun ? 'จบด่าน' : 'ได้รับ'}
                            </span>
                            <span className="min-w-0 truncate text-sm font-semibold text-zinc-100">
                              {isStageRun
                                ? batch.stageName
                                : batch.entries.length === 1
                                  ? headlineItem.name
                                  : `${batch.srcLabel} (${batch.entries.length} รายการ)`}
                            </span>
                            <span className="ml-auto hidden shrink-0 pl-2 text-xs font-mono tabular-nums text-zinc-500 sm:inline">
                              {batch.timeLabel}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-400 truncate">
                            <span className="font-mono tabular-nums text-zinc-500 sm:hidden">
                              {batch.timeLabel} ·{' '}
                            </span>
                            <span>
                              {metaParts.length > 0 ? metaParts.join(' · ') : batch.srcLabel}
                            </span>
                            <span className="mx-1.5 text-zinc-600">·</span>
                            <span style={{ color: topMeta.text }}>
                              สูงสุด {batch.topRarity}
                            </span>
                          </p>
                        </div>

                        {/* Wrapped Visual Reward Cards (Stage-clear drops with framed real game artwork + Tier badge) */}
                        <div className="col-span-2 mt-2.5 flex flex-wrap gap-2 sm:col-span-1 sm:col-start-2">
                          {batch.entries.map((entry, idx) => {
                            const meta = RARITY_META[entry.rarity];
                            const tier = inferItemTier(entry.tier, entry.id, entry.name);
                            const resolvedAssetId =
                              entry.kind === 'currency'
                                ? resolveCurrencyIconId(
                                    entry.id,
                                    entry.name,
                                    entry.iconId,
                                    account.currencyIcons
                                  )
                                : entry.iconId;
                            return (
                              <div
                                key={`${entry.ts}-${entry.id}-${tier || ''}-${idx}`}
                                title={`${entry.name}${tier ? ` [${tier}]` : ''} (${entry.rarity}) ${entry.kind === 'currency' || isStageRun ? '+' : '×'}${formatNumber(entry.qty)}`}
                                className="inline-flex items-center gap-2 rounded-xl bg-[#101418] py-1.5 pl-1.5 pr-2.5 text-xs text-zinc-200"
                                style={{
                                  boxShadow: `inset 0 0 0 1px ${meta.border}`,
                                }}
                              >
                                <div
                                  className="w-8 h-8 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                                  style={{
                                    backgroundColor: meta.softBg,
                                    border: `1px solid ${meta.border}`,
                                  }}
                                >
                                  <RobloxAssetThumb
                                    kind={entry.kind}
                                    name={entry.name}
                                    itemId={entry.id}
                                    assetId={resolvedAssetId}
                                    alt={entry.name}
                                    className={
                                      entry.kind === 'unit'
                                        ? 'w-full h-full object-cover object-top'
                                        : 'w-full h-full object-contain p-0.5'
                                    }
                                    fallback={
                                      <ItemEmblem
                                        kind={entry.kind}
                                        rarity={entry.rarity}
                                        name={entry.name}
                                        size="sm"
                                      />
                                    }
                                  />
                                </div>
                                <div className="min-w-0 leading-tight">
                                  <div className="flex items-center gap-1.5">
                                    <p
                                      className="max-w-[140px] truncate text-xs font-semibold"
                                      style={{ color: meta.text }}
                                    >
                                      {entry.name}
                                    </p>
                                    {tier && (
                                      <span className="shrink-0 rounded bg-cyan-400/15 border border-cyan-400/35 px-1.5 py-px text-[9px] font-mono font-bold text-cyan-200">
                                        {tier}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 font-mono text-[11px] font-bold tabular-nums text-[#10F5A0]">
                                    {entry.kind === 'currency' || isStageRun ? '+' : '×'}
                                    {formatNumber(entry.qty)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        {/* ===================================================================
            TAB 2: ไอเท็มที่ได้รับ (RollinShop Aggregated Obtained Items Grid)
           =================================================================== */}
        {activeTab === 'obtained' && (
          <>
            <div className="border-b border-white/[0.07] px-4 py-3 sm:px-5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-zinc-400 tabular-nums">
                สรุปยอดรวมของที่ดรอปทั้งหมด{' '}
                <strong className="text-white font-semibold">
                  {sortedTotals.length}
                </strong>{' '}
                ชนิด
              </span>
              {!isReadOnly && account.rewards.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearDropsClick}
                  disabled={clearingDrops}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#12161B] border border-white/[0.08] text-xs text-zinc-300 hover:text-rose-300 hover:border-rose-500/35 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>ล้างยอดรวม</span>
                </button>
              )}
            </div>

            <div className="min-h-[20rem] lg:max-h-[38rem] overflow-y-auto p-4 sm:p-5">
              {sortedTotals.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-[#10F5A0]/10 border border-[#10F5A0]/25 flex items-center justify-center text-[#10F5A0]">
                    <Sparkles size={22} />
                  </div>
                  <p className="mt-4 font-display text-base font-bold text-white">
                    ยังไม่มีสรุปไอเท็มที่ได้รับ
                  </p>
                  <p className="mt-1.5 text-xs text-zinc-400 max-w-sm mx-auto">
                    เมื่อได้รับไอเทมหรือยูนิตใหม่ ระบบจะรวมยอดสะสมของแต่ละชิ้นให้ที่นี่อัตโนมัติ
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {sortedTotals.map((t, idx) => {
                    const meta = RARITY_META[t.rarity];
                    const tier = inferItemTier(t.tier, t.id, t.name);
                    const resolvedAssetId =
                      t.kind === 'currency'
                        ? resolveCurrencyIconId(t.id, t.name, t.iconId, account.currencyIcons)
                        : t.iconId;
                    return (
                      <div
                        key={`${t.kind}|${t.id}|${tier || ''}|${idx}`}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-[#101418] p-3 transition-colors hover:bg-[#14191E]"
                        style={{
                          boxShadow: `inset 0 0 0 1px ${meta.border}`,
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                            style={{
                              backgroundColor: meta.softBg,
                              border: `1px solid ${meta.border}`,
                            }}
                          >
                            <RobloxAssetThumb
                              kind={t.kind}
                              name={t.name}
                              itemId={t.id}
                              assetId={resolvedAssetId}
                              alt={t.name}
                              className={
                                t.kind === 'unit'
                                  ? 'w-full h-full object-cover object-top'
                                  : 'w-full h-full object-contain p-0.5'
                              }
                              fallback={
                                <ItemEmblem
                                  kind={t.kind}
                                  rarity={t.rarity}
                                  name={t.name}
                                  size="sm"
                                />
                              }
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p
                                className="text-sm font-semibold truncate"
                                style={{ color: meta.text }}
                              >
                                {t.name}
                              </p>
                              {tier && (
                                <span className="shrink-0 rounded bg-cyan-400/15 border border-cyan-400/35 px-1.5 py-px text-[10px] font-mono font-bold text-cyan-200">
                                  {tier}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-500">
                              {t.rarity} ·{' '}
                              {t.kind === 'unit'
                                ? 'Unit'
                                : t.kind === 'currency'
                                  ? 'Currency'
                                  : 'Item'}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums text-sm font-bold text-[#10F5A0] shrink-0">
                          {t.kind === 'currency' ? '+' : '×'}
                          {formatNumber(t.qty)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ===================================================================
            TAB 3: กระเป๋า (RollinShop Visual Inventory Grid + Compact Table)
           =================================================================== */}
        {activeTab === 'inventory' && (
          <>
            {/* Inventory Filter & Actions Sub-header */}
            <div className="border-b border-white/[0.07] px-4 py-3 sm:px-5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-zinc-400 tabular-nums">
                  แสดง{' '}
                  <strong className="text-white font-semibold">
                    {filteredInventory.length}
                  </strong>{' '}
                  ชนิด · รวม{' '}
                  <strong className="text-[#10F5A0] font-semibold">
                    {formatNumber(
                      filteredInventory.reduce((s, i) => s + i.qty, 0)
                    )}
                  </strong>{' '}
                  ชิ้น
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyTradeSummary}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-xl bg-[#101418] border border-white/[0.08] text-zinc-200 hover:border-[#10F5A0]/45 hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedSummary ? (
                      <Check size={12} className="text-[#10F5A0]" />
                    ) : (
                      <Copy size={12} />
                    )}
                    <span>{copiedSummary ? 'คัดลอกแล้ว' : 'คัดลอกสรุป'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-xl bg-[#101418] border border-white/[0.08] text-zinc-200 hover:border-[#10F5A0]/45 hover:text-white transition-colors cursor-pointer"
                  >
                    <Download size={12} />
                    <span>CSV</span>
                  </button>
                  <div className="inline-flex items-center p-0.5 rounded-xl bg-[#101418] border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setInvView('grid')}
                      title="มุมมองการ์ด"
                      aria-label="มุมมองการ์ด"
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        invView === 'grid'
                          ? 'bg-[#1C2229] text-[#10F5A0]'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <LayoutGrid size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvView('table')}
                      title="มุมมองตาราง"
                      aria-label="มุมมองตาราง"
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        invView === 'table'
                          ? 'bg-[#1C2229] text-[#10F5A0]'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <List size={13} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Search + Sort */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                    placeholder="ค้นหาชื่อไอเทม, Item ID หรือหมวดหมู่..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-[#101418] border border-white/[0.08] text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#10F5A0]/50"
                  />
                </div>
                <select
                  value={invSort}
                  onChange={(e) => setInvSort(e.target.value as InventorySort)}
                  aria-label="เรียงลำดับไอเทม"
                  className="px-3 py-1.5 text-xs rounded-xl bg-[#101418] border border-white/[0.08] text-zinc-200 focus:outline-none focus:border-[#10F5A0]/50 cursor-pointer"
                >
                  <option value="rarity">เรียงตามความหายาก</option>
                  <option value="qty">เรียงตามจำนวนมากสุด</option>
                  <option value="name">เรียงตามชื่อ A-Z</option>
                </select>
              </div>

              {/* Category Filter Strip */}
              {invGroups.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    onClick={() => setInvGroup('ALL')}
                    className={`px-3 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      invGroup === 'ALL'
                        ? 'bg-[#10F5A0] text-[#04150E]'
                        : 'bg-[#101418] text-zinc-400 border border-white/[0.07] hover:text-zinc-200'
                    }`}
                  >
                    ทั้งหมด ({account.inventory.length})
                  </button>
                  {invGroups.map((g) => (
                    <button
                      key={g.name}
                      type="button"
                      onClick={() => setInvGroup(g.name)}
                      className={`px-3 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        invGroup === g.name
                          ? 'bg-[#10F5A0] text-[#04150E]'
                          : 'bg-[#101418] text-zinc-400 border border-white/[0.07] hover:text-zinc-200'
                      }`}
                    >
                      {g.name} ({formatCompact(g.total)})
                    </button>
                  ))}
                </div>
              )}

              {/* Rarity Filter Strip */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setInvRarity('ALL')}
                  className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full whitespace-nowrap shrink-0 cursor-pointer ${
                    invRarity === 'ALL'
                      ? 'bg-white/[0.12] text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  ทุกระดับ
                </button>
                {RARITY_ORDER.map((r) => {
                  const meta = RARITY_META[r];
                  const active = invRarity === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setInvRarity(active ? 'ALL' : r)}
                      className="px-2.5 py-0.5 text-[11px] font-medium rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: active ? meta.softBg : 'transparent',
                        color: active ? meta.text : '#9CA3AF',
                        border: active
                          ? `1px solid ${meta.border}`
                          : '1px solid transparent',
                      }}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inventory Content Body */}
            <div className="min-h-[20rem] lg:max-h-[38rem] overflow-y-auto p-4 sm:p-5">
              {filteredInventory.length === 0 ? (
                <div className="py-14 text-center">
                  <p className="font-display text-base font-bold text-white">
                    ไม่พบไอเทมที่ตรงกับเงื่อนไข
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setInvSearch('');
                      setInvGroup('ALL');
                      setInvRarity('ALL');
                    }}
                    className="mt-4 px-5 py-2 text-xs font-bold rounded-full bg-[#10F5A0] text-[#04150E] hover:bg-[#28FFA9] transition-colors cursor-pointer"
                  >
                    รีเซ็ตตัวกรอง
                  </button>
                </div>
              ) : invView === 'grid' ? (
                invGroup === 'ALL' &&
                (separatedBagSections.portals.length > 0 ||
                  separatedBagSections.charms.length > 0) ? (
                  <div className="space-y-5">
                    {[
                      {
                        key: 'portals',
                        title: 'Portals',
                        accent: 'text-cyan-300',
                        items: separatedBagSections.portals,
                      },
                      {
                        key: 'charms',
                        title: 'Charms',
                        accent: 'text-amber-300',
                        items: separatedBagSections.charms,
                      },
                      {
                        key: 'others',
                        title: 'ไอเทมอื่นๆ และยูนิต',
                        accent: 'text-zinc-300',
                        items: separatedBagSections.others,
                      },
                    ]
                      .filter((sec) => sec.items.length > 0)
                      .map((sec) => (
                        <div key={sec.key}>
                          <div className="mb-2.5 flex items-center justify-between gap-2">
                            <h3 className={`text-xs font-bold tracking-wide ${sec.accent}`}>
                              {sec.title}
                            </h3>
                            <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                              {sec.items.length} รายการ · รวม{' '}
                              {formatNumber(sec.items.reduce((s, x) => s + x.qty, 0))} ชิ้น
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
                            {sec.items.map((it, idx) => {
                              const meta = RARITY_META[it.rarity];
                              return (
                                <div
                                  key={`${it.kind}-${it.id}-${it.tier || ''}-${idx}`}
                                  className="relative flex flex-col justify-between rounded-2xl bg-[#101418] p-3 transition-colors hover:bg-[#141A20]"
                                  style={{
                                    boxShadow: `inset 0 0 0 1px ${meta.border}`,
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div
                                      className="w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                                      style={{
                                        backgroundColor: meta.softBg,
                                        border: `1px solid ${meta.border}`,
                                      }}
                                    >
                                      <RobloxAssetThumb
                                        kind={it.kind === 'unit' ? 'unit' : 'item'}
                                        name={it.name}
                                        itemId={it.id}
                                        assetId={it.iconId}
                                        alt={it.name}
                                        className={
                                          it.kind === 'unit'
                                            ? 'w-full h-full object-cover object-top'
                                            : 'w-full h-full object-contain p-0.5'
                                        }
                                        fallback={
                                          <ItemEmblem
                                            kind={it.kind === 'unit' ? 'unit' : 'item'}
                                            group={it.group}
                                            rarity={it.rarity}
                                            name={it.name}
                                            size="md"
                                          />
                                        }
                                      />
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="rounded-lg bg-black/55 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-[#10F5A0]">
                                        ×{formatNumber(it.qty)}
                                      </span>
                                      {it.tier && (
                                        <span className="rounded-md bg-cyan-400/15 border border-cyan-400/35 px-1.5 py-px font-mono text-[10px] font-bold text-cyan-200">
                                          {it.tier}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-2.5 min-w-0">
                                    <p
                                      className="text-xs font-semibold leading-snug line-clamp-2"
                                      style={{ color: meta.text }}
                                      title={it.tier ? `${it.name} (${it.tier})` : it.name}
                                    >
                                      {it.name}
                                    </p>
                                    <p className="mt-1 text-[10px] text-zinc-500 truncate">
                                      {it.group} · {it.rarity}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  /* Single-group Visual Inventory Card Grid */
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
                    {filteredInventory.map((it, idx) => {
                      const meta = RARITY_META[it.rarity];
                      return (
                        <div
                          key={`${it.kind}-${it.id}-${it.tier || ''}-${idx}`}
                          className="relative flex flex-col justify-between rounded-2xl bg-[#101418] p-3 transition-colors hover:bg-[#141A20]"
                          style={{
                            boxShadow: `inset 0 0 0 1px ${meta.border}`,
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div
                              className="w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center"
                              style={{
                                backgroundColor: meta.softBg,
                                border: `1px solid ${meta.border}`,
                              }}
                            >
                              <RobloxAssetThumb
                                kind={it.kind === 'unit' ? 'unit' : 'item'}
                                name={it.name}
                                itemId={it.id}
                                assetId={it.iconId}
                                alt={it.name}
                                className={
                                  it.kind === 'unit'
                                    ? 'w-full h-full object-cover object-top'
                                    : 'w-full h-full object-contain p-0.5'
                                }
                                fallback={
                                  <ItemEmblem
                                    kind={it.kind === 'unit' ? 'unit' : 'item'}
                                    group={it.group}
                                    rarity={it.rarity}
                                    name={it.name}
                                    size="md"
                                  />
                                }
                              />
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="rounded-lg bg-black/55 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-[#10F5A0]">
                                ×{formatNumber(it.qty)}
                              </span>
                              {it.tier && (
                                <span className="rounded-md bg-cyan-400/15 border border-cyan-400/35 px-1.5 py-px font-mono text-[10px] font-bold text-cyan-200">
                                  {it.tier}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2.5 min-w-0">
                            <p
                              className="text-xs font-semibold leading-snug line-clamp-2"
                              style={{ color: meta.text }}
                              title={it.tier ? `${it.name} (${it.tier})` : it.name}
                            >
                              {it.name}
                            </p>
                            <p className="mt-1 text-[10px] text-zinc-500 truncate">
                              {it.group} · {it.rarity}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                /* High-Density Table View with Tier column */
                <div className="overflow-x-auto -mx-4 sm:-mx-5">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-xs font-medium text-zinc-400">
                        <th className="py-2.5 pl-5 pr-3">ไอเทม</th>
                        <th className="py-2.5 px-3">Tier</th>
                        <th className="py-2.5 px-3">หมวดหมู่</th>
                        <th className="py-2.5 px-3">ระดับ</th>
                        <th className="py-2.5 pl-3 pr-5 text-right">จำนวน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-xs">
                      {filteredInventory.map((it, idx) => {
                        const meta = RARITY_META[it.rarity];
                        return (
                          <tr
                            key={`${it.kind}-${it.id}-${it.tier || ''}-${idx}`}
                            className="hover:bg-white/[0.025] transition-colors"
                          >
                            <td className="py-2.5 pl-5 pr-3">
                              <div className="flex items-center gap-2.5 min-w-[170px]">
                                <div
                                  className="w-8 h-8 rounded-md shrink-0 overflow-hidden flex items-center justify-center"
                                  style={{
                                    backgroundColor: meta.softBg,
                                    border: `1px solid ${meta.border}`,
                                  }}
                                >
                                  <RobloxAssetThumb
                                    kind={it.kind === 'unit' ? 'unit' : 'item'}
                                    name={it.name}
                                    itemId={it.id}
                                    assetId={it.iconId}
                                    alt={it.name}
                                    className={
                                      it.kind === 'unit'
                                        ? 'w-full h-full object-cover object-top'
                                        : 'w-full h-full object-contain p-0.5'
                                    }
                                    fallback={
                                      <ItemEmblem
                                        kind={it.kind === 'unit' ? 'unit' : 'item'}
                                        group={it.group}
                                        rarity={it.rarity}
                                        name={it.name}
                                        size="sm"
                                      />
                                    }
                                  />
                                </div>
                                <div className="min-w-0">
                                  <p
                                    className="font-semibold truncate"
                                    style={{ color: meta.text }}
                                  >
                                    {it.name}
                                  </p>
                                  <p className="text-[10px] font-mono text-zinc-500 truncate">
                                    {it.id}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {it.tier ? (
                                <span className="rounded-md bg-cyan-400/15 border border-cyan-400/35 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-200">
                                  {it.tier}
                                </span>
                              ) : (
                                <span className="text-zinc-600">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-300 whitespace-nowrap">
                              {it.group}
                            </td>
                            <td
                              className="py-2.5 px-3 font-medium whitespace-nowrap"
                              style={{ color: meta.text }}
                            >
                              {it.rarity}
                            </td>
                            <td className="py-2.5 pl-3 pr-5 text-right font-mono font-bold tabular-nums text-[#10F5A0] whitespace-nowrap">
                              ×{formatNumber(it.qty)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
