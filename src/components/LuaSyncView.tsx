import { useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Download,
  FileUp,
  RefreshCw,
  Settings2,
  Unplug,
} from 'lucide-react';
import { formatRelativeTime } from '../data/aaCatalog.ts';
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          สคริปต์เชื่อมต่อเกม (1 บรรทัดพร้อมรัน)
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          เว็บโฮสต์ไฟล์สคริปต์ให้ในตัวแล้ว แค่คัดลอกคำสั่ง <code className="font-mono text-slate-200">loadstring</code> บรรทัดเดียวไปรันใน Anime Adventures ได้เลยโดยไม่ต้องฝาก Pastebin เอง
        </p>
      </div>

      {/* Auto-Sync Status Bar */}
      <section className="rounded-xl bg-[#121620] border border-white/[0.08] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">
              โหมดการเชื่อมต่อ: <span className="text-slate-200">{providerLabel}</span>
              {' · '}
              ห้อง: <span className="font-mono text-slate-200">{syncKey}</span>
            </p>
            <p className="mt-1 text-sm font-medium text-slate-100">
              {accounts.length > 0
                ? `บันทึกข้อมูลจริงแล้ว ${accounts.length} บัญชี (ค้างไว้ดูได้ตลอดแม้ออฟไลน์)`
                : 'กำลังรอข้อมูลจากสคริปต์ในเกม — รันคำสั่งด้านล่างแล้วหน้านี้จะโหลดข้อมูลให้อัตโนมัติทันที'}
            </p>
          </div>
          <span className="text-xs font-mono text-emerald-400 whitespace-nowrap shrink-0">
            {liveConnected || backendProvider ? 'พร้อมรับข้อมูลอัตโนมัติ' : 'กำลังเชื่อมต่อ'}
          </span>
        </div>

        {accounts.length > 0 && (
          <ul className="mt-4 pt-4 border-t border-white/[0.07] divide-y divide-white/[0.06]">
            {accounts.map((acc) => (
              <li
                key={acc.accountId}
                className="py-2.5 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">
                    {acc.displayName}{' '}
                    <span className="text-slate-500">(@{acc.username})</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    ซิงค์ล่าสุด {formatRelativeTime(acc.lastSyncedAt)} · ทีม {acc.equipped.length}/6 · ไอเทม{' '}
                    {acc.inventory.length} ชนิด
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenAccount(acc.accountId)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  เปิดดูของ
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Primary 1-Line Loadstring Card */}
      <section className="rounded-xl bg-[#121620] border border-white/[0.08] overflow-hidden">
        <div className="p-5 border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100">
              สคริปต์แบบสั้น (1 บรรทัด — โฮสต์ตรงบนเว็บนี้)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              คัดลอกบรรทัดเดียวไปวางในตัวรัน Roblox ได้เลย ไม่ต้องก๊อปโค้ดยาวๆ และไม่ต้องอัปโหลดขึ้น Pastebin
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-[#0B0E14] border border-white/[0.10] text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInGameGui}
                onChange={(e) => setShowInGameGui(e.target.checked)}
                className="accent-[#4F6EF7] rounded"
              />
              <span>แสดง GUI ในเกม</span>
            </label>

            <select
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              aria-label="ความถี่ในการซิงค์"
              className="px-3 py-1.5 text-xs rounded-lg bg-[#0B0E14] border border-white/[0.10] text-slate-200 focus:outline-none focus:border-[#4F6EF7] cursor-pointer"
            >
              <option value={5}>ซิงค์ทุก 5 วินาที</option>
              <option value={10}>ซิงค์ทุก 10 วินาที</option>
              <option value={30}>ซิงค์ทุก 30 วินาที</option>
            </select>
          </div>
        </div>

        <div className="p-5 space-y-3 bg-[#0A0D13]">
          <div className="rounded-lg bg-[#0E121B] border border-white/[0.10] px-4 py-3.5 overflow-x-auto">
            <code className="text-xs sm:text-sm font-mono text-emerald-300 whitespace-nowrap select-all">
              {shortLoadstring}
            </code>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLoader}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#4F6EF7] text-white hover:bg-[#3F5EE8] transition-colors whitespace-nowrap cursor-pointer"
            >
              {copiedLoader ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedLoader ? 'คัดลอกสคริปต์สั้นแล้ว' : 'คัดลอกสคริปต์ (1 บรรทัด)'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyRawUrl}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] transition-colors whitespace-nowrap cursor-pointer"
            >
              {copiedRawUrl ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedRawUrl ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์ Raw'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFullCode((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-transparent border border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] transition-colors whitespace-nowrap cursor-pointer"
            >
              {showFullCode ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span>{showFullCode ? 'ซ่อนโค้ดเต็ม' : 'ดูโค้ดเต็ม / ดาวน์โหลด .lua'}</span>
            </button>
          </div>
        </div>

        {showFullCode && (
          <div className="border-t border-white/[0.08]">
            <div className="px-5 py-3 bg-[#121620] border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-400 truncate">
                ส่งข้อมูลไปที่: <code className="font-mono text-slate-200">{activeSyncEndpoint}</code>
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] transition-colors cursor-pointer"
                >
                  {copiedScript ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedScript ? 'คัดลอกโค้ดเต็มแล้ว' : 'คัดลอกโค้ดเต็ม'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadLua}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] transition-colors cursor-pointer"
                >
                  <Download size={13} />
                  <span>ดาวน์โหลด .lua</span>
                </button>
              </div>
            </div>
            <pre className="p-5 overflow-x-auto max-h-[380px] text-xs leading-relaxed font-mono text-slate-300 bg-[#080A0F]">
              <code>{luaScript}</code>
            </pre>
          </div>
        )}
      </section>

      {/* Collapsible Advanced Settings (Optional Sync Key, Cloudflare override, Clipboard fallback) */}
      <section className="rounded-xl bg-[#121620] border border-white/[0.08] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Settings2 size={16} className="text-slate-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-200">
                ตั้งค่าเพิ่มเติม (ไม่จำเป็นต้องตั้งค่า — เปลี่ยนรหัสห้อง / วางคลิปบอร์ด / เชื่อม Cloudflare แยก)
              </p>
            </div>
          </div>
          {showAdvanced ? (
            <ChevronUp size={16} className="text-slate-400 shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-slate-400 shrink-0" />
          )}
        </button>

        {showAdvanced && (
          <div className="border-t border-white/[0.08] p-5 space-y-6 bg-[#0D1018]">
            {/* Sync Key */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-200">
                รหัสห้องซิงค์ (Sync Key) — ค่าเริ่มต้นคือ "main" เพื่อเปิดดูได้จากทุกเครื่องอัตโนมัติ
              </h3>
              <div className="flex flex-col sm:flex-row gap-2 max-w-md">
                <input
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg bg-[#0B0E14] border border-white/[0.10] text-slate-100 focus:outline-none focus:border-[#4F6EF7]"
                />
                <button
                  type="button"
                  onClick={handleApplyKey}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-[#4F6EF7] text-white hover:bg-[#3F5EE8] transition-colors whitespace-nowrap cursor-pointer"
                >
                  ใช้รหัสนี้
                </button>
                <button
                  type="button"
                  onClick={handleGeneratePrivateKey}
                  title="สุ่มรหัสส่วนตัว"
                  aria-label="สุ่มรหัสส่วนตัว"
                  className="p-1.5 rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* Clipboard / Workspace File fallback */}
            <div className="pt-5 border-t border-white/[0.07] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-200">
                    นำเข้าผ่านคลิปบอร์ด / ไฟล์ workspace (สำรองกรณีรันผ่านหน้า Preview)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    กด "คัดลอกข้อมูลเข้าเว็บ" ในเกมแล้วกด Ctrl+V ที่หน้าเว็บนี้ได้เลย
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleReadClipboard}
                    disabled={syncingPaste}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-100 hover:bg-[#1E2538] transition-colors cursor-pointer"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] transition-colors cursor-pointer"
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
                  className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg bg-[#0B0E14] border border-white/[0.10] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#4F6EF7]"
                />
                <button
                  type="button"
                  onClick={() => processPacket(pasteBox)}
                  disabled={syncingPaste || !pasteBox.trim()}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-100 hover:bg-[#1E2538] disabled:opacity-40 transition-colors cursor-pointer"
                >
                  บันทึก
                </button>
              </div>
              {pasteFeedback.type !== 'idle' && (
                <p
                  className={`text-xs ${
                    pasteFeedback.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
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
                  <h3 className="text-xs font-semibold text-slate-200">
                    เชื่อมต่อ Cloudflare Worker แยก (ตัวเลือกเสริม)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    หาก Deploy บน Vercel สามารถผูก Storage (Vercel KV / Upstash Redis) หรือใส่ Env Cloudflare KV ใน Vercel Dashboard ได้โดยไม่ต้องกรอกลิงก์ตรงนี้
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-300 hover:text-rose-300 cursor-pointer shrink-0"
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
                  className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg bg-[#0B0E14] border border-white/[0.10] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#4F6EF7]"
                />
                <button
                  type="button"
                  onClick={handleTestAndSaveCloudflare}
                  disabled={testingCf || !cfInput.trim()}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-100 hover:bg-[#1E2538] disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {testingCf ? 'กำลังทดสอบ...' : 'เชื่อมต่อ Worker'}
                </button>
              </div>

              {cfStatus.type !== 'idle' && (
                <p
                  className={`text-xs ${
                    cfStatus.type === 'success'
                      ? 'text-emerald-400'
                      : cfStatus.type === 'warning'
                        ? 'text-amber-300'
                        : 'text-rose-400'
                  }`}
                >
                  {cfStatus.text}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div className="inline-flex items-center p-1 rounded-lg bg-[#121620] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setWorkerTab('worker')}
                    className={`px-2.5 py-1 text-xs font-mono rounded-md cursor-pointer ${
                      workerTab === 'worker' ? 'bg-[#20273A] text-white' : 'text-slate-400'
                    }`}
                  >
                    worker.js
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkerTab('wrangler')}
                    className={`px-2.5 py-1 text-xs font-mono rounded-md cursor-pointer ${
                      workerTab === 'wrangler' ? 'bg-[#20273A] text-white' : 'text-slate-400'
                    }`}
                  >
                    wrangler.toml
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyWorkerCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] cursor-pointer"
                  >
                    {copiedWorker ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedWorker ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadWorkerCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] cursor-pointer"
                  >
                    <Download size={13} />
                    <span>ดาวน์โหลด</span>
                  </button>
                </div>
              </div>

              <pre className="p-3.5 rounded-lg border border-white/[0.07] overflow-x-auto max-h-[220px] text-xs leading-relaxed font-mono text-slate-300 bg-[#080A0F]">
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
