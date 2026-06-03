import { read, utils } from 'xlsx'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buf = readFileSync(resolve(__dirname, '..', 'data', 'Hunt Calendar 3101.xlsx'))
const wb = read(buf, { type: 'buffer' })

console.log('=== Sheet Names ===')
wb.SheetNames.forEach((name, i) => console.log(`  ${i}: "${name}"`))

console.log('\n=== Home Sheet (first 10 rows) ===')
const home = utils.sheet_to_json(wb.Sheets['Home'], { header: 1 })
home.slice(0, 15).forEach((row, i) => console.log(`  Row ${i}:`, JSON.stringify(row)))

console.log('\n=== First month sheet (first 5 rows) ===')
const month0 = wb.SheetNames[1]
console.log(`Sheet: "${month0}"`)
const m0 = utils.sheet_to_json(wb.Sheets[month0], { header: 1 })
m0.slice(0, 5).forEach((row, i) => console.log(`  Row ${i}:`, JSON.stringify(row)))

console.log('\n=== Row 2 of month sheet (day names) ===')
console.log('  Row 2 (day names):', JSON.stringify(m0[1]))

console.log('\n=== Rows 3-5 (first 3 event rows) ===')
m0.slice(2, 5).forEach((row, i) => console.log(`  Row ${i + 3}:`, JSON.stringify(row)))

console.log('\n=== Home sheet - all rows with data ===')
home.forEach((row, i) => {
  if (row.some(cell => cell !== undefined && cell !== null && cell !== '')) {
    console.log(`  Row ${i}:`, JSON.stringify(row))
  }
})
