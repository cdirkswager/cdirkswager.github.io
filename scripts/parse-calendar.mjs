import { read, utils } from 'xlsx'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buf = readFileSync(resolve(__dirname, '..', 'data', 'Hunt Calendar 3101.xlsx'))
const wb = read(buf, { type: 'buffer' })

const MONTH_NAMES = ['Hammer', 'Alturiak', 'Ches', 'Tarsakh', 'Mirtul', 'Kythorn', 'Flamerule', 'Eleasis', 'Eleint', 'Marpenoth', 'Uktar', 'Nightal']
const DAY_NAMES = ['Day of the Sun', 'Day of the Moon', 'Day of Mysteries', 'Day of Justice', 'Day of the Wild', 'Day of the Book', 'Day of Grain', 'Day of Strife', 'Day of the Dead', 'Day of Love']

// Build description lookup from Home sheet
const homeSheet = utils.sheet_to_json(wb.Sheets['Home'], { header: 1 })
const descMap = {}
for (const row of homeSheet) {
  if (row[3] && row[4]) {
    descMap[row[3].toString().trim()] = row[4].toString().trim()
  }
}

const allEvents = []

for (let mi = 0; mi < 12; mi++) {
  const sheetName = MONTH_NAMES[mi]
  const sheet = wb.Sheets[sheetName]
  const data = utils.sheet_to_json(sheet, { header: 1 })

  // Row 1 (index 1) = header with day names
  // Data rows are Excel rows 3, 4, 5 (indices 2, 3, 4)
  // Each row corresponds to a 10-day block of the 30-day month:
  //   index 2 → block 0 → days  1-10  (offset = 0)
  //   index 3 → block 1 → days 11-20  (offset = 10)
  //   index 4 → block 2 → days 21-30  (offset = 20)
  // Day number = col_index + 1 + offset
  const rowToOffset = { 2: 0, 3: 10, 4: 20 }

  for (const [rowIdx, offset] of Object.entries(rowToOffset)) {
    const row = data[parseInt(rowIdx)]
    if (!row) continue

    for (let col = 0; col < 10; col++) {
      const cellValue = row[col]
      if (!cellValue) continue

      const titles = cellValue.toString().split('\n').map(s => s.trim()).filter(Boolean)
      for (const title of titles) {
        const normalized = title.replace(/^[-•]\s*/, '').trim()
        if (!normalized) continue
        const day = col + 1 + offset
        allEvents.push({
          id: `evt-${mi + 1}-${day}-${col}`,
          month: mi,
          day: day,
          title: normalized,
          description: descMap[normalized] || '',
          dayName: DAY_NAMES[col],
        })
      }
    }
  }
}

// Deduplicate by (month, day, title)
const seen = new Set()
const unique = []
for (const e of allEvents) {
  const key = `${e.month}-${e.day}-${e.title}`
  if (seen.has(key)) continue
  seen.add(key)
  unique.push(e)
}

const output = {
  year: 3101,
  monthNames: MONTH_NAMES,
  dayNames: DAY_NAMES,
  events: unique,
}

writeFileSync(resolve(__dirname, '..', 'data', 'calendar-3101.json'), JSON.stringify(output, null, 2))
console.log(`Parsed ${unique.length} unique events from ${MONTH_NAMES.length} months`)
console.log(`Sample events:`)
unique.slice(0, 5).forEach(e => console.log(`  Month ${e.month+1} (${MONTH_NAMES[e.month]}), Day ${e.day}: ${e.title} [${e.dayName}]`))
