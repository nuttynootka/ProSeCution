// Renders the PWA raster icons from public/icons/icon.svg.
// Run with `npm run icons` after changing the source SVG.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/icons')
const svg = await readFile(resolve(outDir, 'icon.svg'))

await mkdir(outDir, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
]

for (const { file, size } of targets) {
  const png = await sharp(svg).resize(size, size).png().toBuffer()
  await writeFile(resolve(outDir, file), png)
  console.log(`wrote ${file} (${size}x${size}, ${png.length} bytes)`)
}

// Maskable icons get cropped to a circle by the launcher, so the artwork is inset
// into the safe zone (~80% of the canvas) over an opaque background.
const inset = Math.round(512 * 0.78)
const maskable = await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: '#131316',
  },
})
  .composite([{ input: await sharp(svg).resize(inset, inset).png().toBuffer(), gravity: 'centre' }])
  .png()
  .toBuffer()

await writeFile(resolve(outDir, 'icon-maskable-512.png'), maskable)
console.log(`wrote icon-maskable-512.png (512x512, ${maskable.length} bytes)`)
