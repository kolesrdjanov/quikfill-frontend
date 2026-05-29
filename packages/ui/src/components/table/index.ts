import { styled } from '../../lib/styled'

/** Wrap a `Table` in `TableContainer` to get the rounded, clipped card frame. */
export const TableContainer = styled(
  'div',
  'overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-card)]',
  'TableContainer',
)
export const Table = styled('table', 'w-full border-collapse text-sm', 'Table')
export const TableHeader = styled('thead', '', 'TableHeader')
export const TableBody = styled('tbody', '', 'TableBody')
export const TableRow = styled(
  'tr',
  'border-b transition-colors last:border-0 hover:bg-accent/60',
  'TableRow',
)
export const TableHead = styled(
  'th',
  'bg-muted/60 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground',
  'TableHead',
)
export const TableCell = styled('td', 'px-4 py-3 align-middle', 'TableCell')
