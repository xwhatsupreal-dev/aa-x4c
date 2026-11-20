import { useMemo, useState } from 'react';
import { Check, Copy, Download, LayoutGrid, List, Search } from 'lucide-react';
import {
  formatNumber,
  RARITY_META,
  RARITY_ORDER,
  RARITY_RANK,
} from '../data/aaCatalog.ts';
import type { AccountSnapshot, InventoryItem, Rarity } from '../types.ts';
import { ItemEmblem } from './ItemEmblem.tsx';

interface InventoryViewProps {
  account: AccountSnapshot;
  initialGroup: string;
  onGroupChange: (group: string) => void;
}

type SortBy = 'qty' | 'rarity' | 'name';

export function InventoryView({
  account,
  initialGroup,
  onGroupChange,
}: InventoryViewProps) {
  const [search, setSearch] = useState('');
  const [selectedRarity, setSelectedRarity] = useState<Rarity | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('rarity');
  const [viewMode, setViewMode] = useState<'table' | 'grouped'>('table');
  const [copiedSummary, setCopiedSummary] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of account.inventory) {
      map.set(item.group, (map.get(item.group) ?? 0) + item.qty);
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [account.inventory]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = account.inventory.filter((it) => {
      if (initialGroup !== 'ALL' && it.group !== initialGroup) return false;
      if (selectedRarity !== 'ALL' && it.rarity !== selectedRarity) return false;
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
      if (sortBy === 'qty') return b.qty - a.qty || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
      if (sortBy === 'rarity') return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.qty - a.qty;
      return a.name.localeCompare(b.name);
    });
  }, [account.inventory, initialGroup, selectedRarity, search, sortBy]);

  const groupedItems = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const it of filteredItems) {
      const arr = map.get(it.group) ?? [];
      arr.push(it);
      map.set(it.group, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredItems]);

  const handleCopyTradeSummary = async () => {
    const lines: string[] = [
      `=== เช็คของ Anime Adventures: ${account.displayName} (@${account.username}) ===`,
      `Gold: ${formatNumber(account.gold)} | Gems: ${formatNumber(account.gems)}`,
      '',
      `[ทีม 6 ตัว]`,
      ...account.equipped.map((u, i) => {
        const traitStr = u.traits?.length ? ` [${u.traits.join(', ')}]` : '';
        return `${i + 1}. ${u.name}${u.shiny ? ' ✦Shiny' : ''} (${u.rarity}${u.level ? ` Lv.${u.level}` : ''})${traitStr}`;
      }),
      '',
      `[ไอเทมในกระเป๋า (${filteredItems.length} รายการ)]`,
      ...filteredItems.slice(0, 40).map((it) => `- ${it.name} (${it.rarity}) x${formatNumber(it.qty)}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // ignore clipboard errors in restricted contexts
    }
  };

  const handleExportCsv = () => {
    const header = ['Item ID', 'Name', 'Group', 'Rarity', 'Type', 'Quantity'];
    const rows = filteredItems.map((it) => [
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

  const totalFilteredQty = filteredItems.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            กระเป๋าไอเทม
          </h1>
          <p className="mt-1 text-sm text-slate-400 tabular-nums">
            แสดง {filteredItems.length} ชนิด · รวม {formatNumber(totalFilteredQty)} ชิ้น (จากทั้งหมด{' '}
            {account.inventory.length} ชนิด)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyTradeSummary}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#151A26] border border-white/[0.10] text-slate-200 hover:bg-[#1B2233] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedSummary ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copiedSummary ? 'คัดลอกสรุปแล้ว' : 'คัดลอกสรุปเทรด'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#151A26] border border-white/[0.10] text-slate-200 hover:bg-[#1B2233] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download size={14} />
            <span>ส่งออก CSV</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อไอเทม, Item ID หรือหมวดหมู่..."
              className="w-full pl-10 pr-4 py-2 text-sm rounded-lg bg-[#121620] border border-white/[0.09] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#4F6EF7]"
            />
          </div>

          {/* Sort Select */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            aria-label="เรียงลำดับไอเทม"
            className="px-3.5 py-2 text-sm rounded-lg bg-[#121620] border border-white/[0.09] text-slate-200 focus:outline-none focus:border-[#4F6EF7] cursor-pointer"
          >
            <option value="rarity">เรียงตามความหายาก</option>
            <option value="qty">เรียงตามจำนวนมากสุด</option>
            <option value="name">เรียงตามชื่อ A-Z</option>
          </select>

          {/* View Mode Segmented Control */}
          <div className="inline-flex items-center p-1 rounded-lg bg-[#121620] border border-white/[0.08] shrink-0 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-[#20273A] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <List size={14} />
              <span>ตาราง</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'grouped'
                  ? 'bg-[#20273A] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid size={14} />
              <span>แยกหมวดหมู่</span>
            </button>
          </div>
        </div>

        {/* Interactive Group Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => onGroupChange('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              initialGroup === 'ALL'
                ? 'bg-[#4F6EF7] text-white'
                : 'bg-[#121620] text-slate-400 border border-white/[0.07] hover:text-slate-200'
            }`}
          >
            ทุกหมวดหมู่ ({account.inventory.length})
          </button>
          {groups.map((g) => (
            <button
              key={g.name}
              type="button"
              onClick={() => onGroupChange(g.name)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                initialGroup === g.name
                  ? 'bg-[#4F6EF7] text-white'
                  : 'bg-[#121620] text-slate-400 border border-white/[0.07] hover:text-slate-200'
              }`}
            >
              {g.name} ({formatNumber(g.total)})
            </button>
          ))}
        </div>

        {/* Interactive Rarity Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
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

      {/* Empty State */}
      {filteredItems.length === 0 ? (
        <div className="rounded-xl bg-[#121620] border border-white/[0.08] p-12 text-center">
          <p className="text-sm font-medium text-slate-200">
            ไม่พบไอเทมที่ตรงกับเงื่อนไขการค้นหา
          </p>
          <p className="mt-1 text-xs text-slate-500">
            ลองล้างคำค้นหาหรือเปลี่ยนตัวกรองหมวดหมู่และระดับความหายาก
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              onGroupChange('ALL');
              setSelectedRarity('ALL');
            }}
            className="mt-4 px-4 py-2 text-xs font-medium rounded-lg bg-[#4F6EF7] text-white hover:bg-[#3F5EE8] transition-colors cursor-pointer"
          >
            รีเซ็ตตัวกรอง
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* Compact High-Density Data Table */
        <div className="rounded-xl bg-[#121620] border border-white/[0.08] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs font-medium text-slate-400">
                  <th className="py-3 pl-5 pr-3">ไอเทม</th>
                  <th className="py-3 px-3">หมวดหมู่</th>
                  <th className="py-3 px-3">ความหายาก</th>
                  <th className="py-3 px-3">ประเภท</th>
                  <th className="py-3 pl-3 pr-5 text-right">จำนวน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-sm">
                {filteredItems.map((it) => {
                  const meta = RARITY_META[it.rarity];
                  return (
                    <tr
                      key={`${it.kind}-${it.id}`}
                      className="hover:bg-white/[0.025] transition-colors"
                    >
                      <td className="py-2.5 pl-5 pr-3">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <ItemEmblem
                            kind="item"
                            group={it.group}
                            rarity={it.rarity}
                            name={it.name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p
                              className="font-medium truncate"
                              style={{ color: meta.text }}
                            >
                              {it.name}
                            </p>
                            <p className="text-[11px] font-mono text-slate-500 truncate">
                              {it.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-300 whitespace-nowrap">
                        {it.group}
                      </td>
                      <td
                        className="py-2.5 px-3 text-xs font-medium whitespace-nowrap"
                        style={{ color: meta.text }}
                      >
                        {it.rarity}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-400 whitespace-nowrap">
                        {it.kind === 'unique' ? 'Unique' : 'Normal'}
                      </td>
                      <td className="py-2.5 pl-3 pr-5 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                        x{formatNumber(it.qty)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grouped by item_group View (matching Lua script bag layout) */
        <div className="space-y-6">
          {groupedItems.map(([groupName, items]) => {
            const sumQty = items.reduce((s, i) => s + i.qty, 0);
            return (
              <section key={groupName} className="space-y-3">
                <div className="flex items-baseline justify-between border-b border-white/[0.07] pb-2">
                  <h2 className="text-sm font-semibold text-slate-200">
                    {groupName}
                  </h2>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {items.length} ชนิด · {formatNumber(sumQty)} ชิ้น
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {items.map((it) => {
                    const meta = RARITY_META[it.rarity];
                    return (
                      <div
                        key={`${it.kind}-${it.id}`}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#121620] border border-white/[0.08]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <ItemEmblem
                            kind="item"
                            group={it.group}
                            rarity={it.rarity}
                            name={it.name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p
                              className="text-sm font-medium truncate"
                              style={{ color: meta.text }}
                            >
                              {it.name}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {it.rarity} · {it.kind === 'unique' ? 'Unique' : 'Normal'}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums text-sm font-semibold text-slate-100 shrink-0">
                          x{formatNumber(it.qty)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
