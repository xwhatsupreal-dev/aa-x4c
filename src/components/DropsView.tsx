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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            ประวัติของที่ได้หลังจบด่าน
          </h1>
          <p className="mt-1 text-sm text-slate-400 tabular-nums">
            รับข้อมูลจริงจาก Event ในเกม Anime Adventures และ Inventory Diff · ทั้งหมด{' '}
            {account.rewards.length} รายการ
          </p>
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleClear}
              disabled={clearing || account.rewards.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#151A26] border border-white/[0.10] text-slate-300 hover:text-rose-300 hover:border-rose-500/30 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 size={13} />
              <span>ล้างประวัติ</span>
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1 max-w-md">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อไอเทมหรือยูนิตที่ได้..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg bg-[#121620] border border-white/[0.09] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#4F6EF7]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setSelectedRarity('ALL')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedRarity === 'ALL'
                ? 'bg-white/[0.12] text-white'
                : 'text-slate-500 hover:text-slate-300'
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
                className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: active ? meta.softBg : 'transparent',
                  color: active ? meta.text : '#94A3B8',
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
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Drop Timeline Table */}
        <div className="rounded-xl bg-[#121620] border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">
              รายการของที่ได้ล่าสุด ({filteredDrops.length})
            </h2>
            <span className="text-xs text-slate-500">เรียงจากใหม่ไปเก่า</span>
          </div>

          {filteredDrops.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-slate-300">
                ยังไม่มีรายการของที่ได้ในรอบนี้
              </p>
              <p className="mt-1 text-xs text-slate-500">
                เมื่อเล่นจบด่านหรือเปิดของในเกม Anime Adventures ระบบจะบันทึกและแสดงรายการที่นี่อัตโนมัติ
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.07] text-xs font-medium text-slate-400">
                    <th className="py-2.5 pl-5 pr-3">เวลา</th>
                    <th className="py-2.5 px-3">ของที่ได้</th>
                    <th className="py-2.5 px-3">แหล่งที่มา</th>
                    <th className="py-2.5 pl-3 pr-5 text-right">จำนวน</th>
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
                        <td className="py-2.5 pl-5 pr-3 font-mono tabular-nums text-xs text-slate-400 whitespace-nowrap">
                          {entry.t}
                        </td>
                        <td className="py-2.5 px-3">
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
                              <p className="text-xs text-slate-500 truncate">
                                {entry.rarity} · {entry.kind === 'unit' ? 'Unit' : 'Item'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-400 whitespace-nowrap">
                          {SOURCE_LABELS[entry.src] || entry.src}
                        </td>
                        <td className="py-2.5 pl-3 pr-5 text-right font-mono tabular-nums font-semibold text-emerald-300 whitespace-nowrap">
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
        <aside className="rounded-xl bg-[#121620] border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">สรุปยอดรวมที่ได้</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {sortedTotals.length} ชนิด
            </span>
          </div>

          {sortedTotals.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
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
                        <p className="text-[11px] text-slate-500">
                          {t.rarity} · {t.kind === 'unit' ? 'Unit' : 'Item'}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-semibold text-slate-100 shrink-0">
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
