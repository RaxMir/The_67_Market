import { HttpError } from "./errors.js"

import {
  centsToMoney,
  moneyToCents,
  validateCheckoutCustomer,
  validateOrderItems,
} from "./validation.js"

export function calculateOrderQuote(
  userId,
  inputItems,
  inputCustomer,
  products,
) {
  const items = validateOrderItems(inputItems)

  const customer = validateCheckoutCustomer(inputCustomer)

  const productsById = new Map(
    products.map((product) => [String(product._id), product]),
  )

  const requestedStock = new Map()

  let subtotalCents = 0

  const quoteItems = items.map((item) => {
    const product = productsById.get(item.productId)

    if (!product) {
      throw new HttpError(
        409,
        "A product in your basket is no longer available.",
      )
    }

    if (
      !product.colors.some((color) => color.name === item.color) ||
      !product.sizes.includes(item.size)
    ) {
      throw new HttpError(
        409,

        "A selected product option is no longer available.",
      )
    }

    const totalRequested =
      (requestedStock.get(item.productId) ?? 0) + item.quantity

    requestedStock.set(item.productId, totalRequested)

    if (Number(product.stock ?? 0) < totalRequested) {
      throw new HttpError(
        409,

        `${product.name} has only ${Number(product.stock ?? 0)} item(s) available.`,
      )
    }

    const priceCents = moneyToCents(product.price)

    const lineTotalCents = priceCents * item.quantity

    subtotalCents += lineTotalCents

    return {
      productId: item.productId,

      productCode: product.productCode,

      name: product.name,

      priceCents,

      quantity: item.quantity,

      lineTotalCents,

      color: item.color,

      size: item.size,
    }
  })

  if (subtotalCents > 999_999_999_999) {
    throw new HttpError(400, "The order total exceeds the supported limit.")
  }

  const shippingCents = subtotalCents >= 15_000 ? 0 : 1_200

  return {
    userId: String(userId),

    customer,

    items: quoteItems,

    stockByProduct: [...requestedStock],

    subtotalCents,

    shippingCents,

    totalCents: subtotalCents + shippingCents,

    totalAsMoney: Number(centsToMoney(subtotalCents + shippingCents)),
  }
}
