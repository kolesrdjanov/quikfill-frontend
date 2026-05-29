import { styled } from '../../lib/styled'

export const Card = styled(
  'div',
  'rounded-2xl border bg-card text-card-foreground shadow-[var(--shadow-card)]',
  'Card',
)
export const CardHeader = styled(
  'div',
  'flex items-center justify-between gap-2 border-b px-5 py-4',
  'CardHeader',
)
export const CardTitle = styled('h3', 'text-[15px] font-bold tracking-tight', 'CardTitle')
export const CardDescription = styled('p', 'text-[13px] text-muted-foreground', 'CardDescription')
export const CardContent = styled('div', 'p-5', 'CardContent')
export const CardFooter = styled('div', 'flex items-center gap-2 border-t px-5 py-4', 'CardFooter')
