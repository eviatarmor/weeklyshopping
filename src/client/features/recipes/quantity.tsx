import { measure, type MeasureSystem, type SpoonStandard } from "@/shared/measure";
import { formatQty } from "@/shared/units";
import { Segmented } from "@/client/components/ui/misc";

/** A recipe quantity in the chosen system; converted grams are marked "≈". */
export function Quantity({
  qty,
  unit,
  name,
  system,
  standard,
}: {
  qty: number | null;
  unit: string | null;
  name: string;
  system: MeasureSystem;
  standard: SpoonStandard;
}) {
  const m = measure(qty, unit, name, system, standard);
  const text = formatQty(m.qty, m.unit);
  if (!text) return null;
  return (
    <span className="shrink-0 text-sm text-muted-foreground tabular-nums" title={m.approximate ? `≈ converted from ${formatQty(qty, unit)}` : undefined}>
      {m.approximate ? `≈${text}` : text}
    </span>
  );
}

export function MeasureToggle({ value, onChange }: { value: MeasureSystem; onChange: (system: MeasureSystem) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: "spoons", label: "Spoons" },
        { value: "grams", label: "Grams" },
      ]}
    />
  );
}
