// Bundles the Vite build output into a single self-contained HTML file for the
// claude.ai Artifact preview channel: CSS and JS inlined, fonts as base64 data URIs,
// service worker registration stripped (a sandboxed iframe can't register one, and
// nothing in the app currently calls it anyway).
//
// This is a delivery mechanism for reviewing the real app, not a separate design
// surface — it changes nothing about how the app looks or behaves.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const outFile = resolve(root, 'preview.html')

async function findAsset(pattern) {
  const files = await readdir(resolve(dist, 'assets'))
  const match = files.find((f) => pattern.test(f))
  if (!match) throw new Error(`No asset matching ${pattern} in dist/assets`)
  return readFile(resolve(dist, 'assets', match), 'utf-8')
}

let css = await findAsset(/\.css$/)
let js = await findAsset(/\.js$/)

// pdf-lib's minified output contains a literal U+FFFD (replacement character) —
// legitimate source, used to detect failed UTF-16 decodes when reading PDF strings
// — but the Artifact publishing pipeline rejects any HTML containing a raw U+FFFD
// byte outright. Every occurrence is inside a JS string literal (there's no other
// place a bare U+FFFD could appear in valid minified JS), so swapping the literal
// character for its `�` escape sequence is behaviorally identical and produces
// byte-for-byte the same runtime string, just spelled out as source text instead of
// the raw character.
const replacementCharCount = (js.match(/�/g) ?? []).length
if (replacementCharCount > 0) {
  js = js.split('�').join('\\uFFFD')
  console.log(`escaped ${replacementCharCount} literal U+FFFD character(s) in the bundled JS`)
}

// Inline the two self-hosted font files as data URIs so the page has zero external
// requests, per the Artifact sandbox's strict CSP. Vite's `base: './'` rewrites the
// source's absolute `/fonts/...` reference to `../fonts/...` (relative to
// dist/assets/) in the built CSS, so match that form, not the source form.
const fontFiles = {
  'fonts/manrope-variable.woff2': 'font/woff2',
  'fonts/ibm-plex-mono-400.woff2': 'font/woff2',
  'fonts/ibm-plex-mono-500.woff2': 'font/woff2',
}
let inlinedCount = 0
for (const [relPath, mime] of Object.entries(fontFiles)) {
  const bytes = await readFile(resolve(root, 'public', relPath))
  const dataUri = `data:${mime};base64,${bytes.toString('base64')}`
  const before = css.length
  css = css.split(`url(../${relPath})`).join(`url(${dataUri})`)
  if (css.length === before) throw new Error(`Font not found in CSS: ../${relPath}`)
  inlinedCount++
}
console.log(`inlined ${inlinedCount} font file(s) as data URIs`)

const html = `<!doctype html>
<title>ProSeCution</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<style>
  html, body, #root { height: 100%; margin: 0; }
  body { background: #08080b; }
</style>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`

await writeFile(outFile, html, 'utf-8')
console.log(`wrote ${outFile} (${(html.length / 1024).toFixed(0)} KB)`)
