/**
 * Het positie-gereedschap: wat deze trade kost, en wat hij met je limiet doet.
 *
 * Punt 14 van de rij. Sleep een entry, een stop en een target, en zie meteen
 * de R:R en het risico. Dat kan TradingView ook. Het punt waar Companion het
 * beter kan is de regel erna: daar staat "1,2% van je account", hier kan
 * staan "dat is 30% van wat je vandaag nog mag verliezen, en je hebt al de
 * helft op".
 *
 * Drie dingen maken het verschil tussen een getal en een antwoord:
 *
 * 1. **De limiet wordt niet vanaf je huidige equity gemeten.** Dit is de
 *    valkuil. `maxDailyLossPct` hangt aan een *basis* — het startkapitaal, de
 *    balans bij dagopening, een meelopende piek. Reken je 4% over de equity
 *    van nu, dan klopt het antwoord alleen op een dag dat je nog niets
 *    verloren hebt. Sta je 3% in de min, dan rekent die fout de ruimte 3% te
 *    klein en houdt de trader zich in terwijl het niet hoeft; sta je in de
 *    plus, dan rekent hij hem te groot en vliegt de trader eruit op een
 *    trade die het gereedschap goedkeurde.
 *
 * 2. **Twee limieten, en de kleinste telt.** De daglimiet kost een dag, de
 *    totale limiet kost het account. Een trade kan ruim binnen de dag passen
 *    en toch de laatste zijn.
 *
 * 3. **Onbekend is niet hetzelfde als onbeperkt.** `maxDailyLossPct` mag null
 *    zijn. Dan hoort er "niet bekend" te staan en geen stilzwijgend groen
 *    licht — dezelfde regel als in `provenance.ts`.
 *
 * Afhankelijkheidsvrij, zodat `scripts/verify-position-plan.mjs` het
 * rechtstreeks kan uitoefenen.
 */
import type { LossBasis } from "@/lib/risk/accountProfile";

export type PlanSide = "buy" | "sell";

export type PositionPlan = {
  side: PlanSide;
  entry: number;
  stop: number;
  /** Mag ontbreken: een plan zonder target heeft geen R:R maar wel risico. */
  target?: number | null;
  volumeLots: number;
  /** Rekenwaarde per prijseenheid per lot, uit `accountRiskBand`. */
  pointValuePerLot: number;
};

/** De bedragen waar een limiet vanaf gemeten kan worden. */
export type BasisAmounts = {
  initialBalance?: number | null;
  dayStartBalance?: number | null;
  dayStartEquity?: number | null;
  trailingEodBalance?: number | null;
  trailingPeakBalance?: number | null;
};

export type PlanAccount = BasisAmounts & {
  equity: number | null | undefined;
  /** Wat er vandaag al verloren is, in geld. Nul als er nog niets af is. */
  lostTodayMoney?: number | null;
  /** Wat er in totaal al onder de basis staat, in geld. */
  lostTotalMoney?: number | null;
};

export type PlanConstraints = {
  maxDailyLossPct: number | null;
  maxDailyLossBasis: LossBasis | null;
  maxTotalLossPct: number | null;
  maxTotalLossBasis: LossBasis | null;
  maxLot?: number | null;
};

export type LimitRoom = {
  kind: "daily" | "total";
  /** Waar is het niet op te rekenen: de limiet of de basis. */
  unknown: null | "limit" | "basis";
  limitPct: number | null;
  basis: LossBasis | null;
  basisAmount: number | null;
  /** Hoeveel er in totaal verloren mag worden voor de limiet raakt, in geld. */
  allowedLoss: number | null;
  alreadyLost: number;
  /** Wat er nog over is. Nooit negatief — daar is `breached` voor. */
  roomLeft: number | null;
  breached: boolean;
  /** Welk deel van de resterende ruimte deze trade opeet, in procent. */
  shareOfRoomPct: number | null;
  /** Of deze trade de limiet raakt als de stop geraakt wordt. */
  wouldBreach: boolean;
};

export type PositionPlanResult =
  | { ok: false; reason: PlanRefusal }
  | {
      ok: true;
      riskMoney: number;
      rewardMoney: number | null;
      /** Reward gedeeld door risk. Null zonder target. */
      rr: number | null;
      riskPctOfEquity: number | null;
      daily: LimitRoom;
      total: LimitRoom;
      /** De limiet die het eerst in de weg zit, of null als geen van beide bekend is. */
      binding: "daily" | "total" | null;
      /** Boven de maximale lotgrootte van de regels. */
      overMaxLot: boolean;
    };

export type PlanRefusal =
  | "stop_op_entry"
  | "stop_aan_de_verkeerde_kant"
  | "target_aan_de_verkeerde_kant"
  | "geen_volume"
  | "geen_rekenwaarde"
  | "onleesbare_prijzen";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Het bedrag waar een limiet vanaf gemeten wordt, of null als dat ontbreekt. */
export function amountForBasis(basis: LossBasis | null, amounts: BasisAmounts): number | null {
  if (!basis) return null;
  const byBasis: Record<LossBasis, number | null | undefined> = {
    initial_balance: amounts.initialBalance,
    day_start_balance: amounts.dayStartBalance,
    day_start_equity: amounts.dayStartEquity,
    trailing_eod_balance: amounts.trailingEodBalance,
    trailing_peak_balance: amounts.trailingPeakBalance,
  };
  const value = byBasis[basis];
  return finite(value) && value > 0 ? value : null;
}

