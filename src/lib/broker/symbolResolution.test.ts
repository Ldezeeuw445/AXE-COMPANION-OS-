import assert from "node:assert/strict";
import { test } from "node:test";
import {
  brokerSymbolMatchesDisplay,
  cleanDisplaySymbol,
  isDecoratedForm,
  resolveBrokerSymbol,
} from "./symbolResolution";
import { buildBrokerSymbolRuntimeMetadata, getMetadataSymbolMap } from "./brokerSymbolRuntime";

// Part of Luka's Upcomers symbol list (25 Nov 2026): stocks with one- and
// two-letter tickers next to the oil, crypto and FX names.
const UPCOMERS = [
  "UKOIL.c", "USOIL.c", "KO", "D", "SO", "U", "O", "K", "A", "AA", "AAP", "L",
  "XAUUSD", "GOLD", "BTCEUR.nx", "BTCUSD.nx", "ETHEUR.nx", "ETHUSD.nx",
  "EURUSD", "GBPUSD", "AAPL",
];

function resolved(display: string, universe = UPCOMERS): string | null {
  const r = resolveBrokerSymbol(cleanDisplaySymbol(display) || display, universe);
  return r.reason === "fallback_request" ? null : r.brokerSymbol;
}

test("UKOUSD and USOUSD are oil, not the Coca-Cola and Dominion stocks", () => {
  assert.equal(cleanDisplaySymbol("UKOUSD"), "BRENT");
  assert.equal(cleanDisplaySymbol("USOUSD"), "WTI");
  assert.equal(resolved("UKOUSD"), "UKOIL.c");
  assert.equal(resolved("USOUSD"), "USOIL.c");
  assert.equal(resolved("BRENT"), "UKOIL.c");
  assert.equal(resolved("WTI"), "USOIL.c");
});

test("a name the broker does not offer stays unresolved instead of matching a short ticker inside it", () => {
  const noOil = UPCOMERS.filter((s) => !s.includes("OIL"));
  assert.equal(resolved("UKOUSD", noOil), null);
  assert.equal(resolved("USOUSD", noOil), null);
});

test("ordinary names still resolve, decorated or exact", () => {
  assert.equal(resolved("XAUUSD"), "XAUUSD");
  assert.equal(resolved("EURUSD"), "EURUSD");
  assert.equal(resolved("AAPL"), "AAPL");
  assert.equal(resolved("BTCUSD"), "BTCUSD.nx");
  assert.equal(resolved("ETHUSD"), "ETHUSD.nx");
  assert.equal(resolved("KO"), "KO");
  assert.equal(resolved("EURUSD", ["EURUSD.c", "EURGBP.c"]), "EURUSD.c");
  assert.equal(resolved("XAUUSD", ["#XAUUSD", "XAUEUR"]), "#XAUUSD");
  assert.equal(resolved("XAUUSD", ["GOLDm"]), "GOLDm");
  assert.equal(resolved("EURUSD", ["EURUSD.micro"]), "EURUSD.micro");
});

test("bitcoin in euros is not bitcoin in dollars", () => {
  assert.equal(resolved("BTCUSD", ["BTCEUR.nx", "ETHUSD.nx"]), null);
  assert.equal(isDecoratedForm("BTCEUR.nx", "BTC"), false);
  assert.equal(isDecoratedForm("AAPLEUR.nx", "AAPL"), false);
  assert.equal(isDecoratedForm("XAUUSDEUR", "XAUUSD"), false);
});

test("the same instrument quoted in dollars still matches", () => {
  assert.equal(isDecoratedForm("BTCUSD.nx", "BTC"), true);
  assert.equal(isDecoratedForm("NAS100USD", "NAS100"), true);
  assert.equal(resolved("NAS100", ["NAS100USD", "NAS100EUR"]), "NAS100USD");
});

test("decorated forms", () => {
  assert.equal(isDecoratedForm("USOIL.c", "USOIL"), true);
  assert.equal(isDecoratedForm("#AAPL", "AAPL"), true);
  assert.equal(isDecoratedForm("BTCUSD.nx", "BTCUSD"), true);
  assert.equal(isDecoratedForm("KO", "UKOUSD"), false);
  assert.equal(isDecoratedForm("D", "USOUSD"), false);
  assert.equal(isDecoratedForm("DOCU", "D"), false);
  assert.equal(brokerSymbolMatchesDisplay("BRENT", "UKOIL.c"), true);
  assert.equal(brokerSymbolMatchesDisplay("BRENT", "KO"), false);
});

test("a saved mapping to another instrument is dropped and resolved again", () => {
  const saved = {
    symbol_map: { UKOUSD: "KO", USOUSD: "D", BRENT: "UKOIL.c", "USOIL.C": "USOIL.c", KO: "KO" },
    symbol_resolution_report: {
      UKOUSD: { displaySymbol: "UKOUSD", brokerSymbol: "KO", resolved: true, reason: "cached_match" },
    },
  };
  const map = getMetadataSymbolMap(saved);
  assert.equal(map.BRENT, "UKOIL.c");
  assert.equal(map.WTI, "USOIL.c");
  assert.equal(map.KO, "KO");
  assert.ok(!Object.values(map).includes("D"));

  const built = buildBrokerSymbolRuntimeMetadata({
    existingMetadata: saved,
    knownSymbols: UPCOMERS,
    displaySymbols: ["UKOUSD", "USOUSD"],
    now: "2026-11-25T20:00:00.000Z",
  });
  assert.equal(built.symbol_map.BRENT, "UKOIL.c");
  assert.equal(built.symbol_map.WTI, "USOIL.c");
  assert.equal(built.symbol_resolution_report.UKOUSD, undefined);
  assert.ok(!Object.entries(built.symbol_map).some(([k, v]) => k !== "KO" && v === "KO"));
});
