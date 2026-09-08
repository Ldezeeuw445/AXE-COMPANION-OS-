/**
 * Detects that the trader is correcting AXE's previous reply.
 *
 * `ai_correction` has been in the LearningSignalType union since the learning
 * arc was written, and the cockpit's alignment score has always counted it —
 * but nothing ever recorded one, so the table holds zero of them. Corrections
 * are the most valuable signal there is (the trader is telling the assistant,
 * in their own words, exactly where it is wrong), and they were all being
 * dropped on the floor.
 *
 * Heuristic on purpose. The alternative is an extra model call on every single
 * chat turn to classify intent, which costs money and latency on the hot path
 * to catch a handful of extra phrasings. The payload records that this came
 * from the heuristic and which phrase matched, so a wrong call is visible in
 * the data rather than laundered into a confident-looking signal.
 */

/** Unambiguous: the trader is saying the assistant got it wrong. */
const STRONG_PATTERNS: RegExp[] = [
  // Dutch
  /\bdat klopt niet\b/,
  /\bklopt niet\b/,
  /\bdat is niet waar\b/,
  /\bje hebt het (mis|fout)\b/,
  /\bdat is (fout|verkeerd|onjuist)\b/,
  /\bniet correct\b/,
  /\bdat is niet wat ik\b/,
  /\bdat zei ik niet\b/,
  /\bverkeerd\b/,
  // English
  /\bthat'?s (wrong|false|incorrect|not right)\b/,
  /\bthat is (wrong|false|incorrect|not right)\b/,
  /\byou'?re wrong\b/,
  /\byou are wrong\b/,
  /\bnot correct\b/,
  /\bincorrect\b/,
  /\bthat'?s not what i\b/,
  /\bi didn'?t say\b/,
  /\bwrong again\b/,
];

/**
 * A leading "no" that carries an actual counter-statement behind it. Bare "nee"
 * or "no thanks" is a refusal, not a correction, so a length floor separates
 * the two.
 */
const LEADING_NEGATION = /^\s*(nee|neen|no|nope)\b[\s,.!:-]+(.{12,})/;

export type CorrectionDetection = {
  isCorrection: boolean;
  /** The phrase that triggered it, for auditing the heuristic later. */
  matched: string | null;
  confidence: "high" | "medium";
};

const NOT_A_CORRECTION: CorrectionDetection = {
  isCorrection: false,
  matched: null,
  confidence: "medium",
};

/**
 * @param userMessage  what the trader just sent
 * @param previousRole role of the turn immediately before it — a correction can
 *                     only be a correction of something the assistant said
 */
export function detectCorrection(
  userMessage: string,
  previousRole: "user" | "assistant" | null,
): CorrectionDetection {
  if (previousRole !== "assistant") return NOT_A_CORRECTION;

  const text = userMessage.trim().toLowerCase();
  // Too short to carry a correction, long enough to be a pasted document.
  if (text.length < 4 || text.length > 4000) return NOT_A_CORRECTION;

  for (const pattern of STRONG_PATTERNS) {
    const hit = text.match(pattern);
    if (hit) return { isCorrection: true, matched: hit[0], confidence: "high" };
  }

  const negation = text.match(LEADING_NEGATION);
  if (negation) {
    return { isCorrection: true, matched: negation[1], confidence: "medium" };
  }

  return NOT_A_CORRECTION;
}
