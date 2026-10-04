import type * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { cn, useIsDesktop } from "@/client/lib/utils";

/** Bottom sheet on phones; a panel sliding in from the right on desktop. */
export function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  const desktop = useIsDesktop();
  return <DrawerPrimitive.Root data-slot="drawer" repositionInputs={false} direction={desktop ? "right" : "bottom"} {...props} />;
}

export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;

export function DrawerContent({ className, children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const desktop = useIsDesktop();
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "fixed z-50 flex flex-col bg-background outline-none",
          desktop
            ? "inset-y-0 right-0 w-[440px] max-w-[90vw] border-l shadow-2xl"
            : "inset-x-0 bottom-0 mx-auto max-h-[92dvh] max-w-md rounded-t-2xl border-t pb-safe",
          className,
        )}
        {...props}
      >
        {desktop ? <div className="h-3 shrink-0" /> : <div className="mx-auto mt-3 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/25" />}
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}

export function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 px-4 pt-2 pb-3", className)} {...props} />;
}

export function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-auto flex flex-col gap-2 border-t px-4 pt-3 pb-4", className)} {...props} />;
}

export function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title className={cn("text-lg font-semibold", className)} {...props} />;
}

export function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return <DrawerPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
