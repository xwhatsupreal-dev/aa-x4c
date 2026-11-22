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

export const SCRIPT_VERSION = '2.9.2';
export const SCRIPT_UPDATED_AT = '22 พ.ย. 2569 · 18:20 น. (เวลาไทย)';

export interface ScriptReleaseNote {
  version: string;
  updatedAt: string;
  highlights: string[];
}

export const SCRIPT_CHANGELOG: ScriptReleaseNote[] = [
  {
    version: '2.9.2',
    updatedAt: '22 พ.ย. 2569 · 18:20 น. (เวลาไทย)',
    highlights: [
      'แก้บั๊ก XP จบด่านพุ่งเป็นหลักล้าน (เช่น +2,035,815) โดยดึงเฉพาะรางวัลจริงจากตาราง rewards และกรองค่า XP สะสมของยูนิต/ไอดี/แบทเทิลพาสออกทั้งหมด',
      'แสดงสถานะ ชนะ / แพ้ ชัดเจนในประวัติของดรอปทุกด่าน พร้อมสรุปยอด ชนะ · แพ้ และแจ้งเตือนสดแบบแยกสี ชนะ (เขียว) / แพ้ (แดง)',
    ],
  },
  {
    version: '2.9.1',
    updatedAt: '22 พ.ย. 2569 · 17:15 น. (เวลาไทย)',
    highlights: [
      'แยกแสดง Trait Reroll ครบทั้ง 3 แบบ: Reroll Token, Star Remnant และ Star Remnant (Limited) พร้อม Broken Star (Limited), Cursed Token, Stat Cube และ Perfect Stat Cube',
      'แก้ไขรูปไอคอน Reroll ทุกตัวบนหน้าข้อมูลให้ดึงรูปจริงจากเกมและ AA Wiki ครบทุกช่อง (ไม่แสดงเป็นไอคอนลูกเต๋า/ดาวเปล่า)',
      'สแกนและอัปโหลดรูปไอคอนไอเทมสาย Reroll จากในเกมเข้าคิวความสำคัญสูงโดยอัตโนมัติ',
    ],
  },
  {
    version: '2.9.0',
    updatedAt: '22 พ.ย. 2569 · 15:00 น. (เวลาไทย)',
    highlights: [
      'ตรวจจับหน้าต่างหลุดเกม / เตะออกของ Roblox อัตโนมัติ (Error Code 273, 277, 278, 267, 279 ฯลฯ) ส่งข้อความแจ้งบนเว็บและสลับเป็น "ออฟไลน์" ทันทีไม่ค้างออนไลน์',
      'ป้องกันของ/เงิน/ทีมรีเซ็ตเป็น 0 เวลาย้ายเซิฟหรือเข้า-ออกด่าน — รอโหลดข้อมูลจริงครบก่อนอัปเดต และคงค่าเดิมที่จำไว้ระหว่างกำลังย้ายเซิฟ',
      'เพิ่มการแสดงจำนวน Reroll (Trait Reroll, Curse Reroll, Star Remnant, Stat Cube / Perfect Stat Cube) บนหน้าข้อมูลไอดี',
      'แจ้งของรางวัลจบด่านทันทีแบบ 0 ดีเลย์ (พร้อมส่งสำรองก่อน Teleport) ป้องกันการพลาดแจ้งเตือนเมื่อกดเปลี่ยนด่าน/รีเพลย์ทันทีหลังจบ',
    ],
  },
  {
    version: '2.8.0',
    updatedAt: '22 พ.ย. 2569 · 09:30 น. (เวลาไทย)',
    highlights: [
      'เลิกใช้การเดา diff และสแกน ResultsUI — เปลี่ยนมาอ่านรางวัลด่านจาก RemoteEvent จริงของเกม 100% (game_finished, show_unit_and_item_rewards, show_drop_message, show_drop_message_custom) ตามต้นฉบับ 2K v10',
      'รวมของรางวัล (Gold, Gems, XP, Summer Pearls, Token, Charm/Portal พร้อม Tier และยูนิต) ส่งขึ้นเว็บทันทีเมื่อจบด่าน ไม่มีค่าเพี้ยนและไม่แจ้งกวนระหว่างด่าน',
      'รองรับการอ่าน Tier ของ Charm (จาก field tier) และ Portal (จาก tier/rarity) ครบถ้วนพร้อมเก็บประวัติสูงสุด 15 รายการล่าสุด',
    ],
  },
  {
    version: '2.7.2',
    updatedAt: '22 พ.ย. 2569 · 02:20 น. (เวลาไทย)',
    highlights: [
      'จำกัดประวัติของดรอปไว้ไม่เกิน 15 รายการ (รอบดรอปล่าสุด) รายการเก่าที่เกินจะถูกลบออกอัตโนมัติทั้งในเกม, บนเว็บ และในฐานข้อมูล ช่วยประหยัดพื้นที่และโหลดไวขึ้น',
    ],
  },
  {
    version: '2.7.1',
    updatedAt: '22 พ.ย. 2569 · 02:00 น. (เวลาไทย)',
    highlights: [
      'ส่งแจ้งทันทีเฉพาะตอนจบด่าน (ไม่รอคิวอัปรูปและไม่ทิ้งรอบจบด่าน) ส่วนการเปลี่ยนด่าน/เข้าล็อบบี้/ข้อมูลทั่วไปจะรอส่งตามเวลาที่ตั้งในสคริปต์ (ประหยัดโควต้าเขียนมากขึ้น)',
      'ปรับข้อความสถานะบนเว็บและในเกมเป็น "เช็คทุก X วิ" ให้เข้าใจง่ายตรงกันทุกจุด',
    ],
  },
  {
    version: '2.7.0',
    updatedAt: '22 พ.ย. 2569 · 01:20 น. (เวลาไทย)',
    highlights: [
      'จับรางวัล Summer Pearls (และสกุล Event _resource* / profile.resources / unit_killed_resource_reward) สรุปรวมให้ตอนจบด่าน Event Summer พร้อมไอคอนจริงจากเกม',
      'อ่าน Tier ของ Charm และ Portal จากข้อมูลไอเทมจริงในเกม พร้อมแสดงป้าย Tier ทั้งตอนจบด่านและแยกหมวด Portals / Charms ตามแต่ละ Tier ในกระเป๋า',
      'หน้าข้อมูลเปลี่ยนจาก Trophy เป็น Summer Pearls พร้อมสแกนและอัปโหลดรูปจริงจากเกมของ Summer Pearls, ทอง (Gold) และเพชร (Gems) มาแสดงโดยตรง',
    ],
  },
  {
    version: '2.6.1',
    updatedAt: '22 พ.ย. 2569 · 00:40 น. (เวลาไทย)',
    highlights: [
      'ตอนจบด่านสคริปต์จะอัปโหลด "รูปด่านที่เพิ่งจบ + รูปของดรอปทุกชิ้นในรอบนั้น" จากในเกมขึ้นเว็บก่อนส่งประวัติทันที (ไม่พลาดรูปด่านหรือไอคอนรางวัล)',
      'อัปเกรดประวัติของดรอปตอนจบด่านทั้งบนเว็บและในเกมให้แสดงรูปด่านและรูปไอเทม/สกุลเงิน/ยูนิตทุกชิ้นแบบชัดเจน',
      'เพิ่มระบบเช็คหลาย Asset ในครั้งเดียว (/api/asset-exists?ids=...) และขยายโควต้าสแกน MapIcons ในเกมให้ครบทุกด่านมากขึ้น',
    ],
  },
  {
    version: '2.6.0',
    updatedAt: '21 พ.ย. 2569 · 23:45 น. (เวลาไทย)',
    highlights: [
      'ระบบสแกนและอัปโหลด "รูปด่านและไอเทมจริงจากในเกม" ขึ้นเว็บอัตโนมัติ (ใช้ Roblox EditableImage อ่านพิกเซลจาก MapIcons / RES_ICON / OverrideIcons ในตัวเกมแล้วแปลงเป็น PNG เก็บไว้บนเซิร์ฟเวอร์ครั้งเดียว ไม่ต้องเจนรูป)',
      'เพิ่มปุ่ม "สแกนรูปเกม" ในหน้าต่างสคริปต์ พร้อมเช็ค /api/asset-exists ก่อนทุกครั้งเพื่อไม่ให้อัปโหลดซ้ำและประหยัดโควต้า Upstash/KV',
      'เว็บจะแสดงรูปจริงที่สคริปต์อัปโหลดจากเกมเป็นอันดับแรก (เช่น ด่านใหม่ Update 21 อย่าง Sky Island) และใช้ภาพจาก Anime Adventures Wiki เป็นตัวเสริม',
    ],
  },
  {
    version: '2.5.1',
    updatedAt: '21 พ.ย. 2569 · 22:45 น. (เวลาไทย)',
    highlights: [
      'แก้ปัญหารูปกากบาทสีขาวจาก Roblox Private Asset — ดึงรูปด่าน, รูปทีม 6 ตัว, ไอเทม และเหรียญจากฐานข้อมูล Anime Adventures จริงพร้อมแคชไว 24 ชม. และสลับไปไอคอนธีมมืดอัตโนมัติถ้ายังไม่มีรูป',
      'แก้บั๊กหน้าจบด่าน ResultsUI ดึงค่าหลอก +99,999 จากช่องที่ซ่อนอยู่ (ตรวจ .Visible ทุกชั้น + เทียบผลต่าง _stats จริงเป็นหลัก)',
      'ปรับการอ่านเลเวลตัวละครและเลเวลยูนิตในทีม 6 ตัวให้แม่นยำขึ้น (ไม่โดนเลเวลในด่าน Lv.1 ทับ)',
    ],
  },
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
  syncIntervalSec?: number,
  disconnected?: boolean
): boolean {
  if (disconnected) return false;
  return now - lastSyncedAt <= getOnlineTimeoutMs(syncIntervalSec);
}

