/**
 * Why AXE says what it says, and why an order it cannot explain must not go.
 *
 * Luka, 28 October 2026: *"hoe kunnen nu zorgen en kijken dat axe ook echt
 * trade zet en waarom zet hij die trades en waar haalt hij de ideeen vandaan?"*
 *
 * The autonomy ladder already stops AXE placing orders it was not trusted
 * with. It had nothing to say about orders it could not justify. These checks
 * hold the line that `provenance.ts` draws: an untested rule may not sound
 * tested, and nothing that touches an order travels without a readable reason.
 *
 * Run: node scripts/verify-provenance.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EVIDENCE_STALE_HOURS,
  MIN_TRACK_ATTEMPTS,
  PROVENANCE_SOURCES,
  PROVENANCE_SOURCE_LABEL,
  evidenceAgeHours,
  isProvenanceSource,
  provenanceBlocks,
  provenanceGaps,
  renderProvenance,
  renderTrack,
} from "../src/lib/axe/provenance.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const NOW = new Date("2026-10-28T12:00:00.000Z");
const FRESH = "2026-10-28T11:30:00.000Z";

/** A complete, honest provenance. Every case below starts from this. */
const good = (over = {}) => ({
  source: "own-trades",
  rule: "Your London XAUUSD longs beat your own average by more than half again",
  evidence: {
    label: "Closed London XAUUSD longs",
    value: "14 trades, 64% won, +18.40 each",
  },
  track: { tried: 14, held: 9 },
  observedAt: FRESH,
  ...over,
});

check("every source has a label that introduces itself to a trader", () => {
  assert.ok(PROVENANCE_SOURCES.length >= 8, "the sources AXE actually reads from");
  for (const source of PROVENANCE_SOURCES) {
    const label = PROVENANCE_SOURCE_LABEL[source];
    assert.ok(label, `${source} has no label`);
    assert.ok(
      /^From /.test(label),
      `"${label}" should answer "who says so", so it starts with From`,
    );
    assert.ok(label.length > 10, `"${label}" is too terse to mean anything`);
  }
  assert.equal(
    new Set(Object.values(PROVENANCE_SOURCE_LABEL)).size,
    PROVENANCE_SOURCES.length,
    "two sources sharing a label makes them impossible to switch off separately",
  );
});

check("a source outside the list is not a source", () => {
  assert.equal(isProvenanceSource("own-trades"), true);
  assert.equal(isProvenanceSource("vibes"), false);
  assert.equal(isProvenanceSource(""), false);
  assert.equal(isProvenanceSource(null), false);
});

check("a rule that was never tested says so, out loud", () => {
  // The failure this prevents: leaving the track record out when there is
  // none, so the line reads as though nothing were wrong with it.
  assert.equal(renderTrack(null), "not tested yet");
  assert.equal(renderTrack({ tried: 0, held: 0 }), "not tested yet");
  assert.ok(renderTrack(null).length > 0, "silence here reads as approval");
});

check("too few attempts are reported as counts, never as a percentage", () => {
  const thin = renderTrack({ tried: 3, held: 2 });
  assert.ok(/2 of 3/.test(thin), `expected counts, got "${thin}"`);
  assert.ok(!/%/.test(thin), `"${thin}" dresses three trades up as a rate`);

  // At the floor it may start rounding, because by then it means something.
  const solid = renderTrack({ tried: MIN_TRACK_ATTEMPTS, held: 4 });
  assert.ok(/%/.test(solid), `at ${MIN_TRACK_ATTEMPTS} attempts a rate is fair: "${solid}"`);
  assert.ok(/of 8 times/.test(solid), "the sample size stays visible next to the rate");
});

check("the track record cannot claim more wins than attempts", () => {
  assert.ok(provenanceGaps(good({ track: { tried: 4, held: 9 } }), NOW).length > 0);
  assert.equal(renderTrack({ tried: 4, held: 9 }), "held 4 of 4 times so far");
});

check("a complete provenance has nothing missing", () => {
  assert.deepEqual(provenanceGaps(good(), NOW), []);
});

check("empty strings do not satisfy the type's promises", () => {
  assert.ok(provenanceGaps(good({ rule: "   " }), NOW).some((g) => /which rule/.test(g)));
  assert.ok(
    provenanceGaps(good({ evidence: { label: "", value: "14 trades" } }), NOW).some((g) =>
      /what was measured/.test(g),
    ),
  );
  assert.ok(
    provenanceGaps(good({ evidence: { label: "Closed trades", value: " " } }), NOW).some((g) =>
      /number it rests on/.test(g),
    ),
  );
});

