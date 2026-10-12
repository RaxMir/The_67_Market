import fs from "node:fs/promises"

import express from "express"

import cookieParser from "cookie-parser"

import cors from "cors"

import helmet from "helmet"

import { rateLimit } from "express-rate-limit"

import { config, validateServerConfig } from "./config.js"

import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseStatus,
  markIndexesReady,
} from "./db.js"

import { HttpError, errorHandler } from "./errors.js"

import User from "./models/User.js"

import Product from "./models/Product.js"

import Order from "./models/Order.js"

import authRouter from "./routes/auth.js"

import productsRouter from "./routes/products.js"

import ordersRouter from "./routes/orders.js"

validateServerConfig()

await fs.mkdir(config.uploadDirectory, { recursive: true })

const app = express()

app.disable("x-powered-by")

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }))

app.use(
  cors({
    credentials: true,

    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin)) {
        callback(null, origin ?? false)

        return
      }

      callback(new HttpError(403, "This origin is not allowed."))
    },
  }),
)

app.use(express.json({ limit: "1mb" }))

app.use(cookieParser())

app.get(
  "/api/health",

  (request, response) => {
    const database = getDatabaseStatus()
    response.status(database === "connected" ? 200 : 503).json({
      status: database === "connected" ? "ok" : "unavailable",
      database,
    })
  },
)

app.use(
  "/uploads",

  express.static(config.uploadDirectory, {
    dotfiles: "deny",

    fallthrough: false,

    index: false,

    maxAge: "1d",

    setHeaders(response) {
      response.setHeader("X-Content-Type-Options", "nosniff")
    },
  }),
)

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
})

app.use("/api/auth/login", loginLimiter)

app.use("/api/auth/register", loginLimiter)

app.use("/api/auth", authRouter)

app.use("/api/products", productsRouter)

app.use("/api/orders", ordersRouter)

app.use("/api", (request, response, next) => {
  next(new HttpError(404, "API endpoint not found."))
})

app.use(errorHandler)

const server = app.listen(config.port, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${config.port}`)
})

void connectDatabase()
  .then(() => Promise.all([User.init(), Product.init(), Order.init()]))
  .then(() => markIndexesReady())
  .then(() => console.log("MongoDB connected and model indexes are ready."))
  .catch((error) => {
    console.error(
      "MongoDB connection or index initialization failed.",
      error.name,
      "Check backend/.env and Atlas network access; the URI is not logged.",
    )
  })

async function shutdown(signal) {
  console.log(`${signal} received; shutting down the API.`)

  server.close(async (error) => {
    try {
      await disconnectDatabase()
    } finally {
      if (error) {
        console.error("API shutdown failed", error)

        process.exitCode = 1
      }
    }
  })
}

process.on("SIGINT", () => void shutdown("SIGINT"))

process.on("SIGTERM", () => void shutdown("SIGTERM"))
