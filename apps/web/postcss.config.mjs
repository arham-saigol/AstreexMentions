import path from "node:path"
import { fileURLToPath } from "node:url"

const base = path.dirname(fileURLToPath(import.meta.url))

const postcssConfig = {
  plugins: {
    "@tailwindcss/postcss": { base },
  },
}

export default postcssConfig
