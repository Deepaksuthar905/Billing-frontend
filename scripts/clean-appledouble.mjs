import fs from 'node:fs'
import path from 'node:path'

function removeAppleDoubleFiles(dir) {
  if (!fs.existsSync(dir)) return { scanned: 0, removed: 0 }
  const stat = fs.statSync(dir)
  if (!stat.isDirectory()) return { scanned: 0, removed: 0 }

  let scanned = 0
  let removed = 0

  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const full = path.join(cur, ent.name)
      scanned++
      if (ent.name.startsWith('._')) {
        try {
          fs.rmSync(full, { force: true })
          removed++
        } catch {
          // ignore
        }
        continue
      }
      if (ent.isDirectory()) stack.push(full)
    }
  }
  return { scanned, removed }
}

const targets = process.argv.slice(2)
if (targets.length === 0) {
  console.error('Usage: node scripts/clean-appledouble.mjs <dir> [dir...]')
  process.exit(1)
}

let totalRemoved = 0
for (const t of targets) {
  const { removed } = removeAppleDoubleFiles(t)
  totalRemoved += removed
}

if (totalRemoved > 0) {
  console.log(`Removed ${totalRemoved} AppleDouble (._*) files.`)
}

