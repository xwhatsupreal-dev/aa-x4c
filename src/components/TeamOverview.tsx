import { useState } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import {
  formatNumber,
  formatRelativeTime,
  isAccountOnline,
  RARITY_META,
} from '../data/aaCatalog.ts';
import type { AccountSnapshot, TeamUnit } from '../types.ts';
import { ItemEmblem } from './ItemEmblem.tsx';

interface TeamOverviewProps {
  account: AccountSnapshot;
  nowTs?: number;
  onSelectCategory: (group: string) => void;
  onGoDrops: () => void;
}

export function TeamOverview({
  account,
  nowTs = Date.now(),
  onSelectCategory,
  onGoDrops,
}: TeamOverviewProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const online = isAccountOnline(account.lastSyncedAt, nowTs);

  // Build fixed 6 slots matching Anime Adventures team structure
  const slots: Array<{ slot: number; unit: TeamUnit | null }> = Array.from(
    { length: 6 },
    (_, i) => {
      const slotNum = i + 1;
      const found =
        account.equipped.find((u) => u.slot === slotNum) ??
        account.equipped[i] ??
        null;
      return { slot: slotNum, unit: found };
    }
  );

  // Group inventory counts
  const groupSummaryMap = new Map<string, { kinds: number; totalQty: number }>();
  for (const item of account.inventory) {
    const entry = groupSummaryMap.get(item.group) ?? { kinds: 0, totalQty: 0 };
    entry.kinds += 1;
    entry.totalQty += item.qty;
    groupSummaryMap.set(item.group, entry);
  }
  const groupSummary = Array.from(groupSummaryMap.entries())
    .map(([group, stats]) => ({ group, ...stats }))
    .sort((a, b) => b.totalQty - a.totalQty);

  const totalInventoryPieces = account.inventory.reduce((s, it) => s + it.qty, 0);
  const activeUnit =
    selectedSlot !== null
      ? slots.find((s) => s.slot === selectedSlot)?.unit ?? null
      : null;

  return (
    <div className="space-y-6">
      {/* Account Identity Header Card */}
      <div className="rounded-3xl bg-[#0B0E11] border border-white/[0.08] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  online ? 'bg-[#10F5A0] shadow-[0_0_8px_#10F5A0]' : 'bg-zinc-600'
                }`}
              />
              <span className={online ? 'text-[#10F5A0] font-medium' : 'text-zinc-400'}>
                {online ? 'ออนไลน์' : 'ออฟไลน์ (บันทึกค้างไว้)'}
              </span>
              {account.level ? <span>· Lv.{account.level}</span> : null}
              {account.userId ? <span className="font-mono">· ID {account.userId}</span> : null}
            </div>
            <h2 className="mt-1.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-white truncate">
              {account.displayName}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              @{account.username} · อัปเดตล่าสุด {formatRelativeTime(account.lastSyncedAt, nowTs)}
            </p>
          </div>
        </div>

        {/* 4-Column Tabular KPI Strip */}
        <section
          aria-label="สรุปทรัพยากรบัญชี"
          className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-2.5"
        >
          <div className="p-4 rounded-2xl bg-[#101418] border border-white/[0.07]">
            <p className="text-xs text-zinc-400">Gold</p>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono tabular-nums text-amber-300">
              {formatNumber(account.gold)}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">เหรียญทองในตัว</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#101418] border border-white/[0.07]">
            <p className="text-xs text-zinc-400">Gems</p>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono tabular-nums text-[#10F5A0]">
              {formatNumber(account.gems)}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">เพชรสำหรับสุ่มตู้</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#101418] border border-white/[0.07]">
            <p className="text-xs text-zinc-400">ทีมที่สวมใส่</p>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono tabular-nums text-white">
              {account.equipped.length}
              <span className="text-zinc-500 text-base"> / 6</span>
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {account.equipped.filter((u) => u.shiny).length} Shiny ·{' '}
              {account.equipped.filter((u) => u.rarity === 'Secret').length} Secret
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#101418] border border-white/[0.07]">
            <p className="text-xs text-zinc-400">ไอเทมในกระเป๋า</p>
            <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono tabular-nums text-white">
              {formatNumber(totalInventoryPieces)}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">
              Unique {account.uniqueCount} · Normal {account.normalKindCount}
            </p>
          </div>
        </section>
      </div>

      {/* Equipped Team 6-Slot Grid */}
      <section aria-label="ทีม 6 ตัวที่สวมใส่" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10F5A0] shadow-[0_0_10px_#10F5A0]" />
            <h2 className="font-display text-lg sm:text-xl font-bold text-white">
              ทีมที่ใส่ในด่าน <span className="text-[#10F5A0]">({account.equipped.length}/6)</span>
            </h2>
          </div>
          {activeUnit && (
            <button
              type="button"
              onClick={() => setSelectedSlot(null)}
              className="text-xs text-zinc-400 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              ปิดรายละเอียด
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {slots.map(({ slot, unit }) => {
            if (!unit) {
              return (
                <div
                  key={slot}
                  className="flex items-center gap-3.5 p-4 rounded-2xl bg-[#0B0E11] border border-dashed border-white/[0.08] text-zinc-500"
                >
                  <div className="w-12 h-12 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center font-mono text-xs tabular-nums">
                    0{slot}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-400">ช่องว่าง</p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      ยังไม่ได้ใส่ตัวละครในช่องที่ {slot}
                    </p>
                  </div>
                </div>
              );
            }

            const meta = RARITY_META[unit.rarity];
            const isSelected = selectedSlot === slot;
            const traitText =
              unit.traits && unit.traits.length > 0
                ? unit.traits.join(', ')
                : 'ไม่มี Trait';

            return (
              <button
                key={slot}
                type="button"
                onClick={() => setSelectedSlot(isSelected ? null : slot)}
                className={`text-left flex items-center gap-3.5 p-4 rounded-2xl border transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10F5A0] ${
                  isSelected
                    ? 'bg-[#11171A] border-[#10F5A0]/50 shadow-[0_0_20px_rgba(16,245,160,0.08)]'
                    : 'bg-[#0B0E11] border-white/[0.08] hover:border-white/[0.16] hover:bg-[#101418]'
                }`}
              >
                <ItemEmblem
                  kind="unit"
                  rarity={unit.rarity}
                  name={unit.name}
                  shiny={unit.shiny}
                  size="lg"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: meta.text }}
                    >
                      {unit.name}
                      {unit.shiny ? ' ✦' : ''}
                    </p>
                    <span className="text-xs font-mono tabular-nums text-zinc-500 shrink-0">
                      0{slot}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-zinc-400 truncate tabular-nums">
                    <span>{unit.rarity}</span>
                    {unit.level !== undefined && (
                      <>
                        <span className="mx-1.5 text-zinc-600">·</span>
                        <span>Lv.{unit.level}</span>
                      </>
                    )}
                    <span className="mx-1.5 text-zinc-600">·</span>
                    <span className="text-zinc-200">{traitText}</span>
                  </p>

                  {unit.stats && (
                    <p className="mt-1 text-[11px] font-mono tabular-nums text-zinc-500">
                      DMG {unit.stats.dmg || '-'} / SPA {unit.stats.spa || '-'} / RNG{' '}
                      {unit.stats.rng || '-'}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Inline Unit Detail Strip when a unit is clicked */}
        {activeUnit && (
          <div className="p-4 rounded-2xl bg-[#0F1418] border border-[#10F5A0]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <ItemEmblem
                kind="unit"
                rarity={activeUnit.rarity}
                name={activeUnit.name}
                shiny={activeUnit.shiny}
                size="md"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {activeUnit.name}
                  {activeUnit.shiny ? ' (Shiny ✦)' : ''}
                </p>
                <p className="text-xs text-zinc-400 font-mono truncate mt-0.5">
                  Unit ID: {activeUnit.id}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="text-zinc-500">ระดับ: </span>
                <span style={{ color: RARITY_META[activeUnit.rarity].text }} className="font-medium">
                  {activeUnit.rarity}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">เลเวล: </span>
                <span className="font-mono tabular-nums text-zinc-200">
                  {activeUnit.level ?? '-'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Trait: </span>
                <span className="text-zinc-200">
                  {activeUnit.traits && activeUnit.traits.length > 0
                    ? activeUnit.traits.join(', ')
                    : 'ไม่มี'}
                </span>
              </div>
              {activeUnit.stats && (
                <div>
                  <span className="text-zinc-500">Stat Rank: </span>
                  <span className="font-mono text-zinc-200">
                    DMG {activeUnit.stats.dmg ?? '-'} · SPA {activeUnit.stats.spa ?? '-'} · RNG{' '}
                    {activeUnit.stats.rng ?? '-'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Bottom 2-Column Split: Inventory Groups Summary & Latest Drops */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        {/* Inventory Categories Summary */}
        <div className="rounded-3xl bg-[#0B0E11] border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#10F5A0]" />
              <h2 className="font-display text-base font-bold text-white">
                หมวดหมู่ไอเทมในกระเป๋า
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onSelectCategory('ALL')}
              className="text-xs text-[#10F5A0] hover:text-[#6EFFC7] transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>เปิดกระเป๋า</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {groupSummary.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              ยังไม่มีข้อมูลไอเทมในกระเป๋า
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {groupSummary.map((g) => (
                <li key={g.group}>
                  <button
                    type="button"
                    onClick={() => onSelectCategory(g.group)}
                    className="w-full px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.03] transition-colors text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate">
                        {g.group}
                      </p>
                      <p className="text-xs text-zinc-500 tabular-nums">
                        {g.kinds} ชนิด
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-sm font-mono tabular-nums font-semibold text-[#10F5A0]">
                        {formatNumber(g.totalQty)} ชิ้น
                      </span>
                      <ChevronRight size={15} className="text-zinc-600" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Drops Preview */}
        <div className="rounded-3xl bg-[#0B0E11] border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#10F5A0]" />
              <h2 className="font-display text-base font-bold text-white">
                ของที่ได้ล่าสุด <span className="text-[#10F5A0]">({account.rewards.length})</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onGoDrops}
              className="text-xs text-[#10F5A0] hover:text-[#6EFFC7] transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>ดูทั้งหมด</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {account.rewards.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              ยังไม่มีประวัติของที่ดรอป — เมื่อเล่นจบด่านในเกม ระบบจะบันทึกของที่ได้ให้อัตโนมัติ
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {account.rewards.slice(0, 6).map((r, idx) => {
                const meta = RARITY_META[r.rarity];
                return (
                  <li
                    key={`${r.ts}-${r.id}-${idx}`}
                    className="px-5 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ItemEmblem
                        kind={r.kind}
                        rarity={r.rarity}
                        name={r.name}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: meta.text }}
                        >
                          {r.name}
                        </p>
                        <p className="text-xs text-zinc-500 truncate tabular-nums">
                          <span>{r.t}</span>
                          <span className="mx-1.5 text-zinc-700">·</span>
                          <span>{r.rarity}</span>
                          <span className="mx-1.5 text-zinc-700">·</span>
                          <span>{r.kind === 'unit' ? 'Unit' : 'Item'}</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-mono tabular-nums font-semibold text-[#10F5A0] shrink-0">
                      +x{formatNumber(r.qty)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
