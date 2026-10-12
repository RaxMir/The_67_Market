export type AccountRole = "user" | "admin"
export type ProductCategory = "Outerwear" | "Shirts" | "Knitwear" | "T-shirts" | "Accessories" | "Gaming" | "Home audio"
export interface ProductColor {
  name: string
  className: string
}

export type Account = {
  id: string
  username: string
  role: AccountRole
  displayName: string
  email: string
  phone: string
  address: string
  city: string
}

export type StoreProduct = {
  id: string
  productCode: string
  name: string
  type: ProductCategory
  category: ProductCategory
  price: number
  colors: ProductColor[]
  sizes: string[]
  images: string[]
  description: string
  composition: string
  tag: string
  isFeatured: boolean
  createdAt?: string
}

export type OrderLine = {
  key: string
  productId: string
  productCode: string
  name: string
  price: number
  quantity: number
  lineTotal: number
  color: string
  size: string
}

export type StoreOrder = {
  id: string
  userId: string
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled"
  subtotal: number
  shipping: number
  total: number
  createdAt: string
  items: OrderLine[]
}

export type ProductDraft = {
  name: string
  description: string
  price: string
  category: string
  composition: string
  tag: string
  images: File[]
}

export type OrderDraftItem = {
  productId: string
  quantity: number
  color: string
  size: string
}

let csrfToken = ""

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T
  const payload = (await response.json().catch(() => null)) as {
    error?: string
  } | T | null

  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? payload.error
        : null

    if (response.status === 502) {
      throw new Error(
        "The store service is unavailable. Start the backend and check its database configuration.",
      )
    }

    throw new Error(
      typeof error === "string"
        ? error
        : `The request failed with status ${response.status}.`,
    )
  }

  if (payload === null)
    throw new Error("The server returned an empty response.")

  return payload as T
}

async function loadCsrfToken(force = false) {
  if (csrfToken && !force) return csrfToken

  const response = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
  })

  const data = await readResponse<{ token: string }>(response)

  csrfToken = data.token

  return csrfToken
}

export async function initializeApi() {
  await loadCsrfToken()
}

async function apiRequest<T>(
  path: string,

  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase()

  const headers = new Headers(options.headers)

  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    headers.set("X-CSRF-Token", await loadCsrfToken())
  }

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(path, {
    ...options,

    headers,

    credentials: "same-origin",
  })

  if (response.status === 403 && method !== "GET") {
    csrfToken = ""
  }

  return readResponse<T>(response)
}

export const api = {
  async getCurrentAccount() {
    const result = await apiRequest<{ user: Account | null }>("/api/auth/me")

    return result.user
  },

  async login(username: string, password: string) {
    const result = await apiRequest<{ user: Account }>("/api/auth/login", {
      method: "POST",

      body: JSON.stringify({ username, password }),
    })

    return result.user
  },

  async register(username: string, password: string) {
    const result = await apiRequest<{ user: Account }>("/api/auth/register", {
      method: "POST",

      body: JSON.stringify({ username, password }),
    })

    return result.user
  },

  async logout() {
    await apiRequest<void>("/api/auth/logout", { method: "POST" })

    csrfToken = ""
  },

  async updateProfile(profile: Omit<Account, "id" | "username" | "role">) {
    const result = await apiRequest<{ user: Account }>("/api/auth/profile", {
      method: "PATCH",

      body: JSON.stringify(profile),
    })

    return result.user
  },

  async getProducts() {
    const result = await apiRequest<{ products: StoreProduct[] }>(
      "/api/products",
    )

    return result.products
  },

  async getMyOrders() {
    const result = await apiRequest<{ orders: StoreOrder[] }>("/api/orders/my")

    return result.orders
  },

  async getAdminOrders() {
    const result = await apiRequest<{ orders: StoreOrder[] }>(
      "/api/orders/admin",
    )

    return result.orders
  },

  async createProduct(draft: ProductDraft) {
    const body = new FormData()

    body.set("name", draft.name)

    body.set("description", draft.description)

    body.set("price", draft.price)

    body.set("category", draft.category)

    body.set("composition", draft.composition)

    body.set("tag", draft.tag)

    for (const image of draft.images) body.append("images", image)

    const result = await apiRequest<{ product: StoreProduct }>(
      "/api/products",
      {
        method: "POST",

        body,
      },
    )

    return result.product
  },

  async createOrder(
    items: OrderDraftItem[],

    idempotencyKey: string,
  ) {
    const result = await apiRequest<{
      order: StoreOrder

      duplicate: boolean
    }>("/api/orders", {
      method: "POST",

      headers: { "Idempotency-Key": idempotencyKey },

      body: JSON.stringify({ items }),
    })

    return result
  },
}
