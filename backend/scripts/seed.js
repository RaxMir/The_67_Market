import bcrypt from "bcryptjs"
import { Buffer } from "node:buffer"
import { config } from "../config.js"
import { connectDatabase, disconnectDatabase } from "../db.js"
import { reserveUniqueProductCode } from "../product-code.js"
import Order from "../models/Order.js"
import Product from "../models/Product.js"
import User from "../models/User.js"

const initialCatalog = [
  {
    name: "Soft Structure Jacket",

    category: "Outerwear",

    price: "184.00",

    composition: "100% brushed cotton",

    tag: "Fall edit",

    description:
      "A softly tailored layer with a relaxed shoulder and an easy, unstructured fit. Cut from brushed cotton twill that becomes more personal with every wear.",

    colors: [
      { name: "Sand", className: "sand" },
      { name: "Ink", className: "ink" },
    ],

    sizes: ["XS", "S", "M", "L", "XL"],

    images: [
      "https://images.unsplash.com/photo-1593764058442-ec2c37d58f80?auto=format&fit=crop&w=1200&q=85",

      "https://images.unsplash.com/photo-1520975916090-3105956dac38?auto=format&fit=crop&w=1200&q=85",

      "https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&w=1200&q=85",
    ],
  },

  {
    name: "Everyday Cotton Shirt",

    category: "Shirts",

    price: "86.00",

    composition: "100% organic cotton",

    tag: "Wardrobe",

    description:
      "Clean lines and breathable cotton for repeat wear. A quiet shirt with a precise collar and an easy drape.",

    colors: [
      { name: "Chalk", className: "chalk" },
      { name: "Ink", className: "ink" },
    ],

    sizes: ["XS", "S", "M", "L", "XL"],

    images: [
      "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=1200&q=85",

      "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=1200&q=85",
    ],
  },

  {
    name: "Relaxed Knit",

    category: "Knitwear",

    price: "112.00",

    composition: "80% merino wool, 20% cotton",

    tag: "Fall edit",

    description:
      "A soft, slightly oversized knit with a calm texture. Warm enough for cooler days without feeling heavy.",

    colors: [
      { name: "Oat", className: "oat" },
      { name: "Ink", className: "ink" },
    ],

    sizes: ["XS", "S", "M", "L", "XL"],

    images: [
      "https://images.unsplash.com/photo-1633008004535-b255bab275cc?auto=format&fit=crop&w=1200&q=85",

      "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=1200&q=85",
    ],
  },

  {
    name: "Essential Tee",

    category: "T-shirts",

    price: "54.00",

    composition: "100% cotton jersey",

    tag: "Wardrobe",

    description:
      "A dependable tee with a relaxed shoulder and a dense, matte cotton hand. Made to be worn on repeat.",

    colors: [
      { name: "Natural", className: "chalk" },
      { name: "Ink", className: "ink" },
    ],

    sizes: ["XS", "S", "M", "L", "XL"],

    images: [
      "https://images.unsplash.com/photo-1467043237213-65f2da53396f?auto=format&fit=crop&w=1200&q=85",

      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=85",
    ],
  },

  {
    name: "S67 Compact Keyboard",

    category: "Gaming",

    price: "129.00",

    composition: "Aluminum case, PBT keycaps",

    tag: "Gaming",

    description:
      "Tactile mechanical keys in a space-saving aluminum frame. Built for long sessions without visual noise.",

    colors: [
      { name: "Graphite", className: "ink" },
      { name: "Fog", className: "chalk" },
    ],

    sizes: ["65%"],

    images: [
      "https://images.unsplash.com/photo-1614179924047-e1ab49a0a0cf?auto=format&fit=crop&w=1200&q=85",

      "https://images.unsplash.com/photo-1595225476474-87563907a82c?auto=format&fit=crop&w=1200&q=85",
    ],
  },

  {
    name: "Room One Speaker",

    category: "Home audio",

    price: "249.00",

    composition: "Wood cabinet, fabric grille",

    tag: "Home audio",

    description:
      "Warm, room-filling sound from a beautifully simple form. Tuned for music first, and quiet enough to live with.",

    colors: [
      { name: "Walnut", className: "sand" },
      { name: "Stone", className: "chalk" },
    ],

    sizes: ["One size"],

    images: [
      "https://images.unsplash.com/photo-1679153369902-50687ca31379?auto=format&fit=crop&w=1200&q=85",

      "https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=1200&q=85",
    ],
  },

  {
    name: "Soft Wool Scarf",

    category: "Accessories",

    price: "68.00",

    composition: "100% merino wool",

    tag: "Fall edit",

    description:
      "A light wool scarf with a dry, quiet hand. Long enough to wrap twice without extra bulk.",

    colors: [
      { name: "Sand", className: "sand" },
      { name: "Oat", className: "oat" },
    ],

    sizes: ["One size"],

    images: [
      "https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?auto=format&fit=crop&w=1200&q=85",

      "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?auto=format&fit=crop&w=1200&q=85",
    ],
  },

  {
    name: "Low Profile Mouse",

    category: "Gaming",

    price: "79.00",

    composition: "Matte polymer shell",

    tag: "Gaming",

    description:
      "A compact wireless mouse with a calm silhouette and precise tracking. Made to disappear on the desk.",

    colors: [
      { name: "Graphite", className: "ink" },
      { name: "Chalk", className: "chalk" },
    ],

    sizes: ["One size"],

    images: [
      "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=1200&q=85",

      "https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=1200&q=85",
    ],
  },
]

async function main() {
  if (
    config.initialLoginPassword.length < 8 ||
    Buffer.byteLength(config.initialLoginPassword, "utf8") > 72
  ) {
    throw new Error(
      "Set INITIAL_LOGIN_PASSWORD to a password between 8 and 72 UTF-8 bytes in backend/.env.",
    )
  }

  await connectDatabase()
  await Promise.all([User.init(), Product.init(), Order.init()])

  const passwordHash = await bcrypt.hash(config.initialLoginPassword, 12)
  const user = await User.findOneAndUpdate(
    { username: "user" },
    {
      $set: { passwordHash, role: "user", displayName: "Store customer" },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  )
  const admin = await User.findOneAndUpdate(
    { username: "admin" },
    {
      $set: {
        passwordHash,
        role: "admin",
        displayName: "Store administrator",
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  )

  const featuredNames = new Set([
    "S67 Compact Keyboard",
    "Soft Structure Jacket",
    "Room One Speaker",
    "Everyday Cotton Shirt",
  ])
  let insertedProducts = 0

  for (const product of initialCatalog) {
    if (await Product.exists({ name: product.name })) continue

    let created = false
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const productCode = await reserveUniqueProductCode(product.name)
      try {
        await Product.create({
          ...product,
          price: Number(product.price),
          productCode,
          isFeatured: featuredNames.has(product.name),
          createdBy: admin._id,
        })
        insertedProducts += 1
        created = true
      } catch (error) {
        if (error.code !== 11000 || error.keyPattern?.productCode !== 1) {
          throw error
        }
      }
    }

    if (!created) {
      throw new Error(`Could not reserve a unique code for ${product.name}.`)
    }
  }

  console.log(
    `Seed complete. Initial user and admin accounts use the configured password. Added ${insertedProducts} starter products. Existing orders and products were preserved.`,
  )
  return user
}

try {
  await main()
} finally {
  await disconnectDatabase()
}
