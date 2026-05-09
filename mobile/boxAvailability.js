/**
 * Règles de disponibilité hôte (JSON en base).
 * CommonJS pour Node (API) + Metro (React Native).
 */

function timeToMinutes(hhmm) {
  const s = String(hhmm || "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return NaN;
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}

function weekdayFromDateIso(dateIso) {
  const [y, mo, d] = String(dateIso || "").split("-").map(Number);
  if (!y || !mo || !d) return NaN;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCDay();
}

function rangesOverlapOpen(s1, e1, s2, e2) {
  return s1 < e2 && s2 < e1;
}

function slotOverlapsQuietHours(startMin, endMin, quietStartStr, quietEndStr) {
  const qs = timeToMinutes(quietStartStr);
  const qe = timeToMinutes(quietEndStr);
  if (!Number.isFinite(qs) || !Number.isFinite(qe)) return false;
  if (qs === qe) return false;
  if (qs < qe) {
    return rangesOverlapOpen(startMin, endMin, qs, qe);
  }
  const partA = rangesOverlapOpen(startMin, endMin, qs, 1440);
  const partB = rangesOverlapOpen(startMin, endMin, 0, qe);
  return partA || partB;
}

function dateInBlockedRange(dateIso, range) {
  const d = String(dateIso || "").trim();
  const a = String(range?.start || "").trim();
  const b = String(range?.end || "").trim();
  if (!d || !a || !b) return false;
  return d >= a && d <= b;
}

function normalizeAvailabilitySchedule(raw) {
  if (raw == null) return null;
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj))
    return null;
  const out = {
    quietHoursEnabled: Boolean(obj.quietHoursEnabled),
    quietStart: String(obj.quietStart || "00:00").trim(),
    quietEnd: String(obj.quietEnd || "06:00").trim(),
    closedWeekdays: Array.isArray(obj.closedWeekdays)
      ? obj.closedWeekdays
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
      : [],
    blockedRanges: Array.isArray(obj.blockedRanges)
      ? obj.blockedRanges
          .filter(
            (r) =>
              r &&
              typeof r.start === "string" &&
              typeof r.end === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(r.start) &&
              /^\d{4}-\d{2}-\d{2}$/.test(r.end)
          )
          .map((r) => ({
            start: r.start,
            end: r.end,
            note: r.note ? String(r.note).slice(0, 200) : undefined,
          }))
      : [],
  };
  const hasRules =
    out.quietHoursEnabled ||
    out.closedWeekdays.length > 0 ||
    out.blockedRanges.length > 0;
  return hasRules ? out : null;
}

function evaluateBookingAgainstSchedule(schedule, { bookingDate, startTime, endTime }) {
  const sched = normalizeAvailabilitySchedule(schedule);
  if (!sched) return { ok: true };

  const wd = weekdayFromDateIso(bookingDate);
  if (!Number.isFinite(wd)) return { ok: true };

  if (sched.closedWeekdays.includes(wd)) {
    return { ok: false, reason: "closed_weekday" };
  }

  for (const br of sched.blockedRanges) {
    if (dateInBlockedRange(bookingDate, br)) {
      return { ok: false, reason: "blocked_range" };
    }
  }

  const sm = timeToMinutes(startTime);
  const em = timeToMinutes(endTime);
  if (!Number.isFinite(sm) || !Number.isFinite(em) || em <= sm) {
    return { ok: true };
  }

  if (sched.quietHoursEnabled) {
    if (slotOverlapsQuietHours(sm, em, sched.quietStart, sched.quietEnd)) {
      return { ok: false, reason: "quiet_hours" };
    }
  }

  return { ok: true };
}

const DEFAULT_AVAILABILITY_SCHEDULE = {
  quietHoursEnabled: false,
  quietStart: "00:00",
  quietEnd: "06:00",
  closedWeekdays: [],
  blockedRanges: [],
};

function parseAvailabilityScheduleFromBox(box) {
  const raw = box?.availability_schedule_json ?? box?.availabilitySchedule;
  return normalizeAvailabilitySchedule(raw) || null;
}

/** Créneau compatible avec les règles (pour tri carte). */
function isSlotMatchingSchedule(schedule, bookingDate, startTime, endTime) {
  return evaluateBookingAgainstSchedule(schedule, {
    bookingDate,
    startTime,
    endTime,
  }).ok;
}

module.exports = {
  timeToMinutes,
  weekdayFromDateIso,
  slotOverlapsQuietHours,
  dateInBlockedRange,
  normalizeAvailabilitySchedule,
  evaluateBookingAgainstSchedule,
  DEFAULT_AVAILABILITY_SCHEDULE,
  parseAvailabilityScheduleFromBox,
  isSlotMatchingSchedule,
};
