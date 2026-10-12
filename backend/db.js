import mongoose from "mongoose"

import { config } from "./config.js"

mongoose.set("strictQuery", true)

let indexesReady = false

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose.connection

  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
  })

  return mongoose.connection
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
}

export function markIndexesReady() {
  indexesReady = true
}

export function getDatabaseStatus() {
  const states = ["disconnected", "connected", "connecting", "disconnecting"]
  const state = states[mongoose.connection.readyState] ?? "unknown"
  return state === "connected" && !indexesReady ? "initializing" : state
}
