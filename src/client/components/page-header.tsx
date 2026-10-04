import type * as React from "react";
import { cn } from "@/client/lib/utils";

export function PageHeader({ title, action, children, className }: { title: string; action?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("sticky top-0 z-30 bg-background/90 pt-safe backdrop-blur-lg", className)}>
      <div className="flex h-14 items-center justify-between px-4">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {action}
      </div>
      {children}
    </header>
  );
}
