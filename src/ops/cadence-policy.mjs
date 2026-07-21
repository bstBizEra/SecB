// MOD-OPS Slice S3 — cadence catalog + due-action evaluator (PURE, UNWIRED).
//
// Purpose (G3 from mod-ops-gap-assessment-001, bst/mod-ops-assessment): give
// `src/` a single pure, frozen, deny-by-default answer to two doctrine
// questions that today live only as prose in
// docs/12-execution/02-schedule-and-cadence.md:
//   (a) "what is required when cadence trigger X fires?" — the 7-row
//       event-driven cadence table; and
//   (b) "which operating-rhythm activities are DUE at an injected instant T,
//       given caller-supplied last-run state?" — the 8-row recommended
//       operating rhythm.
// Both tables are codified VERBATIM here; the test suite parses the actual
// markdown at runtime and asserts 1:1 parity, so any doc/code drift on names,
// order, counts, or schedule fields fails CI (mirrors the MOD-OPS S1
// KPI-registry doc-parity discipline and the MOD-GOV S2 risk-registry pattern).
//
// DECISION FUNCTION, NOT A SCHEDULER (assessment boundary B4, mirroring the
// `src/control/retry-policy.mjs` charter verbatim): NOTHING in this file
// sleeps, sets a timer, wakes on a clock, fires an action, or wraps a live
// call. It answers exactly "what is required / what is due" as data. The clock
// is INJECTED as `now` — there is no ambient clock read anywhere: no wall-clock
// call, no date-object construction, no timers. `now` is a UTC epoch-millisecond
// number and every calendar computation below is pure integer arithmetic over
// it (civil-from-days / days-from-civil), so the module constructs no calendar
// object at all. Running a cadence (daily triage, Friday integration review) is
// human/operator process — no code here automates it (assessment §5 #6).
//
// Scope discipline: pure data + pure decision. No I/O, no clock, no timers, no
// schema, no persistence, no transport, no imports at all. NOTHING consumes
// this module in this slice — adoption by any live session, ledger, report, or
// scheduler path is later, separately-governed work (assessment §5 #4, #6). It
// never touches `checkpoint-ledger.mjs` or mints a checkpoint (B7); the 6
// semantic checkpoint conditions are codified as a frozen list for future
// consumers only.
//
// NOT invented here (assessment §5, B-notes): the module codifies the
// doctrine's schedule fields verbatim and computes occurrence instants from
// them plus the doctrine's declared timezone. It does NOT invent thresholds,
// SLAs, escalation, or priorities. Two doctrine under-specifications are
// handled honestly rather than guessed:
//   - "Monthly, first Tuesday" names the DAY but no time-of-day. This
//     evaluator anchors that occurrence to the START of that local day
//     (00:00 Asia/Ho_Chi_Minh) — the minimal reading that adds no unstated
//     time — and marks the due entry `resolution: "day"` so a caller knows
//     sub-day timing is not doctrine-sourced.
//   - "Quarterly" names neither a day, a time, nor an anchor. It is genuinely
//     undecidable from doctrine alone, so it is NEVER auto-due; every
//     evaluation surfaces it as a `SCHEDULE_UNDERSPECIFIED` finding. Inventing
//     a quarter anchor/time would be un-sourced authority.
//
// ATOMIC SNAPSHOT (house standard ratified on main, LIVE-S1 rev-002 N1 /
// atomic-snapshot-hardening): every field this evaluator consults off
// caller-supplied input is captured in a SINGLE contained read into a local
// const BEFORE any evaluation logic runs. The top-level {now, lastRun,
// triggerId} is snapshotted once; `lastRun`'s structure is captured
// structurally via `Reflect.ownKeys` into a plain Map (own keys only —
// prototype keys never participate), each value read exactly once. A hostile
// getter or Proxy trap therefore cannot (a) throw past the guard, nor
// (b) return one value to a check and another to the body, nor (c) mutate a
// sibling already captured. Decisions bind to the first snapshot.
//
// FAIL-CLOSED EXTRACTION (WSPACE-S1 lesson): each property read off the input
// is a single contained read inside try/catch; a throw is contained as a
// structured denial, never propagated.
//
// House style: result objects — deep-frozen `{ ok: true, ... }` on success and
// deep-frozen `{ ok: false, code, message }` on any malformed/unknown input
// (deny-by-default; unknown trigger/rhythm names are never coerced to a
// default). Audit-before-effect holds by construction: no side effects; the
// returned frozen result IS the decision record.

