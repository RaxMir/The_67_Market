import { Router } from "express"

import { asyncRoute, HttpError } from "../errors.js"

import { requireAuth, requireRole } from "../security.js"

import {
  centsToMoney,
  moneyToCents,
  validateOrderItems,
} from "../validation.js"

import Order from "../models/Order.js"

import Product from "../models/Product.js"

const router = Router()

function validUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

function mapOrder(order) {
  return {
    id: String(order._id),

    userId: String(order.userId),

    status: order.status,

    subtotal: Number(order.subtotal),

    shipping: Number(order.shipping),

    total: Number(order.total),

    createdAt: order.createdAt,

    items: order.items.map((item) => ({
      key: `${item.productId}-${item.color}-${item.size}`,

      productId: String(item.productId),

      productCode: item.productCode,

      name: item.name,

      price: Number(item.price),

      quantity: Number(item.quantity),

      lineTotal: Number(item.lineTotal),

      color: item.color,

      size: item.size,
    })),
  }
}

router.post(
  "/",

  requireAuth,

  asyncRoute(async (request, response) => {
    const items = validateOrderItems(request.body?.items)

    const idempotencyKey = request.get("idempotency-key")

    if (!validUuid(idempotencyKey)) {
      throw new HttpError(400, "A valid Idempotency-Key header is required.")
    }

    const existing = await Order.findOne({
      userId: request.user.id,

      idempotencyKey,
    }).lean()

    if (existing) {
      response.status(200).json({ order: mapOrder(existing), duplicate: true })

      return
    }

    const ids = [...new Set(items.map((item) => item.productId))]

    const products = await Product.find({ _id: { $in: ids } }).lean()

    const productsById = new Map(
      products.map((product) => [String(product._id), product]),
    )

    let subtotalCents = 0

    const orderItems = items.map((item) => {
      const product = productsById.get(item.productId)

      if (!product) {
        throw new HttpError(
          400,
          "A product in your basket is no longer available.",
        )
      }

      if (
        !product.colors.some((color) => color.name === item.color) ||
        !product.sizes.includes(item.size)
      ) {
        throw new HttpError(
          400,
          "A selected product option is no longer available.",
        )
      }

      const priceCents = moneyToCents(product.price)

      const lineTotalCents = priceCents * item.quantity

      subtotalCents += lineTotalCents

      return {
        productId: product._id,

        productCode: product.productCode,

        name: product.name,

        price: Number(centsToMoney(priceCents)),

        quantity: item.quantity,

        lineTotal: Number(centsToMoney(lineTotalCents)),

        color: item.color,

        size: item.size,
      }
    })

    if (subtotalCents > 999_999_999_999) {
      throw new HttpError(400, "The order total exceeds the supported limit.")
    }

    const shippingCents = subtotalCents >= 15_000 ? 0 : 1_200

    const totalCents = subtotalCents + shippingCents

    const orderData = {
      userId: request.user.id,

      items: orderItems,

      subtotal: Number(centsToMoney(subtotalCents)),

      shipping: Number(centsToMoney(shippingCents)),

      total: Number(centsToMoney(totalCents)),

      status: "pending",

      idempotencyKey,
    }

    try {
      const order = await Order.create(orderData)

      response.status(201).json({ order: mapOrder(order), duplicate: false })
    } catch (error) {
      if (error.code !== 11000) throw error

      const duplicate = await Order.findOne({
        userId: request.user.id,

        idempotencyKey,
      }).lean()

      if (!duplicate) throw error

      response.status(200).json({ order: mapOrder(duplicate), duplicate: true })
    }
  }),
)

router.get(
  "/my",

  requireAuth,

  asyncRoute(async (request, response) => {
    const orders = await Order.find({ userId: request.user.id })

      .sort({ createdAt: -1, _id: -1 })

      .lean()

    response.json({ orders: orders.map(mapOrder) })
  }),
)

router.get(
  "/admin",

  requireAuth,

  requireRole("admin"),

  asyncRoute(async (request, response) => {
    const orders = await Order.find()

      .sort({ createdAt: -1, _id: -1 })

      .limit(500)

      .lean()

    response.json({ orders: orders.map(mapOrder) })
  }),
)

export default router
