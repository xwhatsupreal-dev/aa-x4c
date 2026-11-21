import { useState, type ReactNode } from 'react';

interface RobloxAssetThumbProps {
  assetId?: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
}

export function RobloxAssetThumb({
  assetId,
  alt,
  className = 'w-full h-full object-cover',
  fallback = null,
}: RobloxAssetThumbProps) {
  const cleanId = assetId?.match(/\d{4,15}/)?.[0] || '';
  const [failedId, setFailedId] = useState<string | null>(null);

  if (!cleanId || failedId === cleanId) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={`/api/asset-image?id=${encodeURIComponent(cleanId)}`}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedId(cleanId)}
      className={className}
    />
  );
}
