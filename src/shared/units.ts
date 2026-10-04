const UNIT_ALIASES: Record<string, string> = {
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp",
  cup: "cup", cups: "cup",
  sachet: "sachet", sachets: "sachet",
  packet: "packet", packets: "packet", pkt: "packet", pack: "packet", packs: "packet",
  tin: "tin", tins: "tin", can: "tin", cans: "tin",
  bunch: "bunch", bunches: "bunch",
  clove: "clove", cloves: "clove",
  pinch: "pinch", pinches: "pinch",
  slice: "slice", slices: "slice",
  stick: "stick", sticks: "stick",
  tub: "tub", tubs: "tub",
  bag: "bag", bags: "bag",
  jar: "jar", jars: "jar",
  bottle: "bottle", bottles: "bottle",
  piece: "", pieces: "", unit: "", units: "", each: "", whole: "", pc: "", pcs: "", x: "",
};

/** Canonical unit, or null for "count" items (e.g. 2 onions). */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const key = unit.trim().toLowerCase().replace(/\.$/, "");
  const canonical = UNIT_ALIASES[key];
  if (canonical === undefined) return key || null;
  return canonical || null;
}

/** Convert to a base unit so 500 g + 1 kg can merge. */
export function toBase(qty: number, unit: string | null): { qty: number; unit: string | null } {
  if (unit === "kg") return { qty: qty * 1000, unit: "g" };
  if (unit === "l") return { qty: qty * 1000, unit: "ml" };
  return { qty, unit };
}

export function fromBase(qty: number, unit: string | null): { qty: number; unit: string | null } {
  if (unit === "g" && qty >= 1000) return { qty: qty / 1000, unit: "kg" };
  if (unit === "ml" && qty >= 1000) return { qty: qty / 1000, unit: "l" };
  return { qty, unit };
}

type Quantity = { qty: number | null; unit: string | null };

/** Sum two quantities if they share a base unit; null when they can't be combined. */
export function addQuantities(a: Quantity, b: Quantity): Quantity | null {
  const ua = normalizeUnit(a.unit);
  const ub = normalizeUnit(b.unit);
  if (a.qty == null && b.qty == null) return ua === ub ? { qty: null, unit: ua } : null;
  // A count item without a quantity means one of it.
  const qa = a.qty ?? (ua == null ? 1 : null);
  const qb = b.qty ?? (ub == null ? 1 : null);
  if (qa == null || qb == null) return null;
  const ba = toBase(qa, ua);
  const bb = toBase(qb, ub);
  if (ba.unit !== bb.unit) return null;
  const sum = fromBase(ba.qty + bb.qty, ba.unit);
  return { qty: roundQty(sum.qty, sum.unit), unit: sum.unit };
}

export function roundQty(qty: number, unit: string | null): number {
  if (unit === "g" || unit === "ml") return qty >= 50 ? Math.round(qty / 5) * 5 : Math.round(qty);
  if (unit === null) return Math.ceil(qty * 2 - 1e-9) / 2;
  return Math.round(qty * 100) / 100;
}

const FRACTIONS: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [0.333, "⅓"],
  [0.5, "½"],
  [0.667, "⅔"],
  [0.75, "¾"],
];

export function formatQty(qty: number | null, unit: string | null): string {
  if (qty == null) return unit ?? "";
  const whole = Math.floor(qty);
  const frac = qty - whole;
  let text = String(Math.round(qty * 100) / 100);
  const match = FRACTIONS.find(([v]) => Math.abs(frac - v) < 0.015);
  if (match && unit !== "g" && unit !== "ml") text = `${whole || ""}${match[1]}`;
  if (!unit) return text;
  const tight = unit === "g" || unit === "kg" || unit === "ml" || unit === "l";
  return tight ? `${text}${unit}` : `${text} ${qty > 1 ? pluralUnit(unit) : unit}`;
}

const NO_PLURAL = new Set(["tsp", "tbsp"]);

function pluralUnit(unit: string): string {
  if (NO_PLURAL.has(unit) || unit.endsWith("s")) return unit;
  if (/(ch|sh|x)$/.test(unit)) return `${unit}es`;
  return `${unit}s`;
}
