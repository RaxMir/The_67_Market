import { getDatabaseStatus } from "./db.js"

export class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message, options)

    this.status = status
  }
}

export function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next)
  }
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error)

    return
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    response.status(413).json({ error: "Each image must be 5 MB or smaller." })

    return
  }

  if (
    error.code === "LIMIT_FILE_COUNT" ||
    error.code === "LIMIT_UNEXPECTED_FILE"
  ) {
    response.status(400).json({ error: "Upload up to 6 product images." })

    return
  }

  if (error.code === "LIMIT_FIELD_VALUE") {
    response.status(400).json({ error: "A submitted field is too long." })

    return
  }

  const databaseUnavailable =
    error.name === "MongooseServerSelectionError" ||
    error.name === "MongoNetworkError" ||
    error.name === "MongoTimeoutError" ||
    (error.name === "MongooseError" && getDatabaseStatus() !== "connected")
  const status = Number.isInteger(error.status)
    ? error.status
    : databaseUnavailable
      ? 503
      : 500

  if (status >= 500) {
    console.error("Request failed", {
      method: request.method,

      path: request.path,

      error,
    })
  }

  response.status(status).json({
    error:
      status === 503
        ? "The database is unavailable. Check the MongoDB connection and try again."
        : status >= 500
          ? "The server could not complete the request."
          : error.message,
  })
}
