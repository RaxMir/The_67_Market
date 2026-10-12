import test from "node:test"

import assert from "node:assert/strict"

import {
  findUniqueProductCode,
  generateBaseProductCode,
  normalizeProductName,
} from "./product-code.js"

test("normalizes names using only English alphabetic characters", () => {
  assert.equal(normalizeProductName("123 Apple 2"), "APPLE")

  assert.equal(normalizeProductName("Phone X"), "PHONEX")
})

test("generates the specified product code for Apple", () => {
  assert.equal(generateBaseProductCode("Apple"), "0116161205A1")
})

test("rejects product names without English letters", () => {
  assert.throws(() => generateBaseProductCode("12345"), {
    status: 400,

    message: "Product name must contain at least one English letter (A-Z).",
  })
})

test("allocates the first unused product-code suffix", async () => {
  const reserved = new Set(["0116161205A1", "0116161205A1-2"])
  const code = await findUniqueProductCode("Apple", async (candidate) =>
    reserved.has(candidate),
  )

  assert.equal(code, "0116161205A1-3")
})
