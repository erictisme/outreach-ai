'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
}

export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Loader2 className={cn('animate-spin text-gray-500', sizeClasses[size])} />
      {label && <span className="text-sm text-gray-500">{label}</span>}
    </div>
  )
}

interface SpinnerOverlayProps {
  label?: string
}

export function SpinnerOverlay({ label = 'Loading...' }: SpinnerOverlayProps) {
  return (
    <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-lg">
      <Spinner size="lg" label={label} />
    </div>
  )
}

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse bg-gray-200 rounded', className)} />
  )
}

interface TableSkeletonProps {
  rows?: number
  columns?: number
  showHeader?: boolean
  showCheckbox?: boolean
}

export function TableSkeleton({ rows = 5, columns = 7, showHeader = true, showCheckbox = true }: TableSkeletonProps) {
  return (
    <div className="w-full">
      {/* Header skeleton */}
      {showHeader && (
        <div className="flex gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
          {showCheckbox && <Skeleton className="h-5 w-5 rounded" />}
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={`header-${i}`} className="h-5 flex-1" />
          ))}
        </div>
      )}
      {/* Row skeletons */}
      <div className="divide-y divide-gray-200">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-2 px-4 py-3">
            {showCheckbox && <Skeleton className="h-5 w-5 rounded" />}
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={`row-${rowIndex}-col-${colIndex}`}
                className={cn(
                  'h-5',
                  colIndex === 0 ? 'w-40' : colIndex === columns - 1 ? 'w-20' : 'flex-1'
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
