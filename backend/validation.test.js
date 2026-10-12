import test from "node:test"

import assert from "node:assert/strict"

import { validateOrderItems } from "./validation.js"

const productId = "507f1f77bcf86cd799439011"

test("validates MongoDB object IDs and combines duplicate cart lines", () => {
  assert.deepEqual(
    validateOrderItems([
      { productId, quantity: 2, color: "Ink", size: "M" },

      { productId, quantity: 3, color: "Ink", size: "M" },
    ]),

    [{ productId, quantity: 5, color: "Ink", size: "M" }],
  )
})

test("rejects malformed MongoDB object IDs", () => {
  assert.throws(
    () =>
      validateOrderItems([
        { productId: "42", quantity: 1, color: "Ink", size: "M" },
      ]),

    /valid product and quantity/,
  )
})

test("rejects order-line quantities above the limit after combining", () => {
  assert.throws(
    () =>
      validateOrderItems([
        { productId, quantity: 60, color: "Ink", size: "M" },

        { productId, quantity: 40, color: "Ink", size: "M" },
      ]),

    /cannot exceed 99/,
  )
})