check("a category is not a rule", () => {
  for (const word of ["signal", "Setup", "PATTERN", "analysis"]) {
    const gaps = provenanceGaps(good({ rule: word }), NOW);
    assert.ok(
      gaps.some((g) => /names a category/.test(g)),
      `"${word}" passed as a rule`,
    );
  }
  assert.deepEqual(
    provenanceGaps(good({ rule: "Spread on XAUUSD is above your 90-day median" }), NOW),
    [],
    "a real rule is not caught by the category test",
  );
});

check("evidence with no readable timestamp is a gap, not a guess", () => {
  assert.equal(evidenceAgeHours("not a date", NOW), null);
  assert.equal(evidenceAgeHours("2026-10-28T18:00:00.000Z", NOW), null, "the future is not an age");
  assert.equal(evidenceAgeHours(FRESH, NOW), 0.5);
  assert.ok(
    provenanceGaps(good({ observedAt: "whenever" }), NOW).some((g) => /when the evidence/.test(g)),
  );
});

check("stale evidence says how old it is; fresh evidence does not clutter the line", () => {
  const fresh = renderProvenance(good(), NOW);
  assert.ok(!/ago/.test(fresh), `fresh evidence should not apologise: "${fresh}"`);

  const old = new Date(NOW.getTime() - (EVIDENCE_STALE_HOURS + 60) * 3_600_000).toISOString();
  const line = renderProvenance(good({ observedAt: old }), NOW);
  assert.ok(/ago/.test(line), `${EVIDENCE_STALE_HOURS}h+ old evidence must date itself: "${line}"`);
});

check("the line answers who says so, on what, and how often it was right", () => {
  const line = renderProvenance(good(), NOW);
  assert.ok(line.startsWith("From your own closed trades"), `"${line}" buries the source`);
  assert.ok(/London XAUUSD longs/.test(line), "the rule survives into the line");
  assert.ok(/14 trades, 64% won/.test(line), "the number survives into the line");
  assert.ok(/held 64% of 14 times/.test(line), "the track record is the last thing read");
});

check("an untested rule carries that admission all the way into the line", () => {
  const line = renderProvenance(good({ track: null }), NOW);
  assert.ok(
    /not tested yet/.test(line),
    `the trader has to see this before acting on it: "${line}"`,
  );
});

check("suggesting is free; preparing and placing are not", () => {
  // The whole point of the file. A suggestion is read by someone who is right
  // there. An order is not.
  assert.deepEqual(provenanceBlocks("suggest", null, NOW), []);

  const noProv = provenanceBlocks("prepare", null, NOW);
  assert.ok(noProv.length > 0, "an order with no reason at all must be blocked");
  assert.ok(/cannot explain/.test(noProv[0]));

  assert.ok(provenanceBlocks("place", null, NOW).length > 0, "and placing even more so");
  assert.deepEqual(provenanceBlocks("place", good(), NOW), [], "a sound reason lets it through");
});

check("a broken reason blocks the order, not just the sentence", () => {
  // This is the one that matters in practice: provenance that exists, looks
  // filled in, and is hollow. It must stop the order, not decorate it.
  const hollow = good({ rule: "signal", evidence: { label: "", value: "" } });
  const blocked = provenanceBlocks("prepare", hollow, NOW);
  assert.ok(blocked.length >= 3, `expected several complaints, got ${JSON.stringify(blocked)}`);
  assert.deepEqual(provenanceBlocks("suggest", hollow, NOW), [], "but it may still be said aloud");
});

check("provenance is readable by the trader, not by a developer", () => {
  const line = renderProvenance(good(), NOW);
  assert.ok(!/[_{}]|=>|null|undefined/.test(line), `"${line}" leaks code into the UI`);
  assert.ok(line.split(" · ").length >= 4, "source, rule, evidence and track are all present");
});

check("the watcher actually sends provenance, so this is not dead code", () => {
  // A layer nothing fills in is worse than no layer: it reads as though every
  // idea were explained. The playbook edge is the first source wired through.
  const watcher = read("src/services/axeProactiveWatcher.ts");
  assert.ok(
    /tradeHistoryProvenance\(/.test(watcher),
    "the playbook-edge notice has to carry its reasoning",
  );
  assert.ok(
    /trades: edge\.trades/.test(watcher) && /wins: edge\.wins/.test(watcher),
    "and the track record must be the real counts, not a literal",
  );
  assert.ok(
    /value: edge\.evidence/.test(watcher),
    "the evidence is the same sentence the notice is built from, not a retelling",
  );
});

check("a notice can carry provenance without the notice module gaining a dependency", () => {
  const notice = read("src/lib/axe/notice.ts");
  assert.ok(/provenance\?: Provenance \| null/.test(notice), "the field exists");
  assert.ok(
    /import type \{ Provenance \}/.test(notice),
    "type-only, so this stays runnable without a bundler",
  );
  assert.ok(
    !/^import \{/m.test(notice),
    "a value import here would break the verify suite's direct execution",
  );
});

console.log(`\n${passed} checks passed`);
