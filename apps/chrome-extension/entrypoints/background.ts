export default defineBackground(() => {
  // Open the side panel (the primary UI) when the toolbar icon is clicked.
  browser.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {})
})
