import { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import {
  formatNumber,
  RARITY_META,
  RARITY_ORDER,
  RARITY_RANK,
} from '../data/aaCatalog.ts';
import type { AccountSnapshot, Rarity } from '../types.ts';
import { ItemEmblem } from './ItemEmblem.tsx';

interface DropsViewProps {
  account: AccountSnapshot;
  isReadOnly: boolean;
  onClearDrops: () => Promise<void>;
}

const SOURCE_LABELS: Record<string, string> = {
  show_unit_and_item_rewards: 'รางวัลจบด่าน',
  unit_added: 'ได้รับยูนิต',
  unique_item_added: 'ได้รับไอเทม Unique',
  normal_item_added: 'ได้รับไอเทม',
  inventory: 'ตรวจจับจากกระเป๋า',
  sync: 'ซิงค์ข้อมูล',
};

export function DropsView({
  account,
  isReadOnly,
  onClearDrops,
}: DropsViewProps) {
  const [search, setSearch] = useState('');
  const [selectedRarity, setSelectedRarity] = useState<Rarity | 'ALL'>('ALL');
  const [clearing, setClearing] = useState(false);

  const filteredDrops = useMemo(() => {
    const q = search.trim().toLowerCase();
    return account.rewards.filter((r) => {
      if (selectedRarity !== 'ALL' && r.rarity !== selectedRarity) return false;
      if (q) {
        return (
          r.name.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.src.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [account.rewards, search, selectedRarity]);

  const sortedTotals = useMemo(() => {
    return Object.values(account.totals).sort(
      (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.qty - a.qty
    );
  }, [account.totals]);

  const handleClear = async () => {
    if (clearing || account.rewards.length === 0) return;
    setClearing(true);
    try {
      await onClearDrops();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10F5A0] shadow-[0_0_10px_#10F5A0]" />
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              ประวัติของที่ได้หลังจบด่าน <span className="text-[#10F5A0]">({account.rewards.length})</span>
            </h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            รับข้อมูลจริงจาก Event ในเกม Anime Adventures และ Inventory Diff อัตโนมัติ
          </p>
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleClear}
              disabled={clearing || account.rewards.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl bg-[#0B0E11] border border-white/[0.10] text-zinc-300 hover:text-rose-300 hover:border-rose-500/30 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 size={13} />
              <span>ล้างประวัติ</span>
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2.5 md:items-center">
        <div className="relative flex-1 max-w-md">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อไอเทมหรือยูนิตที่ได้..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-2xl bg-[#0B0E11] border border-white/[0.09] text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#10F5A0]/60"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setSelectedRarity('ALL')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedRarity === 'ALL'
                ? 'bg-white/[0.12] text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            ทุกระดับ
          </button>
          {RARITY_ORDER.map((r) => {
            const meta = RARITY_META[r];
            const active = selectedRarity === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRarity(active ? 'ALL' : r)}
                className="px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: active ? meta.softBg : 'transparent',
                  color: active ? meta.text : '#9CA3AF',
                  border: active ? `1px solid ${meta.border}` : '1px solid transparent',
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* Two-Column Content: Chronological Drop Table + Session Totals */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Drop Timeline Table */}
        <div className="rounded-3xl bg-[#0B0E11] border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-white">
              รายการของที่ได้ล่าสุด <span className="text-[#10F5A0]">({filteredDrops.length})</span>
            </h3>
            <span className="text-xs text-zinc-500">เรียงจากใหม่ไปเก่า</span>
          </div>

          {filteredDrops.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-display text-base font-bold text-white">
                ยังไม่มีรายการของที่ได้ในรอบนี้
              </p>
              <p className="mt-1.5 text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                เมื่อเล่นจบด่านหรือเปิดของในเกม Anime Adventures ระบบจะบันทึกและแสดงรายการที่นี่อัตโนมัติ
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.07] text-xs font-medium text-zinc-400">
                    <th className="py-3 pl-5 pr-3">เวลา</th>
                    <th className="py-3 px-3">ของที่ได้</th>
                    <th className="py-3 px-3">แหล่งที่มา</th>
                    <th className="py-3 pl-3 pr-5 text-right">จำนวน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-sm">
                  {filteredDrops.map((entry, idx) => {
                    const meta = RARITY_META[entry.rarity];
                    return (
                      <tr
                        key={`${entry.ts}-${entry.id}-${idx}`}
                        className="hover:bg-white/[0.025] transition-colors"
                      >
                        <td className="py-3 pl-5 pr-3 font-mono tabular-nums text-xs text-zinc-400 whitespace-nowrap">
                          {entry.t}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-3 min-w-[200px]">
                            <ItemEmblem
                              kind={entry.kind}
                              rarity={entry.rarity}
                              name={entry.name}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p
                                className="font-medium truncate"
                                style={{ color: meta.text }}
                              >
                                {entry.name}
                              </p>
                              <p className="text-xs text-zinc-500 truncate">
                                {entry.rarity} · {entry.kind === 'unit' ? 'Unit' : 'Item'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-zinc-400 whitespace-nowrap">
                          {SOURCE_LABELS[entry.src] || entry.src}
                        </td>
                        <td className="py-3 pl-3 pr-5 text-right font-mono tabular-nums font-semibold text-[#10F5A0] whitespace-nowrap">
                          +x{formatNumber(entry.qty)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Aggregated Session Totals */}
        <aside className="rounded-3xl bg-[#0B0E11] border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-white">สรุปยอดรวมที่ได้</h3>
            <span className="text-xs font-mono tabular-nums text-[#10F5A0]">
              {sortedTotals.length} ชนิด
            </span>
          </div>

          {sortedTotals.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              ยังไม่มีสรุปยอดรวม
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {sortedTotals.map((t) => {
                const meta = RARITY_META[t.rarity];
                return (
                  <li
                    key={`${t.kind}|${t.id}`}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ItemEmblem
                        kind={t.kind}
                        rarity={t.rarity}
                        name={t.name}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p
                          className="text-xs font-medium truncate"
                          style={{ color: meta.text }}
                        >
                          {t.name}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {t.rarity} · {t.kind === 'unit' ? 'Unit' : 'Item'}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-semibold text-[#10F5A0] shrink-0">
                      x{formatNumber(t.qty)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
