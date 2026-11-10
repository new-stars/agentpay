// Web fonts are added after the page starts, so they never block the first paint.
// (Done here instead of with an inline onload attribute so the deployed site can forbid inline scripts.)
const FONTS =
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'

const link = document.createElement('link')
link.rel = 'stylesheet'
link.href = FONTS
document.head.appendChild(link)
