import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold [&_svg]:size-3',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-foreground',
        success: 'bg-success/15 text-success',
        warning: 'bg-warning/20 text-[#b7791f] dark:text-warning',
        danger: 'bg-destructive/15 text-destructive',
        info: 'bg-info/15 text-info',
        gray: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'gray' },
  },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
