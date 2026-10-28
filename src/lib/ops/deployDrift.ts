/**
 * Loopt productie achter op `main`, en hoe erg?
 *
 * Dit bestaat om een schaarse grondstof te sparen. De autopilot-sessie begint
 * elke cyclus met kijken of er iets kapot is: draait productie de laatste
 * commit, zijn de checks groen. Dat is precies het werk waar geen enkel model
 * voor nodig is, en het kost wel een deel van het vijf-uurs limiet dat anders
 * aan bouwen was besteed.
 *
 * Dus: de beslissing staat hier, in gewone rekenkunde, en `scripts/watchdog.sh`
 * is er de dunne schil om. Een shell-script op de VPS kan dit elke tien
 * minuten gratis doen, en pas als er écht iets mis is hoeft er een sessie aan
 * te pas te komen.
 *
 * Zonder imports, zodat de verify-suite het direct kan uitvoeren.
 */

export type DeployState = {
  /** Wat `git rev-parse HEAD` op origin/main zegt. */
  expectedCommit: string;
  /** Wat /api/debug/build terugmeldt. Null als het endpoint niet antwoordde. */
  servingCommit: string | null;
  /** ISO, uit hetzelfde endpoint. Null als het niet antwoordde. */
  builtAt: string | null;
  /** Wanneer er voor het laatst naar main is gepusht. Null als onbekend. */
  lastPushAt: string | null;
};

export type DriftVerdict = {
  /** `ok` is het enige antwoord waar niemand naar hoeft te kijken. */
  level: "ok" | "waiting" | "stale" | "unreachable";
  /** Eén regel, met de cijfers erin. */
  message: string;
  /** True als een mens of een sessie hier iets mee moet. */
  needsAttention: boolean;
};

/**
 * Hoe lang een nieuwe commit mag doen over pullen, bouwen en herstarten.
 *
 * De cron op de VPS draait elke vijf minuten en een koude build duurt ruim
 * dertig seconden, dus tien minuten is ruim. Gemeten over vier echte deploys
 * op 27 oktober: vier tot vijf minuten, elke keer.
 */
export const DEPLOY_GRACE_MINUTES = 10;

function minutesSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return (now - ms) / 60000;
}

/**
 * De korte vorm van een commit, zoals het endpoint hem teruggeeft.
 *
 * Vergelijken op de eerste zeven tekens en niet op de hele hash: het endpoint
 * geeft er beide, en een vergelijking die van het formaat afhangt is er een
 * die stilletjes omvalt zodra iemand het formaat verandert.
 */
function short(commit: string | null): string | null {
  if (!commit) return null;
  const trimmed = commit.trim().toLowerCase();
  return trimmed ? trimmed.slice(0, 7) : null;
}

export function judgeDeployDrift(state: DeployState, now: number = Date.now()): DriftVerdict {
  const expected = short(state.expectedCommit);
  const serving = short(state.servingCommit);

  if (!expected) {
    return {
      level: "unreachable",
      message: "Kon niet vaststellen welke commit er op main staat.",
      needsAttention: true,
    };
  }

  if (!serving) {
    return {
      level: "unreachable",
      message: "Productie antwoordde niet op /api/debug/build.",
      needsAttention: true,
    };
  }

  if (serving === expected) {
    const age = minutesSince(state.builtAt, now);
    return {
      level: "ok",
      message:
        age === null
          ? `Productie draait ${serving}.`
          : `Productie draait ${serving}, gebouwd ${Math.round(age)} min geleden.`,
      needsAttention: false,
    };
  }

  // Productie loopt achter. Of dat erg is hangt af van hoe lang al: de eerste
  // minuten na een push is dit precies wat je verwacht.
  const sincePush = minutesSince(state.lastPushAt, now);
  if (sincePush !== null && sincePush <= DEPLOY_GRACE_MINUTES) {
    return {
      level: "waiting",
      message: `Productie draait nog ${serving}, main staat op ${expected} — ${Math.round(sincePush)} min na de push, dat is normaal.`,
      needsAttention: false,
    };
  }

  const waited = sincePush === null ? null : Math.round(sincePush);
  return {
    level: "stale",
    message:
      `Productie draait ${serving} maar main staat op ${expected}` +
      (waited === null
        ? ". De build faalt waarschijnlijk — lees /var/log/axe-autodeploy.log."
        : `, al ${waited} min. De build faalt waarschijnlijk — lees /var/log/axe-autodeploy.log.`),
    needsAttention: true,
  };
}
