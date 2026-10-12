import { connectDatabase, disconnectDatabase } from "../db.js"

import Order from "../models/Order.js"

import Product from "../models/Product.js"

import User from "../models/User.js"

try {
  await connectDatabase()

  await Promise.all([User.init(), Product.init(), Order.init()])

  const migrated = await Product.updateMany({ stock: { $exists: false } }, {
    $set: { stock: 0 },
  })

  if (migrated.modifiedCount) {
    console.log(
      `Set stock to 0 for ${migrated.modifiedCount} existing product(s).`,
    )
  }

  console.log("MongoDB is connected and application indexes are ready.")
} finally {
  await disconnectDatabase()
}
