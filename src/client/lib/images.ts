import { DEFAULT_SECTIONS } from "@/shared/sections";
import { normalizeName } from "@/shared/normalize";

/** HelloFresh's CDN resizes via the URL; ask for roughly the size we render. */
export function sizedImage(url: string | null | undefined, width: number): string | null {
  if (!url) return null;
  if (url.includes("img.hellofresh.com/")) return url.replace(/w_\d+/, `w_${Math.round(width * 2)}`);
  // Marley Spoon (Dinnerly) serves fixed sizes; use the medium one for cards and thumbnails.
  if (url.includes("marleyspoon.com/media/") && width <= 300) return url.replace("/large/", "/medium/");
  return url;
}

const EMOJI: [RegExp, string][] = [
  [/grape/, "🍇"], [/pineapple/, "🍍"], [/watermelon|melon/, "🍉"], [/kiwi/, "🥝"], [/mandarin|orange/, "🍊"],
  [/peach|nectarine/, "🍑"], [/plum|cherry|cherrie/, "🍒"], [/passionfruit/, "🟣"], [/cauliflower/, "🥦"],
  [/bok choy|cabbage|lettuce|salad|leaf|spinach|rocket/, "🥬"], [/cucumber/, "🥒"], [/chicken/, "🍗"],
  [/beef|steak|lamb|pork|mince/, "🥩"], [/bacon|salami|ham|turkey/, "🥓"], [/fish|salmon|prawn|tuna/, "🐟"],
  [/cheese|feta|haloumi|tzatziki|dip/, "🧀"], [/milk/, "🥛"], [/egg/, "🥚"], [/croissant/, "🥐"], [/bagel/, "🥯"],
  [/bread|roll|bun/, "🍞"], [/rice|noodle|gnocchi/, "🍚"], [/pizza/, "🍕"], [/chip|crisp|cracker|tortilla/, "🍟"],
  [/chocolate|lolly|biscuit/, "🍫"], [/cereal|muesli|oat/, "🥣"], [/coffee/, "☕"], [/tea/, "🍵"],
  [/juice|cordial|kombucha|soft drink/, "🧃"], [/beer/, "🍺"], [/wine/, "🍷"], [/ice\b/, "🧊"], [/dumpling/, "🥟"],
  [/sauce|pesto|chutney|vegemite|miso|paste/, "🫙"], [/spice|seasoning|blend|salt|pepper|zaatar|five spice/, "🧂"],
  [/toilet|paper|tissue/, "🧻"], [/soap|wash|shampoo|conditioner|detergent|liquid|softener|spray/, "🧴"],
  [/sponge/, "🧽"], [/toothpaste/, "🪥"], [/batter/, "🔋"], [/bag|wrap|foil/, "🛍️"],
];

export function emojiFor(name: string, sectionId?: string | null): string {
  const key = normalizeName(name);
  for (const [pattern, emoji] of EMOJI) if (pattern.test(key)) return emoji;
  return DEFAULT_SECTIONS.find((s) => s.id === sectionId)?.emoji ?? "🛒";
}
