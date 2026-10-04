import { useEffect } from "react";
import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BookOpen, Settings, ShoppingCart } from "lucide-react";
import { Toaster } from "sonner";
import { useListSync } from "@/client/features/list/use-list";
import { cn } from "@/client/lib/utils";

export const Route = createRootRoute({ component: RootLayout });

const TABS = [
  { to: "/", label: "List", icon: ShoppingCart },
  { to: "/recipes", label: "Recipes", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function RootLayout() {
  const sync = useListSync();
  // Exposed for tests and debugging: "pending" means the live stream is connected.
  useEffect(() => {
    document.documentElement.dataset.sync = sync.status;
  }, [sync.status]);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Recipe detail pages are full-screen with their own back button.
  const hideTabs = /^\/recipes\/.+/.test(pathname);

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-background md:max-w-none md:flex-row">
      {/* Desktop: sidebar navigation instead of the bottom tab bar. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card/50 px-3 py-5 md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2.5 px-3">
          <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
          <span className="text-lg font-bold tracking-tight">Weekly Shopping</span>
        </Link>
        <nav className="flex flex-col gap-1">
          {TABS.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className={cn("flex-1 overflow-y-auto", !hideTabs && "pb-20 md:pb-0")}>
        <Outlet />
      </main>
      {!hideTabs && (
        <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t bg-background/90 pb-safe backdrop-blur-lg md:hidden">
          <div className="grid grid-cols-3">
            {TABS.map(({ to, label, icon: Icon }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      <Toaster position="top-center" richColors closeButton={false} toastOptions={{ duration: 2500 }} />
    </div>
  );
}