export function getDisconnectHintTh(errorCode?: string, message?: string): string {
  const code = String(errorCode || '').trim();
  const msg = String(message || '').toLowerCase();
  if (code === '273' || msg.includes('same account launched') || msg.includes('different device')) {
    return 'มีเครื่องอื่นล็อกอินไอดีเดียวกันซ้อน (Error 273)';
  }
  if (code === '278' || msg.includes('idle for 20 minutes')) {
    return 'หลุดเพราะยืนนิ่ง AFK เกิน 20 นาที (Error 278)';
  }
  if (code === '277' || msg.includes('lost connection') || msg.includes('internet connection')) {
    return 'อินเทอร์เน็ตหลุดหรือขาดการเชื่อมต่อเซิร์ฟเวอร์ (Error 277)';
  }
  if (code === '267' || msg.includes('kicked')) {
    return 'ถูกเตะออกจากเซิร์ฟเวอร์ (Error 267)';
  }
  if (code === '279' || code === '266' || msg.includes('failed to connect')) {
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (Error ' + (code || '279') + ')';
  }
  if (code === '274' || code === '275' || msg.includes('maintenance') || msg.includes('shut down')) {
    return 'เซิร์ฟเวอร์ปิดปรับปรุงหรือรีเซ็ต (Error ' + (code || '275') + ')';
  }
  if (code === '268' || msg.includes('unexpected client behavior')) {
    return 'ถูกตัดการเชื่อมต่อจากไคลเอนต์ (Error 268)';
  }
  return code ? `หลุดการเชื่อมต่อจากเกม (Error Code: ${code})` : 'หลุดการเชื่อมต่อจากเกม';
}