// --- Deny codes (closed, frozen set) -----------------------------------------
//
//   DENY_CADENCE_MALFORMED — deny-by-default on any structurally invalid
//     input: non-object input; a `now` that is not a finite non-negative
//     number (string, NaN, Infinity, -Infinity, negative, bigint, boolean,
//     null, object all reject); a `lastRun` that is not a plain object;
//     a lastRun value that is not a finite non-negative number; a `triggerId`
//     that is present but not a non-blank null-byte-free string; or an
//     unreadable field (throwing getter / Proxy trap — contained extraction).
//   DENY_CADENCE_UNKNOWN — a well-formed name that is not in doctrine and is
//     never guessed: a `triggerId` not among the 7 cadence triggers, or a
//     `lastRun` own-key that is not among the 8 operating-rhythm ids
//     (prototype keys are own-property misses and do not even reach this gate).
export const CADENCE_DENY_CODES = Object.freeze([
  "DENY_CADENCE_MALFORMED",
  "DENY_CADENCE_UNKNOWN"
]);

// Non-blocking finding codes surfaced on a successful evaluation (never a
// denial): a recognized rhythm row whose doctrine schedule is too
// under-specified to decide precisely.
export const CADENCE_FINDING_CODES = Object.freeze([
  "SCHEDULE_UNDERSPECIFIED"
]);

// Doctrine default timezone (docs/12-execution/02-schedule-and-cadence.md,
// line 3: "All times use `Asia/Ho_Chi_Minh` unless a Project Contract states
// otherwise."). Asia/Ho_Chi_Minh is a FIXED UTC+7 offset (no DST). This module
// applies the doctrine default only; a Project-Contract override is a caller
// concern outside this pure primitive's scope.
export const TIMEZONE = "Asia/Ho_Chi_Minh";
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NULL_BYTE = "\0";

