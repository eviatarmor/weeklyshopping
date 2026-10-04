import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { BlendTreeNode } from "@/shared/expand";

/** "American Spice Blend → paprika, garlic powder, …" with nested blends linked. */
export function BlendTree({ node, depth = 0 }: { node: BlendTreeNode; depth?: number }) {
  return (
    <div className={depth ? "mt-1 ml-3 border-l pl-3" : ""}>
      <Link to="/recipes/$slug" params={{ slug: node.slug }} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
        {node.title}
        <ChevronRight className="size-3.5" />
      </Link>
      <ul className="mt-0.5 text-sm text-muted-foreground">
        {node.children.map((child, i) =>
          "slug" in child ? (
            <li key={child.slug}>
              <BlendTree node={child} depth={depth + 1} />
            </li>
          ) : (
            <li key={`${child.name}-${i}`} className="before:mr-1.5 before:content-['·']">
              {child.name}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
