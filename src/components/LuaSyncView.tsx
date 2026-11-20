import { useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Cloud,
  Copy,
  Download,
  FileUp,
  RefreshCw,
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
  cloudflareHealthy: boolean | null;
  accounts: AccountSnapshot[];
  liveConnected: boolean;
  onChangeSyncKey: (newKey: string) => void;
  onConnectCloudflare: (url: string) => Promise<{ ok: boolean; kvBound?: boolean; message: string }>;
  onDisconnectCloudflare: () => void;
  onOpenAccount: (accountId: string) => void;
  onSubmitScriptPacket: (
    rawText: string
  ) => Promise<{ ok: boolean; username?: string; error?: string }>;
}

export function LuaSyncView({
  syncKey,
  cloudflareUrl,
  cloudflareHealthy,
  accounts,
  liveConnected,
  onChangeSyncKey,
  onConnectCloudflare,
  onDisconnectCloudflare,
  onOpenAccount,
  onSubmitScriptPacket,
}: LuaSyncViewProps) {
  const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const [cfInput, setCfInput] = useState(cloudflareUrl);
  const [testingCf, setTestingCf] = useState(false);
  const [cfStatus, setCfStatus] = useState<{
    type: 'idle' | 'success' | 'warning' | 'error';
    text: string;
  }>({ type: 'idle', text: '' });
  const [showWorkerGuide, setShowWorkerGuide] = useState(!cloudflareUrl);
  const [workerTab, setWorkerTab] = useState<'worker' | 'wrangler'>('worker');
  const [copiedWorker, setCopiedWorker] = useState(false);

  const [keyInput, setKeyInput] = useState(syncKey);
  const [intervalSec, setIntervalSec] = useState(10);
  const [showInGameGui, setShowInGameGui] = useState(true);
  const [copiedScript, setCopiedScript] = useState(false);

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

  const handleTestAndSaveCloudflare = async () => {
    const cleaned = cfInput.trim().replace(/\/+$/, '');
    if (!cleaned || testingCf) return;
    setTestingCf(true);
    setCfStatus({ type: 'idle', text: '' });
    try {
      const result = await onConnectCloudflare(cleaned);
      if (result.ok && result.kvBound) {
        setCfStatus({ type: 'success', text: result.message });
        setShowWorkerGuide(false);
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
    a.download = `2K_AA_Cloudflare_${syncKey}.lua`;
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
          เชื่อมต่อ Cloudflare KV & สคริปต์ Lua
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          เก็บข้อมูลผ่าน Cloudflare Worker + KV เพื่อให้สคริปต์ใน Roblox ยิงข้อมูลจริงเข้ามาเซฟอัตโนมัติได้ตลอด 24 ชม. โดยไม่ติดล็อก Preview
        </p>
      </div>

      {/* Section 1: Cloudflare Worker + KV Connection */}
      <section className="rounded-xl bg-[#121620] border border-white/[0.10] overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Cloud size={18} className="text-amber-400 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  1. เชื่อมต่อ Cloudflare Worker (ที่เก็บข้อมูลหลัก)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {cloudflareUrl
                    ? `กำลังเซฟและอ่านข้อมูลจริงจาก Cloudflare KV (${cloudflareHealthy ? 'เชื่อมต่อปกติ' : 'กำลังตรวจสอบ'})`
                    : 'วางลิงก์ Worker ของคุณ (เช่น https://aa-vault.xxx.workers.dev) เพื่อเปิดซิงค์อัตโนมัติจากในเกม'}
                </p>
              </div>
            </div>

            {cloudflareUrl && (
              <button
                type="button"
                onClick={() => {
                  onDisconnectCloudflare();
                  setCfInput('');
                  setCfStatus({ type: 'idle', text: '' });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-300 hover:text-rose-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Unplug size={13} />
                <span>ยกเลิกการเชื่อมต่อ</span>
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="url"
              value={cfInput}
              onChange={(e) => setCfInput(e.target.value)}
              placeholder="https://aa-vault.your-subdomain.workers.dev"
              className="flex-1 px-3.5 py-2 text-sm font-mono rounded-lg bg-[#0B0E14] border border-white/[0.10] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#4F6EF7]"
            />
            <button
              type="button"
              onClick={handleTestAndSaveCloudflare}
              disabled={testingCf || !cfInput.trim()}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#4F6EF7] text-white hover:bg-[#3F5EE8] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {testingCf ? 'กำลังทดสอบ...' : 'เชื่อมต่อ & ทดสอบ Cloudflare'}
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

          {/* Toggle Setup Guide & Worker Code */}
          <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setShowWorkerGuide((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8FA4FF] hover:text-white transition-colors cursor-pointer"
            >
              {showWorkerGuide ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              <span>
                {showWorkerGuide
                  ? 'ซ่อนขั้นตอนและโค้ด Cloudflare Worker'
                  : 'ดูวิธีสร้าง Cloudflare Worker + KV (ฟรี 1 นาที) และคัดลอกโค้ด worker.js'}
              </span>
            </button>
            <span className="text-xs text-slate-500 font-mono">Binding: AA_VAULT_KV</span>
          </div>
        </div>

        {/* Collapsible Cloudflare Deployment Guide + Copyable worker.js */}
        {showWorkerGuide && (
          <div className="border-t border-white/[0.08] bg-[#0D1018]">
            <div className="p-5 space-y-4">
              <ol className="space-y-1.5 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                <li>
                  เข้า <span className="font-mono text-slate-100">dash.cloudflare.com</span> → เมนู{' '}
                  <strong className="text-slate-100">Storage &amp; Databases → KV</strong> → กด{' '}
                  <strong className="text-slate-100">Create a namespace</strong> ตั้งชื่อ{' '}
                  <code className="font-mono text-amber-300">AA_VAULT_KV</code>
                </li>
                <li>
                  ไปที่เมนู <strong className="text-slate-100">Workers &amp; Pages → Create → Create Worker</strong> ตั้งชื่อเช่น{' '}
                  <code className="font-mono text-slate-100">aa-vault</code> แล้วกด <strong className="text-slate-100">Deploy</strong>
                </li>
                <li>
                  กดปุ่ม <strong className="text-slate-100">Edit code</strong> ลบโค้ดเดิมทั้งหมด แล้ววางโค้ด{' '}
                  <code className="font-mono text-slate-100">worker.js</code> ด้านล่าง จากนั้นกด <strong className="text-slate-100">Deploy</strong>
                </li>
                <li>
                  ไปที่แท็บ <strong className="text-slate-100">Settings → Bindings → Add → KV Namespace</strong> ใส่ Variable name ว่า{' '}
                  <code className="font-mono text-amber-300">AA_VAULT_KV</code> แล้วเลือก Namespace ที่สร้างไว้ในข้อ 1 → กด <strong className="text-slate-100">Save</strong>
                </li>
                <li>
                  คัดลอกลิงก์ <code className="font-mono text-slate-100">https://aa-vault.xxx.workers.dev</code> มาวางในช่องด้านบนแล้วกด{' '}
                  <strong className="text-slate-100">เชื่อมต่อ &amp; ทดสอบ Cloudflare</strong>
                </li>
              </ol>

              <div className="p-3.5 rounded-lg bg-[#121620] border border-white/[0.08] text-xs text-slate-300 space-y-1.5">
                <p className="font-semibold text-slate-100">กรณีนำเว็บนี้ขึ้น Vercel (รองรับทันทีผ่าน vercel.json + /api)</p>
                <p className="text-slate-400 leading-relaxed">
                  Import โปรเจกต์ลง Vercel แล้วตั้ง Environment Variable อย่างใดอย่างหนึ่ง:{' '}
                  <code className="font-mono text-slate-200">VITE_CLOUDFLARE_WORKER_URL</code> (ยิงตรงเข้า Worker) หรือ{' '}
                  <code className="font-mono text-slate-200">CLOUDFLARE_ACCOUNT_ID</code> +{' '}
                  <code className="font-mono text-slate-200">CLOUDFLARE_KV_NAMESPACE_ID</code> +{' '}
                  <code className="font-mono text-slate-200">CLOUDFLARE_API_TOKEN</code> (ให้ Vercel API เซฟลง Cloudflare KV โดยตรงไม่ต้องสร้าง Worker แยก)
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div className="inline-flex items-center p-1 rounded-lg bg-[#121620] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setWorkerTab('worker')}
                    className={`px-3 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                      workerTab === 'worker'
                        ? 'bg-[#20273A] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    worker.js
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkerTab('wrangler')}
                    className={`px-3 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                      workerTab === 'wrangler'
                        ? 'bg-[#20273A] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    wrangler.toml
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyWorkerCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#4F6EF7] text-white hover:bg-[#3F5EE8] transition-colors cursor-pointer"
                  >
                    {copiedWorker ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedWorker ? 'คัดลอกแล้ว' : `คัดลอก ${workerTab === 'worker' ? 'worker.js' : 'wrangler.toml'}`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadWorkerCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] transition-colors cursor-pointer"
                  >
                    <Download size={13} />
                    <span>ดาวน์โหลด</span>
                  </button>
                </div>
              </div>

              <pre className="p-4 rounded-lg border border-white/[0.07] overflow-x-auto max-h-[300px] text-xs leading-relaxed font-mono text-slate-300 bg-[#080A0F]">
                <code>{workerTab === 'worker' ? CLOUDFLARE_WORKER_CODE : WRANGLER_TOML_CODE}</code>
              </pre>
            </div>
          </div>
        )}
      </section>

      {/* Connected Accounts Live Status */}
      {accounts.length > 0 && (
        <section className="rounded-xl bg-[#121620] border border-white/[0.08] p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-100">
              บัญชีที่เซฟข้อมูลแล้ว ({accounts.length})
            </p>
            <span className="text-xs font-mono text-slate-400">
              {cloudflareUrl
                ? 'Cloudflare KV · ซิงค์อัตโนมัติทุก 3 วิ'
                : liveConnected
                  ? 'SSE เชื่อมต่อแล้ว'
                  : 'กำลังเชื่อมต่อ'}
            </span>
          </div>
          <ul className="mt-3 pt-3 border-t border-white/[0.07] divide-y divide-white/[0.06]">
            {accounts.map((acc) => (
              <li
                key={acc.accountId}
                className="py-2.5 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">
                    {acc.displayName} <span className="text-slate-500">(@{acc.username})</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    ซิงค์ล่าสุด {formatRelativeTime(acc.lastSyncedAt)} · ทีม {acc.equipped.length}/6 · ไอเทม {acc.inventory.length} ชนิด
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
        </section>
      )}

      {/* Section 2: Sync Key + Ready-to-Run Lua Script */}
      <section className="rounded-xl bg-[#121620] border border-white/[0.08] overflow-hidden">
        <div className="p-5 border-b border-white/[0.08] space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                2. สคริปต์ 2K AA Vault (.lua) — ยิงตรงเข้า {cloudflareUrl ? 'Cloudflare KV' : 'เว็บเช็คของ'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                Endpoint ในสคริปต์:{' '}
                <code className="font-mono text-slate-200">{activeSyncEndpoint}</code>
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
                <span>แสดงหน้าต่าง GUI ในเกม</span>
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

              <button
                type="button"
                onClick={handleCopyScript}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-[#4F6EF7] text-white hover:bg-[#3F5EE8] transition-colors whitespace-nowrap cursor-pointer"
              >
                {copiedScript ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedScript ? 'คัดลอกสคริปต์แล้ว' : 'คัดลอกสคริปต์'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadLua}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download size={14} />
                <span>ดาวน์โหลด .lua</span>
              </button>
            </div>
          </div>

          {/* Sync Key Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <span className="text-xs text-slate-400 whitespace-nowrap">Sync Key ห้องของคุณ:</span>
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="flex-1 max-w-xs px-3 py-1.5 text-xs font-mono rounded-lg bg-[#0B0E14] border border-white/[0.10] text-slate-100 focus:outline-none focus:border-[#4F6EF7]"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyKey}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-100 hover:bg-[#1E2538] transition-colors whitespace-nowrap cursor-pointer"
              >
                ใช้รหัสนี้
              </button>
              <button
                type="button"
                onClick={handleGeneratePrivateKey}
                title="สุ่ม Sync Key ใหม่"
                aria-label="สุ่ม Sync Key ใหม่"
                className="p-1.5 rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </div>

        <pre className="p-5 overflow-x-auto max-h-[380px] text-xs leading-relaxed font-mono text-slate-300 bg-[#0A0D13]">
          <code>{luaScript}</code>
        </pre>
      </section>

      {/* Section 3: Backup Clipboard / Workspace File Sync */}
      <section className="rounded-xl bg-[#121620] border border-white/[0.08] p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              3. นำเข้าผ่านคลิปบอร์ด / ไฟล์ workspace (สำรองกรณีตัวรันบล็อก HTTP)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              กด "คัดลอกข้อมูลเข้าเว็บ" ในเกมแล้วกด Ctrl+V ที่หน้านี้ได้เลย — ข้อมูลจะถูกเซฟลง{' '}
              {cloudflareUrl ? 'Cloudflare KV' : 'เซิร์ฟเวอร์'} ทันที
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleReadClipboard}
              disabled={syncingPaste}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-100 hover:bg-[#1E2538] disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <ClipboardPaste size={14} />
              <span>{syncingPaste ? 'กำลังบันทึก...' : 'วางข้อมูลจากสคริปต์'}</span>
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
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileUp size={14} />
              <span>เลือกไฟล์ .json</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
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
            placeholder='คลิกแล้วกด Ctrl+V เพื่อวาง AAVAULT_SYNC::... จากสคริปต์ในเกม'
            className="flex-1 px-3.5 py-2 text-xs font-mono rounded-lg bg-[#0B0E14] border border-white/[0.10] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#4F6EF7]"
          />
          <button
            type="button"
            onClick={() => processPacket(pasteBox)}
            disabled={syncingPaste || !pasteBox.trim()}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-100 hover:bg-[#1E2538] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
      </section>
    </div>
  );
}
