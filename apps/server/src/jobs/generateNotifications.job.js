/**
 * @file generateNotifications.job.js
 * @description Cron job: generate notifications for checkout due, tagihan overdue,
 * holidays, weekends, and long holidays.
 *
 * Ported from api/generate-notifications.js (Supabase) → uses query() and push.service.js.
 */

import { query } from '../config/database.js';
import { sendPushToAudience } from '../modules/notifications/push.service.js';
import { env } from '../config/env.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatWibDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const fmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return `${fmt.format(d).replace(',', '')} WIB`;
}

function calcEndAt({ created_at, rental_duration }) {
  const start = new Date(created_at);
  const hours = Number(rental_duration || 1);
  if (Number.isNaN(start.getTime())) return null;
  if (hours >= 24) {
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    end.setHours(12, 0, 0, 0);
    return end;
  }
  return new Date(start.getTime() + hours * 60 * 60 * 1000);
}

// ── Notification upsert (dedupe-safe) ─────────────────────────────────────────

/**
 * Insert a notification only if its dedupe_key doesn't already exist.
 * Returns { id, inserted } — inserted=false means duplicate (no-op).
 *
 * @param {object} payload
 * @returns {Promise<{ id: string|null, inserted: boolean }>}
 */
async function upsertNotification(payload) {
  // 1) Check existing dedupe_key
  if (payload?.dedupe_key) {
    const existing = await query(
      'SELECT id FROM notifications WHERE dedupe_key = $1 LIMIT 1',
      [payload.dedupe_key],
    );
    if (existing.rows[0]?.id) return { id: existing.rows[0].id, inserted: false };
  }

  // 2) Insert — treat duplicate-key violations as silent no-ops
  try {
    const result = await query(
      `INSERT INTO notifications
         (type, title, body, data, dedupe_key, audience_role, audience_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        payload.type          ?? null,
        payload.title         ?? null,
        payload.body          ?? null,
        payload.data          ? JSON.stringify(payload.data) : null,
        payload.dedupe_key    ?? null,
        payload.audience_role ?? null,
        payload.audience_user_id ?? null,
      ],
    );
    return { id: result.rows[0]?.id ?? null, inserted: true };
  } catch (err) {
    if (err.code === '23505' || /duplicate key/i.test(err.message || '')) {
      return { id: null, inserted: false };
    }
    throw err;
  }
}

// ── Holiday API ───────────────────────────────────────────────────────────────

async function fetchHolidayForDate(year, month, day) {
  try {
    const res  = await fetch(`https://libur.deno.dev/api?year=${year}&month=${month}&day=${day}`);
    const data = await res.json();
    if (data?.is_holiday) {
      return (Array.isArray(data.holiday_list) ? data.holiday_list[0] : null) || 'Libur Nasional';
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchHolidaysForMonth(year, month) {
  try {
    const res  = await fetch(`https://libur.deno.dev/api?year=${year}&month=${month}`);
    const data = await res.json();
    if (!Array.isArray(data)) return {};
    const map = {};
    data.forEach((item) => { if (item.date && item.name) map[item.date] = item.name; });
    return map;
  } catch {
    return {};
  }
}

// ── Long holiday detection ────────────────────────────────────────────────────

function detectLongHoliday(holidayMap, fromDate) {
  const NAMA_BULAN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function toKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
  function isHoliday(d) { return !!holidayMap[toKey(d)]; }
  function isHarpitnas(d) {
    if (isWeekend(d) || isHoliday(d)) return false;
    const prev = new Date(d); prev.setDate(d.getDate() - 1);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    return (isWeekend(prev) || isHoliday(prev)) && (isWeekend(next) || isHoliday(next));
  }
  function isOffDay(d) {
    if (isWeekend(d) || isHoliday(d)) return true;
    const prev = new Date(d); prev.setDate(d.getDate() - 1);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    return (isWeekend(prev) || isHoliday(prev)) && (isWeekend(next) || isHoliday(next));
  }

  for (let startOffset = 0; startOffset <= 14; startOffset++) {
    const startD = new Date(fromDate);
    startD.setDate(fromDate.getDate() + startOffset);
    startD.setHours(0, 0, 0, 0);

    if (!isOffDay(startD)) continue;

    let streakLen = 0;
    const streakD = new Date(startD);
    while (streakLen < 14) {
      if (!isOffDay(streakD)) break;
      streakLen++;
      streakD.setDate(streakD.getDate() + 1);
    }

    if (streakLen >= 3) {
      const endD = new Date(startD);
      endD.setDate(startD.getDate() + streakLen - 1);

      const holidayNames  = [];
      const harpitnasDays = [];
      const scanD         = new Date(startD);
      for (let i = 0; i < streakLen; i++) {
        const key = toKey(scanD);
        if (holidayMap[key]) holidayNames.push(holidayMap[key]);
        if (isHarpitnas(scanD)) harpitnasDays.push(scanD.getDate());
        scanD.setDate(scanD.getDate() + 1);
      }

      const uniqueNames = [...new Set(holidayNames)];
      let desc = uniqueNames.length > 0 ? uniqueNames.slice(0, 2).join(' & ') : 'Weekend panjang';
      if (harpitnasDays.length > 0) desc += ` (harpitnas tgl ${harpitnasDays.join(',')})`;

      return {
        isLongHoliday: true,
        startDate: startD,
        endDate: endD,
        totalDays: streakLen,
        description: desc,
        startOffset,
        hasHarpitnas: harpitnasDays.length > 0,
        harpitnasDays,
      };
    }
  }
  return null;
}

// ── Main job function ─────────────────────────────────────────────────────────

/**
 * Run all notification generation steps.
 * Called by the cron scheduler; also exported for manual runs.
 *
 * @returns {Promise<object>} Result summary
 */
export async function runGenerateNotifications() {
  const now    = new Date();
  const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

  const NAMA_BULAN_FULL = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const fmtTanggal = (d) => `${d.getDate()} ${NAMA_BULAN_FULL[d.getMonth()]} ${d.getFullYear()}`;

  // WIB time helpers
  const nowWib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const todayStr = `${nowWib.getFullYear()}-${String(nowWib.getMonth() + 1).padStart(2, '0')}-${String(nowWib.getDate()).padStart(2, '0')}`;
  const tomorrowWib = new Date(nowWib);
  tomorrowWib.setDate(nowWib.getDate() + 1);
  const tomorrowStr = `${tomorrowWib.getFullYear()}-${String(tomorrowWib.getMonth() + 1).padStart(2, '0')}-${String(tomorrowWib.getDate()).padStart(2, '0')}`;
  const dowWib = nowWib.getDay();

  const result = {
    ok: true,
    nowIso: now.toISOString(),
    nowWib: nowWib.toISOString(),
    todayStr,
    dowWib,
    created: 0,
    sections: {
      checkout:    { processed: 0, due: 0, soon30m: 0, error: null },
      tagihan:     { processed: 0, overdue: 0, error: null },
      holiday:     { todayHoliday: null, tomorrowHoliday: null, posted: 0, error: null },
      weekend:     { posted: 0, error: null },
      longHoliday: { detected: null, posted: 0, error: null },
    },
    pushEnabled,
  };

  const recordInserted = (flag) => { if (flag) result.created += 1; };

  // ── 1) Checkout due & soon ─────────────────────────────────────────────────
  try {
    const txResult = await query(
      `SELECT id, created_at, rental_duration, apartment_location,
              room_number, customer_name, created_by AS user_id, checkout_at, checkin_at
       FROM transactions
       WHERE checkout_at IS NULL`,
      [],
    );
    const txList = txResult.rows;
    result.sections.checkout.processed = txList.length;

    const cutoffSoonMs = 30 * 60 * 1000;

    for (const tx of txList) {
      const endAt = calcEndAt(tx);
      if (!endAt) continue;

      const diffMs      = endAt.getTime() - now.getTime();
      const endLabel    = formatWibDateTime(endAt.toISOString());
      const checkinAt   = tx.checkin_at ? new Date(tx.checkin_at) : new Date(tx.created_at);
      const durasiJam   = Number(tx.rental_duration || 1);
      const durasiLabel = durasiJam >= 24 ? `${Math.floor(durasiJam / 24)} malam` : `${durasiJam} jam`;
      const checkinLabel = formatWibDateTime(checkinAt.toISOString());

      const baseData = {
        tx_id: tx.id,
        apartment_location: tx.apartment_location,
        room_number: tx.room_number,
        customer_name: tx.customer_name,
        end_at: endAt.toISOString(),
        checkin_at: checkinAt.toISOString(),
        rental_duration: tx.rental_duration,
      };

      if (diffMs <= 0) {
        // Already past checkout time
        const dedupe = `checkout_due:tx:${tx.id}`;
        const title  = `⏰ Waktunya Checkout: ${tx.apartment_location} ${tx.room_number}`;
        const body   = `${tx.customer_name || 'Customer'} sudah melewati waktu sewa (${endLabel}). Check-in: ${checkinLabel}, durasi: ${durasiLabel}.`;

        const a = await upsertNotification({ type: 'checkout_due', title, body, data: baseData, dedupe_key: `${dedupe}:admin`,       audience_role: 'admin' });
        const b = await upsertNotification({ type: 'checkout_due', title, body, data: baseData, dedupe_key: `${dedupe}:super_admin`, audience_role: 'super_admin' });
        let   c = { inserted: false };
        if (tx.user_id) {
          c = await upsertNotification({ type: 'checkout_due', title, body, data: baseData, dedupe_key: `${dedupe}:user:${tx.user_id}`, audience_user_id: tx.user_id });
        }
        recordInserted(a.inserted); recordInserted(b.inserted); recordInserted(c.inserted);
        if (pushEnabled) {
          if (a.inserted) await sendPushToAudience({ title, body, url: '/', audience_role: 'admin' });
          if (b.inserted) await sendPushToAudience({ title, body, url: '/', audience_role: 'super_admin' });
        }
        if (a.inserted || b.inserted) result.sections.checkout.due += 1;

      } else if (diffMs <= cutoffSoonMs) {
        // Due within 30 minutes
        const minsLeft = Math.max(1, Math.ceil(diffMs / 60000));
        const dedupe   = `checkout_soon:tx:${tx.id}:${todayStr}`;
        const title    = `⚡ Segera Checkout: ${tx.apartment_location} ${tx.room_number}`;
        const body     = `${tx.customer_name || 'Customer'} checkout dalam ~${minsLeft} menit (${endLabel}). Check-in: ${checkinLabel}, durasi: ${durasiLabel}.`;

        const a = await upsertNotification({ type: 'checkout_soon', title, body, data: baseData, dedupe_key: `${dedupe}:admin`,       audience_role: 'admin' });
        const b = await upsertNotification({ type: 'checkout_soon', title, body, data: baseData, dedupe_key: `${dedupe}:super_admin`, audience_role: 'super_admin' });
        let   c = { inserted: false };
        if (tx.user_id) {
          c = await upsertNotification({ type: 'checkout_soon', title, body, data: baseData, dedupe_key: `${dedupe}:user:${tx.user_id}`, audience_user_id: tx.user_id });
        }
        recordInserted(a.inserted); recordInserted(b.inserted); recordInserted(c.inserted);
        if (pushEnabled) {
          if (a.inserted) await sendPushToAudience({ title, body, url: '/', audience_role: 'admin' });
          if (b.inserted) await sendPushToAudience({ title, body, url: '/', audience_role: 'super_admin' });
        }
        if (a.inserted || b.inserted) result.sections.checkout.soon30m += 1;
      }
    }
  } catch (e) {
    result.sections.checkout.error = e?.message || String(e);
  }

  // ── 2) Tagihan bulanan overdue ─────────────────────────────────────────────
  try {
    const tagihanResult = await query(
      `SELECT id, apartment_location, room_number, amount, due_date
       FROM tagihan_bulanan
       WHERE status = 'unpaid' AND due_date < $1`,
      [todayStr],
    );
    const list = tagihanResult.rows;
    result.sections.tagihan.processed = list.length;

    for (const tagihan of list) {
      const dueDate  = new Date(tagihan.due_date);
      const diffDays = Math.max(1, Math.floor((nowWib - dueDate) / (1000 * 60 * 60 * 24)));
      const dedupe   = `tagihan_overdue:${tagihan.id}:${todayStr}`;
      const title    = `🔴 Tagihan Terlambat: ${tagihan.apartment_location} - ${tagihan.room_number}`;
      const body     = `Tagihan unit ${tagihan.apartment_location} - ${tagihan.room_number} sudah terlambat ${diffDays} hari (jatuh tempo: ${new Date(tagihan.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}).`;
      const data     = { tagihan_id: tagihan.id, apartment_location: tagihan.apartment_location, room_number: tagihan.room_number, due_date: tagihan.due_date, overdue_days: diffDays };

      const a = await upsertNotification({ type: 'tagihan_overdue', title, body, data, dedupe_key: `${dedupe}:admin`,       audience_role: 'admin' });
      const b = await upsertNotification({ type: 'tagihan_overdue', title, body, data, dedupe_key: `${dedupe}:super_admin`, audience_role: 'super_admin' });
      recordInserted(a.inserted); recordInserted(b.inserted);
      if (pushEnabled) {
        if (a.inserted) await sendPushToAudience({ title, body, url: '/?tab=finance', audience_role: 'admin' });
        if (b.inserted) await sendPushToAudience({ title, body, url: '/?tab=finance', audience_role: 'super_admin' });
      }
      if (a.inserted || b.inserted) result.sections.tagihan.overdue += 1;
    }
  } catch (e) {
    result.sections.tagihan.error = e?.message || String(e);
  }

  // ── 3) Libur nasional & weekend ───────────────────────────────────────────
  try {
    const [todayHoliday, tomorrowHoliday] = await Promise.all([
      fetchHolidayForDate(nowWib.getFullYear(),     nowWib.getMonth() + 1,     nowWib.getDate()),
      fetchHolidayForDate(tomorrowWib.getFullYear(), tomorrowWib.getMonth() + 1, tomorrowWib.getDate()),
    ]);
    result.sections.holiday.todayHoliday    = todayHoliday;
    result.sections.holiday.tomorrowHoliday = tomorrowHoliday;

    if (todayHoliday) {
      const title = `🔥 Hari Ini Libur: ${todayHoliday}`;
      const body  = `Hari ini ${fmtTanggal(nowWib)} adalah ${todayHoliday}. Tamu makin rame, siap-siap sibuk!`;
      const r = await upsertNotification({ type: 'holiday_today', title, body, data: { date: todayStr }, dedupe_key: `holiday_today:${todayStr}`, audience_role: 'all' });
      recordInserted(r.inserted);
      if (pushEnabled && r.inserted) await sendPushToAudience({ title, body, url: '/', audience_role: 'all' });
      if (r.inserted) result.sections.holiday.posted += 1;
    }

    if (tomorrowHoliday) {
      const title = `⚡ Besok Libur: ${tomorrowHoliday}`;
      const body  = `Besok ${fmtTanggal(tomorrowWib)} adalah ${tomorrowHoliday}. Bersiap, tamu bakal rame besok!`;
      const r = await upsertNotification({ type: 'holiday_tomorrow', title, body, data: { date: tomorrowStr }, dedupe_key: `holiday_tomorrow:${tomorrowStr}`, audience_role: 'all' });
      recordInserted(r.inserted);
      if (pushEnabled && r.inserted) await sendPushToAudience({ title, body, url: '/', audience_role: 'all' });
      if (r.inserted) result.sections.holiday.posted += 1;
    }
  } catch (e) {
    result.sections.holiday.error = e?.message || String(e);
  }

  // ── 4) Weekend notifications ──────────────────────────────────────────────
  try {
    if (dowWib === 5) {
      // Friday — weekend starts today
      const title = `🎉 Selamat Weekend!`;
      const body  = `Hari ini ${fmtTanggal(nowWib)} adalah Jumat. Bersiap menyambut tamu weekend!`;
      const r = await upsertNotification({ type: 'weekend_start', title, body, data: { date: todayStr }, dedupe_key: `weekend_start:${todayStr}`, audience_role: 'all' });
      recordInserted(r.inserted);
      if (pushEnabled && r.inserted) await sendPushToAudience({ title, body, url: '/', audience_role: 'all' });
      if (r.inserted) result.sections.weekend.posted += 1;
    } else if (dowWib === 4) {
      // Thursday — weekend tomorrow
      const title = `🌅 Besok Weekend!`;
      const body  = `Besok ${fmtTanggal(tomorrowWib)} mulai weekend. Pastikan kamar siap untuk tamu!`;
      const r = await upsertNotification({ type: 'weekend_tomorrow', title, body, data: { date: tomorrowStr }, dedupe_key: `weekend_tomorrow:${tomorrowStr}`, audience_role: 'all' });
      recordInserted(r.inserted);
      if (pushEnabled && r.inserted) await sendPushToAudience({ title, body, url: '/', audience_role: 'all' });
      if (r.inserted) result.sections.weekend.posted += 1;
    }
  } catch (e) {
    result.sections.weekend.error = e?.message || String(e);
  }

  // ── 5) Long holiday detection ─────────────────────────────────────────────
  try {
    const holidayMap   = await fetchHolidaysForMonth(nowWib.getFullYear(), nowWib.getMonth() + 1);
    // Also fetch next month if within last 14 days
    if (nowWib.getDate() > 17) {
      const nextMonth = nowWib.getMonth() + 2 > 12 ? 1 : nowWib.getMonth() + 2;
      const nextYear  = nowWib.getMonth() + 2 > 12 ? nowWib.getFullYear() + 1 : nowWib.getFullYear();
      const nextMap   = await fetchHolidaysForMonth(nextYear, nextMonth);
      Object.assign(holidayMap, nextMap);
    }

    const detected = detectLongHoliday(holidayMap, nowWib);
    result.sections.longHoliday.detected = detected;

    if (detected) {
      const { startDate, endDate, totalDays, description, startOffset } = detected;
      const startStr = startDate.toISOString().slice(0, 10);
      const endStr   = endDate.toISOString().slice(0, 10);

      let title, body, dedupe;
      if (startOffset === 0) {
        title  = `🏖️ Libur Panjang Mulai Hari Ini!`;
        body   = `Libur panjang ${totalDays} hari dimulai hari ini (${description}). Siap-siap ramai!`;
        dedupe = `long_holiday_today:${startStr}`;
      } else {
        title  = `📅 Libur Panjang ${totalDays} Hari Akan Datang`;
        body   = `Ada libur panjang ${totalDays} hari mulai ${startStr} s/d ${endStr} (${description}). Bersiap dari sekarang!`;
        dedupe = `long_holiday_start:${startStr}`;
      }

      const r = await upsertNotification({
        type: 'long_holiday', title, body,
        data: { start_date: startStr, end_date: endStr, total_days: totalDays, description },
        dedupe_key:   dedupe,
        audience_role: 'all',
      });
      recordInserted(r.inserted);
      if (pushEnabled && r.inserted) await sendPushToAudience({ title, body, url: '/', audience_role: 'all' });
      if (r.inserted) result.sections.longHoliday.posted += 1;
    }
  } catch (e) {
    result.sections.longHoliday.error = e?.message || String(e);
  }

  // ── Aggregate ok flag ─────────────────────────────────────────────────────
  result.ok = !Object.values(result.sections).some((s) => s.error);
  return result;
}
