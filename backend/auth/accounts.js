import { Buffer } from "node:buffer"

import bcrypt from "bcryptjs"

import { HttpError } from "../errors.js"

import User from "../models/User.js"

const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/

const LOGIN_USERNAME_PATTERN = /^[a-z0-9_-]{1,64}$/

const MIN_PASSWORD_LENGTH = 8

const MAX_PASSWORD_BYTES = 72

export function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function validateNewAccount(usernameValue, password) {
  const username = normalizeUsername(usernameValue)

  if (!USERNAME_PATTERN.test(username)) {
    throw new HttpError(
      400,

      "Username must be 3–32 characters using letters, numbers, underscores, or hyphens.",
    )
  }

  if (!validatePassword(password)) {
    throw new HttpError(
      400,

      "Password must be at least 8 characters and no more than 72 bytes.",
    )
  }

  return { username, password }
}

function validatePassword(value) {
  return (
    typeof value === "string" &&
    value.length >= MIN_PASSWORD_LENGTH &&
    Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES
  )
}

export async function authenticateAccount(usernameValue, password) {
  const username = normalizeUsername(usernameValue)

  if (
    !LOGIN_USERNAME_PATTERN.test(username) ||
    typeof password !== "string" ||
    password.length < 1 ||
    Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES
  ) {
    throw new HttpError(401, "The username or password is incorrect.")
  }

  const user = await User.findOne({ username }).select("+passwordHash")

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "The username or password is incorrect.")
  }

  return user
}

export async function createAccount(usernameValue, password) {
  const credentials = validateNewAccount(usernameValue, password)

  const { username } = credentials

  try {
    const passwordHash = await bcrypt.hash(credentials.password, 12)
    return await User.create({
      username,
      passwordHash,
      role: "user",
      displayName: username,
    })
  } catch (error) {
    if (error.code === 11000) {
      throw new HttpError(409, "That username is already taken.")
    }

    throw error
  }
}
