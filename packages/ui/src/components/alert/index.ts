import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'
import { styled } from '../../lib/styled'

export { default as Alert } from './Alert.vue'

export const AlertTitle = styled('div', 'text-sm font-bold', 'AlertTitle')
export const AlertDescription = styled('div', 'text-[13px] leading-relaxed', 'AlertDescription')

export const alertVariants = cva(
  'flex gap-3 rounded-lg border px-4 py-3.5 text-[13.5px] [&_svg]:mt-0.5 [&_svg]:size-[18px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        info: 'border-info/25 bg-info/10 text-info',
        success: 'border-success/25 bg-success/10 text-success',
        warning: 'border-warning/30 bg-warning/10 text-[#b7791f] dark:text-warning',
        danger: 'border-destructive/25 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { variant: 'info' },
  },
)
export type AlertVariants = VariantProps<typeof alertVariants>
