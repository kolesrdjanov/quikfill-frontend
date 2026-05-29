export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Iteration 3 wires the form-scanner + filler here, driven by the
    // side panel over the typed message protocol. No DOM work yet.
  },
})
