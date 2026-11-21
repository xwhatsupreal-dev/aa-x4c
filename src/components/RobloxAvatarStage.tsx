import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

interface RobloxAvatarStageProps {
  userId?: number;
  username: string;
  online: boolean;
}

export interface AvatarApiResult {
  ok: boolean;
  userId: number | null;
  imageUrl: string | null;
  proxyImageUrl: string | null;
  headshotUrl: string | null;
  proxyHeadshotUrl: string | null;
  avatarType?: 'R6' | 'R15';
  assets?: Array<{ id: number; name: string; type: string }>;
}

const avatarInfoCache = new Map<string, AvatarApiResult>();
const avatarPromiseCache = new Map<string, Promise<AvatarApiResult | null>>();

export function fetchCachedRobloxAvatar(
  userId?: number,
  username?: string,
  forceRefresh = false
): Promise<AvatarApiResult | null> {
  const cleanUser = (username || '').trim();
  if ((!userId || userId <= 0) && !cleanUser) return Promise.resolve(null);

  const cacheKey = `${userId || 0}|${cleanUser.toLowerCase()}`;
  if (!forceRefresh && avatarInfoCache.has(cacheKey)) {
    return Promise.resolve(avatarInfoCache.get(cacheKey)!);
  }
  if (!forceRefresh && avatarPromiseCache.has(cacheKey)) {
    return avatarPromiseCache.get(cacheKey)!;
  }

  const params = new URLSearchParams();
  if (userId && userId > 0) params.set('userId', String(userId));
  if (cleanUser) params.set('username', cleanUser);

  const req = fetch(`/api/avatar?${params.toString()}`)
    .then((res) => res.json())
    .then((data: AvatarApiResult) => {
      if (data && (data.imageUrl || data.headshotUrl || data.userId)) {
        avatarInfoCache.set(cacheKey, data);
      }
      avatarPromiseCache.delete(cacheKey);
      return data;
    })
    .catch(() => {
      avatarPromiseCache.delete(cacheKey);
      return null;
    });

  avatarPromiseCache.set(cacheKey, req);
  return req;
}