function roomFor(
  kind: "daily" | "total",
  limitPct: number | null,
  basis: LossBasis | null,
  amounts: BasisAmounts,
  alreadyLostRaw: number | null | undefined,
  riskMoney: number,
): LimitRoom {
  const alreadyLost = finite(alreadyLostRaw) && alreadyLostRaw > 0 ? alreadyLostRaw : 0;
  const basisAmount = amountForBasis(basis, amounts);

  // Onbekend is niet onbeperkt. Zonder limiet of zonder basis valt er niets
  // te zeggen, en dan hoort er niets gezegd te worden.
  if (!finite(limitPct) || limitPct <= 0) {
    return {
      kind, unknown: "limit", limitPct: null, basis, basisAmount,
      allowedLoss: null, alreadyLost, roomLeft: null, breached: false,
      shareOfRoomPct: null, wouldBreach: false,
    };
  }
  if (basisAmount === null) {
    return {
      kind, unknown: "basis", limitPct, basis, basisAmount: null,
      allowedLoss: null, alreadyLost, roomLeft: null, breached: false,
      shareOfRoomPct: null, wouldBreach: false,
    };
  }

  const allowedLoss = (basisAmount * limitPct) / 100;
  const over = alreadyLost >= allowedLoss;
  const roomLeft = Math.max(0, allowedLoss - alreadyLost);

  return {
    kind,
    unknown: null,
    limitPct,
    basis,
    basisAmount,
    allowedLoss,
    alreadyLost,
    roomLeft,
    breached: over,
    // Al over de limiet: dan is elk bedrag oneindig veel van wat er over is.
    // Null in plaats van een getal, want 100% zou suggereren dat het nog net
    // past.
    shareOfRoomPct: over ? null : roomLeft > 0 ? (riskMoney / roomLeft) * 100 : null,
    wouldBreach: over || alreadyLost + riskMoney >= allowedLoss,
  };
}

/**
 * Reken een gepland plan door.
 *
 * Weigert in plaats van te rekenen zodra het plan zelf niet klopt. Een long
 * met de stop boven de entry is geen trade met een rare R:R — het is geen
 * trade, en er een getal bij zetten is hoe een gereedschap onzin aanleert.
 */
export function evaluatePositionPlan(
  plan: PositionPlan,
  account: PlanAccount,
  constraints: PlanConstraints,
): PositionPlanResult {
  const { side, entry, stop, volumeLots, pointValuePerLot } = plan;
  const target = plan.target ?? null;

  if (!finite(entry) || !finite(stop)) return { ok: false, reason: "onleesbare_prijzen" };
  if (target !== null && !finite(target)) return { ok: false, reason: "onleesbare_prijzen" };
  if (!finite(volumeLots) || volumeLots <= 0) return { ok: false, reason: "geen_volume" };
  if (!finite(pointValuePerLot) || pointValuePerLot <= 0) return { ok: false, reason: "geen_rekenwaarde" };
  if (entry === stop) return { ok: false, reason: "stop_op_entry" };

  const stopFout = side === "buy" ? stop > entry : stop < entry;
  if (stopFout) return { ok: false, reason: "stop_aan_de_verkeerde_kant" };

  if (target !== null) {
    const targetFout = side === "buy" ? target <= entry : target >= entry;
    if (targetFout) return { ok: false, reason: "target_aan_de_verkeerde_kant" };
  }

  const riskMoney = Math.abs(entry - stop) * pointValuePerLot * volumeLots;
  const rewardMoney = target === null ? null : Math.abs(target - entry) * pointValuePerLot * volumeLots;
  const rr = rewardMoney === null || riskMoney <= 0 ? null : rewardMoney / riskMoney;

  const equity = account.equity;
  const riskPctOfEquity = finite(equity) && equity > 0 ? (riskMoney / equity) * 100 : null;

  const daily = roomFor(
    "daily",
    constraints.maxDailyLossPct,
    constraints.maxDailyLossBasis,
    account,
    account.lostTodayMoney,
    riskMoney,
  );
  const total = roomFor(
    "total",
    constraints.maxTotalLossPct,
    constraints.maxTotalLossBasis,
    account,
    account.lostTotalMoney,
    riskMoney,
  );

  // De limiet die het eerst in de weg zit is die met de minste ruimte, niet
  // die met het laagste percentage: een totale limiet van 10% kan krapper
  // zijn dan een daglimiet van 4% als er al veel vanaf is.
  let binding: "daily" | "total" | null = null;
  if (daily.roomLeft !== null && total.roomLeft !== null) {
    binding = total.roomLeft < daily.roomLeft ? "total" : "daily";
  } else if (daily.roomLeft !== null) binding = "daily";
  else if (total.roomLeft !== null) binding = "total";

  const maxLot = constraints.maxLot;
  const overMaxLot = finite(maxLot) && maxLot > 0 ? volumeLots > maxLot : false;

  return { ok: true, riskMoney, rewardMoney, rr, riskPctOfEquity, daily, total, binding, overMaxLot };
}
