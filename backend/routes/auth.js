import { Router } from "express"

import { asyncRoute, HttpError } from "../errors.js"

import { authenticateAccount, createAccount } from "../auth/accounts.js"

import User from "../models/User.js"

import {
  clearSessionCookie,
  createSessionCookie,
  getCsrfToken,
  requireAuth,
  requireCsrf,
} from "../security.js"

const router = Router()

function publicUser(user) {
  return {
    id: String(user.id),

    username: user.username,

    role: user.role,

    displayName: user.displayName,

    email: user.email ?? "",

    phone: user.phone ?? "",

    address: user.address ?? "",

    city: user.city ?? "",
  }
}

router.get("/csrf", (request, response) => {
  response.json({ token: getCsrfToken(request, response) })
})

router.get("/me", (request, response, next) => {
  if (!request.cookies.s67_session) {
    response.json({ user: null })

    return
  }

  requireAuth(request, response, (error) => {
    if (error) {
      if (error.status === 401) {
        response.clearCookie("s67_session", { path: "/" })

        response.json({ user: null })

        return
      }

      next(error)

      return
    }

    response.json({ user: publicUser(request.user) })
  })
})

router.post(
  "/login",

  requireCsrf,

  asyncRoute(async (request, response) => {
    const user = await authenticateAccount(
      request.body?.username,
      request.body?.password,
    )

    const session = createSessionCookie(String(user.id))

    response.cookie(session.name, session.value, session.options)

    response.json({ user: publicUser(user) })
  }),
)

router.post(
  "/register",

  requireCsrf,

  asyncRoute(async (request, response) => {
    const user = await createAccount(
      request.body?.username,
      request.body?.password,
    )

    const session = createSessionCookie(String(user.id))

    response.cookie(session.name, session.value, session.options)

    response.status(201).json({ user: publicUser(user) })
  }),
)

router.post("/logout", requireCsrf, (request, response) => {
  clearSessionCookie(response)

  response.status(204).end()
})

router.patch(
  "/profile",

  requireCsrf,

  requireAuth,

  asyncRoute(async (request, response) => {
    const fields = ["displayName", "email", "phone", "address", "city"]

    const values = fields.map((field) => request.body?.[field])

    if (values.some((value) => typeof value !== "string")) {
      throw new HttpError(400, "All profile fields must be strings.")
    }

    const [displayName, email, phone, address, city] = values.map((value) =>
      value.trim(),
    )

    if (!displayName || displayName.length > 120) {
      throw new HttpError(400, "Name must be between 1 and 120 characters.")
    }

    if (
      email.length > 254 ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      throw new HttpError(400, "Enter a valid email address.")
    }

    if (phone.length > 40 || address.length > 255 || city.length > 120) {
      throw new HttpError(400, "One or more profile fields are too long.")
    }

    const user = await User.findByIdAndUpdate(
      request.user.id,
      {
        displayName,
        email: email || "",
        phone,
        address,
        city,
      },
      { new: true, runValidators: true },
    )

    if (!user) throw new HttpError(404, "The account could not be found.")

    response.json({ user: publicUser(user) })
  }),
)

export default router
