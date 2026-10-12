import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

const backendDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(backendDirectory, ".env") })

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",

  port: Number(process.env.PORT ?? 3001),

  frontendOrigins: (process.env.FRONTEND_ORIGINS ?? "http://localhost:8443")

    .split(",")

    .map((origin) => origin.trim())

    .filter(Boolean),

  sessionSecret: process.env.SESSION_SECRET ?? "",

  initialLoginPassword: process.env.INITIAL_LOGIN_PASSWORD ?? "",

  mongoUri: process.env.MONGODB_URI ?? "",

  uploadDirectory: path.resolve(
    backendDirectory,

    process.env.UPLOAD_DIR ?? "uploads",
  ),
}

export function validateServerConfig() {
  const missing = []

  if (!config.mongoUri) missing.push("MONGODB_URI")
  else if (!/^mongodb(\+srv)?:\/\//.test(config.mongoUri)) {
    throw new Error("MONGODB_URI must be a MongoDB connection URI.")
  }

  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    missing.push("SESSION_SECRET (at least 32 characters)")
  }

  if (
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535
  ) {
    missing.push("PORT (must be 1-65535)")
  }

  if (missing.length) {
    throw new Error(`Invalid server configuration: ${missing.join(", ")}`)
  }
}
