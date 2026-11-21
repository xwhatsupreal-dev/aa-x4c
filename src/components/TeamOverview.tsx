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
    <div className="space-y-8">
      {/* Account Identity Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs text-slate-400">
            บัญชีที่เลือก
            {account.level ? ` · Lv.${account.level}` : ''}
            {account.userId ? ` · ID ${account.userId}` : ''}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-50 text-balance">
            {account.displayName}
          </h1>
          <p className="mt-1 text-sm text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>@{account.username}</span>
            <span className="text-slate-600">·</span>
            <span className={online ? 'text-emerald-400' : 'text-slate-400'}>
              {online ? 'ออนไลน์' : 'ออฟไลน์ (บันทึกข้อมูลล่าสุดไว้)'}
            </span>
            <span className="text-slate-600">·</span>
            <span>อัปเดตล่าสุด {formatRelativeTime(account.lastSyncedAt, nowTs)}</span>
          </p>
        </div>
      </div>

      {/* 4-Column Tabular KPI Strip — single flat bordered bar with internal hairline dividers */}
      <section
        aria-label="สรุปทรัพยากรบัญชี"
        className="grid grid-cols-2 lg:grid-cols-4 rounded-xl bg-[#121620] border border-white/[0.08] divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08]"
      >
        <div className="p-5">
          <p className="text-xs text-slate-400">Gold</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-amber-300">
            {formatNumber(account.gold)}
          </p>
          <p className="mt-1 text-xs text-slate-500">เหรียญทองในตัว</p>
        </div>

        <div className="p-5">
          <p className="text-xs text-slate-400">Gems</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-sky-300">
            {formatNumber(account.gems)}
          </p>
          <p className="mt-1 text-xs text-slate-500">เพชรสำหรับสุ่มตู้</p>
        </div>

        <div className="p-5">
          <p className="text-xs text-slate-400">ทีมที่สวมใส่</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {account.equipped.length}
            <span className="text-slate-500 text-lg"> / 6</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {account.equipped.filter((u) => u.shiny).length} ตัว Shiny ·{' '}
            {account.equipped.filter((u) => u.rarity === 'Secret').length} ตัว Secret
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-slate-400">ไอเทมในกระเป๋า</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {formatNumber(totalInventoryPieces)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Unique {account.uniqueCount} ชิ้น · Normal {account.normalKindCount} ชนิด
          </p>
        </div>
      </section>

      {/* Equipped Team 6-Slot Grid */}
      <section aria-label="ทีม 6 ตัวที่สวมใส่" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              ทีมที่ใส่ในด่าน ({account.equipped.length}/6)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              คลิกที่ตัวละครเพื่อดูรายละเอียด Trait และค่าสเตตัสเพิ่มเติม
            </p>
          </div>
          {activeUnit && (
            <button
              type="button"
              onClick={() => setSelectedSlot(null)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                  className="flex items-center gap-3.5 p-4 rounded-xl bg-[#10131C] border border-dashed border-white/[0.08] text-slate-500"
                >
                  <div className="w-12 h-12 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center font-mono text-xs tabular-nums">
                    0{slot}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-400">ช่องว่าง</p>
                    <p className="text-xs text-slate-600 mt-0.5">
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
                className={`text-left flex items-center gap-3.5 p-4 rounded-xl border transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] ${
                  isSelected
                    ? 'bg-[#171C2B] border-[#4F6EF7]/60'
                    : 'bg-[#121620] border-white/[0.08] hover:border-white/[0.16] hover:bg-[#151A26]'
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
                    <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                      0{slot}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-slate-400 truncate tabular-nums">
                    <span>{unit.rarity}</span>
                    {unit.level !== undefined && (
                      <>
                        <span className="mx-1.5 text-slate-600">·</span>
                        <span>Lv.{unit.level}</span>
                      </>
                    )}
                    <span className="mx-1.5 text-slate-600">·</span>
                    <span className="text-slate-200">{traitText}</span>
                  </p>

                  {unit.stats && (
                    <p className="mt-1 text-[11px] font-mono tabular-nums text-slate-500">
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
          <div className="p-4 rounded-xl bg-[#141926] border border-white/[0.10] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <ItemEmblem
                kind="unit"
                rarity={activeUnit.rarity}
                name={activeUnit.name}
                shiny={activeUnit.shiny}
                size="md"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100 truncate">
                  {activeUnit.name}
                  {activeUnit.shiny ? ' (Shiny ✦)' : ''}
                </p>
                <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
                  Unit ID: {activeUnit.id}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="text-slate-500">ระดับ: </span>
                <span style={{ color: RARITY_META[activeUnit.rarity].text }} className="font-medium">
                  {activeUnit.rarity}
                </span>
              </div>
              <div>
                <span className="text-slate-500">เลเวล: </span>
                <span className="font-mono tabular-nums text-slate-200">
                  {activeUnit.level ?? '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Trait: </span>
                <span className="text-slate-200">
                  {activeUnit.traits && activeUnit.traits.length > 0
                    ? activeUnit.traits.join(', ')
                    : 'ไม่มี'}
                </span>
              </div>
              {activeUnit.stats && (
                <div>
                  <span className="text-slate-500">Stat Rank: </span>
                  <span className="font-mono text-slate-200">
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
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Inventory Categories Summary */}
        <div className="rounded-xl bg-[#121620] border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-slate-100">
              หมวดหมู่ไอเทมในกระเป๋า
            </h2>
            <button
              type="button"
              onClick={() => onSelectCategory('ALL')}
              className="text-xs text-[#7D96FF] hover:text-white transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>เปิดกระเป๋าทั้งหมด</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {groupSummary.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              ยังไม่มีข้อมูลไอเทมในกระเป๋า
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {groupSummary.map((g) => (
                <li key={g.group}>
                  <button
                    type="button"
                    onClick={() => onSelectCategory(g.group)}
                    className="w-full px-5 py-3 flex items-center justify-between gap-4 hover:bg-white/[0.03] transition-colors text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        {g.group}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {g.kinds} ชนิด
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-mono tabular-nums font-medium text-slate-100">
                        {formatNumber(g.totalQty)} ชิ้น
                      </span>
                      <ChevronRight size={15} className="text-slate-600" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Drops Preview */}
        <div className="rounded-xl bg-[#121620] border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-slate-100">
              ของที่ได้ล่าสุด ({account.rewards.length} รายการ)
            </h2>
            <button
              type="button"
              onClick={onGoDrops}
              className="text-xs text-[#7D96FF] hover:text-white transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>ดูประวัติทั้งหมด</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {account.rewards.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
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
                        <p className="text-xs text-slate-500 truncate tabular-nums">
                          <span>{r.t}</span>
                          <span className="mx-1.5 text-slate-700">·</span>
                          <span>{r.rarity}</span>
                          <span className="mx-1.5 text-slate-700">·</span>
                          <span>{r.kind === 'unit' ? 'Unit' : 'Item'}</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-mono tabular-nums font-semibold text-slate-100 shrink-0">
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
