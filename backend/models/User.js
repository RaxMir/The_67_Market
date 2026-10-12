import mongoose from "mongoose"

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,

      required: true,

      trim: true,

      lowercase: true,

      minlength: 3,

      maxlength: 32,

      match: /^[a-z0-9_-]+$/,

      unique: true,

      index: true,
    },

    passwordHash: { type: String, required: true, select: false },

    role: {
      type: String,

      enum: ["user", "admin"],

      default: "user",

      required: true,
    },

    displayName: { type: String, required: true, maxlength: 120 },

    email: { type: String, default: "", maxlength: 254 },

    phone: { type: String, default: "", maxlength: 40 },

    address: { type: String, default: "", maxlength: 255 },

    city: { type: String, default: "", maxlength: 120 },
  },

  { timestamps: { createdAt: true, updatedAt: true } },
)

export default mongoose.models.User ?? mongoose.model("User", userSchema)
