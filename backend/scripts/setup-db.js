import { connectDatabase, disconnectDatabase } from "../db.js"

import Order from "../models/Order.js"

import Product from "../models/Product.js"

import User from "../models/User.js"

try {
  await connectDatabase()

  await Promise.all([User.init(), Product.init(), Order.init()])

  console.log("MongoDB is connected and application indexes are ready.")
} finally {
  await disconnectDatabase()
}
