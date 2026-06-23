import { useEffect, useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts, dismiss } = useToast()
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    toasts.forEach(t => {
      if (!timers.current.has(t.id)) {
        timers.current.set(t.id, setTimeout(() => {
          dismiss(t.id)
          timers.current.delete(t.id)
        }, 1500))
      }
    })
    timers.current.forEach((timer, id) => {
      if (!toasts.find(t => t.id === id)) {
        clearTimeout(timer)
        timers.current.delete(id)
      }
    })
  }, [toasts, dismiss])

  return (
    <ToastProvider duration={Infinity}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
