import { useSyncExternalStore } from "react";
import { CloudOff } from "lucide-react";
import { useIsMutating } from "@tanstack/react-query";

function useOnline() {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener("online", listener);
      window.addEventListener("offline", listener);
      return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Shown without a connection: the list still works and changes are sent once it's back. */
export function OfflineBanner() {
  const online = useOnline();
  const pending = useIsMutating();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 pt-[calc(env(safe-area-inset-top)+0.375rem)] text-xs font-medium text-black">
      <CloudOff className="size-3.5" />
      Offline: the list still works{pending ? ` · ${pending} change${pending === 1 ? "" : "s"} waiting to sync` : ", changes sync when you're back"}
    </div>
  );
}
