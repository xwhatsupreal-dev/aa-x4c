import { useEffect, useState } from 'react';

interface RobloxAvatarStageProps {
  userId?: number;
  username: string;
  apiBase?: string;
  online: boolean;
}

const avatarCache = new Map<string, string | null>();

export function RobloxAvatarStage({
  userId,
  username,
  apiBase = '',
  online,
}: RobloxAvatarStageProps) {
  const cacheKey = userId ? `${apiBase}|${userId}` : '';
  const [imageUrl, setImageUrl] = useState<string | null>(() =>
    cacheKey && avatarCache.has(cacheKey) ? avatarCache.get(cacheKey) ?? null : null
  );
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    if (!userId || userId <= 0) {
      setImageUrl(null);
      return;
    }
    if (avatarCache.has(cacheKey)) {
      setImageUrl(avatarCache.get(cacheKey) ?? null);
      return;
    }

    let cancelled = false;
    fetch(`${apiBase}/api/avatar/${userId}`)
      .then((res) => res.json())
      .then((data: { ok?: boolean; imageUrl?: string | null }) => {
        if (cancelled) return;
        const url = typeof data?.imageUrl === 'string' && data.imageUrl ? data.imageUrl : null;
        avatarCache.set(cacheKey, url);
        setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          avatarCache.set(cacheKey, null);
          setImageUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, apiBase, cacheKey]);

  const showImage = Boolean(imageUrl && !imgFailed);

  return (
    <div className="relative h-56 sm:h-64 lg:h-64 w-full flex items-end justify-center overflow-hidden select-none">
      {/* Subtle obsidian + neon mint floor spotlight behind avatar */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 bottom-2 h-16 rounded-full blur-2xl transition-opacity duration-300"
        style={{
          background: online
            ? 'radial-gradient(ellipse at center, rgba(16, 245, 160, 0.24), transparent 72%)'
            : 'radial-gradient(ellipse at center, rgba(148, 163, 184, 0.14), transparent 72%)',
        }}
      />

      {showImage ? (
        <img
          src={imageUrl!}
          alt={`ตัวละคร Roblox ของ ${username}`}
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setImgFailed(true)}
          className="relative z-10 h-[96%] w-auto max-w-full object-contain object-bottom drop-shadow-[0_14px_26px_rgba(0,0,0,0.72)] transition-transform duration-300 hover:scale-[1.03]"
        />
      ) : (
        /* Clean Roblox character silhouette fallback */
        <svg
          aria-hidden="true"
          viewBox="0 0 100 150"
          preserveAspectRatio="xMidYMax meet"
          className="relative z-10 h-[78%] mb-3"
        >
          <defs>
            <linearGradient id="aaAvatarFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={online ? '#10F5A0' : '#94A3B8'} stopOpacity="0.22" />
              <stop offset="100%" stopColor={online ? '#10F5A0' : '#94A3B8'} stopOpacity="0.06" />
            </linearGradient>
          </defs>
          <g fill="url(#aaAvatarFill)" stroke="rgba(255,255,255,0.08)" strokeWidth="1">
            <rect x="34" y="4" width="32" height="30" rx="7" />
            <rect x="26" y="38" width="48" height="50" rx="5" />
            <rect x="10" y="39" width="14" height="46" rx="5" />
            <rect x="76" y="39" width="14" height="46" rx="5" />
            <rect x="28" y="91" width="21" height="56" rx="5" />
            <rect x="51" y="91" width="21" height="56" rx="5" />
          </g>
        </svg>
      )}
    </div>
  );
}
