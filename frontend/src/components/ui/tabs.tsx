"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "cn"

/**
 * shadcn-style wrapper over @base-ui/react/tabs (base-nova, NO Radix).
 *
 * Atributos de estado (verificado en @base-ui/react 1.8): el `Tab` renderiza
 * `data-active=""` cuando está activo (stateAttributesMapping → data-*).
 * El active style usa `data-[active]:` — NO `data-[selected]:` (Radix).
 */

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 w-fit items-center justify-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Tab>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Tab>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Tab
    ref={ref}
    className={cn(
      "inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm [&_svg:not([class*='size-'])]:size-4",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Tab.displayName

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Panel>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Panel>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Panel
    ref={ref}
    className={cn("mt-6 outline-none", className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Panel.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }