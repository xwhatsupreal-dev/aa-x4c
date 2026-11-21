import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Backpack,
  Code2,
  History,
  Menu,
  Share2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { formatCompact, RARITY_META } from './data/aaCatalog.ts';
import type { AccountSnapshot, RewardEntry, SyncPayload } from './types.ts';
import { DropsView } from './components/DropsView.tsx';
import { InventoryView } from './components/InventoryView.tsx';
import { LuaSyncView } from './components/LuaSyncView.tsx';
import { ShareModal } from './components/ShareModal.tsx';
import { TeamOverview } from './components/TeamOverview.tsx';

type NavTab = 'overview' | 'inventory' | 'drops' | 'sync';

interface ToastNotification {
  uid: string;
  title: string;
  subtitle: string;
  color: string;
  border: string;
}

const STORAGE_KEY = 'aa_vault_sync_key_v2';
const CF_STORAGE_KEY = 'aa_vault_cf_worker_url';

const TAB_TITLES: Record<NavTab, string> = {
  overview: 'ภาพรวม & ทีม 6 ตัว',
  inventory: 'กระเป๋าไอเทม',
  drops: 'ประวัติของที่ได้',
  sync: 'สคริปต์เชื่อมต่อเกม',
};

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

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [inventoryGroup, setInventoryGroup] = useState<string>('ALL');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [backendProvider, setBackendProvider] = useState<string>('');
  const [isServerlessBackend, setIsServerlessBackend] = useState<boolean>(false);

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
              setActiveTab('overview');
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
          setActiveTab('overview');
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
        setActiveTab('overview');
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
    setActiveTab('overview');
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

  const navItems: Array<{ id: NavTab; label: string; icon: typeof Users; hideInShare?: boolean }> = [
    { id: 'overview', label: 'ภาพรวม & ทีม 6 ตัว', icon: Users },
    { id: 'inventory', label: 'กระเป๋าไอเทม', icon: Backpack },
    { id: 'drops', label: 'ประวัติของที่ได้', icon: History },
    { id: 'sync', label: 'สคริปต์เชื่อมต่อเกม', icon: Code2, hideInShare: true },
  ];

  const storageStatusLabel = cloudflareUrl
    ? 'Cloudflare KV · ซิงค์สด'
    : backendProvider === 'vercel-kv'
      ? 'Vercel KV · ซิงค์อัตโนมัติ'
      : backendProvider === 'cloudflare-kv-vercel'
        ? 'Cloudflare KV · ซิงค์อัตโนมัติ'
        : backendProvider === 'vercel-builtin'
          ? 'ซิงค์อัตโนมัติ (Vercel)'
          : liveConnected
            ? 'ซิงค์อัตโนมัติ · พร้อมใช้งาน'
            : 'กำลังเชื่อมต่อ';

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand Title */}
      <div className="h-14 px-5 flex items-center justify-between border-b border-white/[0.07] shrink-0">
        <span className="text-base font-bold tracking-tight text-slate-50 whitespace-nowrap">
          AA Vault
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="ปิดเมนู"
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Primary Navigation */}
      <nav aria-label="เมนูหลัก" className="p-3 space-y-1">
        {navItems
          .filter((item) => !(shareId && item.hideInShare))
          .map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#4F6EF7]/15 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
                }`}
              >
                <Icon
                  size={16}
                  className={active ? 'text-[#7D96FF] shrink-0' : 'text-slate-500 shrink-0'}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
      </nav>

      {/* Synced Accounts Switcher */}
      <div className="px-3 pt-4 pb-3 flex-1 overflow-y-auto border-t border-white/[0.07]">
        <div className="px-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">
            {shareId ? 'บัญชีที่แชร์' : `บัญชีที่ออนไลน์ (${accounts.length})`}
          </span>
        </div>

        {accounts.length === 0 ? (
          <div className="px-3 py-4 text-xs text-slate-500 leading-relaxed">
            กำลังรอข้อมูลจากสคริปต์ในเกม — รันสคริปต์แล้วบัญชีจะขึ้นมาอัตโนมัติ
          </div>
        ) : (
          <ul className="space-y-1">
            {accounts.map((acc) => {
              const selected = activeAccount?.accountId === acc.accountId;
              return (
                <li key={acc.accountId} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAccountId(acc.accountId);
                      if (activeTab === 'sync') setActiveTab('overview');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#171C2B] text-slate-100'
                        : 'text-slate-400 hover:bg-white/[0.035] hover:text-slate-200'
                    }`}
                  >
                    <p className="text-sm font-medium truncate pr-6">{acc.displayName}</p>
                    <p className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 truncate">
                      {formatCompact(acc.gems)} Gems · {formatCompact(acc.gold)} Gold
                    </p>
                  </button>

                  {!shareId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAccount(acc.accountId);
                      }}
                      title={`ลบบัญชี ${acc.username}`}
                      aria-label={`ลบบัญชี ${acc.username}`}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-white/[0.06] transition-all cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-white/[0.07] shrink-0">
        {shareId ? (
          <button
            type="button"
            onClick={handleExitShareMode}
            className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] transition-colors cursor-pointer"
          >
            เปิดแดชบอร์ดของฉัน
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setActiveTab('sync');
              setMobileMenuOpen(false);
            }}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <p className="text-[11px] text-slate-500 truncate">{storageStatusLabel}</p>
            <p className="mt-0.5 text-xs font-mono text-slate-200 truncate">ห้อง: {syncKey}</p>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0E121B] border-r border-white/[0.08] z-30">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/65"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0E121B] border-r border-white/[0.08] z-10 h-full">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-20 h-14 px-4 sm:px-8 bg-[#0B0E14]/90 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="เปิดเมนู"
              className="lg:hidden p-1.5 -ml-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              <Menu size={18} />
            </button>

            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">
                {shareId ? 'ลิ้งค์เช็คของ' : 'Anime Adventures'}
              </span>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <span className="font-medium text-slate-100 truncate">
                {TAB_TITLES[activeTab]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {shareId ? (
              <button
                type="button"
                onClick={handleExitShareMode}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-[#4F6EF7] text-white hover:bg-[#3F5EE8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                ใช้งานแดชบอร์ด
              </button>
            ) : activeAccount ? (
              <button
                type="button"
                onClick={() => setShareModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-[#4F6EF7] text-white hover:bg-[#3F5EE8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Share2 size={14} />
                <span>แชร์ลิ้งค์เช็คของ</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('sync')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-[#4F6EF7] text-white hover:bg-[#3F5EE8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Code2 size={14} />
                <span>คัดลอกสคริปต์ Lua</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-8 w-56 rounded-lg bg-white/[0.06]" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 rounded-xl bg-[#121620] border border-white/[0.06]" />
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-[#121620] border border-white/[0.06]" />
                ))}
              </div>
            </div>
          ) : loadError ? (
            <div className="rounded-xl bg-[#121620] border border-white/[0.08] p-12 text-center">
              <p className="text-base font-medium text-slate-200">{loadError}</p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fetchAccounts(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-[#4F6EF7] text-white hover:bg-[#3F5EE8] transition-colors cursor-pointer"
                >
                  ลองใหม่อีกครั้ง
                </button>
                {shareId && (
                  <button
                    type="button"
                    onClick={handleExitShareMode}
                    className="px-4 py-2 text-xs font-medium rounded-lg bg-[#171C2B] border border-white/[0.10] text-slate-200 hover:bg-[#1E2538] transition-colors cursor-pointer"
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
                setActiveTab('overview');
              }}
              onSubmitScriptPacket={submitScriptPacket}
            />
          ) : !activeAccount ? (
            <div className="rounded-xl bg-[#121620] border border-white/[0.08] p-12 text-center max-w-xl mx-auto mt-6">
              <h1 className="text-lg font-semibold text-slate-100">
                กำลังรอข้อมูลจากสคริปต์ในเกมอัตโนมัติ
              </h1>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                คัดลอกสคริปต์ Lua ไปรันในแมพ Anime Adventures แล้วข้อมูลทีม 6 ตัว กระเป๋า และของที่ดรอปจะเด้งขึ้นมาเองทันทีโดยไม่ต้องกรอกลิงก์เพิ่ม
              </p>
              <div className="mt-6 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setActiveTab('sync')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg bg-[#4F6EF7] text-white hover:bg-[#3F5EE8] transition-colors cursor-pointer"
                >
                  <Code2 size={14} />
                  <span>ไปคัดลอกสคริปต์ Lua</span>
                </button>
              </div>
            </div>
          ) : activeTab === 'overview' ? (
            <TeamOverview
              account={activeAccount}
              onSelectCategory={(group) => {
                setInventoryGroup(group);
                setActiveTab('inventory');
              }}
              onGoDrops={() => setActiveTab('drops')}
            />
          ) : activeTab === 'inventory' ? (
            <InventoryView
              account={activeAccount}
              initialGroup={inventoryGroup}
              onGroupChange={setInventoryGroup}
            />
          ) : (
            <DropsView
              account={activeAccount}
              isReadOnly={Boolean(shareId)}
              onClearDrops={handleClearDrops}
            />
          )}
        </main>
      </div>

      {/* Live Toast Notifications */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.uid}
              className="pointer-events-auto rounded-lg bg-[#141926]/95 backdrop-blur-md px-4 py-3 shadow-lg"
              style={{ border: `1px solid ${t.border}` }}
            >
              <p className="text-xs font-semibold truncate" style={{ color: t.color }}>
                {t.title}
              </p>
              <p className="mt-0.5 text-[11px] font-mono text-slate-400">{t.subtitle}</p>
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
