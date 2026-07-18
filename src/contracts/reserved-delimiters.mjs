// GOV-P011-08 (ratified 2026-07-19): system-wide reserved composite-key
// delimiters, denied in every id field of every service. Five instances
// of this finding class were found one at a time (IMM-P009-01 '|', the
// skill-registry '@', the work-package objectId '@', and the
// AuthorityEngine SoD scope key '|'); services import this single list
// so a sixth rediscovery is structurally impossible.

export const RESERVED_ID_DELIMITERS = Object.freeze(["|", "@"]);

export function findReservedDelimiter(value) {
  if (typeof value !== "string") return null;
  return RESERVED_ID_DELIMITERS.find((delimiter) => value.includes(delimiter)) ?? null;
}
