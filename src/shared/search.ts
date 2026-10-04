/**
 * Loose text matching for search boxes: case, accents and punctuation don't matter,
 * so "all american" finds "All-American" and "creme" finds "Crème".
 */
export function searchKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A prepared search: every word of the query must appear in the text (spaced or joined up). */
export function searchMatcher(query: string): ((text: string) => boolean) | null {
  const words = searchKey(query).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  return (text) => {
    const key = searchKey(text);
    const joined = key.replaceAll(" ", "");
    return words.every((w) => key.includes(w) || joined.includes(w));
  };
}
