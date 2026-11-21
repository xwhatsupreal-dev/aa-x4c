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

export const THAI_TIMEZONE = 'Asia/Bangkok';

export function formatClock(ts: number): string {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: THAI_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(ts));
  } catch {
    const d = new Date(ts + 7 * 3600 * 1000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
}

export function formatThaiDateTime(ts: number): string {
  try {
    const datePart = new Intl.DateTimeFormat('th-TH', {
      timeZone: THAI_TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(ts));
    const timePart = new Intl.DateTimeFormat('th-TH', {
      timeZone: THAI_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ts));
    return `${datePart} · ${timePart} น.`;
  } catch {
    return `${formatClock(ts)} น.`;
  }
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

export const SCRIPT_VERSION = '2.5.0';
export const SCRIPT_UPDATED_AT = '21 พ.ย. 2569 · 17:45 น. (เวลาไทย)';

export interface ScriptReleaseNote {
  version: string;
  updatedAt: string;
  highlights: string[];
}

export const SCRIPT_CHANGELOG: ScriptReleaseNote[] = [
  {
    version: '2.5.0',
    updatedAt: '21 พ.ย. 2569 · 17:45 น. (เวลาไทย)',
    highlights: [
      'รวมของดรอปแจ้งเตือนและส่งประวัติ "ทีเดียวตอนลงด่านจบ" (ไม่ยิงทีละชิ้นระหว่างด่านยังไม่จบ) พร้อมสรุป Gold/Gems/XP/Resource/Trophy/Token + ไอเทม + ยูนิตครบในรอบเดียว',
      'ดึงข้อมูลด่านที่กำลังเล่นสด (ชื่อด่าน, โลก, แผนที่, โหมด, ความยาก, Wave, บอส, ศัตรูเหลือ) พร้อมรูปด่านจริงจาก MapIcons ของเกมแสดงทั้งในเกมและบนเว็บ',
      'เพิ่มระบบให้คะแนนอ่าน Profile แม่นยำขึ้น (scoreProfile), อ่านยูนิตทั้งหมดในกระเป๋า (owned_units), รูปไอเทมจริง, ค่า _stats (Trait/Curse/Rebirth Token, Trophy, XP) และรูปทีม 6 ตัวแบบภาพนิ่ง/การ์ด 2D ในเกม',
    ],
  },
  {
    version: '2.4.3',
    updatedAt: '21 พ.ย. 2569 · 15:58 น. (เวลาไทย)',
    highlights: [
      'โหมดประหยัดโควต้า (Write-Saver): ปรับรอบเช็คออนไลน์เริ่มต้นเป็นทุก 2 นาที (~720 ครั้ง/วัน/ไอดี ลดการเขียนลง 12 เท่า) และเลือกได้ถึง 5 นาที / 10 นาที (~144 ครั้ง/วัน)',
      'รวมของดรอปหลังจบด่านหลายชิ้นส่งในครั้งเดียวภายใน 3 วินาที (เห็นของดรอปทันทีโดยไม่ต้องรอครบรอบ Heartbeat และไม่ยิงซ้ำทีละชิ้น)',
      'ลดความถี่ดึงข้อมูลฝั่งเว็บเป็นทุก 10 วินาที (ประหยัดโควต้า Read บน Upstash/Cloudflare ลง 4 เท่า)',
    ],
  },
  {
    version: '2.4.2',
    updatedAt: '21 พ.ย. 2569 · 13:38 น. (เวลาไทย)',
    highlights: [
      'ปรับนาฬิกาในสคริปต์และบนเว็บทั้งหมดให้ตรงกับเวลาประเทศไทย (UTC+7 / Asia/Bangkok) ตลอดเวลา',
    ],
  },
  {
    version: '2.4.1',
    updatedAt: '21 พ.ย. 2569 · 13:10 น. (เวลาไทย)',
    highlights: [
      'รองรับตัวรันมือถือ/PC มากขึ้น (แก้การอ่าน StatusCode/Body หลายรูปแบบ และป้องกันสคริปต์ค้างเมื่อ getgc ช้า)',
      'แก้เส้นทาง API บน Vercel และรองรับการส่ง JSON แม้ตัวรันไม่ส่ง Header Content-Type',
      'แสดงสาเหตุ Error ตรงหน้าต่างสคริปต์ในเกมทันทีหากส่งข้อมูลไม่สำเร็จ',
    ],
  },
  {
    version: '2.4.0',
    updatedAt: '21 พ.ย. 2569 · 12:30 น. (เวลาไทย)',
    highlights: [
      'เพิ่มลูป Heartbeat ซิงค์และเช็คออนไลน์อัตโนมัติตามรอบเวลาที่ตั้งไว้',
      'ส่งเวอร์ชันสคริปต์และรอบเวลาซิงค์ขึ้นเว็บ พร้อมแจ้งเตือนทั้งบนเว็บและในเกมเมื่อมีเวอร์ชันใหม่',
      'ปรับระบบลองส่งใหม่อัตโนมัติเมื่อเน็ตหลุดชั่วคราว ไม่หยุดซิงค์เงียบๆ',
    ],
  },
  {
    version: '2.3.0',
    updatedAt: '21 พ.ย. 2569 · 11:10 น. (เวลาไทย)',
    highlights: [
      'ส่ง UserId และข้อมูลตัวละคร Roblox จริงของบัญชีที่รันสคริปต์ขึ้นหน้าโปรไฟล์',
      'แก้ไม่ให้ไอเทมที่มีอยู่แล้วในกระเป๋าเด้งเข้าไปในประวัติของดรอปตอนเพิ่งรันสคริปต์',
    ],
  },
  {
    version: '2.2.0',
    updatedAt: '21 พ.ย. 2569 · 09:40 น. (เวลาไทย)',
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
    const clamped = Math.min(600, Math.max(5, Math.round(syncIntervalSec)));
    return Math.max(30_000, Math.round(clamped * 2.2 * 1000) + 15_000);
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
