import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { PageHeader } from "@/client/components/page-header";
import { SortableList } from "@/client/components/sortable-list";
import { Button } from "@/client/components/ui/button";
import { useCatalog } from "@/client/features/list/use-list";
import { MeasureToggle } from "@/client/features/recipes/quantity";
import { EnergyToggle } from "@/client/features/recipes/energy";
import { useEnergyUnit, useMeasureSystem } from "@/client/lib/preferences";
import { dropServiceWorker, useTRPC } from "@/client/lib/trpc";
import { cn } from "@/client/lib/utils";
import { disableNotifications, enableNotifications, useNotificationStatus } from "@/client/features/cooking/notifications";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

/**
 * End the Cloudflare Access session: clear this app's cookie, then log out of the
 * Access team domain too, which lands on Cloudflare's page. Coming back asks you
 * to sign in again.
 */
async function signOut(teamDomain: string | undefined) {
  // Without the service worker, the next visit loads from the network and lands on the Access login.
  await dropServiceWorker();
  try {
    await fetch("/cdn-cgi/access/logout", { credentials: "same-origin", redirect: "manual" });
  } catch {
    // The cookie is cleared even if the response can't be read.
  }
  window.location.href = teamDomain ? `https://${teamDomain}/cdn-cgi/access/logout` : "/cdn-cgi/access/logout";
}

function SettingsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const me = useQuery(trpc.me.queryOptions());
  const { sections } = useCatalog();
  const [system, setSystem] = useMeasureSystem();
  const [energyUnit, setEnergyUnit] = useEnergyUnit();
  const reorder = useMutation(
    trpc.catalog.reorderSections.mutationOptions({
      onSettled: () => void qc.invalidateQueries({ queryKey: trpc.catalog.get.queryKey() }),
    }),
  );

  const reorderTo = (ids: string[]) => {
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
    <div className="md:mx-auto md:max-w-2xl md:pt-4">
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

        <section className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div>
            <h2 className="font-semibold">Energy</h2>
            <p className="text-sm text-muted-foreground">Show recipe energy in kilojoules or calories (per serving, estimated).</p>
          </div>
          <EnergyToggle value={energyUnit} onChange={setEnergyUnit} />
        </section>

        <TimerNotifications />

        <section>
          <h2 className="mb-1 font-semibold">Store layout</h2>
          <p className="mb-3 text-sm text-muted-foreground">Drag the sections into the order you walk through your supermarket.</p>
          <SortableList
            items={sections}
            keyOf={(s) => s.id}
            labelOf={(s) => s.name}
            onReorder={(next) => reorderTo(next.map((s) => s.id))}
            renderItem={(s) => (
              <>
                <span className="text-xl">{s.emoji}</span>
                <span className="flex-1 font-medium">{s.name}</span>
              </>
            )}
          />
        </section>

        <section className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Install:</span> in Safari tap Share → “Add to Home Screen”; in Chrome use the menu → “Install app”.
          </p>
        </section>

        {!import.meta.env.DEV && (
          <Button variant="outline" className="w-full" onClick={() => void signOut(me.data?.accessTeamDomain)}>
            <LogOut /> Sign out
          </Button>
        )}
      </div>
    </div>
  );
}

/** Turn timer notifications on or off for this phone. */
function TimerNotifications() {
  const status = useNotificationStatus();
  const description = {
    on: "This phone gets a notification when a cooking timer is up, even when the app is closed.",
    off: "Get a notification on this phone when a cooking timer is up, even when the app is closed.",
    blocked: "Notifications are blocked for this app. Allow them in your phone's settings, then come back.",
    "install-first": "On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then open it from there.",
    unsupported: "This browser can't show notifications.",
  }[status];
  return (
    <section className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-semibold">Timer notifications</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {(status === "on" || status === "off") && (
        <Button
          variant={status === "on" ? "outline" : "default"}
          onClick={() => void (status === "on" ? disableNotifications() : enableNotifications())}
        >
          {status === "on" ? "Turn off" : "Turn on"}
        </Button>
      )}
    </section>
  );
}
