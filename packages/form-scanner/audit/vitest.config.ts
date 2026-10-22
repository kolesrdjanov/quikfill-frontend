// Shortcut to the audit regressions, also included in the normal product suite.
export default {
  test: { environment: 'jsdom', include: ['src/audit-regressions.test.ts'] },
}
