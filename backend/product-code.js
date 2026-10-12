import { HttpError } from "./errors.js"
import Product from "./models/Product.js"

const PI_DECIMAL_DIGITS =
  "1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679"

export function normalizeProductName(name) {
  if (typeof name !== "string") {
    throw new HttpError(400, "Product name must be a string.")
  }

  const normalized = name.replace(/[^a-z]/gi, "").toUpperCase()

  if (!normalized) {
    throw new HttpError(
      400,
      "Product name must contain at least one English letter (A-Z).",
    )
  }

  return normalized
}

export function generateBaseProductCode(name) {
  const normalized = normalizeProductName(name)

  const letterPositions = [...normalized]

    .map((letter) => String(letter.charCodeAt(0) - 64).padStart(2, "0"))

    .join("")

  const firstLetterPosition = normalized.charCodeAt(0) - 64

  const piDigit = PI_DECIMAL_DIGITS[firstLetterPosition - 1]

  return `${letterPositions}${normalized[0]}${piDigit}`
}

export async function findUniqueProductCode(name, exists) {
  const baseCode = generateBaseProductCode(name)

  for (let suffix = 1; suffix <= 1_000_000; suffix += 1) {
    const candidate = suffix === 1 ? baseCode : `${baseCode}-${suffix}`

    const existing = await exists(candidate)

    if (!existing) return candidate
  }

  throw new HttpError(503, "A unique product code could not be allocated.")
}

export async function reserveUniqueProductCode(name) {
  return findUniqueProductCode(name, (productCode) =>
    Product.exists({ productCode }),
  )
}
