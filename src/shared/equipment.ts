/**
 * Kitchen tools a recipe needs, read from its method ("Heat oil in a large frying pan…").
 * Order is roughly the order you'd get things out: cooktop, oven, appliances, small tools.
 */
const TOOLS: [name: string, pattern: RegExp][] = [
  ["Pressure cooker", /\bpressure (cooker|pot)\b|\binstant pot\b/],
  ["Slow cooker", /\bslow cooker\b/],
  ["Wok", /\bwok\b/],
  ["Frying pan", /\b(frying|fry|non-?stick|large|deep) pan\b|\bskillet\b|\bpan over\b|\bthe pan\b/],
  ["Grill pan", /\b(grill|griddle|chargrill) pan\b|\bgriddle\b/],
  ["Saucepan", /\bsauce ?pan\b|\b(small|medium) (pan|pot)\b/],
  ["Large pot", /\b(large|big|deep|soup|stock) pot\b|\bstockpot\b|\bdutch oven\b|\bpot of (boiling|salted)?\s*water\b|\bin a pot\b|\bthe pot\b/],
  ["Lid", /\blid\b|\bcover(ed)? (the (pan|pot|saucepan)|and (cook|simmer))\b/],
  ["Steamer", /\bsteamer\b/],
  ["Oven tray", /\b(oven|baking|roasting|lined) (tray|sheet)\b|\bsheet pan\b|\btray\b/],
  ["Baking dish", /\b(baking|oven-?proof|casserole|gratin|lasagne|roasting) dish\b|\bbaking pan\b/],
  ["Baking tin", /\b(pie|tart|cake|loaf|muffin|springform|quiche) (tin|dish|pan|tray)\b/],
  ["Baking paper", /\bbaking paper\b|\bparchment\b/],
  ["Air fryer", /\bair ?fryer\b/],
  ["Microwave", /\bmicrowave\b/],
  ["Kettle", /\bkettle\b/],
  ["Toaster or sandwich press", /\btoaster\b|\bsandwich press\b/],
  // In Australia "the grill" is usually the oven grill, so only a named barbecue counts.
  ["Barbecue", /\b(on|preheat|heat) (the |a )?(bbq|barbecue)\b|\bbarbecue (plate|hotplate)\b/],
  ["Blender", /\b(?<!stick |immersion |hand )blender\b|\bblend (until|everything|the|to)\b/],
  ["Stick blender", /\b(stick|immersion|hand) blender\b/],
  ["Food processor", /\bfood processor\b|\bprocessor\b/],
  ["Mixing bowl", /\bbowl\b/],
  ["Whisk", /\bwhisk/],
  ["Grater", /\bgrate\b|\bgrater\b|\bzest\b/],
  ["Peeler", /\bpeeler\b/],
  ["Potato masher", /\bmash(er)?\b/],
  ["Colander or sieve", /\bcolander\b|\bsieve\b|\bstrain(er)?\b|\bdrain\b/],
  ["Rolling pin", /\brolling pin\b|\broll (it |the dough |the pastry )?out\b/],
  ["Mortar and pestle", /\bmortar\b|\bpestle\b/],
  ["Skewers", /\bskewers?\b/],
  ["Kitchen paper", /\b(kitchen|paper) towels?\b|\bkitchen paper\b/],
];

export function equipmentFor(steps: { text: string }[]): string[] {
  const text = steps.map((s) => s.text).join("\n").toLowerCase();
  const found = TOOLS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  // A stick blender alone shouldn't also list a blender, and a wok covers the frying pan.
  return found.filter(
    (name) => !(name === "Blender" && found.includes("Stick blender")) && !(name === "Frying pan" && found.includes("Wok") && !/frying pan|skillet/.test(text)),
  );
}
