import { frameDocument, ownerDocOf, type FillRoot } from './widget-dom'

/** Block form submission caused by widget handlers while the executor interacts. */
export async function withoutSubmit<T>(root: FillRoot, operation: () => Promise<T>): Promise<T> {
  const docs = new Set<Document>([ownerDocOf(root)])
  const visit = (scope: FillRoot): void => {
    for (const el of Array.from(scope.querySelectorAll('*'))) {
      if (el.shadowRoot) visit(el.shadowRoot)
      const frame = frameDocument(el)
      if (frame && !docs.has(frame)) {
        docs.add(frame)
        visit(frame)
      }
    }
  }
  visit(root)
  const prevent = (event: Event): void => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  for (const doc of docs) doc.addEventListener('submit', prevent, true)
  try {
    return await operation()
  } finally {
    for (const doc of docs) doc.removeEventListener('submit', prevent, true)
  }
}