const deny = (code, message) => deepFreeze({ ok: false, code, message });

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// Stable-id scheme (same as MOD-OPS S1): lowercase the doctrine text, collapse
// every non-alphanumeric run to a single hyphen, trim hyphens. The parity test
// derives every id from the doc text independently, so the scheme itself is
// drift-guarded, not just the literals below.
function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Mechanical split of a doctrine required-action / activity cell into its
// enumerated items: split on top-level commas, then on the coordinating
// " and ". Deterministic and documented; the parity test re-derives the same
// split from the doc cell, so both the split rule and the literals are
// drift-guarded. No item is invented, dropped, or reordered.
function splitClause(cell) {
  return cell
    .split(/,\s*/)
    .flatMap((segment) => segment.split(/\s+and\s+/))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

// --- Event-driven cadence (7 triggers; verbatim, doc order) ------------------
// docs/12-execution/02-schedule-and-cadence.md §"Event-driven cadence".
const trigger = (name, requiredAction) =>
  Object.freeze({
    id: slug(name),
    trigger: name,
    requiredAction,
    actions: Object.freeze(splitClause(requiredAction))
  });

export const CADENCE_TRIGGERS = Object.freeze([
  trigger("Work package created", "Preflight, risk classification and team compilation"),
  trigger("Session started", "Context receipt, baseline and evidence destination confirmation"),
  trigger("Commit/checkpoint", "Write-set reconciliation, merge simulation and evidence update"),
  trigger("Failed/denied action", "Failure Evidence Envelope and learning disposition"),
  trigger("Candidate submitted", "Freeze, independent review and integration queue entry"),
  trigger("Release/activation", "Verification, approval, rollback readiness and outcome window"),
  trigger("Outcome observed", "Outcome Receipt, learning and knowledge assessment")
]);

// --- Recommended operating rhythm (8 rows; verbatim, doc order) --------------
// docs/12-execution/02-schedule-and-cadence.md §"Recommended operating rhythm".
// `schedule` codifies the "Cadence" column structurally so due-ness is
// decidable; `resolution` records the precision the doctrine actually
// specifies for that row.
//
//   schedule.kind:
//     "daily"           — every local day at {hour, minute}         (minute)
//     "weekly"          — every local {weekday} at {hour, minute}   (minute)
//     "monthly-weekday" — the {ordinal}-th {weekday} of each local  (day)
//                         month, anchored at 00:00 (no doctrine time)
//     "underspecified"  — doctrine gives no decidable anchor        (none)
// weekday: 0=Sunday .. 6=Saturday.
const rhythm = (cadence, activity, requiredOutput, schedule, resolution) =>
  Object.freeze({
    id: slug(cadence),
    cadence,
    activity,
    requiredOutput,
    schedule: Object.freeze(schedule),
    resolution
  });

export const OPERATING_RHYTHM = Object.freeze([
  rhythm("Daily 08:30", "Portfolio and blocker triage", "Priority/authority updates",
    { kind: "daily", hour: 8, minute: 30 }, "minute"),
  rhythm("Daily 17:30", "Evidence and outcome close", "Session disposition, gaps and next actions",
    { kind: "daily", hour: 17, minute: 30 }, "minute"),
  rhythm("Monday 09:00", "Goal and work-package planning", "Authorized weekly plan",
    { kind: "weekly", weekday: 1, hour: 9, minute: 0 }, "minute"),
  rhythm("Wednesday 15:00", "Architecture/dependency review", "ADRs, interface changes, risk updates",
    { kind: "weekly", weekday: 3, hour: 15, minute: 0 }, "minute"),
  rhythm("Friday 15:00", "Integration queue and release review", "Candidate dispositions",
    { kind: "weekly", weekday: 5, hour: 15, minute: 0 }, "minute"),
  rhythm("Friday 16:30", "Learning and skill review", "Experience/knowledge/skill decisions",
    { kind: "weekly", weekday: 5, hour: 16, minute: 30 }, "minute"),
  rhythm("Monthly, first Tuesday", "Security, cost and capability governance", "Risk, spend, model and harness decisions",
    { kind: "monthly-weekday", ordinal: 1, weekday: 2 }, "day"),
  rhythm("Quarterly", "Product and platform review", "Roadmap, KPI and capability reprioritization",
    { kind: "underspecified" }, "none")
]);

// --- Session checkpoint policy (6 semantic conditions; verbatim, doc order) ---
// docs/12-execution/02-schedule-and-cadence.md §"Session checkpoint policy".
// Codified for future consumers ONLY; S3 mints no checkpoint (B7).
const checkpoint = (condition) => Object.freeze({ id: slug(condition), condition });

export const CHECKPOINT_TRIGGERS = Object.freeze([
  checkpoint("broad refactoring"),
  checkpoint("dependency or schema change"),
  checkpoint("privilege/network expansion"),
  checkpoint("handoff to another role"),
  checkpoint("review submission"),
  checkpoint("integration or release")
]);

// --- Frozen indexes (module-load time; no caller input involved) -------------
const TRIGGER_BY_ID = Object.freeze(
  Object.fromEntries(CADENCE_TRIGGERS.map((t) => [t.id, t]))
);
const RHYTHM_IDS = Object.freeze(new Set(OPERATING_RHYTHM.map((r) => r.id)));

// --- Pure calendar helpers (integer arithmetic; no Date object) --------------

// Positive modulo (JS `%` keeps the sign of the dividend).
const mod = (n, m) => ((n % m) + m) % m;

// Days since 1970-01-01 for a UTC-shifted millisecond value.
const daysOf = (ms) => Math.floor(ms / DAY_MS);

// Weekday of a day index. 1970-01-01 (day 0) was a Thursday; with Sunday=0 that
// is 4, hence the +4. Result 0=Sunday .. 6=Saturday.
const weekdayOf = (dayIndex) => mod(dayIndex + 4, 7);

// Civil calendar date from a day index (Howard Hinnant's algorithm). month is
// 1..12, day is 1..31. Pure; valid across the Gregorian range.
function civilFromDays(z) {
  const zz = z + 719468;
  const era = Math.floor((zz >= 0 ? zz : zz - 146096) / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

// Inverse of civilFromDays: day index for a civil (year, month, day).
function daysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

// Day index of the {ordinal}-th {weekday} of a given local (year, month).
// ordinal is 1-based (1 = first). Pure.
function nthWeekdayOfMonth(year, month, ordinal, weekday) {
  const firstDay = daysFromCivil(year, month, 1);
  const firstWeekday = weekdayOf(firstDay);
  const offset = mod(weekday - firstWeekday, 7);
  return firstDay + offset + (ordinal - 1) * 7;
}

// Local-time view of a UTC epoch-ms `now`, in the doctrine timezone.
function localView(now) {
  const localMs = now + TZ_OFFSET_MS;
  const dayIndex = daysOf(localMs);
  return {
    dayIndex,
    weekday: weekdayOf(dayIndex),
    msOfDay: localMs - dayIndex * DAY_MS
  };
}

// UTC epoch-ms of a local day-index at {hour, minute} in the doctrine timezone.
const localInstantUTC = (dayIndex, hour, minute) =>
  dayIndex * DAY_MS + (hour * 60 + minute) * 60 * 1000 - TZ_OFFSET_MS;

// Most-recent scheduled occurrence (UTC epoch-ms) at-or-before `now` for a
// rhythm schedule, or null when the schedule is not decidable from doctrine.
function mostRecentOccurrence(schedule, now) {
  const local = localView(now);
  if (schedule.kind === "daily") {
    const todayUTC = localInstantUTC(local.dayIndex, schedule.hour, schedule.minute);
    return todayUTC <= now ? todayUTC : todayUTC - DAY_MS;
  }
  if (schedule.kind === "weekly") {
    const daysBack = mod(local.weekday - schedule.weekday, 7);
    const thisWeekUTC = localInstantUTC(local.dayIndex - daysBack, schedule.hour, schedule.minute);
    return thisWeekUTC <= now ? thisWeekUTC : thisWeekUTC - 7 * DAY_MS;
  }
  if (schedule.kind === "monthly-weekday") {
    const { year, month } = civilFromDays(local.dayIndex);
    const thisMonthDay = nthWeekdayOfMonth(year, month, schedule.ordinal, schedule.weekday);
    const thisMonthUTC = thisMonthDay * DAY_MS - TZ_OFFSET_MS; // 00:00 local
    if (thisMonthUTC <= now) return thisMonthUTC;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevDay = nthWeekdayOfMonth(prevYear, prevMonth, schedule.ordinal, schedule.weekday);
    return prevDay * DAY_MS - TZ_OFFSET_MS;
  }
  return null; // underspecified
}

// --- Atomic input snapshot ---------------------------------------------------

// Single contained read of the three consulted top-level fields. `lastRun` is
// captured STRUCTURALLY via Reflect.ownKeys into a plain Map (own keys only,
// each value read exactly once) so a hostile getter/Proxy cannot hand one
// value to a guard and another to the body. A throw anywhere is contained as a
// malformed snapshot.
function snapshotInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, detail: "input must be a non-array object" };
  }
  let now;
  let lastRun;
  let triggerId;
  try {
    now = input.now;
    lastRun = input.lastRun;
    triggerId = input.triggerId;
  } catch {
    return { ok: false, detail: "an input field could not be read safely" };
  }

  // Capture lastRun's structure atomically. Absent (undefined/null) => empty.
  const runs = new Map();
  if (lastRun !== undefined && lastRun !== null) {
    if (typeof lastRun !== "object" || Array.isArray(lastRun)) {
      return { ok: false, detail: "lastRun, when supplied, must be a plain object" };
    }
    try {
      for (const key of Reflect.ownKeys(lastRun)) {
        if (typeof key !== "string") continue; // symbol keys are not rhythm ids
        runs.set(key, lastRun[key]); // single read per own key
      }
    } catch {
      return { ok: false, detail: "a lastRun field could not be read safely" };
    }
  }
  return { ok: true, now, triggerId, runs };
}