export function RobloxAvatarStage({
  userId,
  username,
  online,
}: RobloxAvatarStageProps) {
  const cacheKey = `${userId || 0}|${username.trim().toLowerCase()}`;
  const [info, setInfo] = useState<AvatarApiResult | null>(
    () => avatarInfoCache.get(cacheKey) ?? null
  );
  const [loading, setLoading] = useState<boolean>(() => !avatarInfoCache.has(cacheKey));
  const [useDirectFallback, setUseDirectFallback] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [hopping, setHopping] = useState(false);
  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);

  const loadAvatar = useCallback(
    (force = false) => {
      let cancelled = false;
      setUseDirectFallback(false);
      setImgFailed(false);
      if (force || !avatarInfoCache.has(cacheKey)) {
        setLoading(true);
      }

      fetchCachedRobloxAvatar(userId, username, force).then((data) => {
        if (cancelled) return;
        setInfo(data);
        setLoading(false);
      });

      return () => {
        cancelled = true;
      };
    },
    [userId, username, cacheKey]
  );

  useEffect(() => {
    return loadAvatar(false);
  }, [loadAvatar]);

  const activeImgSrc = !useDirectFallback
    ? info?.proxyImageUrl || info?.imageUrl || null
    : info?.imageUrl || null;

  const showRealRobloxImage = Boolean(activeImgSrc && !imgFailed);
  const resolvedUserId = info?.userId || (userId && userId > 0 ? userId : null);

  const handlePoke = () => {
    setHopping(true);
    window.setTimeout(() => setHopping(false), 360);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: -ny * 8, ry: nx * 12 });
  };

  const handlePointerLeave = () => {
    setTilt({ rx: 0, ry: 0 });
  };

  const handleImageError = () => {
    if (!useDirectFallback && info?.proxyImageUrl && info?.imageUrl) {
      setUseDirectFallback(true);
    } else {
      setImgFailed(true);
    }
  };

  return (
    <div
      ref={stageRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative h-64 sm:h-72 lg:h-68 w-full flex items-end justify-center overflow-hidden select-none"
      style={{ perspective: '800px' }}
    >
      {/* Grounded glowing platform pedestal behind real Roblox character */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 w-44 h-8 rounded-[100%] border transition-all duration-300"
        style={{
          borderColor: online
            ? 'rgba(16, 245, 160, 0.36)'
            : 'rgba(148, 163, 184, 0.18)',
          background: online
            ? 'radial-gradient(ellipse at center, rgba(16, 245, 160, 0.24), rgba(11, 14, 17, 0.1) 75%)'
            : 'radial-gradient(ellipse at center, rgba(148, 163, 184, 0.12), rgba(11, 14, 17, 0.05) 75%)',
          boxShadow: online
            ? '0 0 28px rgba(16, 245, 160, 0.22)'
            : '0 0 18px rgba(0, 0, 0, 0.45)',
        }}
      />

      <button
        type="button"
        onClick={handlePoke}
        aria-label={`ตัวละคร Roblox ของ ${username}`}
        title={`ตัวละคร Roblox จริงของ @${username} (คลิกเพื่อจิ้มตัวละคร)`}
        className="relative z-10 w-full h-full flex items-end justify-center pb-3 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#10F5A0]"
      >
        {showRealRobloxImage ? (
          <img
            src={activeImgSrc!}
            alt={`ตัวละคร Roblox จริงของ ${username}`}
            referrerPolicy="no-referrer"
            draggable={false}
            onError={handleImageError}
            className="h-[95%] w-auto max-w-full object-contain object-bottom drop-shadow-[0_14px_26px_rgba(0,0,0,0.82)] transition-transform duration-200 ease-out"
            style={{
              transform: hopping
                ? 'translateY(-16px) scaleY(1.06) scaleX(0.95)'
                : `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
            }}
          />
        ) : loading ? (
          /* Clean loading placeholder while fetching real Roblox character from Roblox API */
          <div className="mb-10 flex flex-col items-center gap-2.5 text-zinc-400">
            <div className="size-10 rounded-full border-2 border-white/10 border-t-[#10F5A0] animate-spin" />
            <span className="text-[11px] font-medium text-zinc-400">
              กำลังโหลดตัวละคร Roblox...
            </span>
          </div>
        ) : (
          /* Retry state if Roblox thumbnail API temporarily failed */
          <div className="mb-10 flex flex-col items-center gap-2 text-center px-4">
            <p className="text-xs text-zinc-400">
              โหลดรูปตัวละคร Roblox ของ @{username} ไม่สำเร็จ
            </p>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                loadAvatar(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  loadAvatar(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#10F5A0]/12 border border-[#10F5A0]/40 text-[11px] font-semibold text-[#10F5A0] hover:bg-[#10F5A0]/20 transition-colors cursor-pointer"
            >
              <RefreshCw size={11} />
              <span>โหลดตัวละครใหม่</span>
            </span>
          </div>
        )}
      </button>

      {/* Bottom-left subtle Roblox rig info */}
      {info?.avatarType && (
        <div className="pointer-events-none absolute left-3.5 bottom-2.5 z-20 text-[10px] font-mono text-zinc-400">
          {info.avatarType}
          {info.assets?.length ? ` · ${info.assets.length} ชิ้น` : ''}
        </div>
      )}

      {/* Bottom-right direct link to this user's real Roblox profile */}
      {resolvedUserId && (
        <a
          href={`https://www.roblox.com/users/${resolvedUserId}/profile`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={`เปิดโปรไฟล์ Roblox ของ @${username}`}
          className="absolute right-3 bottom-2 z-20 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0C1014]/85 border border-white/[0.10] text-[10px] font-medium text-zinc-300 hover:border-[#10F5A0]/45 hover:text-[#10F5A0] transition-colors"
        >
          <span>โปรไฟล์ Roblox</span>
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}
