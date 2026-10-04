import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, LogOut } from "lucide-react";
import { PageHeader } from "@/client/components/page-header";
import { Button } from "@/client/components/ui/button";
import { useCatalog } from "@/client/features/list/use-list";
import { MeasureToggle } from "@/client/features/recipes/quantity";
import { useMeasureSystem } from "@/client/lib/preferences";
import { useTRPC } from "@/client/lib/trpc";
import { cn } from "@/client/lib/utils";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const me = useQuery(trpc.me.queryOptions());
  const { sections } = useCatalog();
  const [system, setSystem] = useMeasureSystem();
  const reorder = useMutation(
    trpc.catalog.reorderSections.mutationOptions({
      onSettled: () => void qc.invalidateQueries({ queryKey: trpc.catalog.get.queryKey() }),
    }),
  );

  const move = (index: number, delta: number) => {
    const ids = sections.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    // Optimistic: reorder the cached catalog right away.
    qc.setQueryData(trpc.catalog.get.queryKey(), (old) =>
      old ? { ...old, sections: ids.map((id, sortOrder) => ({ ...old.sections.find((s) => s.id === id)!, sortOrder })) } : old,
    );
    reorder.mutate({ ids });
  };

  const switchDevUser = (email: string) => {
    document.cookie = `dev_user=${encodeURIComponent(email)}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  };

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6 px-4 pb-8">
        <section className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="font-semibold">{me.data?.user.name}</p>
          <p className="text-sm text-muted-foreground">{me.data?.user.email}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Household: <span className="font-medium text-foreground">{me.data?.household.name}</span> ·{" "}
            {me.data?.household.members.map((m) => m.name).join(", ")}
          </p>
          {import.meta.env.DEV && me.data && (
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
              <span className="w-full text-xs font-medium text-muted-foreground">Dev: switch user</span>
              {me.data.household.members.map((m) => (
                <Button key={m.email} size="sm" variant={m.email === me.data.user.email ? "default" : "outline"} onClick={() => switchDevUser(m.email)}>
                  {m.name}
                </Button>
              ))}
            </div>
          )}
        </section>

        <section className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div>
            <h2 className="font-semibold">Recipe quantities</h2>
            <p className="text-sm text-muted-foreground">Show spoons and cups, or convert them to grams (approximate).</p>
          </div>
          <MeasureToggle value={system} onChange={setSystem} />
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Store layout</h2>
          <p className="mb-3 text-sm text-muted-foreground">Order the sections the way you walk through your supermarket.</p>
          <ul className="divide-y rounded-xl border bg-card">
            {sections.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                <span className="text-xl">{s.emoji}</span>
                <span className="flex-1 font-medium">{s.name}</span>
                <Button variant="ghost" size="icon-sm" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${s.name} down`}
                  disabled={i === sections.length - 1}
                  onClick={() => move(i, 1)}
                  className={cn(i === sections.length - 1 && "invisible")}
                >
                  <ArrowDown />
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Install:</span> in Safari tap Share → “Add to Home Screen”; in Chrome use the menu → “Install app”.
          </p>
        </section>

        {!import.meta.env.DEV && (
          <Button variant="outline" className="w-full" asChild>
            <a href="/cdn-cgi/access/logout">
              <LogOut /> Sign out
            </a>
          </Button>
        )}
      </div>
    </>
  );
}
