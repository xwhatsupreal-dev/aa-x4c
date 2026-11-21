import { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Clock,
  Copy,
  Download,
  FileUp,
  RefreshCw,
  Settings2,
  Sparkles,
  Unplug,
} from 'lucide-react';
import {
  formatRelativeTime,
  getOnlineTimeoutMs,
  isAccountOnline,
  isScriptOutdated,
  SCRIPT_CHANGELOG,
  SCRIPT_UPDATED_AT,
  SCRIPT_VERSION,
} from '../data/aaCatalog.ts';
import type { AccountSnapshot } from '../types.ts';
import {
  CLOUDFLARE_WORKER_CODE,
  WRANGLER_TOML_CODE,
} from '../utils/cloudflareWorkerTemplate.ts';
import { generateWebSyncLuaScript } from '../utils/luaGenerator.ts';

interface LuaSyncViewProps {
  syncKey: string;
  cloudflareUrl: string;
  backendProvider: string;
  accounts: AccountSnapshot[];
  nowTs: number;
  liveConnected: boolean;
  onChangeSyncKey: (newKey: string) => void;
  onConnectCloudflare: (
    url: string
  ) => Promise<{ ok: boolean; kvBound?: boolean; message: string }>;
  onDisconnectCloudflare: () => void;
  onOpenAccount: (accountId: string) => void;
  onSubmitScriptPacket: (
    rawText: string
  ) => Promise<{ ok: boolean; username?: string; error?: string }>;
}

