import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC, type RouterOutputs } from "@/client/lib/trpc";
import { enableNotifications } from "./notifications";

export type CookingTimer = RouterOutputs["timers"]["list"][number];

/** The household's kitchen timers. Changes from the other phone arrive over the live stream. */
export function useTimers() {
  const trpc = useTRPC();
  return useQuery(trpc.timers.list.queryOptions(undefined, { staleTime: Infinity, refetchOnWindowFocus: true }));
}

/** The current time, updated every second while `active`. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function useTimerActions() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: trpc.timers.list.queryKey() });
  const onError = (e: { message: string }) => toast.error(e.message);
  const start = useMutation(trpc.timers.start.mutationOptions({ onSuccess: refresh, onError }));
  const extend = useMutation(trpc.timers.extend.mutationOptions({ onSuccess: refresh, onError }));
  const remove = useMutation(trpc.timers.remove.mutationOptions({ onSuccess: refresh, onError }));
  return {
    start: (input: { recipeSlug: string | null; label: string; seconds: number }) => {
      start.mutate(input);
      // The first timer is a good moment to ask for notification permission (it needs a tap).
      if ("Notification" in window && Notification.permission === "default") {
        void enableNotifications().then((status) => {
          if (status === "on") toast.success("You'll get a notification when the time is up");
        });
      }
    },
    extend: (id: string, seconds: number) => extend.mutate({ id, seconds }),
    remove: (id: string) => remove.mutate({ id }),
  };
}

/** A short alarm: three beeps and a buzz. */
function ring() {
  try {
    const audio = new AudioContext();
    for (let i = 0; i < 3; i++) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audio.currentTime + i * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.4, audio.currentTime + i * 0.4 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + i * 0.4 + 0.3);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + i * 0.4);
      osc.stop(audio.currentTime + i * 0.4 + 0.32);
    }
    setTimeout(() => void audio.close(), 1500);
  } catch {
    // No audio available.
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

/** While the app is open: ring and show a message the moment a timer runs out. Mounted once. */
export function useTimerAlerts() {
  const { data: timers } = useTimers();
  const running = (timers ?? []).filter((t) => t.firedAt == null);
  const now = useNow(running.length > 0);
  const alerted = useRef(new Set<string>());
  const { extend, remove } = useTimerActions();

  useEffect(() => {
    for (const t of timers ?? []) {
      const due = t.endsAt <= now;
      if (!due || alerted.current.has(`${t.id}:${t.endsAt}`)) continue;
      alerted.current.add(`${t.id}:${t.endsAt}`);
      // Only ring for timers that ran out just now, not ones that finished while the app was closed.
      if (now - t.endsAt > 60_000) continue;
      ring();
      toast(`⏰ Time's up: ${t.label}`, {
        duration: 30_000,
        action: { label: "Done", onClick: () => remove(t.id) },
        cancel: { label: "+1 min", onClick: () => extend(t.id, 60) },
      });
    }
  }, [timers, now, extend, remove]);
}
