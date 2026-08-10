# Changelog

## 0.3.0 — 2026-08-10

- Rewrote the evaluation expectations of all 22 template skill packages. Every
  package stated the same ten strings; the prompts were skill-specific and the
  expectations were not. Each package's expectations now name that skill's own
  declared `Required outputs`, quoted, so the strings are the package's and a
  reader has something to look for.
- Corrected `evaluation.suite` in all 23 governed manifests. Each declared
  `evals/<skill-name>` while the file beside it was `evals/cases.yaml`, so every
  claim resolved to nothing — false in every package, which is why it read as
  normal.
- Gave every negative and adversarial arm an expectation asserting PRESENCE. The
  previous single expectation was an absence, and an empty run satisfies an
  absence vacuously, so the arm whose entire job is to show the skill declining
  could not fail.
- Audit effect, measured: VIOLATION 72 -> 3, UNDECIDABLE 186 -> 10. The three
  remaining violations are `governance.ungoverned-package` on the three packages
  that carry no manifest, and are unrelated to evaluations.
- `src/audit/calibration.mjs`: both repair arms retired and replaced. Repairing a
  defect that no longer exists changes nothing and scores as an undetected
  mutation, so `repair-eval-suite-path` and `repair-expectation-uniqueness`
  became `break-eval-suite-path` and `break-expectation-uniqueness` (detection),
  and a new `repair-ungoverned-package` keeps the repair arm on the defect this
  corpus still carries. The harness requires at least one repair arm: its own
  tests say a detection-only calibration cannot tell a working check from one
  that always fires.
- Status remains CANDIDATE / NOT EFFECTIVE.

## 0.2.0 — 2026-08-10

- Added `SECB-ARCH-023 maker-evidence-audit`: adversarial audit of a maker's own
  evidence and claims before the commit that makes them a candidate.
- Adapted from the bOPEN pack skill of the same name. The substance is carried
  over, including the observed failure distribution. Citations are re-pointed
  from `BOPEN-GOV-EBIV-001` §3/§8 and `BOPEN-ENG-LOOP-001` §5 — sections SecB's
  own copy does not contain — to `08-bopen-engineering-loop.md` §3.1 (Maker ≠
  Verifier assignment) and §3.4 (VERIFY), and to `SECB-AGENTS-AMD-004`'s
  non-authority clause. A skill citing a section its repository lacks teaches
  agents to cite things that do not exist.
- Status remains CANDIDATE / NOT EFFECTIVE; mutation class M0; the skill produces
  findings and is explicitly not an independent verification.

## 0.1.0 — 2026-07-22

- Initial 22-skill SecB Architecture Skills Pack.
- Added portable SKILL.md files, SecB manifests, Codex metadata, templates, evaluation cases, schemas, validators, installers, and source traceability.
- Status remains CANDIDATE / NOT EFFECTIVE.
