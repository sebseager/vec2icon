/** Transient messages, bottom-right. Anything with an action waits to be dismissed. */
import { useEffect } from 'react'
import { type Toast, useEditor } from '@/state'

const DISMISS_MS = 5000

const ToastRow = ({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) => {
  const { id, action } = toast
  useEffect(() => {
    if (action) return
    const timer = setTimeout(() => onDismiss(id), DISMISS_MS)
    return () => clearTimeout(timer)
  }, [id, action, onDismiss])

  return (
    <li className="pointer-events-auto flex w-80 items-start gap-3 border border-zinc-300 bg-white px-3 py-2 shadow-lg shadow-black/10">
      <span className="flex-1 text-zinc-800">{toast.message}</span>
      {action ? (
        <button
          type="button"
          className="shrink-0 text-accent hover:underline"
          onClick={() => {
            action.onClick()
            onDismiss(id)
          }}
        >
          {action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        className="shrink-0 text-zinc-500 hover:text-zinc-900"
        onClick={() => onDismiss(id)}
      >
        &times;
      </button>
    </li>
  )
}

export const Toasts = () => {
  const toasts = useEditor((s) => s.toasts)
  const dismissToast = useEditor((s) => s.dismissToast)
  if (toasts.length === 0) return null
  return (
    <ul
      aria-live="polite"
      className="pointer-events-none fixed right-3 bottom-3 z-50 flex flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </ul>
  )
}
