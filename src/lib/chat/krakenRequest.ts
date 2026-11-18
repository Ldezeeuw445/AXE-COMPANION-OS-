export function parseKrakenRequest(text: string) {
  if (!/\bkraken\b/i.test(text)) return null;
  const data = /order\s*(book|boek)|orderboek|diepte|depth/i.test(text)
    ? "orderbook"
    : /candles?|ohlc|kaarsen/i.test(text)
      ? "candles"
      : /prijs|koers|spread|quote|price|\bbid\b|\bask\b/i.test(text)
        ? "quote"
        : null;
  if (!data) return null;
  const explicit = text.match(/\b([a-z0-9]{2,12})\s*[/]\s*([a-z0-9]{2,12})\b/i);
  const compact = text.match(/\b(BTC|XBT|ETH|SOL|XRP|ADA|DOGE)(USDT|USDC|USD|EUR|GBP)\b/i);
  const match = explicit ?? compact;
  const pair = match ? (match[1] + "/" + match[2]).toUpperCase().replace(/^XBT\//, "BTC/") : null;
  const period = text.match(/\b(\d+)\s*-?\s*(min(?:uten?)?|m\b|uurs?|hours?|h\b|dagen|days?|d\b|weken|weeks?|w\b)/i);
  const unit = period?.[2].toLowerCase()[0];
  const minutes = { m: 1, u: 60, h: 60, d: 1440, w: 10080 };
  const interval = period && unit && unit in minutes
    ? Number(period[1]) * minutes[unit as keyof typeof minutes]
    : 60;
  return { pair, data, ...(data === "candles" ? { interval } : {}) };
}

type KrakenRequest = NonNullable<ReturnType<typeof parseKrakenRequest>>;
type Level = { price: string; quantity: string };
type Candle = { high: string; low: string; close: string };

export function formatKrakenReply(request: KrakenRequest, result: string | null): string {
  if (!request.pair) return "Welk Kraken Spot-paar bedoel je? Bijvoorbeeld BTC/USD of ETH/EUR.";
  const label = "Kraken Spot · " + request.pair;
  try {
    const envelope = JSON.parse(result ?? "null");
    const data = envelope?.data;
    if (envelope?.ok === true && data?.source === "Kraken Spot" && data.pair === request.pair) {
      if (request.data === "quote") {
        const { bid, ask, last } = data;
        if ([bid, ask, last].every(value => Number(value) > 0 && Number.isFinite(Number(value)))) {
          const spread = (Number(ask) - Number(bid)).toLocaleString("nl-NL", { maximumFractionDigits: 12 });
          return label + "\nBiedprijs: " + bid + "\nLaatprijs: " + ask + "\nLaatst verhandeld: " + last +
            "\nSpread: " + spread + " " + request.pair.split("/")[1];
        }
      }
      if (request.data === "orderbook" && Array.isArray(data.bids) && Array.isArray(data.asks)) {
        const levels = (rows: Level[]) => rows.map(row => "- " + row.price + " × " + row.quantity).join("\n");
        return label + "\n\nBiedniveaus (prijs × hoeveelheid)\n" + levels(data.bids) +
          "\n\nLaatniveaus (prijs × hoeveelheid)\n" + levels(data.asks);
      }
      if (request.data === "candles" && Array.isArray(data.candles) && data.candles.length > 0) {
        const candles: Candle[] = data.candles;
        return label + "\n" + candles.length + " gesloten candles van " + data.intervalMinutes +
          " minuten. Hoogste: " + Math.max(...candles.map(row => Number(row.high))) +
          ". Laagste: " + Math.min(...candles.map(row => Number(row.low))) +
          ". Laatste slot: " + candles.at(-1)?.close + ".";
      }
    }
  } catch {
    // Invalid upstream payload is unavailable.
  }
  return label + "\nIk kan deze Kraken-data momenteel niet ophalen.";
}
