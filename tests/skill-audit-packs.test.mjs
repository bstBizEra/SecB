/**
 * AC-AUDIT-03 — evidence packs and lens scoring.
 *
 * The lens layer has no `selfTest` gate: a lens is an agent, not a function, so
 * the runner cannot execute its controls. That makes THIS suite the only
 * mechanical guard on the layer, and it has two jobs:
 *
 *   1. Prove a pack cannot leak what a blind run must not see — the answer key,
 *      and the deterministic checks' verdicts. A lens shown the answers restates
 *      them, and its agreement then reads as corroboration when it is an echo.
 *   2. Prove `scoreLensRun` can report a MISS. A scorer that always credits the
 *      lens licenses whatever it was pointed at, which is the same failure the
 *      calibration gate exists to prevent one level down.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { loadCorpus } from "../src/audit/corpus.mjs";
import { plant, MUTATIONS } from "../src/audit/calibration.mjs";
import { emitPacks, scoreLensRun, LENSES } from "../src/audit/packs.mjs";

const SEED = "packs-test-seed";

function planted() {
  const { corpus, key } = plant(loadCorpus(), { seed: SEED, count: MUTATIONS.length });
  return { corpus, key, packs: emitPacks(corpus, { ref: "test" }) };
}

describe("AC-AUDIT-03 — a pack cannot leak what a blind run must not see", () => {
  it("contains no mutation identifier from the answer key", () => {
    const { key, packs } = planted();
    const blob = JSON.stringify(packs);
    const leaked = [...new Set(key.map((k) => k.mutation))].filter((id) => blob.includes(id));
    assert.deepEqual(leaked, [], "a lens that can read the answer key is not blind");
  });

  it("contains no deterministic finding — no check id, observation or verdict field", () => {
    const { packs } = planted();
    for (const pack of packs) {
      const data = JSON.stringify(pack.packages);
      for (const forbidden of ['"check"', '"observation"', '"verdict"', '"evidence"']) {
        assert.ok(!data.includes(forbidden),
          `${pack.lens} carries ${forbidden}: a lens shown the answers corroborates nothing`);
      }
    }
  });

  it("names its own ref and frame, so a finding can say what it was derived against", () => {
    // The omission that closed SECB-PRD-SKILLSHUB-001 was a claim with no ref.
    for (const pack of emitPacks(loadCorpus(), { ref: "abc1234" })) {
      assert.equal(pack.ref, "abc1234");
      assert.ok(pack.frame && pack.frame.length > 0);
      assert.ok(pack.rules.length >= 4);
    }
  });
});

describe("AC-AUDIT-03 — no two packs are alike, and one works from a different frame", () => {
  it("every pack carries a distinct evidence set", () => {
    const packs = emitPacks(loadCorpus(), { ref: "t" });
    const shapes = new Set(packs.map((p) => JSON.stringify(p.packages)));
    assert.equal(shapes.size, packs.length,
      "identical slices reproduce a shared blind spot, which is what this criterion exists to prevent");
  });

  it("at least one lens is given no specification at all", () => {
    // Slices of one frame all answer the same question. The sibling lens is the
    // structural defence: it is asked which package is unlike the others, which
    // a lens reasoning from a spec cannot ask, because a spec also tells you
    // what NOT to look for.
    const corpus = loadCorpus();
    const pack = emitPacks(corpus, { ref: "t" }).find((p) => p.lens === "sibling");

    // Asserted on the EMITTED pack, not on the lens definition. A frame may be a
    // function of the corpus, and what a lens actually receives is the resolved
    // string -- checking the definition would pass on a function that resolves to
    // anything at all.
    assert.match(pack.frame, /no specification/i);

    // The sibling count is DERIVED and asserted against the corpus. It used to be
    // the literal "24 siblings" while the corpus held 23 packages, so the one
    // lens whose whole method is comparing a package to its siblings was told the
    // wrong number of them. Nothing reads a frame string for accuracy, which is
    // why it went stale twice unnoticed.
    assert.match(pack.frame, new RegExp((corpus.packages.length - 1) + " siblings"));

    const sample = pack.packages[0];
    assert.equal(sample.skill_text, undefined, "the sibling lens must not receive prose");
    assert.ok(Array.isArray(sample.skill_sections), "it receives structure instead");
  });

  it("a lens receives only its declared slice", () => {
    const packs = emitPacks(loadCorpus(), { ref: "t" });
    const authority = packs.find((p) => p.lens === "authority").packages[0];
    assert.equal(authority.skill_text, undefined, "authority must not see the whole document");
    assert.equal(authority.manifest_declares.version, undefined,
      "authority has no version field, which is why it is not scored on drop-identity-field");

    const content = packs.find((p) => p.lens === "content").packages[0];
    assert.equal(content.manifest_declares, undefined, "content must not see roles or ceiling");
    assert.ok(typeof content.skill_text === "string");
  });
});

describe("AC-AUDIT-03 — the scorer can report a miss", () => {
  // The load-bearing tests. Without these the suite above proves only that packs
  // are well-formed, not that scoring means anything.

  const found = (key, mutation) => {
    const entry = key.find((k) => k.mutation === mutation);
    return [{ pkg: entry.package, file: null, line: null, verdict: "VIOLATION", observation: "x" }];
  };

  it("credits a lens that found the planted package", () => {
    const { key } = planted();
    const r = scoreLensRun({
      key, lens: "authority",
      canReveal: ["claim-prohibited-authority"],
      findings: found(key, "claim-prohibited-authority")
    });
    assert.equal(r.planted, 1);
    assert.equal(r.caught, 1);
    assert.deepEqual(r.missedClasses, []);
  });

  it("reports a miss when the lens found nothing", () => {
    const { key } = planted();
    const r = scoreLensRun({ key, lens: "authority", canReveal: ["claim-prohibited-authority"], findings: [] });
    assert.equal(r.caught, 0);
    assert.deepEqual(r.missedClasses, ["claim-prohibited-authority"]);
  });

  it("does not credit a lens for a package it merely returned NO_EVIDENCE on", () => {
    // Otherwise emitting NO_EVIDENCE for all 25 packages would score a perfect
    // detection rate — the same trap the calibration's repair arm catches.
    const { key } = planted();
    const entry = key.find((k) => k.mutation === "claim-prohibited-authority");
    const r = scoreLensRun({
      key, lens: "authority", canReveal: ["claim-prohibited-authority"],
      findings: [{ pkg: entry.package, file: null, line: null, verdict: "NO_EVIDENCE", observation: "x" }]
    });
    assert.equal(r.caught, 0);
  });

  it("records a lens that flags packages nothing was planted in", () => {
    // A lens flagging everything scores perfectly on detection and is useless.
    const { key, corpus } = planted();
    const unplanted = corpus.packages.map((p) => p.name).filter((n) => !key.some((k) => k.package === n));
    const r = scoreLensRun({
      key, lens: "authority", canReveal: ["claim-prohibited-authority"],
      findings: [
        ...found(key, "claim-prohibited-authority"),
        ...unplanted.slice(0, 3).map((pkg) => ({ pkg, file: null, line: null, verdict: "VIOLATION", observation: "x" }))
      ]
    });
    assert.equal(r.caught, 1, "it did find the planted one");
    assert.equal(r.flaggedUnplanted.length, 3, "and it flagged three it should not have");
  });
});

describe("AC-AUDIT-03 — scoring is slice-aware", () => {
  it("does not grade a lens on evidence deliberately withheld from it", () => {
    // The authority slice carries no version field. Counting drop-identity-field
    // as a miss would measure the slice, not the lens.
    const { key } = planted();
    const r = scoreLensRun({ key, lens: "authority", canReveal: ["claim-prohibited-authority"], findings: [] });
    assert.ok(r.outOfSlice.includes("drop-identity-field"));
    assert.ok(!r.missedClasses.includes("drop-identity-field"));
  });

  it("every declared canReveal entry is a real mutation id", () => {
    // A typo would silently shrink a lens's denominator and inflate its rate.
    const ids = new Set(MUTATIONS.map((m) => m.id));
    for (const lens of LENSES) {
      for (const id of lens.canReveal) {
        assert.ok(ids.has(id), `${lens.id} declares unknown mutation ${id}`);
      }
    }
  });

  it("carries the one-run caveat in the result rather than only in prose", () => {
    const { key } = planted();
    const r = scoreLensRun({ key, lens: "authority", canReveal: ["claim-prohibited-authority"], findings: [] });
    assert.match(r.note, /rate needs N runs|one run/i,
      "an agent is non-deterministic; a single run is an anecdote and the result must say so");
  });
});
