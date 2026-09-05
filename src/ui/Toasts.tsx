/** Transient messages, bottom-right. The store stays the source of truth; this mirrors
 * it into sonner, so anything with an action waits to be dismissed. */
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { useEditor } from '@/state'

const DISMISS_MS = 5000

export const Toasts = () => {
  const toasts = useEditor((s) => s.toasts)
  const dismissToast = useEditor((s) => s.dismissToast)
  const shown = useRef(new Set<string>())

  useEffect(() => {
    for (const { id, message, action } of toasts) {
      if (shown.current.has(id)) continue
      shown.current.add(id)
      toast(message, {
        id,
        duration: action ? Number.POSITIVE_INFINITY : DISMISS_MS,
        action: action
          ? {
              label: action.label,
              onClick: () => {
                action.onClick()
                dismissToast(id)
              },
            }
          : undefined,
        onDismiss: () => dismissToast(id),
        onAutoClose: () => dismissToast(id),
      })
    }
    for (const id of shown.current) {
      if (toasts.some((t) => t.id === id)) continue
      shown.current.delete(id)
      toast.dismiss(id)
    }
  }, [toasts, dismissToast])

  return <Toaster position="bottom-right" closeButton offset={12} gap={8} />
}
