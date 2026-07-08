import { useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { DisplayTypeIcon } from '@/lib/widget/widget-icons'

/**
 * DisplayTypePopover — wraps a trigger element with a popover showing display type options.
 * Manages its own open state. The drawer closes via its own backdrop/Escape handlers,
 * not from popover dismiss.
 *
 * @param {object} props
 * @param {Array<{value: string, label: string}>} props.displayTypes — Available display types.
 * @param {(displayType: string) => void} props.onSelect — Called when a display type is selected.
 * @param {React.ReactNode} props.children — The trigger element.
 * @returns {JSX.Element} Rendered React element.
 */
export function DisplayTypePopover({ displayTypes, onSelect, children }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={6.8} className="-ml-2 mt-6 w-48 p-[0.2rem] rounded-none">
        <div className="flex flex-col gap-[0.11rem]">
          {displayTypes.map((dt) => (
            <button
              key={dt.value}
              onClick={() => {
                onSelect(dt.value)
                setOpen(false)
              }}
              className="group flex items-center gap-4 px-[0.4rem] py-[0.3rem] rounded-none hover:bg-accent text-[0.85rem] hover:text-accent-foreground cursor-pointer text-left"
            >
              <DisplayTypeIcon displayType={dt.value} className="h-4.5 w-4.5 shrink-0 text-muted-foreground group-hover:text-accent-foreground" />
              <span>{dt.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
