import { Flame } from "lucide-react";
import { Segmented } from "@/client/components/ui/misc";
import { formatEnergy, useEnergyUnit, type EnergyUnit } from "@/client/lib/preferences";
import { cn } from "@/client/lib/utils";

/** Estimated energy per serving in the user's preferred unit. */
export function Energy({ kcal, className }: { kcal: number | null | undefined; className?: string }) {
  const [unit] = useEnergyUnit();
  if (kcal == null) return null;
  return (
    <span className={cn("inline-flex items-center gap-1", className)} title="Per serving, estimated by the recipe source">
      <Flame className="size-3.5" />
      {formatEnergy(kcal, unit)}
    </span>
  );
}

export function EnergyToggle({ value, onChange }: { value: EnergyUnit; onChange: (unit: EnergyUnit) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: "kj", label: "kJ" },
        { value: "kcal", label: "kcal" },
      ]}
    />
  );
}