const isFiniteNonNegative = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

const isUsableId = (v) =>
  typeof v === "string" && v.trim().length > 0 && !v.includes(NULL_BYTE);

// --- Trigger lookup (pure) ---------------------------------------------------

// requiredActionsForTrigger({ triggerId }) — the doctrine required actions for
// one event-driven cadence trigger, or a typed denial. Single contained read;
// malformed (non-string/blank/null-byte/hostile) => DENY_CADENCE_MALFORMED,
// well-formed but not a doctrine trigger => DENY_CADENCE_UNKNOWN (never
// guessed, never an empty "nothing required").
export function requiredActionsForTrigger(input) {
  let triggerId;
  try {
    triggerId = input?.triggerId;
  } catch {
    return deny("DENY_CADENCE_MALFORMED", "triggerId could not be read safely from the input");
  }
  if (!isUsableId(triggerId)) {
    return deny("DENY_CADENCE_MALFORMED", "triggerId must be a non-blank string without null bytes");
  }
  if (!Object.hasOwn(TRIGGER_BY_ID, triggerId)) {
    return deny("DENY_CADENCE_UNKNOWN", `no cadence trigger is cataloged under id "${triggerId}"`);
  }
  const t = TRIGGER_BY_ID[triggerId];
  return deepFreeze({
    ok: true,
    trigger: t.trigger,
    triggerId: t.id,
    requiredAction: t.requiredAction,
    actions: [...t.actions]
  });
}

// --- Catalog listers (pure; take no input; never deny) -----------------------
export function listTriggers() {
  return Object.freeze({ ok: true, triggers: CADENCE_TRIGGERS });
}
export function listRhythm() {
  return Object.freeze({ ok: true, rhythm: OPERATING_RHYTHM });
}
export function listCheckpointTriggers() {
  return Object.freeze({ ok: true, checkpoints: CHECKPOINT_TRIGGERS });
}

// --- Due-action evaluator (the S3 decision function) -------------------------

