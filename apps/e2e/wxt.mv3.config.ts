import base from '../chrome-extension/wxt.config'

// Keep the local release-test artifact separate from the distributable build.
export default { ...base, outDir: '.output/mv3-release' }
