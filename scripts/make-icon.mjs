import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const source = path.join(root, 'resources', 'icon.svg')
const svg = fs.readFileSync(source)
const build = path.join(root, 'build')
fs.mkdirSync(build, { recursive: true })

for (const size of [1024, 512, 256, 128, 64]) {
  const target = path.join(build, size === 1024 ? 'icon.png' : `icon-${size}.png`)
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(target)
  console.log(`wrote ${target}`)
}
