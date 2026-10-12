import { HttpError } from "./errors.js"

export const CATEGORIES = [
  "Outerwear",

  "Shirts",

  "Knitwear",

  "T-shirts",

  "Accessories",

  "Gaming",

  "Home audio",
]

const DEFAULT_VARIANTS = {
  Outerwear: {
    colors: [
      { name: "Sand", className: "sand" },
      { name: "Ink", className: "ink" },
    ],

    sizes: ["XS", "S", "M", "L", "XL"],
  },

  Shirts: {
    colors: [
      { name: "Chalk", className: "chalk" },
      { name: "Ink", className: "ink" },
    ],

    sizes: ["XS", "S", "M", "L", "XL"],
  },

  Knitwear: {
    colors: [
      { name: "Oat", className: "oat" },
      { name: "Ink", className: "ink" },
    ],

    sizes: ["XS", "S", "M", "L", "XL"],
  },

  "T-shirts": {
    colors: [
      { name: "Natural", className: "chalk" },
      { name: "Ink", className: "ink" },
    ],

    sizes: ["XS", "S", "M", "L", "XL"],
  },

  Accessories: {
    colors: [
      { name: "Sand", className: "sand" },
      { name: "Oat", className: "oat" },
    ],

    sizes: ["One size"],
  },

  Gaming: {
    colors: [
      { name: "Graphite", className: "ink" },
      { name: "Fog", className: "chalk" },
    ],

    sizes: ["One size"],
  },

  "Home audio": {
    colors: [
      { name: "Walnut", className: "sand" },
      { name: "Stone", className: "chalk" },
    ],

    sizes: ["One size"],
  },
}

export function validateProductInput(body) {
  const name = typeof body.name === "string" ? body.name.trim() : ""

  const description =
    typeof body.description === "string" ? body.description.trim() : ""

  const category = typeof body.category === "string" ? body.category : ""

  const priceText =
    typeof body.price === "string"
      ? body.price.trim()
      : String(body.price ?? "")

  const stockText =
    typeof body.stock === "string"
      ? body.stock.trim()
      : String(body.stock ?? "")

  const composition =
    typeof body.composition === "string" ? body.composition.trim() : ""

  const tag = typeof body.tag === "string" ? body.tag.trim() : ""

  if (name.length < 1 || name.length > 160) {
    throw new HttpError(
      400,
      "Product name must be between 1 and 160 characters.",
    )
  }

  if (!/[a-z]/i.test(name)) {
    throw new HttpError(
      400,
      "Product name must contain at least one English letter (A-Z).",
    )
  }

  if (description.length < 1 || description.length > 5000) {
    throw new HttpError(
      400,
      "Product description must be between 1 and 5000 characters.",
    )
  }

  if (!CATEGORIES.includes(category)) {
    throw new HttpError(400, "Choose a valid product category.")
  }

  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(priceText)) {
    throw new HttpError(
      400,
      "Price must be a non-negative amount with up to two decimal places.",
    )
  }

  if (
    !/^(?:0|[1-9]\d{0,6})$/.test(stockText) ||
    Number(stockText) > 1_000_000
  ) {
    throw new HttpError(
      400,
      "Stock must be a whole number from 0 to 1,000,000.",
    )
  }

  return {
    name,

    description,

    category,

    price: Number(priceText).toFixed(2),

    stock: Number(stockText),

    composition: composition.slice(0, 255),

    tag: (tag || category).slice(0, 80),

    ...DEFAULT_VARIANTS[category],
  }
}

export function validateCheckoutCustomer(input) {
  const legalName =
    typeof input?.legalName === "string" ? input.legalName.trim() : ""
  const email = typeof input?.email === "string" ? input.email.trim() : ""
  const phone = typeof input?.phone === "string" ? input.phone.trim() : ""

  if (legalName.length < 2 || legalName.length > 120) {
    throw new HttpError(400, "Enter your legal name (2 to 120 characters).")
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email address.")
  }
  if (
    phone.length < 7 ||
    phone.length > 40 ||
    !/^[+()0-9.\-\s]+$/.test(phone)
  ) {
    throw new HttpError(400, "Enter a valid phone number.")
  }

  return { legalName, email: email.toLowerCase(), phone }
}

export function validateProductStock(input) {
  if (
    !(
      typeof input === "number" ||
      (typeof input === "string" && /^\d+$/.test(input))
    )
  ) {
    throw new HttpError(
      400,
      "Stock must be a whole number from 0 to 1,000,000.",
    )
  }
  const stock = Number(input)
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1_000_000) {
    throw new HttpError(
      400,
      "Stock must be a whole number from 0 to 1,000,000.",
    )
  }
  return stock
}

export function validateOrderItems(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 50) {
    throw new HttpError(
      400,
      "An order must include between 1 and 50 cart lines.",
    )
  }

  const combined = new Map()

  for (const item of input) {
    if (
      !item ||
      typeof item.productId !== "string" ||
      !/^[a-f\d]{24}$/i.test(item.productId) ||
      !Number.isSafeInteger(Number(item.quantity)) ||
      Number(item.quantity) < 1 ||
      Number(item.quantity) > 99
    ) {
      throw new HttpError(
        400,
        "Each cart line needs a valid product and quantity from 1 to 99.",
      )
    }

    if (
      typeof item.color !== "string" ||
      item.color.length > 80 ||
      typeof item.size !== "string" ||
      item.size.length > 40
    ) {
      throw new HttpError(400, "Each cart line needs a valid color and size.")
    }

    const key = `${item.productId}:${item.color}:${item.size}`

    const previous = combined.get(key)

    const quantity = Number(item.quantity) + (previous?.quantity ?? 0)

    if (quantity > 99)
      throw new HttpError(400, "A product quantity cannot exceed 99.")

    combined.set(key, {
      productId: item.productId,

      color: item.color,

      size: item.size,

      quantity,
    })
  }

  return [...combined.values()]
}

export function moneyToCents(value) {
  const [whole, fraction = ""] = String(value).split(".")

  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
}

export function centsToMoney(value) {
  return (value / 100).toFixed(2)
}
