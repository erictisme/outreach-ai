'use client'

import { AlertCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ErrorVariant = 'error' | 'warning' | 'info'

interface ErrorMessageProps {
  message: string
  variant?: ErrorVariant
  className?: string
  onDismiss?: () => void
  retry?: () => void
}

const variantStyles = {
  error: {
    container: 'bg-red-50 border-red-200 text-red-700',
    icon: XCircle,
  },
  warning: {
    container: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    icon: AlertTriangle,
  },
  info: {
    container: 'bg-blue-50 border-blue-200 text-blue-700',
    icon: Info,
  },
}

export function ErrorMessage({
  message,
  variant = 'error',
  className,
  onDismiss,
  retry,
}: ErrorMessageProps) {
  const styles = variantStyles[variant]
  const Icon = styles.icon

  return (
    <div
      className={cn(
        'p-4 border rounded-lg flex items-start gap-3',
        styles.container,
        className
      )}
      role="alert"
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm">{message}</p>
        {retry && (
          <button
            onClick={retry}
            className="mt-2 text-sm font-medium underline hover:no-underline"
          >
            Try again
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 hover:opacity-70 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

interface InlineErrorProps {
  message: string
  className?: string
}

export function InlineError({ message, className }: InlineErrorProps) {
  return (
    <p className={cn('text-sm text-red-500 flex items-center gap-1', className)}>
      <AlertCircle className="w-3.5 h-3.5" />
      {message}
    </p>
  )
}
