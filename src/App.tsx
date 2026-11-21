import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Code2,
  History,
  Package,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  formatCompact,
  formatRelativeTime,
  isAccountOnline,
  RARITY_META,
} from './data/aaCatalog.ts';
import type { AccountSnapshot, RewardEntry, SyncPayload } from './types.ts';
import { AccountDashboard, type DashboardTab } from './components/AccountDashboard.tsx';
import { LuaSyncView } from './components/LuaSyncView.tsx';
import { RobloxHeadshot } from './components/RobloxHeadshot.tsx';
import { ShareModal } from './components/ShareModal.tsx';

type NavTab = DashboardTab | 'sync';

interface ToastNotification {
  uid: string;
  title: string;
  subtitle: string;
  color: string;
  border: string;
}

const STORAGE_KEY = 'aa_vault_sync_key_v2';
const CF_STORAGE_KEY = 'aa_vault_cf_worker_url';

function getInitialSyncKey(): string {
  if (typeof window === 'undefined') return 'main';
  const fromQuery = new URLSearchParams(window.location.search).get('key');
  if (fromQuery) {
    const cleaned = fromQuery.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    if (cleaned) {
      localStorage.setItem(STORAGE_KEY, cleaned);
      return cleaned;
    }
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved !== 'demo-aa-2k') return saved;
  return 'main';
}

function getInitialCloudflareUrl(): string {
  if (typeof window === 'undefined') return '';
  const fromQuery = new URLSearchParams(window.location.search).get('cf');
  if (fromQuery) return fromQuery.trim().replace(/\/+$/, '');
  const saved = localStorage.getItem(CF_STORAGE_KEY);
  if (saved) return saved.trim().replace(/\/+$/, '');
  const envUrl = import.meta.env.VITE_CLOUDFLARE_WORKER_URL;
  return typeof envUrl === 'string' ? envUrl.trim().replace(/\/+$/, '') : '';
}

