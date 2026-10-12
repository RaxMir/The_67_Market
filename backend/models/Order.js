import mongoose from "mongoose"

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "Product",

      required: true,
    },

    productCode: { type: String, required: true },

    name: { type: String, required: true },

    price: { type: Number, required: true, min: 0 },

    quantity: { type: Number, required: true, min: 1, max: 99 },

    lineTotal: { type: Number, required: true, min: 0 },

    color: { type: String, default: "" },

    size: { type: String, default: "" },
  },

  { _id: false },
)

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,

      index: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: (items) => items.length > 0,
    },

    subtotal: { type: Number, required: true, min: 0 },

    shipping: { type: Number, required: true, min: 0 },

    total: { type: Number, required: true, min: 0 },

    status: {
      type: String,

      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],

      default: "pending",

      required: true,
    },

    idempotencyKey: { type: String, required: true },
  },

  { timestamps: { createdAt: true, updatedAt: false } },
)

orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true })

orderSchema.index({ userId: 1, createdAt: -1 })

export default mongoose.models.Order ?? mongoose.model("Order", orderSchema)
