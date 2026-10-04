import type * as React from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";
import type { BlendTreeLeaf, BlendTreeNode } from "@/shared/expand";
import { Thumb } from "@/client/components/ui/misc";
import { emojiFor, sizedImage } from "@/client/lib/images";
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
  imageFor,
  depth = 0,
}: {
  node: BlendTreeNode;
  path: string;
  done: Set<string>;
  onToggle: (path: string) => void;
  renderQty: (leaf: BlendTreeLeaf) => React.ReactNode;
  /** Product photo for an ingredient, when there is one. */
  imageFor: (leaf: BlendTreeLeaf) => string | null;
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
                <BlendTree node={child} path={childPath} done={done} onToggle={onToggle} renderQty={renderQty} imageFor={imageFor} depth={depth + 1} />
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
                <span className="relative shrink-0">
                  <Thumb src={sizedImage(imageFor(child), 32)} emoji={emojiFor(child.name)} className={cn("size-8 bg-background", ticked && "opacity-40")} />
                  {ticked && (
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    </span>
                  )}
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
