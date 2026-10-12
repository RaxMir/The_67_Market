import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"

import mongoose from "mongoose"

import { Router } from "express"

import { config } from "../config.js"

import { asyncRoute, HttpError } from "../errors.js"

import { requireAuth, requireRole, requireCsrf } from "../security.js"

import { centsToMoney, validateOrderItems } from "../validation.js"

import { calculateOrderQuote } from "../order-quote.js"
import Order from "../models/Order.js"

import Product from "../models/Product.js"

const router = Router()

const QUOTE_TTL_MS = 5 * 60 * 1000

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

    customer: order.customer,

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

function quoteSignature(encoded) {
  return createHmac("sha256", config.sessionSecret)

    .update(`order-quote:${encoded}`)

    .digest("base64url")
}

function createQuoteToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")

  return `${encoded}.${quoteSignature(encoded)}`
}

function readQuoteToken(token, userId) {
  if (typeof token !== "string") {
    throw new HttpError(400, "Review the order before confirming it.")
  }

  const separator = token.lastIndexOf(".")

  if (separator < 1) {
    throw new HttpError(400, "The order review is invalid. Review it again.")
  }

  const encoded = token.slice(0, separator)

  const signature = Buffer.from(token.slice(separator + 1))

  const expected = Buffer.from(quoteSignature(encoded))

  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  ) {
    throw new HttpError(400, "The order review is invalid. Review it again.")
  }

  let payload

  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  } catch {
    throw new HttpError(400, "The order review is invalid. Review it again.")
  }

  if (
    payload.userId !== String(userId) ||
    !validUuid(payload.quoteId) ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt <= Date.now() ||
    !Array.isArray(payload.items) ||
    !payload.customer
  ) {
    throw new HttpError(
      409,

      "The order review expired. Review your order again.",
    )
  }

  return payload
}

async function buildQuote(userId, inputItems, inputCustomer, session) {
  const items = validateOrderItems(inputItems)

  const ids = [...new Set(items.map((item) => item.productId))]

  let query = Product.find({ _id: { $in: ids } })

  if (session) query = query.session(session)

  const products = await query.lean()

  return calculateOrderQuote(userId, items, inputCustomer, products)
}

router.post(
  "/quote",

  requireAuth,

  requireCsrf,

  asyncRoute(async (request, response) => {
    const quote = await buildQuote(
      request.user.id,

      request.body?.items,

      request.body?.customer,
    )

    const expiresAt = Date.now() + QUOTE_TTL_MS

    const token = createQuoteToken({
      ...quote,

      stockByProduct: undefined,

      quoteId: randomUUID(),

      expiresAt,
    })

    response.json({
      quote: {
        token,

        expiresAt,

        customer: quote.customer,

        items: quote.items.map((item) => ({
          productId: item.productId,

          name: item.name,

          price: Number(centsToMoney(item.priceCents)),

          quantity: item.quantity,

          lineTotal: Number(centsToMoney(item.lineTotalCents)),

          color: item.color,

          size: item.size,
        })),

        subtotal: Number(centsToMoney(quote.subtotalCents)),

        shipping: Number(centsToMoney(quote.shippingCents)),

        total: Number(centsToMoney(quote.totalCents)),
      },
    })
  }),
)

router.post(
  "/",

  requireAuth,

  requireCsrf,

  asyncRoute(async (request, response) => {
    const quote = readQuoteToken(request.body?.quoteToken, request.user.id)

    const existing = await Order.findOne({
      userId: request.user.id,

      idempotencyKey: quote.quoteId,
    }).lean()

    if (existing) {
      response.status(200).json({ order: mapOrder(existing), duplicate: true })

      return
    }

    const session = await mongoose.startSession()

    let order

    try {
      await session.withTransaction(async () => {
        const latest = await buildQuote(
          request.user.id,

          quote.items.map((item) => ({
            productId: item.productId,

            color: item.color,

            size: item.size,

            quantity: item.quantity,
          })),

          quote.customer,

          session,
        )

        const priceChanged = latest.items.some((item, index) => {
          const quoted = quote.items[index]

          return (
            !quoted ||
            item.productId !== quoted.productId ||
            item.priceCents !== quoted.priceCents ||
            item.quantity !== quoted.quantity ||
            item.color !== quoted.color ||
            item.size !== quoted.size
          )
        })

        if (
          priceChanged ||
          latest.totalCents !== quote.totalCents ||
          latest.subtotalCents !== quote.subtotalCents
        ) {
          throw new HttpError(
            409,

            "Prices or availability changed. Review the updated order before confirming.",
          )
        }

        for (const [productId, quantity] of latest.stockByProduct) {
          const quotedLine = latest.items.find(
            (item) => item.productId === productId,
          )

          const reserved = await Product.findOneAndUpdate(
            {
              _id: productId,

              stock: { $gte: quantity },

              price: Number(centsToMoney(quotedLine.priceCents)),
            },

            { $inc: { stock: -quantity } },

            { new: true, session, runValidators: true },
          )

          if (!reserved) {
            throw new HttpError(
              409,

              "Stock or price changed. Review the updated order before confirming.",
            )
          }
        }

        const orderItems = latest.items.map((item) => ({
          productId: item.productId,

          productCode: item.productCode,

          name: item.name,

          price: Number(centsToMoney(item.priceCents)),

          quantity: item.quantity,

          lineTotal: Number(centsToMoney(item.lineTotalCents)),

          color: item.color,

          size: item.size,
        }))

        const [created] = await Order.create(
          [
            {
              userId: request.user.id,

              customer: latest.customer,

              items: orderItems,

              subtotal: Number(centsToMoney(latest.subtotalCents)),

              shipping: Number(centsToMoney(latest.shippingCents)),

              total: Number(centsToMoney(latest.totalCents)),

              status: "pending",

              idempotencyKey: quote.quoteId,
            },
          ],

          { session },
        )

        order = created
      })
    } catch (error) {
      if (error.code === 11000) {
        const duplicate = await Order.findOne({
          userId: request.user.id,

          idempotencyKey: quote.quoteId,
        }).lean()

        if (duplicate) {
          response

            .status(200)

            .json({ order: mapOrder(duplicate), duplicate: true })

          return
        }
      }

      if (
        error.code === 20 ||
        error.code === 303 ||
        /transaction numbers are only allowed|does not support transactions/i.test(
          error.message ?? "",
        )
      ) {
        throw new HttpError(
          503,

          "Safe stock reservation requires MongoDB transactions. Use Atlas or a replica-set deployment.",

          { cause: error },
        )
      }

      throw error
    } finally {
      await session.endSession()
    }

    response.status(201).json({ order: mapOrder(order), duplicate: false })
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

router.get(
  "/:id",

  requireAuth,

  asyncRoute(async (request, response) => {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      throw new HttpError(400, "Order ID must be a valid ID.")
    }

    const order = await Order.findById(request.params.id).lean()

    if (!order) throw new HttpError(404, "Order not found.")

    if (
      String(order.userId) !== String(request.user.id) &&
      request.user.role !== "admin"
    ) {
      throw new HttpError(403, "You do not have permission to view this order.")
    }

    response.json({ order: mapOrder(order) })
  }),
)

export default router
