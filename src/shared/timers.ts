/** A countdown suggested by a method step ("Cook for 10 minutes" → "Cook", 600 s). */
export type StepTimer = { label: string; seconds: number };

const NUMBER = String.raw`(\d+(?:\.\d+)?|½|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty)`;
// "10 minutes", "1-2 mins", "8–10 min", "1 hour", "30 seconds"
const DURATION = new RegExp(
  String.raw`\b${NUMBER}(?:\s*(?:-|–|to)\s*${NUMBER})?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b`,
  "gi",
);
const WORDS: Record<string, number> = {
  "½": 0.5, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30,
};
const toNumber = (s: string) => WORDS[s.toLowerCase()] ?? Number(s);
const UNIT_SECONDS = (unit: string) => (/^h/i.test(unit) ? 3600 : /^m/i.test(unit) ? 60 : 1);

/** Where an instruction stops naming the action: "Cook the haloumi[, stirring,] until golden". */
const ACTION_END = /,|;|:|\(|\buntil\b|\bfor\b|\bover\b|\bin the\b|\bstirring\b|\btossing\b|\bturning\b|\bor\b|\babout\b|\bapprox/i;

/** The action a timer belongs to, from the start of its clause: "Cook the haloumi". */
function labelFrom(clause: string, step: number): string {
  // Skip lead-ins like "When oil is hot," / "Meanwhile," / "In a large frying pan,".
  const start = clause.replace(/^[\s•\-*]+/, "").replace(/^(?:(?:when|once|meanwhile|while|after|in a|in the|to the|using)\b[^,]*,\s*)+/i, "");
  const action = start.split(ACTION_END)[0]!.trim();
  const words = action.split(/\s+/).filter(Boolean);
  if (words.length === 0) return `Step ${step + 1}`;
  const text = words.length > 5 ? `${words.slice(0, 5).join(" ")}…` : words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Timers for one method step, found in its text. Ranges use the longer time
 * ("8–10 minutes" → 10 min); anything under 30 seconds is ignored.
 */
export function stepTimers(text: string, step: number): StepTimer[] {
  const timers: StepTimer[] = [];
  const plain = text.replace(/\*\*|__/g, "");
  // One sentence or bullet at a time, so the name comes from the same instruction.
  for (const sentence of plain.split(/\n|(?<=[.!?])\s+|•/)) {
    if (/^\s*tip\b/i.test(sentence)) continue;
    for (const match of sentence.matchAll(DURATION)) {
      // "When the veggies have 10 minutes left" is a cue, not a timer.
      if (/^\s*(?:left|remaining|to go)\b/i.test(sentence.slice(match.index + match[0].length))) continue;
      if (/\b(?:has|have|with)\s*(?:about\s*)?$/i.test(sentence.slice(0, match.index))) continue;
      const amount = toNumber(match[2] ?? match[1]!);
      const seconds = Math.round(amount * UNIT_SECONDS(match[3]!));
      if (!Number.isFinite(seconds) || seconds < 30 || seconds > 6 * 3600) continue;
      // The clause the time belongs to starts after the last "then" (or at the sentence start).
      const before = sentence.slice(0, match.index);
      const clause = before.split(/\bthen\b/i).filter((c) => c.trim()).at(-1) ?? before;
      const label = labelFrom(clause, step);
      if (!timers.some((t) => t.label === label && t.seconds === seconds)) timers.push({ label, seconds });
    }
  }
  return timers;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
