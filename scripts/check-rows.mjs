import { read, utils } from 'xlsx'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buf = readFileSync(resolve(__dirname, '..', 'data', 'Hunt Calendar 3101.xlsx'))
const wb = read(buf, { type: 'buffer' })

for (let i = 1; i < wb.SheetNames.length; i++) {
  const name = wb.SheetNames[i]
  const data = utils.sheet_to_json(wb.Sheets[name], { header: 1 })
  console.log(`${name}: ${data.length} rows total (rows 2-${data.length - 1} = days 1-${data.length - 2})`)
}
