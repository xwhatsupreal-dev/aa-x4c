import { useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Code2,
  Coins,
  Copy,
  Download,
  Gem,
  History,
  LayoutGrid,
  List,
  Monitor,
  Package,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import {
  formatCompact,
  formatNumber,
  formatRelativeTime,
  isAccountOnline,
  RARITY_META,
  RARITY_ORDER,
  RARITY_RANK,
} from '../data/aaCatalog.ts';
import type {
  AccountSnapshot,
  Rarity,
  RewardEntry,
  TeamUnit,
} from '../types.ts';
import { ItemEmblem } from './ItemEmblem.tsx';
import { RobloxAvatarStage } from './RobloxAvatarStage.tsx';

export type DashboardTab = 'drops' | 'obtained' | 'inventory';

interface AccountDashboardProps {
  account: AccountSnapshot;
  nowTs: number;
  syncKey: string;
  apiBase: string;
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
}

const SOURCE_INFO: Record<string, { label: string; short: string }> = {
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

export function AccountDashboard({
  account,
  nowTs,
  syncKey,
  apiBase,
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

  const online = isAccountOnline(account.lastSyncedAt, nowTs);

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

  // Group drops that arrived within 15 seconds & same source into RollinShop-style event rows
  const dropBatches = useMemo<DropBatch[]>(() => {
    const q = dropSearch.trim().toLowerCase();
    const filtered = account.rewards.filter((r) => {
      if (dropRarity !== 'ALL' && r.rarity !== dropRarity) return false;
      if (q) {
        return (
          r.name.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.src.toLowerCase().includes(q)
        );
      }
      return true;
    });

    const batches: DropBatch[] = [];
    for (const r of filtered) {
      const prev = batches[batches.length - 1];
      const sameWindow =
        prev &&
        prev.src === r.src &&
        Math.abs(prev.ts - r.ts) <= 15_000;

      if (sameWindow) {
        prev.entries.push(r);
        prev.totalQty += r.qty;
        if (RARITY_RANK[r.rarity] > RARITY_RANK[prev.topRarity]) {
          prev.topRarity = r.rarity;
        }
      } else {
        const info = SOURCE_INFO[r.src] || {
          label: r.src || 'ได้รับไอเทม',
          short: 'ดรอป',
        };
        batches.push({
          id: `${r.ts}-${r.src}-${batches.length}`,
          ts: r.ts,
          timeLabel: r.t,
          src: r.src,
          srcLabel: info.label,
          srcShort: info.short,
          topRarity: r.rarity,
          totalQty: r.qty,
          entries: [r],
        });
      }
    }
    return batches;
  }, [account.rewards, dropSearch, dropRarity]);

  // Sorted aggregated totals (for "ไอเท็มที่ได้รับ" tab)
  const sortedTotals = useMemo(() => {
    return Object.values(account.totals).sort(
      (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.qty - a.qty
    );
  }, [account.totals]);

  // Inventory groups + filtered list
  const invGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of account.inventory) {
      map.set(it.group, (map.get(it.group) ?? 0) + it.qty);
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [account.inventory]);

  const filteredInventory = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    const list = account.inventory.filter((it) => {
      if (invGroup !== 'ALL' && it.group !== invGroup) return false;
      if (invRarity !== 'ALL' && it.rarity !== invRarity) return false;
      if (q) {
        return (
          it.name.toLowerCase().includes(q) ||
          it.id.toLowerCase().includes(q) ||
          it.group.toLowerCase().includes(q)
        );
      }
      return true;
    });
    return [...list].sort((a, b) => {
      if (invSort === 'qty')
        return b.qty - a.qty || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
      if (invSort === 'rarity')
        return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.qty - a.qty;
      return a.name.localeCompare(b.name);
    });
  }, [account.inventory, invGroup, invRarity, invSearch, invSort]);

  const handleClearDropsClick = async () => {
    if (clearingDrops || account.rewards.length === 0) return;
    setClearingDrops(true);
    try {
      await onClearDrops();
    } finally {
      setClearingDrops(false);
    }
  };

  const handleCopyTradeSummary = async () => {
    const lines: string[] = [
      `=== เช็คของ Anime Adventures: ${account.displayName} (@${account.username}) ===`,
      `Gold: ${formatNumber(account.gold)} | Gems: ${formatNumber(account.gems)}${account.level ? ` | Lv.${account.level}` : ''}`,
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
        .map((it) => `- ${it.name} (${it.rarity}) x${formatNumber(it.qty)}`),
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
    const header = ['Item ID', 'Name', 'Group', 'Rarity', 'Type', 'Quantity'];
    const rows = filteredInventory.map((it) => [
      it.id,
      `"${it.name.replace(/"/g, '""')}"`,
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
              background: online
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
                online
                  ? 'bg-[#10F5A0]/12 border-[#10F5A0]/35 text-[#10F5A0]'
                  : 'bg-[#12161B]/90 border-white/[0.10] text-zinc-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  online ? 'bg-[#10F5A0] shadow-[0_0_8px_#10F5A0]' : 'bg-zinc-500'
                }`}
              />
              <span>{online ? 'ออนไลน์' : 'ออฟไลน์'}</span>
            </span>
          </div>

          {/* 3D Full-Body Roblox Character Stage */}
          <RobloxAvatarStage
            userId={account.userId}
            username={account.username}
            apiBase={apiBase}
            online={online}
          />
        </div>

        {/* Account Identity */}
        <div className="px-5 pb-4">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white truncate">
            {account.displayName}
          </h2>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="size-9 shrink-0 rounded-xl bg-[#10F5A0]/12 border border-[#10F5A0]/30 flex items-center justify-center font-display text-xs font-extrabold text-[#10F5A0]">
              AA
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100 truncate">
                @{account.username}
              </p>
              <p className="text-xs text-zinc-400 truncate font-mono tabular-nums">
                Anime Adventures{account.userId ? ` · ID ${account.userId}` : ''}
              </p>
            </div>
          </div>
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

        {/* 3-Column Divided Stat Grid (Level / Gems / Gold) */}
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
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              <Gem size={12} className="shrink-0 text-[#10F5A0]" />
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
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              <Coins size={12} className="shrink-0 text-amber-300" />
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

        {/* Bottom Meta Footer Bar */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-white/[0.08] bg-white/[0.02] px-5 py-2.5 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
            <Monitor size={13} className="shrink-0 text-zinc-500" />
            <span className="truncate">
              {storageLabel} · {syncKey}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 shrink-0 tabular-nums">
            <Clock size={13} className="shrink-0 text-zinc-500" />
            <span>{formatRelativeTime(account.lastSyncedAt, nowTs)}</span>
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
                      online ? 'bg-[#10F5A0] shadow-[0_0_8px_#10F5A0]' : 'bg-zinc-600'
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
                      {/* Center Unit Monogram / Emblem */}
                      <div className="absolute inset-0 flex items-center justify-center pb-2">
                        <span
                          className="font-display text-sm sm:text-base font-extrabold tracking-tight drop-shadow"
                          style={{ color: meta.text }}
                        >
                          {getUnitInitials(unit.name)}
                        </span>
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

            {/* Right Highlight Counter Box (matching RollinShop's Wave Box) */}
            <div className="flex shrink-0 gap-2">
              <div className="flex h-14 min-w-[4.75rem] flex-col justify-center rounded-2xl bg-[#10151A] border border-white/[0.09] px-3.5 text-center">
                <span className="text-[11px] font-medium text-zinc-400 whitespace-nowrap">
                  ของดรอป
                </span>
                <span className="mt-0.5 block text-2xl font-display font-extrabold leading-none tabular-nums text-[#10F5A0]">
                  {account.rewards.length}
                </span>
              </div>
            </div>
          </div>

          {/* Inline Expanded Unit Detail Bar when clicking one of the 6 unit portraits */}
          {activeUnit && (
            <div className="mt-3 rounded-2xl bg-[#10151A] border border-[#10F5A0]/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <ItemEmblem
                  kind="unit"
                  rarity={activeUnit.rarity}
                  name={activeUnit.name}
                  shiny={activeUnit.shiny}
                  size="sm"
                />
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
                  {account.rewards.length}
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
                  {account.rewards.length}
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
                className="relative flex min-w-0 cursor-pointer flex-col items-center gap-0.5 overflow-hidden rounded-2xl px-1.5 py-2 text-center transition-colors sm:flex-row sm:gap-3 sm:px-3 sm:py-2.5 sm:text-left bg-[#101418] border border-white/[0.07] hover:border-[#10F5A0]/45"
              >
                <span className="flex items-center gap-1 sm:hidden text-[#10F5A0]">
                  <Code2 size={14} />
                  <span className="text-sm font-bold leading-tight text-white">Lua</span>
                </span>
                <span className="text-[10px] leading-tight sm:hidden truncate w-full text-zinc-400">
                  สคริปต์
                </span>

                <span className="hidden size-9 shrink-0 place-items-center rounded-xl sm:grid bg-white/[0.05] text-[#10F5A0]">
                  <Code2 size={17} />
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block text-base font-bold leading-tight text-white">
                    Lua
                  </span>
                  <span className="block truncate text-xs text-zinc-400">
                    สคริปต์ซิงค์
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
                  รอบดรอป ({account.rewards.length} รายการ)
                  {account.rewards[0] ? ` · ล่าสุด ${account.rewards[0].t}` : ''}
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
                    return (
                      <li
                        key={batch.id}
                        className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-start gap-x-3 py-3.5 sm:grid-cols-[6.75rem_minmax(0,1fr)]"
                      >
                        {/* Left Event Thumbnail Card (matching RollinShop left stage card) */}
                        <div
                          className="relative row-span-1 flex flex-col justify-between aspect-video w-full self-start overflow-hidden rounded-xl p-2 sm:row-span-2 sm:aspect-auto sm:min-h-[4.25rem] sm:self-stretch"
                          style={{
                            background: `linear-gradient(145deg, ${topMeta.hex}24, rgba(16, 20, 24, 0.96) 75%)`,
                            boxShadow: `inset 0 0 0 1px ${topMeta.border}`,
                          }}
                        >
                          <span
                            className="text-[10px] font-mono font-bold tabular-nums"
                            style={{ color: topMeta.text }}
                          >
                            +{formatNumber(batch.totalQty)} ชิ้น
                          </span>
                          <span className="truncate text-[11px] font-bold leading-none text-white">
                            {batch.srcShort}
                          </span>
                        </div>

                        {/* Top Row: Event Title + Right-Aligned Clock */}
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-x-2">
                            <span className="shrink-0 text-sm font-extrabold text-[#10F5A0]">
                              ได้รับ
                            </span>
                            <span className="min-w-0 truncate text-sm font-semibold text-zinc-100">
                              {batch.entries.length === 1
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
                            <span>{batch.srcLabel}</span>
                            <span className="mx-1.5 text-zinc-600">·</span>
                            <span style={{ color: topMeta.text }}>
                              สูงสุด {batch.topRarity}
                            </span>
                          </p>
                        </div>

                        {/* Wrapped Inline Reward Chips (exact RollinShop chip list style!) */}
                        <div className="col-span-2 mt-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:col-start-2">
                          {batch.entries.map((entry, idx) => {
                            const meta = RARITY_META[entry.rarity];
                            return (
                              <span
                                key={`${entry.ts}-${entry.id}-${idx}`}
                                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-white/[0.035] py-1 pl-1.5 pr-2 text-xs text-zinc-200"
                                style={{
                                  boxShadow: `inset 0 0 0 1px ${meta.border}`,
                                }}
                              >
                                <span
                                  className="size-2 rounded-full shrink-0"
                                  style={{ backgroundColor: meta.hex }}
                                />
                                <span
                                  className="max-w-[160px] truncate font-medium"
                                  style={{ color: meta.text }}
                                >
                                  {entry.name}
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-white">
                                  ×{formatNumber(entry.qty)}
                                </span>
                              </span>
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
                  {sortedTotals.map((t) => {
                    const meta = RARITY_META[t.rarity];
                    return (
                      <div
                        key={`${t.kind}|${t.id}`}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-[#101418] p-3 transition-colors hover:bg-[#14191E]"
                        style={{
                          boxShadow: `inset 0 0 0 1px ${meta.border}`,
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <ItemEmblem
                            kind={t.kind}
                            rarity={t.rarity}
                            name={t.name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p
                              className="text-sm font-semibold truncate"
                              style={{ color: meta.text }}
                            >
                              {t.name}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {t.rarity} · {t.kind === 'unit' ? 'Unit' : 'Item'}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums text-sm font-bold text-[#10F5A0] shrink-0">
                          ×{formatNumber(t.qty)}
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
                /* RollinShop-Style Visual Inventory Card Grid */
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
                  {filteredInventory.map((it) => {
                    const meta = RARITY_META[it.rarity];
                    return (
                      <div
                        key={`${it.kind}-${it.id}`}
                        className="relative flex flex-col justify-between rounded-2xl bg-[#101418] p-3 transition-colors hover:bg-[#141A20]"
                        style={{
                          boxShadow: `inset 0 0 0 1px ${meta.border}`,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <ItemEmblem
                            kind="item"
                            group={it.group}
                            rarity={it.rarity}
                            name={it.name}
                            size="sm"
                          />
                          <span className="rounded-lg bg-black/55 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-[#10F5A0]">
                            ×{formatNumber(it.qty)}
                          </span>
                        </div>
                        <div className="mt-2.5 min-w-0">
                          <p
                            className="text-xs font-semibold leading-snug line-clamp-2"
                            style={{ color: meta.text }}
                            title={it.name}
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
              ) : (
                /* High-Density Table View */
                <div className="overflow-x-auto -mx-4 sm:-mx-5">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-xs font-medium text-zinc-400">
                        <th className="py-2.5 pl-5 pr-3">ไอเทม</th>
                        <th className="py-2.5 px-3">หมวดหมู่</th>
                        <th className="py-2.5 px-3">ระดับ</th>
                        <th className="py-2.5 pl-3 pr-5 text-right">จำนวน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-xs">
                      {filteredInventory.map((it) => {
                        const meta = RARITY_META[it.rarity];
                        return (
                          <tr
                            key={`${it.kind}-${it.id}`}
                            className="hover:bg-white/[0.025] transition-colors"
                          >
                            <td className="py-2.5 pl-5 pr-3">
                              <div className="flex items-center gap-2.5 min-w-[170px]">
                                <ItemEmblem
                                  kind="item"
                                  group={it.group}
                                  rarity={it.rarity}
                                  name={it.name}
                                  size="sm"
                                />
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