export default function App() {
  const [shareId, setShareId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('share');
  });

  const [shareCfUrl, setShareCfUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('cf') || '')
      .trim()
      .replace(/\/+$/, '');
  });

  const [syncKey, setSyncKey] = useState<string>(getInitialSyncKey);
  const [cloudflareUrl, setCloudflareUrl] = useState<string>(getInitialCloudflareUrl);

  const [accounts, setAccounts] = useState<AccountSnapshot[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('drops');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [backendProvider, setBackendProvider] = useState<string>('');
  const [isServerlessBackend, setIsServerlessBackend] = useState<boolean>(false);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const toastTimeouts = useRef<number[]>([]);
  const hasAutoSwitchedToSync = useRef(false);
  const seenRewardsRef = useRef<Set<string>>(new Set());
  const initialPollDoneRef = useRef(false);

  // Automatic zero-config API base: defaults directly to the site's own /api/* (Vercel or Express)
  const activeApiBase = shareId ? shareCfUrl || cloudflareUrl : cloudflareUrl;

  const pushSystemToast = useCallback((title: string, subtitle: string, ok = true) => {
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [
      {
        uid,
        title,
        subtitle,
        color: ok ? '#7fd689' : '#fda4af',
        border: ok ? 'rgba(110, 200, 120, 0.36)' : 'rgba(244, 63, 94, 0.4)',
      },
      ...prev.slice(0, 3),
    ]);
    const tid = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.uid !== uid));
    }, 4000);
    toastTimeouts.current.push(tid);
  }, []);

  const pushToast = useCallback((reward: RewardEntry) => {
    const meta = RARITY_META[reward.rarity];
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const prefix = reward.kind === 'unit' ? '+ UNIT' : '+ ITEM';
    const qtySuffix = reward.qty > 1 ? ` x${reward.qty}` : '';
    setToasts((prev) => [
      {
        uid,
        title: `${prefix}  ${reward.name}${qtySuffix}`,
        subtitle: `${reward.rarity} · ${reward.t}`,
        color: meta.text,
        border: meta.border,
      },
      ...prev.slice(0, 3),
    ]);
    const tid = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.uid !== uid));
    }, 4000);
    toastTimeouts.current.push(tid);
  }, []);

  useEffect(() => {
    return () => {
      toastTimeouts.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const recordAccountRewards = useCallback(
    (list: AccountSnapshot[], triggerToasts: boolean) => {
      const freshRewards: RewardEntry[] = [];
      for (const acc of list) {
        for (const r of acc.rewards) {
          const sig = `${acc.accountId}|${r.t}|${r.kind}|${r.id}|${r.qty}|${r.src}`;
          if (!seenRewardsRef.current.has(sig)) {
            seenRewardsRef.current.add(sig);
            if (triggerToasts) freshRewards.push(r);
          }
        }
      }
      if (triggerToasts && freshRewards.length > 0) {
        freshRewards.slice(0, 3).forEach((r) => pushToast(r));
      }
    },
    [pushToast]
  );

  const fetchAccounts = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      try {
        if (shareId) {
          const res = await fetch(`${activeApiBase}/api/share/${encodeURIComponent(shareId)}`);
          const data = await res.json();
          if (!res.ok || !data.account) {
            if (!silent) {
              setLoadError(data.error || 'ไม่พบลิ้งค์เช็คของนี้');
              setAccounts([]);
              setSelectedAccountId(null);
            }
            return;
          }
          setAccounts([data.account as AccountSnapshot]);
          setSelectedAccountId(data.account.accountId);
        } else {
          const res = await fetch(
            `${activeApiBase}/api/accounts?key=${encodeURIComponent(syncKey)}`
          );
          const data = await res.json();
          if (!res.ok) {
            if (!silent) {
              setLoadError(data.error || 'ไม่สามารถโหลดข้อมูลจากเซิร์ฟเวอร์ได้');
            }
            return;
          }
          setLiveConnected(true);
          if (typeof data.provider === 'string') {
            setBackendProvider(data.provider);
          }
          const list = (data.accounts || []) as AccountSnapshot[];
          recordAccountRewards(list, initialPollDoneRef.current && silent);
          initialPollDoneRef.current = true;
          setAccounts((prev) => {
            if (prev.length === 0 && list.length > 0 && silent) {
              setActiveTab('drops');
            }
            return list;
          });
          setSelectedAccountId((prev) => {
            if (prev && list.some((a) => a.accountId === prev)) return prev;
            return list[0]?.accountId ?? null;
          });
          if (list.length === 0 && !hasAutoSwitchedToSync.current && !silent) {
            hasAutoSwitchedToSync.current = true;
            setActiveTab('sync');
          }
        }
      } catch {
        if (!silent) {
          setLoadError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [shareId, activeApiBase, syncKey, recordAccountRewards]
  );

  useEffect(() => {
    seenRewardsRef.current.clear();
    initialPollDoneRef.current = false;
    fetchAccounts(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId, syncKey, activeApiBase]);

  // Auto-detect backend capabilities (/api/health)
  useEffect(() => {
    if (shareId) return;
    if (cloudflareUrl) {
      setIsServerlessBackend(true);
      setBackendProvider('cloudflare-worker');
      return;
    }
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const serverless = Boolean(d?.serverless || d?.provider === 'cloudflare-worker');
        setIsServerlessBackend(serverless);
        setBackendProvider(typeof d?.provider === 'string' ? d.provider : 'express');
      })
      .catch(() => {
        if (!cancelled) setIsServerlessBackend(true);
      });
    return () => {
      cancelled = true;
    };
  }, [shareId, cloudflareUrl]);

  // Automatic real-time updates:
  // - On Vercel / Cloudflare: poll every 2.5 seconds automatically when tab is visible
  // - On Express server: subscribe via SSE
  useEffect(() => {
    if (shareId) {
      setLiveConnected(false);
      return;
    }

    if (cloudflareUrl || isServerlessBackend) {
      const timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchAccounts(true);
        }
      }, 2500);
      return () => window.clearInterval(timer);
    }

    const es = new EventSource(`/api/events?key=${encodeURIComponent(syncKey)}`);

    es.addEventListener('connected', () => {
      setLiveConnected(true);
    });

    es.addEventListener('sync', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as {
          account: AccountSnapshot;
          newRewards?: RewardEntry[];
        };
        if (!payload.account) return;
        let wasEmpty = false;
        setAccounts((prev) => {
          wasEmpty = prev.length === 0;
          const filtered = prev.filter((a) => a.accountId !== payload.account.accountId);
          return [payload.account, ...filtered].sort((a, b) => b.lastSyncedAt - a.lastSyncedAt);
        });
        setSelectedAccountId((prev) => prev ?? payload.account.accountId);
        if (wasEmpty) {
          setActiveTab('drops');
        }
        if (Array.isArray(payload.newRewards)) {
          payload.newRewards.slice(0, 3).forEach((r) => pushToast(r));
        }
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('delete', (evt) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data) as { accountId: string };
        setAccounts((prev) => {
          const next = prev.filter((a) => a.accountId !== payload.accountId);
          setSelectedAccountId((curr) =>
            curr === payload.accountId ? (next[0]?.accountId ?? null) : curr
          );
          return next;
        });
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      setLiveConnected(false);
    };

    return () => {
      es.close();
      setLiveConnected(false);
    };
  }, [shareId, syncKey, cloudflareUrl, isServerlessBackend, fetchAccounts, pushToast]);

  const handleConnectCloudflare = useCallback(
    async (
      rawUrl: string
    ): Promise<{ ok: boolean; kvBound?: boolean; message: string }> => {
      let normalized = rawUrl.trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
      }
      normalized = normalized.replace(/\/api\/sync$/i, '');

      try {
        const res = await fetch(`${normalized}/api/health`, { method: 'GET' });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          return {
            ok: false,
            message: 'URL นี้ไม่ตอบกลับจาก AA Vault Cloudflare Worker',
          };
        }
        if (!data.kvBound) {
          return {
            ok: true,
            kvBound: false,
            message: 'เชื่อมต่อ Worker ได้แล้ว แต่ยังไม่ได้ผูก KV Namespace ชื่อ AA_VAULT_KV',
          };
        }

        localStorage.setItem(CF_STORAGE_KEY, normalized);
        setCloudflareUrl(normalized);
        setLiveConnected(true);
        pushSystemToast(
          'เชื่อมต่อ Cloudflare Worker สำเร็จ',
          'สคริปต์ Lua อัปเดต Endpoint ให้แล้ว',
          true
        );
        return {
          ok: true,
          kvBound: true,
          message: 'เชื่อมต่อ Cloudflare Worker + KV สำเร็จแล้ว',
        };
      } catch {
        return {
          ok: false,
          message: 'เชื่อมต่อไม่ได้ — ตรวจสอบ URL หรือสถานะ Deploy ของ Worker',
        };
      }
    },
    [pushSystemToast]
  );

  const handleDisconnectCloudflare = useCallback(() => {
    localStorage.removeItem(CF_STORAGE_KEY);
    setCloudflareUrl('');
    setAccounts([]);
    setSelectedAccountId(null);
  }, []);

  const submitScriptPacket = useCallback(
    async (
      rawText: string
    ): Promise<{ ok: boolean; username?: string; error?: string }> => {
      const cleaned = rawText.trim().replace(/^AAVAULT_SYNC::/, '');
      let parsed: SyncPayload;
      try {
        parsed = JSON.parse(cleaned) as SyncPayload;
      } catch {
        return {
          ok: false,
          error: 'ข้อมูลไม่ถูกต้อง — กรุณากดปุ่ม "คัดลอกข้อมูลเข้าเว็บ" จากหน้าต่างสคริปต์ในเกมก่อน',
        };
      }

      if (!parsed || typeof parsed !== 'object' || !parsed.username) {
        return { ok: false, error: 'ไม่พบชื่อบัญชี Roblox ในข้อมูลที่วาง' };
      }

      try {
        const res = await fetch(`${activeApiBase}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...parsed, syncKey }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          return { ok: false, error: data.error || 'บันทึกข้อมูลไม่สำเร็จ' };
        }
        await fetchAccounts(true);
        setSelectedAccountId(data.accountId);
        setActiveTab('drops');
        pushSystemToast(
          `อัปเดตข้อมูลจริงของ ${parsed.username} แล้ว`,
          `ทีม ${parsed.equipped?.length ?? 0} ตัว · ไอเทม ${parsed.inventory?.length ?? 0} ชนิด`,
          true
        );
        return { ok: true, username: parsed.username };
      } catch {
        return { ok: false, error: 'ไม่สามารถส่งข้อมูลเข้าเซิร์ฟเวอร์ได้' };
      }
    },
    [activeApiBase, syncKey, fetchAccounts, pushSystemToast]
  );

  // Global Ctrl+V backup listener
  useEffect(() => {
    if (shareId) return;
    const onWindowPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const text = e.clipboardData?.getData('text') || '';
      if (!text.startsWith('AAVAULT_SYNC::')) return;
      e.preventDefault();
      submitScriptPacket(text);
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [shareId, submitScriptPacket]);

  const activeAccount =
    accounts.find((a) => a.accountId === selectedAccountId) ?? accounts[0] ?? null;

  const handleChangeSyncKey = (nextKey: string) => {
    setSyncKey(nextKey);
    localStorage.setItem(STORAGE_KEY, nextKey);
    setSelectedAccountId(null);
  };

  const handleExitShareMode = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('share');
    url.searchParams.delete('cf');
    window.history.replaceState({}, '', url.toString());
    setShareId(null);
    setShareCfUrl('');
    setActiveTab('drops');
  };

  const handleClearDrops = async () => {
    if (!activeAccount || shareId) return;
    await fetch(
      `${activeApiBase}/api/accounts/${encodeURIComponent(activeAccount.accountId)}/clear-drops?key=${encodeURIComponent(syncKey)}`,
      { method: 'POST' }
    );
    await fetchAccounts(true);
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (shareId) return;
    await fetch(
      `${activeApiBase}/api/accounts/${encodeURIComponent(accountId)}?key=${encodeURIComponent(syncKey)}`,
      { method: 'DELETE' }
    );
    await fetchAccounts(true);
  };

  const navItems: Array<{ id: NavTab; label: string; icon: typeof History; hideInShare?: boolean }> = [
    { id: 'drops', label: 'ของดรอป', icon: History },
    { id: 'obtained', label: 'ของที่ได้', icon: Sparkles },
    { id: 'inventory', label: 'กระเป๋า', icon: Package },
    { id: 'sync', label: 'สคริปต์', icon: Code2, hideInShare: true },
  ];

  const visibleNavItems = navItems.filter((item) => !(shareId && item.hideInShare));
  const onlineCount = accounts.filter((a) => isAccountOnline(a.lastSyncedAt, nowTs)).length;

  const storageShortLabel = cloudflareUrl
    ? 'Cloudflare KV'
    : backendProvider === 'vercel-kv'
      ? 'Upstash Redis'
      : backendProvider === 'cloudflare-kv-vercel'
        ? 'Cloudflare KV'
        : backendProvider === 'vercel-builtin'
          ? 'Vercel API'
          : liveConnected
            ? 'Live Server'
            : 'Auto Sync';

  const handleManualRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetchAccounts(true);
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  return (
    <div className="min-h-screen text-zinc-100 pb-28">
      {/* Floating Rounded Top Header (matching uniqueclub-opm.vercel.app) */}
      <header className="sticky top-0 z-30 pt-3 sm:pt-4 px-3 sm:px-6">
        <div className="max-w-7xl mx-auto rounded-2xl bg-[#0B0E11]/90 backdrop-blur-xl border border-white/[0.09] px-3.5 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          {/* Brand Logo */}
          <button
            type="button"
            onClick={() => setActiveTab('drops')}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer"
          >
            <svg
              viewBox="0 0 36 36"
              fill="none"
              className="w-8 h-8 shrink-0"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="aaCrownGrad" x1="4" y1="6" x2="32" y2="30" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FF2E63" />
                  <stop offset="55%" stopColor="#FF5E3A" />
                  <stop offset="100%" stopColor="#FFB800" />
                </linearGradient>
              </defs>
              <path
                d="M5 12.5L11.5 18.5L18 9L24.5 18.5L31 12.5L28.5 26.5C28.3 27.6 27.3 28.5 26.1 28.5H9.9C8.7 28.5 7.7 27.6 7.5 26.5L5 12.5Z"
                fill="url(#aaCrownGrad)"
              />
              <circle cx="5.5" cy="11" r="2" fill="#FF2E63" />
              <circle cx="18" cy="7.5" r="2.2" fill="#FF6B35" />
              <circle cx="30.5" cy="11" r="2" fill="#FF9E1B" />
            </svg>
            <span className="font-display text-lg sm:text-xl font-extrabold tracking-tight leading-none whitespace-nowrap">
              <span className="text-white">AA </span>
              <span className="text-[#10F5A0]">VAULT</span>
            </span>
          </button>

          {/* Right Compact Icon/Action Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleManualRefresh}
              title="รีเฟรชข้อมูลล่าสุด"
              aria-label="รีเฟรชข้อมูลล่าสุด"
              className="w-10 h-10 rounded-xl bg-[#10F5A0]/10 border border-[#10F5A0]/40 text-[#10F5A0] hover:bg-[#10F5A0]/20 flex items-center justify-center transition-colors cursor-pointer"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>

            {shareId ? (
              <button
                type="button"
                onClick={handleExitShareMode}
                className="h-10 px-3.5 rounded-xl bg-[#12161B] border border-white/[0.10] text-xs font-semibold text-white hover:border-[#10F5A0]/40 transition-colors whitespace-nowrap cursor-pointer"
              >
                แดชบอร์ดหลัก
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('sync')}
                  className="h-10 px-3 rounded-xl bg-[#12161B] border border-white/[0.10] text-xs font-mono text-zinc-200 hover:border-[#10F5A0]/40 hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10F5A0]" />
                  <span>{syncKey}</span>
                </button>

                {activeAccount ? (
                  <button
                    type="button"
                    onClick={() => setShareModalOpen(true)}
                    title="แชร์ลิ้งค์เช็คของ"
                    aria-label="แชร์ลิ้งค์เช็คของ"
                    className="w-10 h-10 sm:w-auto sm:px-3.5 rounded-xl bg-[#12161B] border border-white/[0.10] text-zinc-200 hover:border-[#10F5A0]/40 hover:text-[#10F5A0] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Share2 size={15} />
                    <span className="hidden sm:inline text-xs font-semibold">แชร์ลิงก์</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTab('sync')}
                    title="สคริปต์ 1 บรรทัด"
                    aria-label="สคริปต์ 1 บรรทัด"
                    className="w-10 h-10 rounded-xl bg-[#12161B] border border-white/[0.10] text-zinc-300 hover:border-[#10F5A0]/40 hover:text-[#10F5A0] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Code2 size={16} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Container (wide 7xl when viewing RollinShop-style 2-column dashboard) */}
      <main
        className={`mx-auto px-3.5 sm:px-6 ${
          activeAccount && activeTab !== 'sync' ? 'max-w-7xl pt-4 sm:pt-5' : 'max-w-5xl'
        }`}
      >
        {/* Centered Hero Section shown when no account is active or on the Sync setup page */}
        {(!activeAccount || activeTab === 'sync') && (
          <section className="pt-8 pb-7 sm:pt-10 sm:pb-8 text-center">
            <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-mono font-semibold tracking-wider text-[#10F5A0] uppercase">
              <Sparkles size={14} className="shrink-0" />
              <span>
                {shareId
                  ? '// SHARED INVENTORY SNAPSHOT · READ ONLY'
                  : '// LIVE INVENTORY HUB · ANIME ADVENTURES'}
              </span>
            </div>

            <h1 className="mt-3 font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight text-balance">
              <span className="text-white">เช็คของ </span>
              <span className="text-[#10F5A0]">Anime Adventures</span>
            </h1>

            <p className="mt-3 text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
              เช็คทีม 6 ตัว กระเป๋าไอเทม และของดรอปแบบเรียลไทม์ ซิงค์ตรงจากสคริปต์ในเกม
              บันทึกค้างไว้ดูได้ตลอดแม้ออฟไลน์
            </p>

            {/* 3 Rounded Status Capsules */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0C1014] border border-white/[0.09] text-xs sm:text-sm">
                <span className="w-2 h-2 rounded-full bg-[#10F5A0] shadow-[0_0_8px_#10F5A0]" />
                <span className="text-zinc-400">ออนไลน์ตอนนี้:</span>
                <span className="font-mono font-bold tabular-nums text-[#10F5A0]">
                  {onlineCount}
                </span>
                <span className="font-semibold text-[#10F5A0]">บัญชี</span>
              </div>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0C1014] border border-white/[0.09] text-xs sm:text-sm">
                <span className="text-zinc-400">บันทึกไว้ทั้งหมด:</span>
                <span className="font-mono font-bold tabular-nums text-white">
                  {accounts.length}
                </span>
                <span className="font-semibold text-white">บัญชี</span>
              </div>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0C1014] border border-white/[0.09] text-xs sm:text-sm">
                <span className="text-zinc-400">ระบบจัดเก็บ:</span>
                <span className="font-semibold text-white">{storageShortLabel}</span>
              </div>
            </div>
          </section>
        )}

        {/* Horizontal Saved Account Selector Strip (when accounts exist) */}
        {!shareId && accounts.length > 0 && (
          <section aria-label="เลือกบัญชีที่บันทึกไว้" className="mb-4">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <span className="w-2 h-2 rounded-full bg-[#10F5A0] shadow-[0_0_8px_#10F5A0]" />
                <span className="font-display font-bold text-white">
                  บัญชีที่บันทึกไว้ <span className="text-[#10F5A0]">({accounts.length})</span>
                </span>
                <span className="text-xs text-zinc-500 hidden sm:inline">
                  · ออนไลน์ {onlineCount} บัญชี · {storageShortLabel}
                </span>
              </div>
              <span className="text-[11px] text-zinc-500">แตะเพื่อสลับไอดี</span>
            </div>

            <div className="flex items-stretch gap-2 overflow-x-auto pb-1.5">
              {accounts.map((acc) => {
                const selected = activeAccount?.accountId === acc.accountId && activeTab !== 'sync';
                const online = isAccountOnline(acc.lastSyncedAt, nowTs);
                return (
                  <div
                    key={acc.accountId}
                    className={`group relative shrink-0 min-w-[195px] max-w-[235px] rounded-2xl border transition-all ${
                      selected
                        ? 'bg-[#101816] border-[#10F5A0]/55 shadow-[0_0_18px_rgba(16,245,160,0.10)]'
                        : 'bg-[#0B0E11] border-white/[0.08] hover:border-white/[0.16]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAccountId(acc.accountId);
                        if (activeTab === 'sync') setActiveTab('drops');
                      }}
                      className="w-full text-left px-3 py-2.5 pr-9 flex items-center gap-2.5 cursor-pointer"
                    >
                      <RobloxHeadshot
                        userId={acc.userId}
                        username={acc.username}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              online ? 'bg-[#10F5A0] shadow-[0_0_8px_#10F5A0]' : 'bg-zinc-600'
                            }`}
                          />
                          <p className="text-sm font-semibold text-white truncate">
                            {acc.displayName}
                          </p>
                        </div>
                        <p className="mt-0.5 text-[11px] font-mono tabular-nums text-zinc-400 truncate">
                          {formatCompact(acc.gems)} Gems · {formatCompact(acc.gold)} Gold
                        </p>
                        <p
                          className={`mt-0.5 text-[10px] truncate ${
                            online ? 'text-[#10F5A0]' : 'text-zinc-500'
                          }`}
                        >
                          {online ? 'ออนไลน์' : `ออฟไลน์ · ${formatRelativeTime(acc.lastSyncedAt, nowTs)}`}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAccount(acc.accountId);
                      }}
                      title={`ลบบัญชี ${acc.username}`}
                      aria-label={`ลบบัญชี ${acc.username}`}
                      className="absolute right-2 top-2 p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Active View Content */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-[21.5rem_minmax(0,1fr)] gap-4 animate-pulse">
            <div className="h-[34rem] rounded-3xl bg-[#0B0E11] border border-white/[0.06]" />
            <div className="h-[34rem] rounded-3xl bg-[#0B0E11] border border-white/[0.06]" />
          </div>
        ) : loadError ? (
          <div className="rounded-3xl bg-[#0B0E11] border border-white/[0.08] px-6 py-12 text-center">
            <p className="font-display text-lg font-bold text-white">{loadError}</p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fetchAccounts(false)}
                className="px-6 py-2.5 text-sm font-bold rounded-full bg-[#10F5A0] text-[#04150E] hover:bg-[#28FFA9] transition-colors cursor-pointer"
              >
                ลองใหม่อีกครั้ง
              </button>
              {shareId && (
                <button
                  type="button"
                  onClick={handleExitShareMode}
                  className="px-5 py-2.5 text-sm font-medium rounded-full bg-[#12161B] border border-white/[0.10] text-zinc-200 hover:text-white transition-colors cursor-pointer"
                >
                  กลับหน้าหลัก
                </button>
              )}
            </div>
          </div>
        ) : activeTab === 'sync' && !shareId ? (
          <LuaSyncView
            syncKey={syncKey}
            cloudflareUrl={cloudflareUrl}
            backendProvider={backendProvider}
            accounts={accounts}
            liveConnected={liveConnected}
            onChangeSyncKey={handleChangeSyncKey}
            onConnectCloudflare={handleConnectCloudflare}
            onDisconnectCloudflare={handleDisconnectCloudflare}
            onOpenAccount={(accountId) => {
              setSelectedAccountId(accountId);
              setActiveTab('drops');
            }}
            onSubmitScriptPacket={submitScriptPacket}
          />
        ) : !activeAccount ? (
          /* Empty State Card styled identically to uniqueclub-opm.vercel.app */
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10F5A0] shadow-[0_0_10px_#10F5A0]" />
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                บัญชีที่ซิงค์เข้ามา <span className="text-[#10F5A0]">(0)</span>
              </h2>
            </div>

            <div className="rounded-3xl bg-[#0B0E11] border border-white/[0.08] px-6 py-14 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-[#10F5A0]/10 border border-[#10F5A0]/25 flex items-center justify-center text-[#10F5A0] shadow-[0_0_24px_rgba(16,245,160,0.14)]">
                <Sparkles size={26} />
              </div>

              <h3 className="mt-6 font-display text-xl sm:text-2xl font-bold text-white">
                ยังไม่มีบัญชีที่ซิงค์เข้ามา
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                คัดลอกสคริปต์ 1 บรรทัดไปรันในแมพ Anime Adventures แล้วทีม 6 ตัว กระเป๋าไอเทม
                และประวัติของดรอปจะเด้งขึ้นมาและบันทึกค้างไว้ให้อัตโนมัติ
              </p>

              <div className="mt-8">
                <button
                  type="button"
                  onClick={() => setActiveTab('sync')}
                  className="inline-flex items-center gap-2 px-7 py-3.5 text-sm font-bold rounded-full bg-[#10F5A0] text-[#04150E] hover:bg-[#28FFA9] shadow-[0_0_28px_rgba(16,245,160,0.38)] transition-all cursor-pointer"
                >
                  <span>ไปคัดลอกสคริปต์ 1 บรรทัด</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </section>
        ) : (
          <AccountDashboard
            account={activeAccount}
            nowTs={nowTs}
            syncKey={syncKey}
            storageLabel={storageShortLabel}
            isReadOnly={Boolean(shareId)}
            activeTab={activeTab === 'sync' ? 'drops' : activeTab}
            onTabChange={(tab) => setActiveTab(tab)}
            onOpenSync={shareId ? undefined : () => setActiveTab('sync')}
            onOpenShare={shareId ? undefined : () => setShareModalOpen(true)}
            onClearDrops={handleClearDrops}
          />
        )}
      </main>

      {/* Anchored Floating Bottom Navigation Dock (matching uniqueclub-opm.vercel.app) */}
      <nav
        aria-label="เมนูหลัก"
        className="fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pt-4 bg-gradient-to-t from-[#050709] via-[#050709]/95 to-transparent pointer-events-none"
      >
        <div
          className={`max-w-lg mx-auto pointer-events-auto rounded-2xl bg-[#0C0F13]/95 backdrop-blur-xl border border-white/[0.10] p-1.5 grid gap-1 shadow-[0_12px_40px_rgba(0,0,0,0.8)] ${
            visibleNavItems.length === 3 ? 'grid-cols-3' : 'grid-cols-4'
          }`}
        >
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-xl transition-all cursor-pointer ${
                  active
                    ? 'bg-[#1A1F26] border border-white/[0.10] text-white shadow-sm'
                    : 'border border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon
                  size={18}
                  className={active ? 'text-[#10F5A0]' : 'text-zinc-400'}
                />
                <span className="text-[11px] font-semibold leading-none whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Live Toast Notifications */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-24 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.uid}
              className="pointer-events-auto rounded-2xl bg-[#0C1014]/95 backdrop-blur-md px-4 py-3 shadow-xl"
              style={{ border: `1px solid ${t.border}` }}
            >
              <p className="text-xs font-semibold truncate" style={{ color: t.color }}>
                {t.title}
              </p>
              <p className="mt-0.5 text-[11px] font-mono text-zinc-400">{t.subtitle}</p>
            </div>
          ))}
        </div>
      )}

      {/* Share Check Link Modal */}
      {shareModalOpen && activeAccount && !shareId && (
        <ShareModal
          account={activeAccount}
          syncKey={syncKey}
          apiBase={activeApiBase}
          cloudflareUrl={cloudflareUrl}
          onClose={() => setShareModalOpen(false)}
        />
      )}
    </div>
  );
}
