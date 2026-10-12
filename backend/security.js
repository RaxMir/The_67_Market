import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import { config } from "./config.js"

import { asyncRoute, HttpError } from "./errors.js"

import User from "./models/User.js"

const SESSION_COOKIE = "s67_session"

const CSRF_COOKIE = "s67_csrf"

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

function signature(value) {
  return createHmac("sha256", config.sessionSecret)
    .update(value)
    .digest("base64url")
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left)

  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function makeSignedToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")

  return `${encoded}.${signature(encoded)}`
}

function readSignedToken(token) {
  if (typeof token !== "string") return null

  const separator = token.lastIndexOf(".")

  if (separator < 1) return null

  const encoded = token.slice(0, separator)

  const receivedSignature = token.slice(separator + 1)

  if (!safeEqual(signature(encoded), receivedSignature)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    )

    if (
      typeof payload.sub !== "string" ||
      !/^[a-f\d]{24}$/i.test(payload.sub) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Date.now()
    )
      return null

    return payload
  } catch {
    return null
  }
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,

    secure: config.nodeEnv === "production",

    sameSite: "strict",

    path: "/",

    ...(maxAge ? { maxAge } : {}),
  }
}

export function createSessionCookie(userId) {
  const token = makeSignedToken({
    sub: userId,

    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,

    nonce: randomBytes(16).toString("base64url"),
  })

  return {
    name: SESSION_COOKIE,
    value: token,
    options: cookieOptions(SESSION_MAX_AGE_SECONDS * 1000),
  }
}

export function clearSessionCookie(response) {
  response.clearCookie(SESSION_COOKIE, cookieOptions())
}

function createCsrfToken() {
  const random = randomBytes(32).toString("base64url")

  return `${random}.${signature(`csrf:${random}`)}`
}

function isValidCsrfToken(token) {
  if (typeof token !== "string") return false

  const separator = token.lastIndexOf(".")

  if (separator < 1) return false

  const random = token.slice(0, separator)

  return safeEqual(signature(`csrf:${random}`), token.slice(separator + 1))
}

export function getCsrfToken(request, response) {
  const existing = request.cookies[CSRF_COOKIE]

  const token = isValidCsrfToken(existing) ? existing : createCsrfToken()

  response.cookie(CSRF_COOKIE, token, {
    httpOnly: false,

    secure: config.nodeEnv === "production",

    sameSite: "strict",

    path: "/",
  })

  return token
}

export function requireCsrf(request, response, next) {
  const cookieToken = request.cookies[CSRF_COOKIE]

  const headerToken = request.get("x-csrf-token")

  const origin = request.get("origin")

  if (
    !origin ||
    !config.frontendOrigins.includes(origin) ||
    !isValidCsrfToken(cookieToken) ||
    !safeEqual(cookieToken, headerToken ?? "")
  ) {
    next(
      new HttpError(
        403,
        "This request could not be verified. Refresh and try again.",
      ),
    )

    return
  }

  next()
}

export const requireAuth = asyncRoute(async (request, response, next) => {
  const claims = readSignedToken(request.cookies[SESSION_COOKIE])

  if (!claims) throw new HttpError(401, "Please sign in to continue.")

  if (!/^[a-f\d]{24}$/i.test(claims.sub)) {
    throw new HttpError(401, "Please sign in to continue.")
  }

  const user = await User.findById(claims.sub)

  if (!user) throw new HttpError(401, "Please sign in to continue.")

  request.user = user

  next()
})

export function requireRole(role) {
  return (request, response, next) => {
    if (!request.user) {
      next(new HttpError(401, "Please sign in to continue."))

      return
    }

    if (request.user.role !== role) {
      next(new HttpError(403, "You do not have permission to do that."))

      return
    }

    next()
  }
}
