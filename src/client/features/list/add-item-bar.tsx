import { useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { normalizeName } from "@/shared/normalize";
import { parseIngredient } from "@/shared/parse-ingredient";
import { DEFAULT_SECTIONS } from "@/shared/sections";
import { Thumb } from "@/client/components/ui/misc";
import { emojiFor, sizedImage } from "@/client/lib/images";
import { cn } from "@/client/lib/utils";
import { suggest, type Suggestion } from "./autocomplete";
import { useCatalog, useListActions } from "./use-list";

const sectionName = (id: string) => DEFAULT_SECTIONS.find((s) => s.id === id)?.name ?? "Other";

export function AddItemBar({ onList }: { onList: Set<string> }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const catalog = useCatalog();
  const actions = useListActions();

  const query = parseIngredient(text).name || text;
  const suggestions = useMemo(() => suggest(query, catalog.data, onList), [query, catalog.data, onList]);
  const open = focused && suggestions.length > 0;

  const submit = (s?: Suggestion) => {
    const raw = text.trim();
    if (!s && !raw) return;
    if (s) {
      // Keep any typed quantity: "2 avo" + pick "Avocado" → "2 Avocado".
      const parsed = parseIngredient(raw);
      const prefix = parsed.qty != null ? `${parsed.qty}${parsed.unit ? ` ${parsed.unit}` : ""} ` : "";
      actions.add({ text: `${prefix}${s.name}`, productSlug: s.productSlug });
    } else {
      actions.add({ text: raw });
    }
    setText("");
    setHighlight(0);
    inputRef.current?.focus();
  };

  return (
    <div className="relative px-4 pb-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text.trim() && open ? suggestions[highlight] : undefined);
        }}
        className="flex h-12 items-center gap-2 rounded-xl border bg-card px-3 shadow-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30"
      >
        <Plus className="size-5 text-primary" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setHighlight(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Escape") {
              inputRef.current?.blur();
            }
          }}
          placeholder="Add item, e.g. 2 avocados"
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="sentences"
          className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          aria-label="Add item"
        />
        {text && (
          <button type="button" aria-label="Clear" onClick={() => setText("")} className="text-muted-foreground">
            <X className="size-4" />
          </button>
        )}
      </form>

      {open && (
        <div className="absolute inset-x-4 top-[calc(100%-0.25rem)] z-40 overflow-hidden rounded-xl border bg-popover shadow-lg">
          {!text.trim() && <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">Frequently bought</p>}
          <ul role="listbox">
            {suggestions.map((s, i) => {
              const already = onList.has(normalizeName(s.name));
              return (
                <li key={s.key} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => submit(s)}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left", i === highlight && text.trim() && "bg-accent")}
                  >
                    <Thumb src={sizedImage(s.imageUrl, 32)} emoji={emojiFor(s.name, s.sectionId)} className="size-8 text-sm" />
                    <span className="flex-1 truncate font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{already ? "On list" : sectionName(s.sectionId)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {text.trim() && !suggestions.some((s) => normalizeName(s.name) === normalizeName(query)) && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit()}
              className="flex w-full items-center gap-3 border-t px-3 py-2.5 text-left text-sm text-primary"
            >
              <Plus className="size-4" /> Add “{text.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
