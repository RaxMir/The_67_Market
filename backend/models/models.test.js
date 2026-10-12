import test from "node:test"

import assert from "node:assert/strict"

import mongoose from "mongoose"

import Order from "./Order.js"

import Product from "./Product.js"

import User from "./User.js"

test("new users default to the user role and require a password hash", async () => {
  const user = new User({
    username: "shopper",

    passwordHash: "hashed-value",

    displayName: "Shopper",
  })

  assert.equal(user.role, "user")

  await user.validate()

  assert.ok(
    User.schema
      .indexes()
      .some(([index, options]) => index.username && options.unique),
  )
})

test("products validate storefront data and enforce unique product codes", async () => {
  const product = new Product({
    name: "Sample Product",

    description: "A sample listing.",

    price: 12.5,

    productCode: "0116161205A1",

    images: ["/uploads/sample.jpg"],

    category: "Outerwear",

    colors: [{ name: "Ink", className: "ink" }],

    sizes: ["M"],

    createdBy: new mongoose.Types.ObjectId(),
  })

  await product.validate()

  assert.ok(
    Product.schema

      .indexes()

      .some(([index, options]) => index.productCode && options.unique),
  )
})

test("orders keep all line items in one validated document", async () => {
  const order = new Order({
    userId: new mongoose.Types.ObjectId(),

    items: [
      {
        productId: new mongoose.Types.ObjectId(),

        productCode: "0116161205A1",

        name: "Sample Product",

        price: 12.5,

        quantity: 2,

        lineTotal: 25,

        color: "Ink",

        size: "M",
      },
    ],

    subtotal: 25,

    shipping: 0,

    total: 25,

    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
  })

  await order.validate()

  assert.equal(order.items.length, 1)

  assert.ok(Order.schema.indexes().some(([index, options]) => {
      return index.userId === 1 && index.idempotencyKey === 1 && options.unique
    }))
})
