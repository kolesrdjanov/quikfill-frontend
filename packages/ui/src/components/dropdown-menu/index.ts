import { styled } from '../../lib/styled'

export { DropdownMenuRoot as DropdownMenu, DropdownMenuTrigger } from 'reka-ui'
export { default as DropdownMenuContent } from './DropdownMenuContent.vue'
export { default as DropdownMenuItem } from './DropdownMenuItem.vue'

export const DropdownMenuSeparator = styled(
  'div',
  '-mx-1.5 my-1.5 h-px bg-border',
  'DropdownMenuSeparator',
)
export const DropdownMenuLabel = styled(
  'div',
  'px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground',
  'DropdownMenuLabel',
)
