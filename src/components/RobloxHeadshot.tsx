import { useEffect, useState } from 'react';
import { fetchCachedRobloxAvatar } from './RobloxAvatarStage.tsx';

interface RobloxHeadshotProps {
  userId?: number;
  username: string;
  size?: 'sm' | 'md';
}

export function RobloxHeadshot({
  userId,
  username,
  size = 'sm',
}: RobloxHeadshotProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetchCachedRobloxAvatar(userId, username, false).then((data) => {
      if (cancelled) return;
      const primary = data?.proxyHeadshotUrl || data?.headshotUrl || null;
      const backup = data?.headshotUrl || null;
      setSrc(primary);
      setFallbackUrl(backup !== primary ? backup : null);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, username]);

  const sizeClass = size === 'md' ? 'size-9 rounded-xl' : 'size-8 rounded-xl';
  const initials = (username || 'AA').slice(0, 2).toUpperCase();

  return (
    <div
      className={`${sizeClass} shrink-0 overflow-hidden bg-[#10151A] border border-white/[0.10] flex items-center justify-center`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={`@${username}`}
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => {
            if (fallbackUrl && src !== fallbackUrl) {
              setSrc(fallbackUrl);
            } else {
              setFailed(true);
            }
          }}
          className="size-full object-cover"
        />
      ) : (
        <span className="font-display text-[11px] font-bold text-[#10F5A0]">
          {initials}
        </span>
      )}
    </div>
  );
}