// evaluateDueActions({ now, lastRun?, triggerId? }) — decide which cadence
// actions are DUE at the injected instant `now`, given caller-supplied last-run
// state. A DECISION, never an effect: it fires nothing and schedules nothing.
//
//   now       — REQUIRED. UTC epoch-milliseconds, a finite non-negative
//               number. String / NaN / Infinity / -Infinity / negative /
//               bigint / boolean / null / object => DENY_CADENCE_MALFORMED.
//   lastRun   — OPTIONAL. A plain object mapping a rhythm id to the UTC
//               epoch-ms of its last completion. An own-key that is not a
//               rhythm id => DENY_CADENCE_UNKNOWN; a value that is not a finite
//               non-negative number => DENY_CADENCE_MALFORMED. A rhythm whose
//               last run is at-or-after its most-recent occurrence is NOT due.
//   triggerId — OPTIONAL. When supplied, the event-driven cadence trigger
//               whose required actions are due immediately; unknown =>
//               DENY_CADENCE_UNKNOWN, malformed => DENY_CADENCE_MALFORMED.
//
// Success shape (deep-frozen):
//   {
//     ok: true,
//     data_untrusted: true,            // lastRun / triggerId are caller data
//     evaluatedAt: <now>,              // echo of the injected clock
//     timezone: "Asia/Ho_Chi_Minh",
//     due: [                           // rhythm rows (doc order) then trigger
//       { kind: "rhythm", id, cadence, activity, requiredOutput,
//         resolution, scheduledFor },  // scheduledFor = occurrence UTC ms
//       { kind: "trigger", id, trigger, requiredAction, actions }
//     ],
//     findings: [                      // recognized-but-undecidable rows
//       { kind: "rhythm", id, code: "SCHEDULE_UNDERSPECIFIED", message }
//     ]
//   }
export function evaluateDueActions(input) {
  // Phase A — ATOMIC SNAPSHOT.
  const snap = snapshotInput(input);
  if (!snap.ok) {
    return deny("DENY_CADENCE_MALFORMED", snap.detail);
  }
  const { now, triggerId, runs } = snap;

  // Phase B — VALIDATE the snapshot (no further input reads past here).
  if (!isFiniteNonNegative(now)) {
    return deny(
      "DENY_CADENCE_MALFORMED",
      "now must be a finite non-negative number of UTC epoch milliseconds"
    );
  }
  for (const [id, value] of runs) {
    if (!RHYTHM_IDS.has(id)) {
      return deny("DENY_CADENCE_UNKNOWN", `lastRun key "${id}" is not an operating-rhythm id`);
    }
    if (!isFiniteNonNegative(value)) {
      return deny("DENY_CADENCE_MALFORMED", `lastRun["${id}"] must be a finite non-negative epoch-ms number`);
    }
  }
  let triggerEntry = null;
  if (triggerId !== undefined) {
    if (!isUsableId(triggerId)) {
      return deny("DENY_CADENCE_MALFORMED", "triggerId, when supplied, must be a non-blank string without null bytes");
    }
    if (!Object.hasOwn(TRIGGER_BY_ID, triggerId)) {
      return deny("DENY_CADENCE_UNKNOWN", `no cadence trigger is cataloged under id "${triggerId}"`);
    }
    triggerEntry = TRIGGER_BY_ID[triggerId];
  }

  // Phase C — DECIDE. Rhythm rows in doc order, then the trigger (if any).
  const due = [];
  const findings = [];
  for (const row of OPERATING_RHYTHM) {
    const occurrence = mostRecentOccurrence(row.schedule, now);
    if (occurrence === null) {
      findings.push({
        kind: "rhythm",
        id: row.id,
        code: "SCHEDULE_UNDERSPECIFIED",
        message: `"${row.cadence}" names no doctrine-decidable day/time; not machine-due without operator resolution`
      });
      continue;
    }
    const lastRun = runs.get(row.id);
    // Due unless a last run at-or-after the most-recent occurrence exists.
    if (lastRun !== undefined && lastRun >= occurrence) continue;
    due.push({
      kind: "rhythm",
      id: row.id,
      cadence: row.cadence,
      activity: row.activity,
      requiredOutput: row.requiredOutput,
      resolution: row.resolution,
      scheduledFor: occurrence
    });
  }
  if (triggerEntry) {
    due.push({
      kind: "trigger",
      id: triggerEntry.id,
      trigger: triggerEntry.trigger,
      requiredAction: triggerEntry.requiredAction,
      actions: [...triggerEntry.actions]
    });
  }

  return deepFreeze({
    ok: true,
    data_untrusted: true,
    evaluatedAt: now,
    timezone: TIMEZONE,
    due,
    findings
  });
}
