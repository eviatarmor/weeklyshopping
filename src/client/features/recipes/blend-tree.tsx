import type * as React from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";
import type { BlendTreeLeaf, BlendTreeNode } from "@/shared/expand";
import { cn, haptic } from "@/client/lib/utils";

/**
 * "American Spice Blend → paprika, garlic powder, …" with nested blends linked.
 * Each spice can be ticked off once it's in the pan; `path` identifies it ("3/1/0").
 */
export function BlendTree({
  node,
  path,
  done,
  onToggle,
  renderQty,
  depth = 0,
}: {
  node: BlendTreeNode;
  path: string;
  done: Set<string>;
  onToggle: (path: string) => void;
  renderQty: (leaf: BlendTreeLeaf) => React.ReactNode;
  depth?: number;
}) {
  return (
    <div className={depth ? "mt-1 ml-3 border-l pl-3" : ""}>
      <Link to="/recipes/$slug" params={{ slug: node.slug }} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
        {node.title}
        <ChevronRight className="size-3.5" />
      </Link>
      <ul className="mt-1 space-y-0.5 text-sm">
        {node.children.map((child, i) => {
          const childPath = `${path}/${i}`;
          if ("slug" in child) {
            return (
              <li key={childPath}>
                <BlendTree node={child} path={childPath} done={done} onToggle={onToggle} renderQty={renderQty} depth={depth + 1} />
              </li>
            );
          }
          const ticked = done.has(childPath);
          return (
            <li key={childPath}>
              <button
                type="button"
                role="checkbox"
                aria-checked={ticked}
                aria-label={`${child.name} added`}
                onClick={() => {
                  haptic(ticked ? 5 : 12);
                  onToggle(childPath);
                }}
                className="flex w-full items-center gap-2 py-1 text-left"
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    ticked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                  )}
                >
                  {ticked && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={cn("flex-1", ticked ? "text-muted-foreground line-through" : "text-foreground")}>{child.name}</span>
                <span className={cn("text-muted-foreground", ticked && "opacity-60")}>{renderQty(child)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
