import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FX_SESSIONS,
  clockLabel,
  formatCountdown,
  formatSessionStatusLine,
  nowMarkerPct,
  sessionClock,
  sessionTimelineBlocks,
} from "./sessionClock";

const byId = Object.fromEntries(FX_SESSIONS.map((s) => [s.id, s]));

describe("sessionClock", () => {
  it("marks London open at midday winter UTC and New York as soon", () => {
    const now = new Date("2026-11-26T12:00:00.000Z");
    const ldn = sessionClock(byId.ldn, now);
    const nyc = sessionClock(byId.nyc, now);
    const syd = sessionClock(byId.syd, now);
    const tyo = sessionClock(byId.tyo, now);

    assert.equal(ldn.status, "open");
    assert.equal(ldn.localTime, "12:00");
    assert.equal(ldn.minutesUntilClose, 4 * 60);

    assert.equal(nyc.status, "soon");
    assert.equal(nyc.localTime, "07:00");
    assert.equal(nyc.minutesUntilOpen, 60);

    assert.equal(syd.status, "closed");
    assert.equal(tyo.status, "closed");
  });

  it("treats Tokyo as open during its local cash session", () => {
    const now = new Date("2026-11-26T02:30:00.000Z");
    const tyo = sessionClock(byId.tyo, now);
    assert.equal(tyo.status, "open");
    assert.equal(tyo.localTime, "11:30");
  });

  it("formats countdowns and status lines", () => {
    assert.equal(formatCountdown(null), "");
    assert.equal(formatCountdown(9), "9m");
    assert.equal(formatCountdown(75), "1h 15m");
    const now = new Date("2026-11-26T12:00:00.000Z");
    const ldn = sessionClock(byId.ldn, now);
    assert.match(formatSessionStatusLine(byId.ldn, ldn), /Open/);
    const nyc = sessionClock(byId.nyc, now);
    assert.match(formatSessionStatusLine(byId.nyc, nyc), /Opens in/);
  });

  it("maps London hours onto a UTC 24h bar without wrapping in winter", () => {
    const now = new Date("2026-11-26T12:00:00.000Z");
    const blocks = sessionTimelineBlocks(byId.ldn, now, "UTC");
    assert.equal(blocks.length, 1);
    assert.ok(Math.abs(blocks[0].startPct - (8 / 24) * 100) < 0.2);
    assert.ok(Math.abs(blocks[0].widthPct - (8 / 24) * 100) < 0.2);
  });

  it("places the now marker from the view timezone", () => {
    const now = new Date("2026-11-26T12:00:00.000Z");
    assert.ok(Math.abs(nowMarkerPct(now, "UTC") - 50) < 0.2);
    const label = clockLabel(now, "UTC");
    assert.equal(label.time, "12:00:00");
    assert.match(label.zone, /UTC|GMT/);
  });
});
