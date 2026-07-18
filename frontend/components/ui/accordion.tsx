"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type AccordionContextValue = {
  openItems: string[]
  toggle: (value: string) => void
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null)
const AccordionItemContext = React.createContext<string>("")

function useAccordion() {
  const ctx = React.useContext(AccordionContext)
  if (!ctx) {
    throw new Error("Accordion components must be used within <Accordion>")
  }
  return ctx
}

type AccordionProps = {
  type?: "single" | "multiple"
  collapsible?: boolean
  defaultValue?: string | string[]
  className?: string
  children?: React.ReactNode
}

function Accordion({
  type = "single",
  collapsible = false,
  defaultValue,
  className,
  children,
}: AccordionProps) {
  const [openItems, setOpenItems] = React.useState<string[]>(() => {
    if (!defaultValue) return []
    return Array.isArray(defaultValue) ? defaultValue : [defaultValue]
  })

  const toggle = React.useCallback(
    (value: string) => {
      setOpenItems((prev) => {
        const isOpen = prev.includes(value)
        if (type === "single") {
          if (isOpen) return collapsible ? [] : prev
          return [value]
        }
        return isOpen ? prev.filter((v) => v !== value) : [...prev, value]
      })
    },
    [type, collapsible]
  )

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div data-slot="accordion" className={className}>
        {children}
      </div>
    </AccordionContext.Provider>
  )
}

function AccordionItem({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <AccordionItemContext.Provider value={value}>
      <div data-slot="accordion-item" className={cn("border-b", className)}>
        {children}
      </div>
    </AccordionItemContext.Provider>
  )
}

function AccordionTrigger({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  const { openItems, toggle } = useAccordion()
  const value = React.useContext(AccordionItemContext)
  const isOpen = openItems.includes(value)

  return (
    <button
      type="button"
      data-slot="accordion-trigger"
      aria-expanded={isOpen}
      onClick={() => toggle(value)}
      className={cn(
        "flex w-full flex-1 items-center justify-between gap-4 py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      {children}
      <ChevronDownIcon
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180"
        )}
      />
    </button>
  )
}

function AccordionContent({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  const { openItems } = useAccordion()
  const value = React.useContext(AccordionItemContext)
  const isOpen = openItems.includes(value)

  if (!isOpen) return null

  return (
    <div data-slot="accordion-content" className={cn("overflow-hidden pb-4 text-sm", className)}>
      {children}
    </div>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
