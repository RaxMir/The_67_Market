import test from "node:test"

import assert from "node:assert/strict"

import { calculateOrderQuote } from "./order-quote.js"

const productId = "507f1f77bcf86cd799439011"

const customer = {
  legalName: "Sample Customer",

  email: "customer@example.com",

  phone: "+1 555 555 5555",
}

const product = {
  _id: productId,

  name: "Sample Speaker",

  productCode: "SAMPLE1",

  price: 20.25,

  stock: 4,

  colors: [{ name: "Walnut" }],

  sizes: ["One size"],
}

test("quotes current server prices, shipping, customer, and requested stock", () => {
  const quote = calculateOrderQuote(
    "507f191e810c19729de860ea",

    [{ productId, quantity: 2, color: "Walnut", size: "One size" }],

    customer,

    [product],
  )

  assert.equal(quote.items[0].priceCents, 2025)

  assert.equal(quote.items[0].lineTotalCents, 4050)

  assert.equal(quote.subtotalCents, 4050)

  assert.equal(quote.shippingCents, 1200)

  assert.equal(quote.totalCents, 5250)

  assert.deepEqual(quote.stockByProduct, [[productId, 2]])

  assert.equal(quote.customer.email, customer.email)
})

test("rejects a quote when requested quantity exceeds current stock", () => {
  assert.throws(
    () =>
      calculateOrderQuote(
        "507f191e810c19729de860ea",

        [{ productId, quantity: 5, color: "Walnut", size: "One size" }],

        customer,

        [product],
      ),

    (error) => error.status === 409 && /only 4 item/.test(error.message),
  )
})

test("rejects combined quantities beyond stock even across variants", () => {
  const variants = {
    ...product,

    colors: [{ name: "Walnut" }, { name: "Stone" }],
  }

  assert.throws(
    () =>
      calculateOrderQuote(
        "507f191e810c19729de860ea",

        [
          { productId, quantity: 3, color: "Walnut", size: "One size" },

          { productId, quantity: 2, color: "Stone", size: "One size" },
        ],

        customer,

        [variants],
      ),

    (error) => error.status === 409 && /only 4 item/.test(error.message),
  )
})

test("uses the live product price rather than any client-supplied price", () => {
  const quote = calculateOrderQuote(
    "507f191e810c19729de860ea",

    [
      {
        productId,

        quantity: 1,

        color: "Walnut",

        size: "One size",

        price: 0.01,
      },
    ],

    customer,

    [product],
  )

  assert.equal(quote.items[0].priceCents, 2025)
})
