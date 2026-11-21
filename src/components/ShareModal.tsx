import { useState } from 'react';
import { Check, Copy, Link2, X } from 'lucide-react';
import { formatNumber } from '../data/aaCatalog.ts';
import type { AccountSnapshot } from '../types.ts';

interface ShareModalProps {
  account: AccountSnapshot;
  syncKey: string;
  apiBase: string;
  cloudflareUrl: string;
  onClose: () => void;
}

export function ShareModal({
  account,
  syncKey,
  apiBase,
  cloudflareUrl,
  onClose,
}: ShareModalProps) {
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const handleCreateShare = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncKey, accountId: account.accountId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.shareId) {
        setError(data?.error || `ไม่สามารถสร้างลิ้งค์แชร์ได้ (HTTP ${res.status})`);
        return;
      }
      const params = new URLSearchParams({ share: data.shareId });
      if (cloudflareUrl) {
        params.set('cf', cloudflareUrl);
      }
      const url = `${window.location.origin}/?${params.toString()}`;
      setShareUrl(url);
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyTextCard = async () => {
    const topUnits = account.equipped
      .map(
        (u, idx) =>
          `${idx + 1}. ${u.name}${u.shiny ? ' ✦' : ''} (${u.rarity}${u.traits?.length ? ` · ${u.traits.join(', ')}` : ''})`
      )
      .join('\n');
    const summary = [
      `เช็คของ Anime Adventures — ${account.displayName} (@${account.username})`,
      `Gold: ${formatNumber(account.gold)} · Gems: ${formatNumber(account.gems)}`,
      `ทีม 6 ตัว:\n${topUnits || '-'}`,
      shareUrl ? `\nดูของทั้งหมดในกระเป๋า: ${shareUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="w-full max-w-lg rounded-3xl bg-[#0B0E11] border border-white/[0.10] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#10F5A0] shadow-[0_0_8px_#10F5A0]" />
            <h2 id="share-modal-title" className="font-display text-base font-bold text-white">
              แชร์ลิ้งค์เช็คของ (Read-Only)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="p-1.5 rounded-xl bg-[#12161B] border border-white/[0.08] text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            สร้างลิ้งค์สำหรับส่งให้เพื่อนหรือผู้ซื้อดูทีม 6 ตัว, Gold/Gems และกระเป๋าไอเทมของ{' '}
            <span className="text-white font-semibold">{account.displayName}</span>{' '}
            {cloudflareUrl
              ? '(บันทึกลง Cloudflare KV ถาวรโดยไม่เปิดเผย Sync Key)'
              : '(โหมดดูอย่างเดียวโดยไม่เปิดเผย Sync Key)'}
          </p>

          {!shareUrl ? (
            <div className="space-y-3">
              {error && <p className="text-xs text-rose-400">{error}</p>}
              <button
                type="button"
                onClick={handleCreateShare}
                disabled={creating}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold rounded-full bg-[#10F5A0] text-[#04150E] hover:bg-[#28FFA9] shadow-[0_0_24px_rgba(16,245,160,0.28)] disabled:opacity-50 transition-all cursor-pointer"
              >
                <Link2 size={15} />
                <span>{creating ? 'กำลังสร้างลิ้งค์เช็คของ...' : 'สร้างลิ้งค์เช็คของตอนนี้'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 px-3.5 py-2.5 text-xs font-mono rounded-xl bg-[#050709] border border-white/[0.10] text-zinc-200 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl bg-[#10F5A0] text-[#04150E] hover:bg-[#28FFA9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedUrl ? 'คัดลอกแล้ว' : 'คัดลอกลิ้งค์'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyTextCard}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-xl bg-[#12161B] border border-white/[0.09] text-zinc-200 hover:border-[#10F5A0]/40 hover:text-white transition-colors cursor-pointer"
              >
                {copiedText ? <Check size={14} className="text-[#10F5A0]" /> : <Copy size={14} />}
                <span>
                  {copiedText
                    ? 'คัดลอกข้อความพร้อมลิ้งค์แล้ว'
                    : 'คัดลอกข้อความสรุป + ลิ้งค์ (พร้อมโพสต์ลง Discord / Facebook)'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
