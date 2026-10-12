import { randomUUID } from "node:crypto"

import fs from "node:fs/promises"

import path from "node:path"

import multer from "multer"

import { fileTypeFromBuffer } from "file-type"

import { config } from "./config.js"

import { HttpError } from "./errors.js"

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

const IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],

  ["image/png", ".png"],

  ["image/webp", ".webp"],
])

export const receiveProductImages = multer({
  storage: multer.memoryStorage(),

  limits: { files: 6, fileSize: MAX_IMAGE_SIZE, fields: 8, fieldSize: 10_000 },

  fileFilter(request, file, callback) {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      callback(new HttpError(400, "Images must be JPEG, PNG, or WebP files."))

      return
    }

    callback(null, true)
  },
}).array("images", 6)

export async function saveVerifiedImages(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new HttpError(400, "Upload at least one product image.")
  }

  const saved = []

  try {
    await fs.mkdir(config.uploadDirectory, { recursive: true })

    for (const file of files) {
      const detected = await fileTypeFromBuffer(file.buffer)

      if (!detected || !ALLOWED_IMAGE_TYPES.has(detected.mime)) {
        throw new HttpError(400, "An uploaded file is not a supported image.")
      }

      const filename = `${randomUUID()}${IMAGE_EXTENSIONS.get(detected.mime)}`

      await fs.writeFile(
        path.join(config.uploadDirectory, filename),
        file.buffer,
        {
          flag: "wx",

          mode: 0o644,
        },
      )

      saved.push({ filename, imagePath: `/uploads/${filename}` })
    }

    return saved
  } catch (error) {
    await removeSavedImages(saved)

    throw error
  }
}

export async function removeSavedImages(files) {
  const results = await Promise.allSettled(
    files.map((file) =>
      fs.unlink(path.join(config.uploadDirectory, file.filename)),
    ),
  )

  for (const result of results) {
    if (result.status === "rejected" && result.reason.code !== "ENOENT") {
      console.error(
        "Could not remove an uploaded image after a failed operation",
        result.reason,
      )
    }
  }
}
