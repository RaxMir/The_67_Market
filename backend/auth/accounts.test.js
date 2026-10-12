import test from "node:test"

import assert from "node:assert/strict"

import { validateNewAccount } from "./accounts.js"

test("normalizes new usernames and accepts valid credentials", () => {
  assert.deepEqual(validateNewAccount("  New_User  ", "password1"), {
    username: "new_user",

    password: "password1",
  })
})

test("rejects invalid usernames", () => {
  assert.throws(
    () => validateNewAccount("ab", "password1"),

    /Username must be 3–32 characters/,
  )

  assert.throws(
    () => validateNewAccount("bad username", "password1"),

    /Username must be 3–32 characters/,
  )
})

test("requires passwords with at least 8 characters", () => {
  assert.throws(
    () => validateNewAccount("new_user", "short"),

    /Password must be at least 8 characters/,
  )
})

test("rejects passwords that exceed bcrypt's 72-byte input limit", () => {
  assert.throws(
    () => validateNewAccount("new_user", "é".repeat(37)),

    /Password must be at least 8 characters/,
  )
})
