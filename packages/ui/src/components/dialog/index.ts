import { styled } from '../../lib/styled'

export { DialogRoot as Dialog, DialogTrigger, DialogClose } from 'reka-ui'
export { default as DialogContent } from './DialogContent.vue'
export { default as DialogTitle } from './DialogTitle.vue'
export { default as DialogDescription } from './DialogDescription.vue'

export const DialogHeader = styled('div', 'flex flex-col gap-1.5 pr-6', 'DialogHeader')
export const DialogFooter = styled('div', 'flex justify-end gap-2 pt-2', 'DialogFooter')
