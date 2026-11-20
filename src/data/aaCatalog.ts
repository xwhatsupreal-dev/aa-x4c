import type { Rarity } from '../types.ts';

export const RARITY_ORDER: Rarity[] = [
  'Secret',
  'Exclusive',
  'Mythic',
  'Legendary',
  'Epic',
  'Rare',
  'Uncommon',
  'Common',
];

export const RARITY_RANK: Record<Rarity, number> = {
  Secret: 8,
  Exclusive: 7,
  Mythic: 6,
  Legendary: 5,
  Epic: 4,
  Rare: 3,
  Uncommon: 2,
  Common: 1,
};

/** Matches RCOL from the attached Anime Adventures 2K Lua script */
export const RARITY_META: Record<
  Rarity,
  { hex: string; softBg: string; border: string; text: string; labelTh: string }
> = {
  Secret: {
    hex: '#ff64a5',
    softBg: 'rgba(255, 100, 165, 0.12)',
    border: 'rgba(255, 100, 165, 0.36)',
    text: '#ff7db4',
    labelTh: 'Secret',
  },
  Exclusive: {
    hex: '#82dceb',
    softBg: 'rgba(130, 220, 235, 0.12)',
    border: 'rgba(130, 220, 235, 0.36)',
    text: '#8ee4f2',
    labelTh: 'Exclusive',
  },
  Mythic: {
    hex: '#ff785a',
    softBg: 'rgba(255, 120, 90, 0.12)',
    border: 'rgba(255, 120, 90, 0.36)',
    text: '#ff8a70',
    labelTh: 'Mythic',
  },
  Legendary: {
    hex: '#ffbe50',
    softBg: 'rgba(255, 190, 80, 0.12)',
    border: 'rgba(255, 190, 80, 0.36)',
    text: '#ffc766',
    labelTh: 'Legendary',
  },
  Epic: {
    hex: '#b46eff',
    softBg: 'rgba(180, 110, 255, 0.12)',
    border: 'rgba(180, 110, 255, 0.36)',
    text: '#c28aff',
    labelTh: 'Epic',
  },
  Rare: {
    hex: '#5aa0ff',
    softBg: 'rgba(90, 160, 255, 0.12)',
    border: 'rgba(90, 160, 255, 0.36)',
    text: '#74b0ff',
    labelTh: 'Rare',
  },
  Uncommon: {
    hex: '#6ec878',
    softBg: 'rgba(110, 200, 120, 0.12)',
    border: 'rgba(110, 200, 120, 0.36)',
    text: '#7fd689',
    labelTh: 'Uncommon',
  },
  Common: {
    hex: '#a0a0ac',
    softBg: 'rgba(160, 160, 172, 0.10)',
    border: 'rgba(160, 160, 172, 0.28)',
    text: '#b4b4c0',
    labelTh: 'Common',
  },
};

export function normalizeRarity(input?: string): Rarity {
  if (!input) return 'Common';
  const cleaned = input.trim().toLowerCase();
  const match = RARITY_ORDER.find((r) => r.toLowerCase() === cleaned);
  return match ?? 'Common';
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('th-TH').format(Math.floor(n || 0));
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatNumber(n);
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 15) return 'เมื่อสักครู่';
  if (diffSec < 60) return `${diffSec} วินาทีที่แล้ว`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
  return `${Math.floor(diffHr / 24)} วันที่แล้ว`;
}
