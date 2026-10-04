import { normalizeUnit } from "./units";

const UNICODE_FRACTIONS: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

const KNOWN_UNITS = [
  "kilograms", "kilogram", "kg", "grams", "gram", "g", "millilitres", "milliliters", "millilitre", "milliliter", "ml",
  "litres", "liters", "litre", "liter", "l", "tablespoons", "tablespoon", "tbsp", "tbs", "teaspoons", "teaspoon", "tsp",
  "cups", "cup", "sachets", "sachet", "packets", "packet", "pkt", "tins", "tin", "cans", "can", "bunches", "bunch",
  "cloves", "clove", "pinches", "pinch", "slices", "slice", "sticks", "stick", "tubs", "tub", "bags", "bag", "jars", "jar",
];

function parseNumber(token: string): number | null {
  if (UNICODE_FRACTIONS[token] !== undefined) return UNICODE_FRACTIONS[token]!;
  const mixedUnicode = token.match(/^(\d+)([¼½¾⅓⅔⅛])$/);
  if (mixedUnicode) return Number(mixedUnicode[1]) + UNICODE_FRACTIONS[mixedUnicode[2]!]!;
  const fraction = token.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const n = Number(token.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type ParsedIngredient = { name: string; qty: number | null; unit: string | null; note: string | null };

/** Parse free-text lines like "2 tbsp olive oil" or "1 ½ cups rice, rinsed". */
export function parseIngredient(line: string): ParsedIngredient {
  let text = line.replace(/\s+/g, " ").trim();
  let note: string | null = null;

  const paren = text.match(/\(([^)]*)\)/);
  if (paren) {
    note = paren[1]!.trim() || null;
    text = text.replace(paren[0], " ").replace(/\s+/g, " ").trim();
  }

  // Quantity: "2", "1/2", "1 1/2", "½", "1½", "2-3" (take the upper bound).
  let qty: number | null = null;
  const qtyMatch = text.match(
    /^(\d+\/\d+|\d*[¼½¾⅓⅔⅛]|\d+(?:[.,]\d+)?(?:\s+(?:\d+\/\d+|[¼½¾⅓⅔⅛]))?)(?:\s*(?:-|–|to)\s*(\d+(?:[.,]\d+)?))?\s*/,
  );
  if (qtyMatch) {
    const parts = qtyMatch[1]!.split(/\s+/);
    const first = parseNumber(parts[0]!);
    const extra = parts[1] ? parseNumber(parts[1]) : 0;
    qty = qtyMatch[2] ? parseNumber(qtyMatch[2]) : first != null ? first + (extra ?? 0) : null;
    text = text.slice(qtyMatch[0].length);
  }

  let unit: string | null = null;
  const unitMatch = text.match(new RegExp(`^(${KNOWN_UNITS.join("|")})\\.?\\b\\s*(of\\s+)?`, "i"));
  if (unitMatch && qty != null) {
    unit = normalizeUnit(unitMatch[1]);
    text = text.slice(unitMatch[0].length);
  }

  const comma = text.indexOf(",");
  if (comma > 0) {
    const rest = text.slice(comma + 1).trim();
    note = [rest, note].filter(Boolean).join("; ") || null;
    text = text.slice(0, comma);
  }

  return { name: text.trim(), qty, unit, note };
}
