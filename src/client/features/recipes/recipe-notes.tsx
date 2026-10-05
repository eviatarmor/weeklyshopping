import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/client/lib/trpc";
import { timeAgo } from "@/client/lib/utils";

/** "Our notes": one shared note per recipe ("add extra chilli"), saved when you leave the box. */
export function RecipeNotes({ slug }: { slug: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const note = useQuery(trpc.household.note.queryOptions({ slug }, { staleTime: Infinity }));
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(note.data?.text ?? "");
  }, [note.data, editing]);
  const save = useMutation(
    trpc.household.setNote.mutationOptions({
      onSuccess: () => void qc.invalidateQueries({ queryKey: trpc.household.note.queryKey({ slug }) }),
      onError: (e) => toast.error(e.message),
    }),
  );

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Our notes</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          if (text.trim() !== (note.data?.text ?? "")) save.mutate({ slug, text });
        }}
        rows={text ? Math.min(8, text.split("\n").length + 1) : 2}
        placeholder="Tweaks for next time: more chilli, less salt, swap the rice…"
        className="w-full resize-none rounded-xl border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
      />
      {note.data && !editing && (
        <p className="mt-1 text-xs text-muted-foreground">
          {note.data.updatedBy} · {timeAgo(note.data.updatedAt)}
        </p>
      )}
    </section>
  );
}
