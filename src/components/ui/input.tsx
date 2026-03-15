import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]">
            {icon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            'flex h-11 w-full rounded-[8px] bg-white px-3 py-2.5 text-[14px] text-black transition-all duration-150',
            'placeholder:text-[#A1A1AA]',
            'focus:outline-none focus:border-black',
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-[#FAFAFA]',
            icon && 'pl-10',
            className
          )}
          style={{ border: '1px solid rgba(39, 39, 42, 0.3)' }}
          ref={ref}
          {...props}
        />
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
