import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { brokerDayKey, brokerDayStart, resolveSessionZone } from "./sessionDay";

describe("brokerDayStart", () => {
  it("uses Europe/Athens midnight across the EEST→EET switch", () => {
    // 2026-10-25 is the EU DST fall-back Sunday. Before the switch Athens is
    // UTC+3; after, UTC+2.
    const before = new Date("2026-10-24T12:00:00Z"); // still EEST
    const after = new Date("2026-10-26T12:00:00Z"); // EET

    const startBefore = brokerDayStart(before, "Europe/Athens");
    const startAfter = brokerDayStart(after, "Europe/Athens");

    assert.equal(brokerDayKey(before, "Europe/Athens"), "2026-10-24");
    assert.equal(brokerDayKey(after, "Europe/Athens"), "2026-10-26");

    // Local midnight should format back to 00:00 on that day in Athens.
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Athens",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(d);

    assert.match(fmt(startBefore), /2026-10-24, 00:00/);
    assert.match(fmt(startAfter), /2026-10-26, 00:00/);

    // 23:30 vs 00:30 server time land on opposite days.
    const late = new Date("2026-10-24T20:30:00Z"); // 23:30 Athens (UTC+3)
    const early = new Date("2026-10-24T21:30:00Z"); // 00:30 Athens next day
    assert.equal(brokerDayKey(late, "Europe/Athens"), "2026-10-24");
    assert.equal(brokerDayKey(early, "Europe/Athens"), "2026-10-25");
    assert.ok(brokerDayStart(early, "Europe/Athens").getTime() > brokerDayStart(late, "Europe/Athens").getTime());
  });

  it("honours a non-midnight reset by rolling back before the clock", () => {
    // 10:00 Athens on a winter day — reset at 17:00 means the open trading
    // day still started yesterday at 17:00.
    const morning = new Date("2026-11-16T08:00:00Z"); // 10:00 Athens (UTC+2)
    const start = brokerDayStart(morning, "Europe/Athens", "17:00");
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Athens",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(start);
    assert.match(local, /2026-11-15, 17:00/);
  });

  it("defaults unknown broker zones to Athens", () => {
    assert.equal(resolveSessionZone(null), "Europe/Athens");
    assert.equal(resolveSessionZone("EET"), "Europe/Athens");
  });
});
