import { useEffect, useState, type ReactNode } from 'react';

export type AaThumbKind = 'stage' | 'unit' | 'item' | 'currency';

interface RobloxAssetThumbProps {
  assetId?: string;
  kind?: AaThumbKind;
  name?: string;
  itemId?: string;
  world?: string;
  map?: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
}

export function RobloxAssetThumb({
  assetId,
  kind,
  name,
  itemId,
  world,
  map,
  alt,
  className = 'w-full h-full object-cover',
  fallback = null,
}: RobloxAssetThumbProps) {
  const cleanId = assetId?.match(/\d{4,15}/)?.[0] || '';
  const cleanName = name?.trim() || '';
  const cleanItemId = itemId?.trim() || '';
  const cleanWorld = world?.trim() || '';
  const cleanMap = map?.trim() || '';

  let baseSrc = '';
  if (kind && (cleanName || cleanItemId || cleanWorld || cleanMap || cleanId)) {
    const params = new URLSearchParams();
    params.set('kind', kind);
    if (cleanName) params.set('name', cleanName);
    if (cleanItemId) params.set('id', cleanItemId);
    if (cleanWorld) params.set('world', cleanWorld);
    if (cleanMap) params.set('map', cleanMap);
    if (cleanId) params.set('assetId', cleanId);
    baseSrc = `/api/aa-image?${params.toString()}`;
  } else if (cleanId) {
    baseSrc = `/api/asset-image?id=${encodeURIComponent(cleanId)}`;
  }

  const [retryCount, setRetryCount] = useState(0);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    setRetryCount(0);
    setFailedSrc(null);
  }, [baseSrc]);

  const src = baseSrc ? (retryCount > 0 ? `${baseSrc}&_r=${retryCount}` : baseSrc) : '';

  useEffect(() => {
    if (!src || failedSrc !== src || !cleanId || retryCount >= 2) return;
    const timer = window.setTimeout(() => {
      setRetryCount((c) => c + 1);
      setFailedSrc(null);
    }, retryCount === 0 ? 4000 : 12000);
    return () => window.clearTimeout(timer);
  }, [src, failedSrc, cleanId, retryCount]);

  if (!src || failedSrc === src) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}
