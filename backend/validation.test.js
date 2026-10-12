import test from "node:test"

import assert from "node:assert/strict"

import {
  validateCheckoutCustomer,
  validateOrderItems,
  validateProductInput,
  validateProductStock,
} from "./validation.js"

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

test("validates product stock and requires an explicit available quantity", () => {
  const input = {
    name: "Sample Item",
    description: "A stocked product.",
    category: "Outerwear",
    price: "12.50",
    stock: "4",
  }
  assert.equal(validateProductInput(input).stock, 4)
  assert.equal(validateProductStock(0), 0)
  assert.throws(() => validateProductStock(-1), /whole number/)
  assert.throws(() => validateProductStock(1.5), /whole number/)
  assert.throws(
    () => validateProductInput({ ...input, stock: "" }),
    /whole number/,
  )
})

test("validates legal name, phone, and email before checkout", () => {
  assert.deepEqual(
    validateCheckoutCustomer({
      legalName: "  Sample Customer ",
      email: " CUSTOMER@example.com ",
      phone: "+1 (555) 555-0100",
    }),
    {
      legalName: "Sample Customer",
      email: "customer@example.com",
      phone: "+1 (555) 555-0100",
    },
  )
  assert.throws(
    () =>
      validateCheckoutCustomer({
        legalName: "",
        email: "not-an-email",
        phone: "123",
      }),
    /legal name/,
  )
  assert.throws(
    () =>
      validateCheckoutCustomer({
        legalName: "Sample Customer",
        email: "not-an-email",
        phone: "123456789",
      }),
    /email address/,
  )
})
