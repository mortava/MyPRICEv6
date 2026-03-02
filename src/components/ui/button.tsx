import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-[14px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 rounded-[8px]',
  {
    variants: {
      variant: {
        default:
          'bg-black text-white border-none hover:opacity-85 active:opacity-90',
        destructive:
          'bg-[#EF4444] text-white border-none hover:opacity-85',
        outline:
          'bg-white text-black border border-[rgba(39,39,42,0.25)] hover:bg-[#FAFAFA]',
        secondary:
          'bg-white text-black border border-[rgba(39,39,42,0.25)] hover:bg-[#FAFAFA]',
        ghost: 'hover:bg-[#F4F4F5] text-black',
        link: 'text-black underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-6 py-2',
        sm: 'h-8 px-3 text-[13px]',
        lg: 'h-12 px-8 text-[14px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
