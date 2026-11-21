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

export function formatRelativeTime(ts: number, now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 15) return 'เมื่อสักครู่';
  if (diffSec < 60) return `${diffSec} วินาทีที่แล้ว`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
  return `${Math.floor(diffHr / 24)} วันที่แล้ว`;
}

export const ONLINE_THRESHOLD_MS = 65_000;

export const SCRIPT_VERSION = '2.4.1';
export const SCRIPT_UPDATED_AT = '21 พ.ย. 2026 · 13:10 น.';

export interface ScriptReleaseNote {
  version: string;
  updatedAt: string;
  highlights: string[];
}

export const SCRIPT_CHANGELOG: ScriptReleaseNote[] = [
  {
    version: '2.4.1',
    updatedAt: '21 พ.ย. 2026 · 13:10 น.',
    highlights: [
      'รองรับตัวรันมือถือ/PC มากขึ้น (แก้การอ่าน StatusCode/Body หลายรูปแบบ และป้องกันสคริปต์ค้างเมื่อ getgc ช้า)',
      'แก้เส้นทาง API บน Vercel และรองรับการส่ง JSON แม้ตัวรันไม่ส่ง Header Content-Type',
      'แสดงสาเหตุ Error ตรงหน้าต่างสคริปต์ในเกมทันทีหากส่งข้อมูลไม่สำเร็จ',
    ],
  },
  {
    version: '2.4.0',
    updatedAt: '21 พ.ย. 2026 · 12:30 น.',
    highlights: [
      'เพิ่มลูป Heartbeat ซิงค์และเช็คออนไลน์อัตโนมัติตามรอบเวลาที่ตั้งไว้ (5 / 10 / 15 / 30 / 60 วินาที)',
      'ส่งเวอร์ชันสคริปต์และรอบเวลาซิงค์ขึ้นเว็บ พร้อมแจ้งเตือนทั้งบนเว็บและในเกมเมื่อมีเวอร์ชันใหม่',
      'ปรับระบบลองส่งใหม่อัตโนมัติเมื่อเน็ตหลุดชั่วคราว ไม่หยุดซิงค์เงียบๆ',
    ],
  },
  {
    version: '2.3.0',
    updatedAt: '21 พ.ย. 2026 · 11:10 น.',
    highlights: [
      'ส่ง UserId และข้อมูลตัวละคร Roblox จริงของบัญชีที่รันสคริปต์ขึ้นหน้าโปรไฟล์',
      'แก้ไม่ให้ไอเทมที่มีอยู่แล้วในกระเป๋าเด้งเข้าไปในประวัติของดรอปตอนเพิ่งรันสคริปต์',
    ],
  },
  {
    version: '2.2.0',
    updatedAt: '21 พ.ย. 2026 · 09:40 น.',
    highlights: [
      'รองรับคำสั่งรันแบบ 1 บรรทัด (loadstring) โฮสต์บนเว็บโดยตรง ไม่ต้องฝาก Pastebin',
    ],
  },
];

export function isScriptOutdated(version?: string): boolean {
  return !version || version.trim() !== SCRIPT_VERSION;
}

export function getOnlineTimeoutMs(syncIntervalSec?: number): number {
  if (typeof syncIntervalSec === 'number' && Number.isFinite(syncIntervalSec) && syncIntervalSec > 0) {
    const clamped = Math.min(120, Math.max(5, Math.round(syncIntervalSec)));
    return Math.max(25_000, Math.round(clamped * 2.5 * 1000) + 10_000);
  }
  return ONLINE_THRESHOLD_MS;
}

export function isAccountOnline(
  lastSyncedAt: number,
  now = Date.now(),
  syncIntervalSec?: number
): boolean {
  return now - lastSyncedAt <= getOnlineTimeoutMs(syncIntervalSec);
}
