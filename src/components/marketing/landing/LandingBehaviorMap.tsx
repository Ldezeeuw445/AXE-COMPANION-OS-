/**
 * ZONDER de twee telefoon-mockups uit Luka's bestand, met reden.
 *
 * `figma-assets/images/behavior-phone-left-transparent.png` toont in zijn
 * eigen screenshot een blok "Market Tide: Bearish sentiment ... (Data Basis:
 * Market Tide)". `marketTide` staat in INTEL_ACTION_SOURCE als
 * `unusual_whales`, en dat abonnement is nooit gekocht — het is precies de
 * claim die op 12 oktober van de pagina is gehaald en waar
 * `verify-landing-claims` sindsdien op let. Die check leest de paginatekst,
 * dus een claim die in een PNG gebakken zit glipt erlangs. Een plaatje is
 * geen uitzondering op de regel.
 *
 * De rechter (`behavior-phone-right-transparent.png`) somt zes verbeteringen
 * op die AXE zichzelf voorstelt — "Advanced Sentiment Analysis ... including
 * social media trends", "Machine Learning Insights: predictive analytics",
 * "Broader Asset Coverage". Als appscherm op een verkooppagina leest een
 * bezoeker dat als functies. Ze bestaan geen van alle.
 *
 * Allebei kunnen terug zodra er schermafbeeldingen zijn van schermen die
 * alleen tonen wat er is. Dat staat in docs/VOOR-LUKA.md.
 */

/**
 * De behavior map: twee telefoons op één plaat, met de cockpit ernaast.
 *
 * Uit Luka's final-landing-v2-enhanced.html. De cijfers hieronder zijn
 * voorbeeldcijfers — 75% alignment, New York 60%, XAUUSD 80% — en dat moet
 * ook zo op het scherm staan. Dat is geen vormfout maar de regel: de pagina
 * stond eerder vol met verzonnen prijzen en een provider die nooit gekocht
 * is, en `verify-landing-claims` houdt sindsdien vast dat een voorbeeld een
 * voorbeeld heet. Hetzelfde `data-landing-cockpit-example` als de cockpit,
 * zodat één check beide dekt en een nieuwe sectie niet langs de controle
 * glipt.
 *
 * Wat eromheen staat is wél waar: de map wordt gebouwd uit je eigen MT5-fills,
 * niet uit iets dat wij verzinnen.
 */

const SESSIES = [
  { naam: "New York", deel: 60 },
  { naam: "London", deel: 30 },
  { naam: "Asia", deel: 10 },
] as const;

const INSTRUMENTEN = [
  { naam: "XAUUSD", deel: 80 },
  { naam: "BTCUSD", deel: 20 },
] as const;

const PATRONEN = [
  { naam: "Breakout", score: 85, deel: 72 },
  { naam: "Consolidation", score: 70, deel: 58 },
] as const;

/** Waar de map vandaan komt. Alledrie bestaan ze; niets hiervan is belofte. */
const BOUWSTENEN = [
  {
    titel: "Your fills, not a survey",
    tekst:
      "Every closed trade on a connected MT5 or Alpaca account lands in your history with the session, the instrument and the size you actually used.",
  },
  {
    titel: "The rules you set yourself",
    tekst:
      "Your account rules — risk per trade, daily loss, lot ceiling — are the yardstick. The map shows where you stayed inside them and where you did not.",
  },
  {
    titel: "Paper stays marked as paper",
    tekst:
      "Practice fills carry their origin on the row, so a run on generated demo prices never quietly counts as evidence about how you trade.",
  },
] as const;

export function LandingBehaviorMap() {
  return (
    <section className="relative px-5 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        {/* Geen eigen kop meer. LandingDiscipline staat er direct boven met
            exact dezelfde kicker en kop ("Behavior map" / "Execution
            discipline, from your fills."), dus die stond na PR #124 drie keer
            op de pagina. Deze sectie is het beeld bij dat blok, niet een
            tweede blok. */}
        <div className="axe-behavior-plate">
          <div className="axe-behavior-uitleg">
            {BOUWSTENEN.map((steen) => (
              <div key={steen.titel}>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white/88">{steen.titel}</h3>
                <p className="mt-1.5 max-w-[46ch] text-[14px] leading-[1.7] text-white/48">{steen.tekst}</p>
              </div>
            ))}
          </div>

          <div className="axe-behavior-card" data-landing-cockpit-example="true">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
              Example — sample behavior map, not live data
            </div>

            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/44">Alignment Fit</div>
            <div className="axe-behavior-ring mt-4" style={{ "--fit": 75 } as React.CSSProperties}>
              <span className="axe-behavior-ring-getal">75</span>
            </div>
            <p className="mt-4 text-[11px] leading-[1.6] text-white/38">
              How often AXE&apos;s proposals look like your book rather than a generic playbook. Built from your saved
              context, your messages, your journal and your account history.
            </p>
            {/* Dit bijschrift hing aan de meter in LandingDiscipline. De meter
                staat nu hier, dus het bijschrift ook — anders staat het getal
                op de ene plek en de waarschuwing erbij op de andere. */}
            <p className="mt-2 text-[11px] leading-[1.6] text-white/35">
              Example cockpit chrome — live alignment uses your own workspace signals, not this sample.
            </p>

            <div className="mt-6 space-y-5 border-t border-white/[0.06] pt-5">
              <RailGroep label="Sessions" rijen={SESSIES.map((s) => ({ naam: s.naam, rechts: `${s.deel}%`, deel: s.deel }))} />
              <RailGroep
                label="Instruments"
                rijen={INSTRUMENTEN.map((i) => ({ naam: i.naam, rechts: `${i.deel}%`, deel: i.deel }))}
                goud
              />
              <RailGroep
                label="Edge patterns"
                rijen={PATRONEN.map((p) => ({ naam: p.naam, rechts: String(p.score), deel: p.deel }))}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RailGroep({
  label,
  rijen,
  goud = false,
}: {
  label: string;
  rijen: readonly { naam: string; rechts: string; deel: number }[];
  goud?: boolean;
}) {
  return (
    <div>
      <div
        className={`mb-3.5 text-[10px] font-bold uppercase tracking-[0.3em] ${goud ? "text-[rgba(255,203,104,0.88)]" : "text-[rgba(146,171,255,0.86)]"}`}
      >
        {label}
      </div>
      <div className="space-y-3">
        {rijen.map((rij) => (
          <div key={rij.naam}>
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="font-semibold text-white/86">{rij.naam}</span>
              <span className="tabular-nums text-white/46">{rij.rechts}</span>
            </div>
            <div className="axe-behavior-rail mt-1.5">
              <span style={{ width: `${rij.deel}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
