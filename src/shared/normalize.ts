const IRREGULAR: Record<string, string> = {
  leaves: "leaf",
  loaves: "loaf",
  knives: "knife",
  potatoes: "potato",
  tomatoes: "tomato",
  mangoes: "mango",
  avocadoes: "avocado",
  chillies: "chilli",
  cherries: "cherry",
  berries: "berry",
};

// Words where a trailing "s" is not a plural.
const KEEP_S = new Set([
  "asparagus", "couscous", "hummus", "molasses", "swiss", "brussels", "lentils",
  "oats", "chickpeas", "peas", "greens", "noodles", "grass", "glass", "bass", "citrus",
  "cress", "series", "species", "rice", "tortillas",
]);

function singularWord(word: string): string {
  if (word.length <= 3 || KEEP_S.has(word)) return word;
  const irregular = IRREGULAR[word];
  if (irregular) return irregular;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (/(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("ss") || word.endsWith("us")) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** Canonical key used to match list items, history and catalog entries. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singularWord)
    .join(" ");
}

export function capitalize(name: string): string {
  const trimmed = name.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
