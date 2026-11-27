import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FINANCE_CALENDAR_ATTRIBUTION_URL,
  SHARED_ECON_FRESH_MS,
  SHARED_ECON_SELECT,
  formatSurprise,
  loadSharedEconRows,
  mapSharedEconRow,
  pickFreshSharedEcon,
  type SharedEconRow,
} from "./sharedEconCalendar.ts";

const now = Date.parse("2026-12-10T14:00:00.000Z");

function row(partial: Partial<SharedEconRow> = {}): SharedEconRow {
  return {
    id: "fc:us-cpi-report-november-2026",
    title: "US CPI Report November 2026",
    name: "US CPI",
    country: "US",
    currency: "USD",
    impact: "high",
    status: "released",
    event_date: "2026-12-10",
    release_at: "2026-12-10T13:30:00+00:00",
    all_day: false,
    consensus: "2.9",
    prior: "3.0",
    actual: "3.1",
    surprise: "0.2",
    unit: "% y/y",
    event_url: "https://www.financecalendar.com/event/us-cpi-report-november-2026/",
    ingested_at: "2026-12-10T13:45:00.000Z",
    ...partial,
  };
}

describe("shared econ calendar (Trading OS econ_calendar_events)", () => {
  it("selects the read contract columns only", () => {
    assert.equal(
      SHARED_ECON_SELECT,
      "id,title,name,country,currency,impact,status,event_date,release_at,all_day,consensus,prior,actual,surprise,unit,event_url,ingested_at",
    );
    assert.equal(FINANCE_CALENDAR_ATTRIBUTION_URL, "https://www.financecalendar.com");
  });

  it("maps a released row with actual / consensus / prior / surprise", () => {
    const e = mapSharedEconRow(row());
    assert.ok(e);
    assert.equal(e.title, "US CPI");
    assert.equal(e.startsAt, "2026-12-10T13:30:00.000Z");
    assert.equal(e.actual, "3.1");
    assert.equal(e.forecast, "2.9");
    assert.equal(e.previous, "3.0");
    assert.equal(e.surprise, "0.2");
    assert.equal(e.provider, "financeCalendar");
    assert.equal(e.allDay, false);
    assert.equal(e.eventUrl, "https://www.financecalendar.com/event/us-cpi-report-november-2026/");
  });

  it("keeps nulls null and drops cancelled / broken rows", () => {
    const scheduled = mapSharedEconRow(row({ actual: null, surprise: null, status: "confirmed" }));
    assert.equal(scheduled?.actual, null);
    assert.equal(scheduled?.surprise, null);
    assert.equal(mapSharedEconRow(row({ status: "cancelled" })), null);
    assert.equal(mapSharedEconRow(row({ release_at: null, event_date: "" })), null);
    assert.equal(mapSharedEconRow(null), null);
    assert.equal(mapSharedEconRow(row({ impact: "extreme" }))?.impact, "unknown");
    assert.equal(mapSharedEconRow(row({ event_url: "javascript:alert(1)" }))?.eventUrl, null);
  });

  it("date-only rows start at 00:00 UTC and are allDay", () => {
    const e = mapSharedEconRow(row({ release_at: null, event_date: "2026-12-11" }));
    assert.equal(e?.startsAt, "2026-12-11T00:00:00.000Z");
    assert.equal(e?.allDay, true);
  });

  it("returns [] when the newest ingest is older than 2h (→ old calendar chain)", () => {
    const stale = new Date(now - SHARED_ECON_FRESH_MS - 60_000).toISOString();
    assert.deepEqual(pickFreshSharedEcon([row({ ingested_at: stale })], { nowMs: now, daysAhead: 5 }), []);
    assert.deepEqual(pickFreshSharedEcon([], { nowMs: now, daysAhead: 5 }), []);
    assert.deepEqual(pickFreshSharedEcon(null, { nowMs: now, daysAhead: 5 }), []);
  });

  it("hides rows the API stopped returning and rows outside the window, soonest first", () => {
    const rows = [
      row({ id: "fc:b", release_at: "2026-12-12T13:30:00Z" }),
      row({ id: "fc:a" }),
      row({ id: "fc:dropped", ingested_at: "2026-12-10T09:00:00.000Z" }),
      row({ id: "fc:far", release_at: "2026-12-30T13:30:00Z", event_date: "2026-12-30" }),
      row({ id: "fc:old", release_at: "2026-12-09T00:00:00Z", event_date: "2026-12-09" }),
    ];
    const out = pickFreshSharedEcon(rows, { nowMs: now, daysAhead: 5 });
    assert.deepEqual(out.map((e) => e.id), ["fc:a", "fc:b"]);
  });

  it("loadSharedEconRows: [] on error, missing client or throw; maps on success", async () => {
    assert.deepEqual(await loadSharedEconRows(null, { daysAhead: 5, nowMs: now }), []);
    const client = (result: { data: unknown[] | null; error: unknown } | Error) => ({
      from: (table: string) => {
        assert.equal(table, "econ_calendar_events");
        return {
          select: (cols: string) => {
            assert.equal(cols, SHARED_ECON_SELECT);
            return {
              gte: () => ({
                lte: () => ({
                  order: () => ({
                    limit: async () => {
                      if (result instanceof Error) throw result;
                      return result;
                    },
                  }),
                }),
              }),
            };
          },
        };
      },
    });
    assert.deepEqual(await loadSharedEconRows(client({ data: null, error: { code: "42P01" } }), { daysAhead: 5, nowMs: now }), []);
    assert.deepEqual(await loadSharedEconRows(client(new Error("network")), { daysAhead: 5, nowMs: now }), []);
    const ok = await loadSharedEconRows(client({ data: [row()], error: null }), { daysAhead: 5, nowMs: now });
    assert.equal(ok.length, 1);
    assert.equal(ok[0].actual, "3.1");
  });

  it("formats the surprise with a sign", () => {
    assert.equal(formatSurprise("0.2"), "+0.2");
    assert.equal(formatSurprise("-0.3"), "-0.3");
    assert.equal(formatSurprise(0), "0");
    assert.equal(formatSurprise("n/a"), null);
    assert.equal(formatSurprise(null), null);
  });
});
