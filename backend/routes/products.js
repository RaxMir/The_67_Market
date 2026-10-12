import { Router } from "express"

import { asyncRoute, HttpError } from "../errors.js"

import { requireAuth, requireRole } from "../security.js"

import {
  generateBaseProductCode,
  reserveUniqueProductCode,
} from "../product-code.js"

import {
  removeSavedImages,
  receiveProductImages,
  saveVerifiedImages,
} from "../uploads.js"

import { validateProductInput } from "../validation.js"

import Product from "../models/Product.js"

const router = Router()

function mapProduct(product) {
  return {
    id: String(product._id),

    productCode: product.productCode,

    name: product.name,

    description: product.description,

    price: Number(product.price),

    type: product.category,

    category: product.category,

    colors: product.colors,

    sizes: product.sizes,

    images: product.images,

    composition: product.composition,

    tag: product.tag,

    isFeatured: Boolean(product.isFeatured),

    createdAt: product.createdAt,
  }
}

router.get(
  "/",

  asyncRoute(async (request, response) => {
    const products = await Product.find()

      .sort({ isFeatured: -1, createdAt: -1, _id: -1 })

      .lean()

    response.json({ products: products.map(mapProduct) })
  }),
)

router.get(
  "/admin/list",

  requireAuth,

  requireRole("admin"),

  asyncRoute(async (request, response) => {
    const products = await Product.find()
      .sort({ createdAt: -1, _id: -1 })
      .lean()

    response.json({ products: products.map(mapProduct) })
  }),
)

router.get(
  "/:id",

  asyncRoute(async (request, response) => {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      throw new HttpError(400, "Product ID must be a valid ID.")
    }

    const product = await Product.findById(request.params.id).lean()

    if (!product) throw new HttpError(404, "Product not found.")

    response.json({ product: mapProduct(product) })
  }),
)

router.post(
  "/",

  requireAuth,

  requireRole("admin"),

  receiveProductImages,

  asyncRoute(async (request, response) => {
    const input = validateProductInput(request.body ?? {})

    const baseCode = generateBaseProductCode(input.name)

    const savedImages = await saveVerifiedImages(request.files)

    let product

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const productCode = await reserveUniqueProductCode(input.name)

        try {
          product = await Product.create({
            ...input,

            price: Number(input.price),

            productCode,

            images: savedImages.map((image) => image.imagePath),

            createdBy: request.user.id,
          })

          break
        } catch (error) {
          if (error.code !== 11000 || error.keyPattern?.productCode !== 1) {
            throw error
          }
        }
      }

      if (!product) {
        throw new HttpError(
          503,

          `Could not allocate a unique product code based on ${baseCode}. Please try again.`,
        )
      }
    } catch (error) {
      await removeSavedImages(savedImages)

      throw error
    }

    response.status(201).json({ product: mapProduct(product) })
  }),
)

export default router