export function LuaSyncView({
  syncKey,
  cloudflareUrl,
  backendProvider,
  accounts,
  nowTs,
  liveConnected,
  onChangeSyncKey,
  onConnectCloudflare,
  onDisconnectCloudflare,
  onOpenAccount,
  onSubmitScriptPacket,
}: LuaSyncViewProps) {
  const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const [keyInput, setKeyInput] = useState(syncKey);
  const [intervalSec, setIntervalSec] = useState(10);
  const [showInGameGui, setShowInGameGui] = useState(true);
  const [copiedLoader, setCopiedLoader] = useState(false);
  const [copiedRawUrl, setCopiedRawUrl] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showFullCode, setShowFullCode] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  // Optional advanced panel (collapsed by default so users don't need to enter any Cloudflare link!)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cfInput, setCfInput] = useState(cloudflareUrl);
  const [testingCf, setTestingCf] = useState(false);
  const [cfStatus, setCfStatus] = useState<{
    type: 'idle' | 'success' | 'warning' | 'error';
    text: string;
  }>({ type: 'idle', text: '' });
  const [workerTab, setWorkerTab] = useState<'worker' | 'wrangler'>('worker');
  const [copiedWorker, setCopiedWorker] = useState(false);

  const [pasteBox, setPasteBox] = useState('');
  const [syncingPaste, setSyncingPaste] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState<{
    type: 'idle' | 'success' | 'error';
    text: string;
  }>({ type: 'idle', text: '' });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeSyncEndpoint = cloudflareUrl
    ? `${cloudflareUrl.replace(/\/$/, '')}/api/sync`
    : `${defaultOrigin}/api/sync`;

  const rawScriptUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (syncKey && syncKey !== 'main') params.set('key', syncKey);
    if (intervalSec !== 10) params.set('interval', String(intervalSec));
    if (!showInGameGui) params.set('gui', '0');
    if (cloudflareUrl) params.set('endpoint', `${cloudflareUrl.replace(/\/$/, '')}/api/sync`);
    const qs = params.toString();
    return `${defaultOrigin}/api/script${qs ? `?${qs}` : ''}`;
  }, [defaultOrigin, syncKey, intervalSec, showInGameGui, cloudflareUrl]);

  const shortLoadstring = `loadstring(game:HttpGet("${rawScriptUrl}"))()`;

  const luaScript = useMemo(
    () =>
      generateWebSyncLuaScript(
        activeSyncEndpoint,
        syncKey,
        intervalSec,
        showInGameGui
      ),
    [activeSyncEndpoint, syncKey, intervalSec, showInGameGui]
  );

  const providerLabel = cloudflareUrl
    ? 'Cloudflare Worker KV'
    : backendProvider === 'vercel-kv'
      ? 'Vercel KV / Redis (ถาวร)'
      : backendProvider === 'cloudflare-kv-vercel'
        ? 'Vercel + Cloudflare KV (ถาวร)'
        : backendProvider === 'vercel-builtin'
          ? 'Vercel API อัตโนมัติ'
          : 'เซิร์ฟเวอร์อัตโนมัติ';

  const handleApplyKey = () => {
    const cleaned = keyInput.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    if (!cleaned) return;
    setKeyInput(cleaned);
    onChangeSyncKey(cleaned);
  };

  const handleGeneratePrivateKey = () => {
    const randomPart = Math.random().toString(36).slice(2, 8);
    const nextKey = `aa-${randomPart}`;
    setKeyInput(nextKey);
    onChangeSyncKey(nextKey);
  };

  const handleCopyLoader = async () => {
    try {
      await navigator.clipboard.writeText(shortLoadstring);
      setCopiedLoader(true);
      setTimeout(() => setCopiedLoader(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyRawUrl = async () => {
    try {
      await navigator.clipboard.writeText(rawScriptUrl);
      setCopiedRawUrl(true);
      setTimeout(() => setCopiedRawUrl(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(luaScript);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadLua = () => {
    const blob = new Blob([luaScript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `2K_AA_AutoSync_${syncKey}.lua`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTestAndSaveCloudflare = async () => {
    const cleaned = cfInput.trim().replace(/\/+$/, '');
    if (!cleaned || testingCf) return;
    setTestingCf(true);
    setCfStatus({ type: 'idle', text: '' });
    try {
      const result = await onConnectCloudflare(cleaned);
      if (result.ok && result.kvBound) {
        setCfStatus({ type: 'success', text: result.message });
      } else if (result.ok && result.kvBound === false) {
        setCfStatus({ type: 'warning', text: result.message });
      } else {
        setCfStatus({ type: 'error', text: result.message });
      }
    } finally {
      setTestingCf(false);
    }
  };

  const handleCopyWorkerCode = async () => {
    const text = workerTab === 'worker' ? CLOUDFLARE_WORKER_CODE : WRANGLER_TOML_CODE;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWorker(true);
      setTimeout(() => setCopiedWorker(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadWorkerCode = () => {
    const isWorker = workerTab === 'worker';
    const blob = new Blob([isWorker ? CLOUDFLARE_WORKER_CODE : WRANGLER_TOML_CODE], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isWorker ? 'worker.js' : 'wrangler.toml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const processPacket = async (raw: string) => {
    if (!raw.trim() || syncingPaste) return;
    setSyncingPaste(true);
    setPasteFeedback({ type: 'idle', text: '' });
    try {
      const res = await onSubmitScriptPacket(raw);
      if (res.ok) {
        setPasteBox('');
        setPasteFeedback({
          type: 'success',
          text: `บันทึกข้อมูลจริงของ ${res.username} เรียบร้อยแล้ว`,
        });
      } else {
        setPasteFeedback({
          type: 'error',
          text: res.error || 'ข้อมูลที่วางไม่ใช่ข้อมูลจากสคริปต์ 2K AA Vault',
        });
      }
    } finally {
      setSyncingPaste(false);
    }
  };

  const handleReadClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText.trim()) {
        setPasteFeedback({
          type: 'error',
          text: 'คลิปบอร์ดว่าง — กดปุ่ม "คัดลอกข้อมูลเข้าเว็บ" ในหน้าต่างสคริปต์ในเกมก่อน',
        });
        return;
      }
      await processPacket(clipText);
    } catch {
      setPasteFeedback({
        type: 'error',
        text: 'เบราว์เซอร์ไม่อนุญาตให้อ่านคลิปบอร์ดอัตโนมัติ — คลิกช่องด้านล่างแล้วกด Ctrl+V แทนได้เลย',
      });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await processPacket(text);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const offlineTimeoutSec = Math.round(getOnlineTimeoutMs(intervalSec) / 1000);
  const outdatedAccountsCount = accounts.filter((a) => isScriptOutdated(a.scriptVersion)).length;

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10F5A0] shadow-[0_0_10px_#10F5A0]" />
          <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
            สคริปต์เชื่อมต่อเกม <span className="text-[#10F5A0]">(1 บรรทัด)</span>
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#10F5A0]/12 border border-[#10F5A0]/35 text-xs font-mono font-bold text-[#10F5A0]">
          <Sparkles size={12} />
          <span>v{SCRIPT_VERSION} · อัปเดต {SCRIPT_UPDATED_AT}</span>
        </span>
      </div>

      {/* Script Version & Update History Card */}
      <section className="rounded-3xl bg-[#0B0E11] border border-white/[0.08] overflow-hidden">
        <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-white">
                สคริปต์เวอร์ชันล่าสุด: <span className="font-mono text-[#10F5A0]">v{SCRIPT_VERSION}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                <Clock size={12} className="text-zinc-500" />
                <span>อัปเดตเมื่อ {SCRIPT_UPDATED_AT}</span>
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              <strong className="text-zinc-200">คำสั่งรัน 1 บรรทัด (loadstring)</strong>{' '}
              จะดึงสคริปต์เวอร์ชันล่าสุดจากเว็บให้อัตโนมัติ แค่กดรันซ้ำในเกมอีกครั้งเมื่อเห็นเวลาอัปเดตใหม่
              — ส่วนถ้าใช้ไฟล์ <code className="font-mono text-zinc-300">.lua</code> หรือก๊อปโค้ดเต็ม ต้องคัดลอกใหม่ทุกครั้งที่มีอัปเดต
            </p>
            {outdatedAccountsCount > 0 && (
              <p className="inline-flex items-center gap-1.5 pt-1 text-xs font-medium text-amber-300">
                <AlertCircle size={13} className="shrink-0" />
                <span>
                  มี {outdatedAccountsCount} บัญชีที่ยังใช้สคริปต์รุ่นเก่า — แนะนำให้รันคำสั่ง 1 บรรทัดด้านล่างซ้ำในเกม
                </span>
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowChangelog((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#12161B] border border-white/[0.10] text-xs font-medium text-zinc-200 hover:border-[#10F5A0]/40 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{showChangelog ? 'ซ่อนประวัติอัปเดต' : 'ดูประวัติอัปเดตสคริปต์'}</span>
            {showChangelog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showChangelog && (
          <div className="border-t border-white/[0.08] bg-[#080B0E] px-5 py-4 space-y-4">
            {SCRIPT_CHANGELOG.map((rel, idx) => (
              <div
                key={rel.version}
                className={idx > 0 ? 'pt-3.5 border-t border-white/[0.06]' : ''}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-mono text-xs font-bold ${
                      idx === 0 ? 'text-[#10F5A0]' : 'text-zinc-200'
                    }`}
                  >
                    v{rel.version}
                  </span>
                  {idx === 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#10F5A0]/15 text-[10px] font-semibold text-[#10F5A0]">
                      ล่าสุด
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">{rel.updatedAt}</span>
                </div>
                <ul className="mt-1.5 space-y-1 text-xs text-zinc-300 list-disc pl-4">
                  {rel.highlights.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Auto-Sync Status Bar + Per-Account Version & Heartbeat Check */}
      <section className="rounded-3xl bg-[#0B0E11] border border-white/[0.08] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-400">
              โหมดการเชื่อมต่อ: <span className="text-zinc-100 font-medium">{providerLabel}</span>
              {' · '}
              ห้อง: <span className="font-mono text-[#10F5A0]">{syncKey}</span>
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              {accounts.length > 0
                ? `บันทึกข้อมูลจริงแล้ว ${accounts.length} บัญชี (เช็คสถานะออนไลน์ตามรอบซิงค์ของแต่ละไอดี)`
                : 'กำลังรอข้อมูลจากสคริปต์ในเกม — รันคำสั่งด้านล่างแล้วข้อมูลจะเด้งเข้าเว็บอัตโนมัติ'}
            </p>
          </div>
          <span className="text-xs font-mono text-[#10F5A0] whitespace-nowrap shrink-0">
            {liveConnected || backendProvider ? '● พร้อมรับข้อมูลอัตโนมัติ' : 'กำลังเชื่อมต่อ'}
          </span>
        </div>

        {accounts.length > 0 && (
          <ul className="mt-4 pt-4 border-t border-white/[0.07] divide-y divide-white/[0.06]">
            {accounts.map((acc) => {
              const online = isAccountOnline(acc.lastSyncedAt, nowTs, acc.syncIntervalSec);
              const outdated = isScriptOutdated(acc.scriptVersion);
              return (
                <li
                  key={acc.accountId}
                  className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          online ? 'bg-[#10F5A0] shadow-[0_0_8px_#10F5A0]' : 'bg-zinc-600'
                        }`}
                      />
                      <p className="text-sm font-medium text-white truncate">
                        {acc.displayName}{' '}
                        <span className="text-zinc-500">(@{acc.username})</span>
                      </p>
                      <span
                        className={`text-[11px] font-mono ${
                          online ? 'text-[#10F5A0]' : 'text-zinc-500'
                        }`}
                      >
                        {online ? 'ออนไลน์' : 'ออฟไลน์'}
                      </span>
                      {outdated ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400/12 border border-amber-400/35 text-[10px] font-semibold text-amber-300">
                          สคริปต์เก่า ({acc.scriptVersion ? `v${acc.scriptVersion}` : 'รุ่นก่อน'}) · ควรรันใหม่
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-[#10F5A0]/12 border border-[#10F5A0]/30 text-[10px] font-mono font-semibold text-[#10F5A0]">
                          v{acc.scriptVersion} ล่าสุด
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      ซิงค์ล่าสุด {formatRelativeTime(acc.lastSyncedAt, nowTs)}
                      {acc.syncIntervalSec ? ` · เช็คทุก ${acc.syncIntervalSec} วิ` : ''}
                      {' · '}ทีม {acc.equipped.length}/6 · ไอเทม {acc.inventory.length} ชนิด
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenAccount(acc.accountId)}
                    className="self-start sm:self-center px-3.5 py-1.5 text-xs font-semibold rounded-full bg-[#14191F] border border-white/[0.10] text-zinc-200 hover:border-[#10F5A0]/40 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    เปิดดูของ
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Primary 1-Line Loadstring Card */}
      <section className="rounded-3xl bg-[#0B0E11] border border-white/[0.08] overflow-hidden">
        <div className="p-5 border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-white">
              คำสั่งรันแบบสั้น (โฮสต์ตรงบนเว็บนี้ · v{SCRIPT_VERSION})
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              คัดลอก 1 บรรทัดไปรันในตัวรัน Roblox ได้เลย ไม่ต้องฝาก Pastebin เอง
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl bg-[#050709] border border-white/[0.10] text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInGameGui}
                onChange={(e) => setShowInGameGui(e.target.checked)}
                className="accent-[#10F5A0] rounded"
              />
              <span>แสดง GUI ในเกม</span>
            </label>

            <select
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              aria-label="ความถี่ในการเช็คออนไลน์และซิงค์"
              className="px-3 py-1.5 text-xs rounded-xl bg-[#050709] border border-white/[0.10] text-zinc-200 focus:outline-none focus:border-[#10F5A0]/60 cursor-pointer"
            >
              <option value={5}>เช็ค/ซิงค์ทุก 5 วินาที</option>
              <option value={10}>เช็ค/ซิงค์ทุก 10 วินาที</option>
              <option value={15}>เช็ค/ซิงค์ทุก 15 วินาที</option>
              <option value={30}>เช็ค/ซิงค์ทุก 30 วินาที</option>
              <option value={60}>เช็ค/ซิงค์ทุก 60 วินาที</option>
            </select>
          </div>
        </div>

        <div className="p-5 space-y-4 bg-[#080B0E]">
          <div className="rounded-2xl bg-[#050709] border border-[#10F5A0]/25 px-4 py-4 overflow-x-auto">
            <code className="text-xs sm:text-sm font-mono text-[#10F5A0] whitespace-nowrap select-all">
              {shortLoadstring}
            </code>
          </div>

          <p className="flex items-start gap-2 text-xs text-zinc-400">
            <Activity size={14} className="text-[#10F5A0] shrink-0 mt-0.5" />
            <span>
              ขณะรันสคริปต์ ระบบจะส่งสัญญาณ Heartbeat และอัปเดตของทุก ๆ{' '}
              <strong className="text-zinc-200">{intervalSec} วินาที</strong> — หากปิดเกมหรือสคริปต์หยุดเกิน{' '}
              <strong className="text-zinc-200">~{offlineTimeoutSec} วินาที</strong> เว็บจะสลับเป็น{' '}
              <strong className="text-zinc-200">ออฟไลน์</strong> อัตโนมัติ (แต่ยังเก็บของค้างไว้ให้ดูต่อได้)
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyLoader}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs sm:text-sm font-bold rounded-full bg-[#10F5A0] text-[#04150E] hover:bg-[#28FFA9] shadow-[0_0_24px_rgba(16,245,160,0.3)] transition-all whitespace-nowrap cursor-pointer"
            >
              {copiedLoader ? <Check size={15} /> : <Copy size={15} />}
              <span>{copiedLoader ? 'คัดลอกสคริปต์สั้นแล้ว' : 'คัดลอกสคริปต์ (1 บรรทัด)'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyRawUrl}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium rounded-full bg-[#12161B] border border-white/[0.10] text-zinc-200 hover:border-[#10F5A0]/40 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              {copiedRawUrl ? <Check size={14} className="text-[#10F5A0]" /> : <Copy size={14} />}
              <span>{copiedRawUrl ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์ Raw'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFullCode((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium rounded-full bg-transparent border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors whitespace-nowrap cursor-pointer"
            >
              {showFullCode ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span>{showFullCode ? 'ซ่อนโค้ดเต็ม' : 'ดูโค้ดเต็ม / ดาวน์โหลด .lua'}</span>
            </button>
          </div>
        </div>

        {showFullCode && (
          <div className="border-t border-white/[0.08]">
            <div className="px-5 py-3 bg-[#0B0E11] border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-400 truncate">
                ส่งข้อมูลไปที่: <code className="font-mono text-zinc-200">{activeSyncEndpoint}</code>
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#12161B] border border-white/[0.10] text-zinc-200 hover:text-white transition-colors cursor-pointer"
                >
                  {copiedScript ? <Check size={13} className="text-[#10F5A0]" /> : <Copy size={13} />}
                  <span>{copiedScript ? 'คัดลอกโค้ดเต็มแล้ว' : 'คัดลอกโค้ดเต็ม'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadLua}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#12161B] border border-white/[0.10] text-zinc-200 hover:text-white transition-colors cursor-pointer"
                >
                  <Download size={13} />
                  <span>ดาวน์โหลด .lua</span>
                </button>
              </div>
            </div>
            <pre className="p-5 overflow-x-auto max-h-[380px] text-xs leading-relaxed font-mono text-zinc-300 bg-[#050709]">
              <code>{luaScript}</code>
            </pre>
          </div>
        )}
      </section>

      {/* Collapsible Advanced Settings */}
      <section className="rounded-3xl bg-[#0B0E11] border border-white/[0.08] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Settings2 size={16} className="text-zinc-400 shrink-0" />
            <p className="text-sm font-medium text-zinc-200">
              ตั้งค่าเพิ่มเติม (เปลี่ยนรหัสห้อง / วางคลิปบอร์ด / Cloudflare แยก)
            </p>
          </div>
          {showAdvanced ? (
            <ChevronUp size={16} className="text-zinc-400 shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-zinc-400 shrink-0" />
          )}
        </button>

        {showAdvanced && (
          <div className="border-t border-white/[0.08] p-5 space-y-6 bg-[#080B0E]">
            {/* Sync Key */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-200">
                รหัสห้องซิงค์ (Sync Key) — ค่าเริ่มต้นคือ "main" เพื่อให้ทุกคนเห็นเหมือนกัน
              </h3>
              <div className="flex flex-col sm:flex-row gap-2 max-w-md">
                <input
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="flex-1 px-3.5 py-2 text-xs font-mono rounded-xl bg-[#050709] border border-white/[0.10] text-zinc-100 focus:outline-none focus:border-[#10F5A0]/60"
                />
                <button
                  type="button"
                  onClick={handleApplyKey}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[#10F5A0] text-[#04150E] hover:bg-[#28FFA9] transition-colors whitespace-nowrap cursor-pointer"
                >
                  ใช้รหัสนี้
                </button>
                <button
                  type="button"
                  onClick={handleGeneratePrivateKey}
                  title="สุ่มรหัสส่วนตัว"
                  aria-label="สุ่มรหัสส่วนตัว"
                  className="p-2 rounded-xl bg-[#12161B] border border-white/[0.10] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* Clipboard / Workspace File fallback */}
            <div className="pt-5 border-t border-white/[0.07] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-200">
                    นำเข้าผ่านคลิปบอร์ด / ไฟล์ workspace (ตัวเลือกสำรอง)
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    กด "คัดลอกข้อมูลเข้าเว็บ" ในเกมแล้วกด Ctrl+V ที่หน้าเว็บนี้ได้เลย
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleReadClipboard}
                    disabled={syncingPaste}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-[#12161B] border border-white/[0.10] text-zinc-100 hover:border-[#10F5A0]/40 transition-colors cursor-pointer"
                  >
                    <ClipboardPaste size={13} />
                    <span>วางจากคลิปบอร์ด</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={syncingPaste}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-[#12161B] border border-white/[0.10] text-zinc-200 hover:border-[#10F5A0]/40 transition-colors cursor-pointer"
                  >
                    <FileUp size={13} />
                    <span>เลือกไฟล์ .json</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={pasteBox}
                  onChange={(e) => setPasteBox(e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text');
                    if (text && (text.startsWith('AAVAULT_SYNC::') || text.trim().startsWith('{'))) {
                      e.preventDefault();
                      processPacket(text);
                    }
                  }}
                  placeholder='คลิกแล้วกด Ctrl+V เพื่อวาง AAVAULT_SYNC::...'
                  className="flex-1 px-3.5 py-2 text-xs font-mono rounded-xl bg-[#050709] border border-white/[0.10] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#10F5A0]/60"
                />
                <button
                  type="button"
                  onClick={() => processPacket(pasteBox)}
                  disabled={syncingPaste || !pasteBox.trim()}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-[#12161B] border border-white/[0.10] text-zinc-100 hover:border-[#10F5A0]/40 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  บันทึก
                </button>
              </div>
              {pasteFeedback.type !== 'idle' && (
                <p
                  className={`text-xs ${
                    pasteFeedback.type === 'success' ? 'text-[#10F5A0]' : 'text-rose-400'
                  }`}
                >
                  {pasteFeedback.text}
                </p>
              )}
            </div>

            {/* Optional Cloudflare Worker Override */}
            <div className="pt-5 border-t border-white/[0.07] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-200">
                    เชื่อมต่อ Cloudflare Worker แยก (ตัวเลือกเสริม)
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    หากผูก Upstash Redis บน Vercel แล้วไม่จำเป็นต้องตั้งค่าส่วนนี้
                  </p>
                </div>
                {cloudflareUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      onDisconnectCloudflare();
                      setCfInput('');
                      setCfStatus({ type: 'idle', text: '' });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-[#12161B] border border-white/[0.10] text-zinc-300 hover:text-rose-300 cursor-pointer shrink-0"
                  >
                    <Unplug size={13} />
                    <span>ยกเลิก</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={cfInput}
                  onChange={(e) => setCfInput(e.target.value)}
                  placeholder="https://aa-vault.your-subdomain.workers.dev"
                  className="flex-1 px-3.5 py-2 text-xs font-mono rounded-xl bg-[#050709] border border-white/[0.10] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#10F5A0]/60"
                />
                <button
                  type="button"
                  onClick={handleTestAndSaveCloudflare}
                  disabled={testingCf || !cfInput.trim()}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-[#12161B] border border-white/[0.10] text-zinc-100 hover:border-[#10F5A0]/40 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {testingCf ? 'กำลังทดสอบ...' : 'เชื่อมต่อ Worker'}
                </button>
              </div>

              {cfStatus.type !== 'idle' && (
                <p
                  className={`text-xs ${
                    cfStatus.type === 'success'
                      ? 'text-[#10F5A0]'
                      : cfStatus.type === 'warning'
                        ? 'text-amber-300'
                        : 'text-rose-400'
                  }`}
                >
                  {cfStatus.text}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div className="inline-flex items-center p-1 rounded-xl bg-[#0B0E11] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setWorkerTab('worker')}
                    className={`px-2.5 py-1 text-xs font-mono rounded-lg cursor-pointer ${
                      workerTab === 'worker' ? 'bg-[#191F24] text-white' : 'text-zinc-400'
                    }`}
                  >
                    worker.js
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkerTab('wrangler')}
                    className={`px-2.5 py-1 text-xs font-mono rounded-lg cursor-pointer ${
                      workerTab === 'wrangler' ? 'bg-[#191F24] text-white' : 'text-zinc-400'
                    }`}
                  >
                    wrangler.toml
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyWorkerCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-[#12161B] border border-white/[0.10] text-zinc-200 hover:text-white cursor-pointer"
                  >
                    {copiedWorker ? <Check size={13} className="text-[#10F5A0]" /> : <Copy size={13} />}
                    <span>{copiedWorker ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadWorkerCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-[#12161B] border border-white/[0.10] text-zinc-200 hover:text-white cursor-pointer"
                  >
                    <Download size={13} />
                    <span>ดาวน์โหลด</span>
                  </button>
                </div>
              </div>

              <pre className="p-3.5 rounded-2xl border border-white/[0.07] overflow-x-auto max-h-[220px] text-xs leading-relaxed font-mono text-zinc-300 bg-[#050709]">
                <code>
                  {workerTab === 'worker' ? CLOUDFLARE_WORKER_CODE : WRANGLER_TOML_CODE}
                </code>
              </pre>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
