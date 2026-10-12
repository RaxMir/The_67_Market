import mongoose from "mongoose"

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },

    description: { type: String, required: true, trim: true, maxlength: 5000 },

    price: { type: Number, required: true, min: 0, max: 99_999_999.99 },

    productCode: { type: String, required: true, unique: true, index: true },

    images: {
      type: [String],
      required: true,
      validate: (images) => images.length > 0,
    },

    category: { type: String, required: true },

    composition: { type: String, default: "", maxlength: 255 },

    tag: { type: String, default: "", maxlength: 80 },

    colors: {
      type: [
        {
          name: { type: String, required: true },
          className: { type: String, required: true },
        },
      ],

      required: true,
    },

    sizes: { type: [String], required: true },

    isFeatured: { type: Boolean, default: false },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },
  },

  { timestamps: true },
)

productSchema.index({ category: 1, createdAt: -1 })

export default mongoose.models.Product ??
  mongoose.model("Product", productSchema)
