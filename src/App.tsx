import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import {
  api,
  getApiUrl,
  initializeApi,
  type Account,
  type CheckoutCustomer,
  type ProductCategory,
  type StoreOrderQuote,
  type StoreOrder,
  type StoreProduct,
} from "./api"

type Page = "main" | "catalog" | "product" | "support" | "profile" | "basket" | "create"
type IconName = "arrow" | "bag" | "chevron" | "filter" | "mail" | "minus" | "plus" | "telegram" | "trash" | "user"
type Category = "All pieces" | ProductCategory
type SortKey = "featured" | "high" | "low"
type ProfileTab = "Overview" | "Current orders" | "Order history" | "Profile info" | "Settings"
interface IconProps {
  name: IconName
  size?: number
}

interface NavigationLink {
  label: string
  page: Page
}

interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

interface OrderListProps {
  orders: Order[]
  empty: string
}

interface CartProductEntry {
  item: CartItem
  product: Product
}

type Product = StoreProduct

type CartItem = {
  key: string
  productId: string
  color: string
  size: string
  quantity: number
}

type Order = StoreOrder

type ProfileData = {
  name: string
  email: string
  phone: string
  address: string
  city: string
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

function productSearchScore(product: Product, query: string) {
  const terms = normalizeSearchText(query)
    .trim()
    .split(/\s+/)
    .filter((term) => term.length >= 3)
  if (!terms.length) return 1

  const searchable = normalizeSearchText(
    [
      product.name,
      product.description,
      product.type,
      product.category,
      product.tag,
      product.productCode,
      product.composition,
    ].join(" "),
  )
  const productTrigrams = new Set(
    searchable
      .split(/\s+/)
      .flatMap((word) =>
        Array.from({ length: Math.max(0, word.length - 2) }, (_, index) =>
          word.slice(index, index + 3),
        ),
      ),
  )
  let score = 0
  for (const term of terms) {
    if (searchable.includes(term)) {
      score += 1
      continue
    }
    const trigrams = Array.from({ length: term.length - 2 }, (_, index) =>
      term.slice(index, index + 3),
    )
    const matches = trigrams.filter((trigram) =>
      productTrigrams.has(trigram),
    ).length
    const termScore = matches / trigrams.length
    if (termScore < 0.6) return 0
    score += termScore
  }
  return score / terms.length
}

const categories: Category[] = [
  "All pieces",
  "Outerwear",
  "Shirts",
  "Knitwear",
  "T-shirts",
  "Accessories",
  "Gaming",
  "Home audio",
]

const offers = [
  {
    label: "Seasonal edit · Up to 40% off",
    title: "Fall layers,\nless expected.",
    action: "Shop fall offers",
    image:
      "https://images.unsplash.com/photo-1532332248682-206cc786359f?auto=format&fit=crop&w=1600&q=85",
    category: "Outerwear" as Category,
    theme: "light",
  },
  {
    label: "Level up your space",
    title: "The gaming\nsetup event.",
    action: "Explore setups",
    image:
      "https://images.unsplash.com/photo-1616588589676-62b3bd4ff6d2?auto=format&fit=crop&w=1600&q=85",
    category: "Gaming" as Category,
    theme: "dark",
  },
  {
    label: "Sound, considered",
    title: "Home audio\nwithout the noise.",
    action: "Hear the difference",
    image:
      "https://images.unsplash.com/photo-1679153369902-50687ca31379?auto=format&fit=crop&w=1600&q=85",
    category: "Home audio" as Category,
    theme: "light",
  },
]

function money(value: number) {
  return `$${value}`
}

function productById(products: Product[], id: string) {
  return products.find((product) => product.id === id)
}

function cartKey(productId: string, color: string, size: string) {
  return `${productId}-${color}-${size}`
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function usePersistedState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) as T : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state))
  }, [key, state])

  return [state, setState] as const
}

function loadPersistedCart(): CartItem[] {
  try {
    const raw = localStorage.getItem("s67-cart")
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((value): CartItem[] => {
      if (
        !value ||
        typeof value !== "object" ||
        !("productId" in value) ||
        typeof value.productId !== "string" ||
        !/^[a-f\d]{24}$/i.test(value.productId) ||
        !("color" in value) ||
        typeof value.color !== "string" ||
        !("size" in value) ||
        typeof value.size !== "string" ||
        !("quantity" in value) ||
        typeof value.quantity !== "number" ||
        !Number.isSafeInteger(value.quantity) ||
        value.quantity < 1 ||
        value.quantity > 99
      ) {
        return []
      }

      return [
        {
          key: cartKey(value.productId, value.color, value.size),
          productId: value.productId,
          color: value.color,
          size: value.size,
          quantity: value.quantity,
        },
      ]
    })
  } catch {
    return []
  }
}

function usePersistedCart() {
  const [cart, setCart] = useState<CartItem[]>(loadPersistedCart)

  useEffect(() => {
    localStorage.setItem("s67-cart", JSON.stringify(cart))
  }, [cart])

  return [cart, setCart] as const
}

function Icon({ name, size = 20 }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    bag: (
      <>
        <path d="M5 8h14l-1 12H6L5 8Z" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      </>
    ),
    chevron: <path d="m7 10 5 5 5-5" />,
    filter: <path d="M4 7h16M7 12h10M10 17h4" />,
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    minus: <path d="M5 12h14" />,
    plus: <path d="M12 5v14M5 12h14" />,
    telegram: <path d="m21 4-3 16-6-5-4 3 1-5 8-6-10 5-4-2 18-6Z" />,
    trash: (
      <>
        <path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      {paths[name]}
    </svg>
  )
}

function Header({
  page,
  setPage,
  cartCount,
  account,
}: {
  page: Page
  setPage: (page: Page) => void
  cartCount: number
  account: Account | null
}) {
  const links: NavigationLink[] = [
    { label: "Main", page: "main" },
    { label: "Catalog", page: "catalog" },
    { label: "Support", page: "support" },
    { label: "Profile", page: "profile" },
  ]
  if (account?.role === "admin") links.push({ label: "Create", page: "create" })

  return (
    <header className="site-header">
      <button
        className="brand"
        onClick={() => setPage("main")}
        aria-label="Go to main page"
      >
        six-seven <span>market</span>
      </button>
      <nav aria-label="Main navigation">
        {links.map((link) => (
          <button
            className={page === link.page ? "nav-link active" : "nav-link"}
            key={link.page}
            onClick={() => setPage(link.page)}
          >
            {link.label}
          </button>
        ))}
      </nav>
      <button
        className="basket-link"
        onClick={() => setPage("basket")}
        aria-label={`Basket, ${cartCount} items`}
      >
        <Icon name="bag" />
        <span>Basket</span>
        <b>{cartCount}</b>
      </button>
    </header>
  )
}

function DragScrollArea({
  className,
  label,
  children,
}: {
  className: string
  label: string
  children: ReactNode
}) {
  const drag = useRef<{
    pointerId: number
    startX: number
    startScrollLeft: number
    dragging: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  return (
    <div
      className={`drag-scroll ${className} ${isDragging ? "is-dragging" : ""}`}
      role="region"
      aria-label={label}
      tabIndex={0}
      onPointerDown={(event) => {
        if (
          !event.isPrimary ||
          event.currentTarget.scrollWidth <= event.currentTarget.clientWidth ||
          (event.pointerType === "mouse" && event.button !== 0)
        )
          return
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startScrollLeft: event.currentTarget.scrollLeft,
          dragging: false,
        }
      }}
      onPointerMove={(event) => {
        const activeDrag = drag.current
        if (!activeDrag || activeDrag.pointerId !== event.pointerId) return

        const distance = event.clientX - activeDrag.startX
        if (!activeDrag.dragging && Math.abs(distance) > 5) {
          activeDrag.dragging = true
          event.currentTarget.setPointerCapture(event.pointerId)
          setIsDragging(true)
        }
        if (activeDrag.dragging) {
          event.preventDefault()
          event.currentTarget.scrollLeft = activeDrag.startScrollLeft - distance
        }
      }}
      onPointerUp={(event) => {
        const activeDrag = drag.current
        if (!activeDrag || activeDrag.pointerId !== event.pointerId) return
        suppressClick.current = activeDrag.dragging
        drag.current = null
        setIsDragging(false)
      }}
      onPointerCancel={() => {
        drag.current = null
        setIsDragging(false)
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault()
          event.currentTarget.scrollBy({
            left:
              event.key === "ArrowRight"
                ? event.currentTarget.clientWidth
                : -event.currentTarget.clientWidth,
            behavior: "smooth",
          })
        }
      }}
    >
      {children}
    </div>
  )
}

function MainMenu({
  products,
  productsLoading,
  productsError,
  availableCategories,
  onRetry,
  openCatalog,
  openProduct,
}: {
  products: Product[]
  productsLoading: boolean
  productsError: string
  availableCategories: ProductCategory[]
  onRetry: () => void
  openCatalog: (category: Category) => void
  openProduct: (id: string) => void
}) {
  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] =
    useState<ProductCategory | "">("")
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  const hasSearch = query.trim().length >= 3
  const isFiltered =
    hasSearch ||
    Boolean(selectedCategory) ||
    Boolean(minPrice) ||
    Boolean(maxPrice)
  const matchedProducts = useMemo(() => {
    return products
      .map((product) => ({
        product,
        score: hasSearch ? productSearchScore(product, query) : 1,
      }))
      .filter(({ product, score }) => {
        const low = minPrice === "" ? null : Number(minPrice)
        const high = maxPrice === "" ? null : Number(maxPrice)
        return (
          score > 0 &&
          (!selectedCategory || product.category === selectedCategory) &&
          (low === null || product.price >= low) &&
          (high === null || product.price <= high)
        )
      })
      .sort((left, right) =>
        hasSearch && left.score !== right.score
          ? right.score - left.score
          : Number(right.product.isFeatured) - Number(left.product.isFeatured),
      )
      .map(({ product }) => product)
  }, [hasSearch, maxPrice, minPrice, products, query, selectedCategory])
  const featuredProducts = products.filter((product) => product.isFeatured)
  const displayedProducts = (
    isFiltered
      ? matchedProducts
      : featuredProducts.length
        ? featuredProducts
        : products
  ).slice(0, isFiltered ? 12 : 4)
  const invalidPriceRange =
    minPrice !== "" && maxPrice !== "" && Number(minPrice) > Number(maxPrice)

  return (
    <main className="main-menu">
      <section className="main-intro">
        <p className="eyebrow">six-seven market · Current selection</p>
        <div>
          <h1>
            Good finds,
            <br />
            all in one place.
          </h1>
          <p>
            Useful things with a point of view—from what you wear to how you
            play and live.
          </p>
        </div>
      </section>

      <DragScrollArea
        className="offer-stack"
        label="Featured offers. Scroll horizontally to explore."
      >
        {offers.map((offer, index) => (
          <button
            className={`offer-billboard ${offer.theme}`}
            key={offer.title}
            onClick={() => openCatalog(offer.category)}
          >
            <img src={offer.image} alt="" />
            <span className="offer-shade" />
            <span className="offer-number">0{index + 1}</span>
            <span className="offer-content">
              <small>{offer.label}</small>
              <strong>
                {offer.title.split("\n").map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </strong>
              <span className="offer-action">
                {offer.action}
                <Icon name="arrow" />
              </span>
            </span>
          </button>
        ))}
      </DragScrollArea>

      <section className="single-products">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Find your next favorite</p>
            <h2>Shop the collection</h2>
          </div>
          <p className="single-products-intro">
            Search names, descriptions, categories, and product codes. Search
            starts at three characters.
          </p>
        </div>
        <div className="store-search-controls">
          <label className="store-search">
            <span className="sr-only">Search products</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products (3+ characters)"
            />
          </label>
          <label>
            <span className="sr-only">Filter by category</span>
            <select
              value={selectedCategory}
              onChange={(event) =>
                setSelectedCategory(event.target.value as ProductCategory | "")
              }
            >
              <option value="">All categories</option>
              {availableCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Minimum price</span>
            <input
              aria-label="Minimum price"
              type="number"
              min="0"
              step="0.01"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              placeholder="Min price"
            />
          </label>
          <label>
            <span className="sr-only">Maximum price</span>
            <input
              aria-label="Maximum price"
              type="number"
              min="0"
              step="0.01"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder="Max price"
            />
          </label>
        </div>
        {query.trim().length > 0 && query.trim().length < 3 && (
          <p className="form-hint" role="status">
            Enter at least 3 characters to search.
          </p>
        )}
        {invalidPriceRange && (
          <p className="form-error" role="alert">
            Minimum price must not be higher than maximum price.
          </p>
        )}
        {productsError ? (
          <div className="empty-state">
            <h3>Products are unavailable</h3>
            <p>{productsError}</p>
            <button className="text-link" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : productsLoading ? (
          <p className="store-message" role="status">
            Loading products…
          </p>
        ) : !invalidPriceRange && displayedProducts.length ? (
          <DragScrollArea
            className={`single-product-list ${
              isFiltered ? "search-results" : ""
            }`}
            label="Products. Scroll horizontally to explore."
          >
            {displayedProducts.map((product, index) => (
              <button
                className="single-product"
                key={product.id}
                onClick={() => openProduct(product.id)}
              >
                <span className="single-index">0{index + 1}</span>
                <span className="single-thumb">
                  <img src={getApiUrl(product.images[0])} alt={product.name} />
                </span>
                <span className="single-copy">
                  <small>{product.tag}</small>
                  <strong>{product.name}</strong>
                  <span>{product.description}</span>
                </span>
                <b>{money(product.price)}</b>
                <small className="stock-label">
                  {product.stock > 0
                    ? `${product.stock} available`
                    : "Out of stock"}
                </small>
                <span className="single-arrow">
                  <Icon name="arrow" />
                </span>
              </button>
            ))}
          </DragScrollArea>
        ) : (
          <div className="empty-state">
            <h3>
              {products.length ? "No matching products" : "No products yet"}
            </h3>
            <p>
              {products.length
                ? "Adjust the search or filters to find another product."
                : "New products will appear here when they are added to the store."}
            </p>
          </div>
        )}
      </section>
    </main>
  )
}

function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <div className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {item.onClick ? (
            <button className="crumb-button" onClick={item.onClick}>
              {item.label}
            </button>
          ) : (
            item.label
          )}
          {index < items.length - 1 && <i>/</i>}
        </span>
      ))}
    </div>
  )
}

function ProductCard({
  product,
  onClick,
  compact = false,
}: {
  product: Product
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      className={`product-card ${compact ? "compact" : ""}`}
      onClick={onClick}
    >
      <div className="product-image-wrap">
        <img src={getApiUrl(product.images[0])} alt={product.name} />
        {!compact && product.colors[0] && (
          <span className="product-color">{product.colors[0].name}</span>
        )}
        <span className="card-arrow">
          <Icon name="arrow" size={18} />
        </span>
      </div>
      <div className="product-meta">
        <div>
          <span>{product.type}</span>
          <strong>{product.name}</strong>
          <small className="stock-label">
            {product.stock > 0 ? `${product.stock} available` : "Out of stock"}
          </small>
        </div>
        <b>{money(product.price)}</b>
      </div>
    </button>
  )
}

function Catalog({
  products,
  productsLoading,
  productsError,
  category,
  setCategory,
  sort,
  setSort,
  openProduct,
  setPage,
}: {
  products: Product[]
  productsLoading: boolean
  productsError: string
  category: Category
  setCategory: (category: Category) => void
  sort: SortKey
  setSort: (sort: SortKey) => void
  openProduct: (id: string) => void
  setPage: (page: Page) => void
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const matchesCategory =
        category === "All pieces" || product.type === category
      const matchesQuery =
        query.trim().length < 3 || productSearchScore(product, query) > 0
      const matchesMin = minPrice === "" || product.price >= Number(minPrice)
      const matchesMax = maxPrice === "" || product.price <= Number(maxPrice)
      return matchesCategory && matchesQuery && matchesMin && matchesMax
    })
    if (sort === "high") return [...filtered].sort((a, b) => b.price - a.price)
    if (sort === "low") return [...filtered].sort((a, b) => a.price - b.price)
    return filtered
  }, [category, maxPrice, minPrice, query, sort])
  const invalidPriceRange =
    minPrice !== "" && maxPrice !== "" && Number(minPrice) > Number(maxPrice)

  const sortLabel =
    sort === "high"
      ? "Bigger to smaller"
      : sort === "low"
        ? "Smaller to bigger"
        : "Featured"

  return (
    <main>
      <section className="catalog-hero">
        <div>
          <p className="eyebrow">Current selection</p>
          <h1>
            Quiet essentials,
            <br />
            made to be lived in.
          </h1>
        </div>
        <p className="hero-copy">
          A considered collection of everyday pieces, built from natural fibers
          and designed with an easy, lasting shape.
        </p>
      </section>

      <div className="catalog-toolbar">
        <Breadcrumbs
          items={[
            { label: "Main", onClick: () => setPage("main") },
            { label: category },
            { label: sortLabel },
          ]}
        />
        <button
          className="filter-toggle"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
          aria-controls="catalog-filters"
        >
          <Icon name="filter" />
          Filters
        </button>
        <label className="catalog-search">
          <span className="sr-only">Search products</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
          />
        </label>
        <button
          className="sort-toggle"
          onClick={() =>
            setSort(
              sort === "featured"
                ? "high"
                : sort === "high"
                  ? "low"
                  : "featured",
            )
          }
        >
          {sortLabel}
          <Icon name="chevron" size={16} />
        </button>
        <span className="item-count">{visibleProducts.length} pieces</span>
      </div>

      <section className="catalog-layout">
        <aside
          className={filtersOpen ? "sidebar open" : "sidebar"}
          id="catalog-filters"
        >
          <div className="sidebar-head">
            <p>Categories</p>
            <button
              onClick={() => setFiltersOpen(false)}
              aria-label="Close filters"
            >
              <Icon name="minus" />
            </button>
          </div>
          <div className="price-filters">
            <p>Price range</p>
            <label>
              <span className="sr-only">Minimum price</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Min"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Maximum price</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Max"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
              />
            </label>
          </div>
          {categories.map((item) => (
            <button
              className={category === item ? "category active" : "category"}
              key={item}
              onClick={() => {
                setCategory(item)
                setFiltersOpen(false)
              }}
            >
              {item}
              {category === item && (
                <span>0{categories.indexOf(item) + 1}</span>
              )}
            </button>
          ))}
          <div className="sidebar-note">
            <span>Selected view</span>
            <p>{category}</p>
          </div>
        </aside>
        <div className="product-grid">
          {productsLoading ? (
            <p className="store-message" role="status">
              Loading products…
            </p>
          ) : productsError ? (
            <div className="empty-state catalog-empty" role="alert">
              <h3>Could not load products</h3>
              <p>{productsError}</p>
            </div>
          ) : invalidPriceRange ? (
            <div className="empty-state catalog-empty" role="alert">
              <h3>Invalid price range</h3>
              <p>Minimum price must not be higher than maximum price.</p>
            </div>
          ) : visibleProducts.length ? (
            visibleProducts.map((product) => (
              <ProductCard
                product={product}
                onClick={() => openProduct(product.id)}
                key={product.id}
              />
            ))
          ) : (
            <div className="empty-state catalog-empty">
              <span>00</span>
              <h3>No matching pieces</h3>
              <p>Try another category or clear your search.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function ProductDetail({
  products,
  product,
  addToCart,
  openProduct,
  setPage,
  openCatalog,
}: {
  products: Product[]
  product: Product
  addToCart: (item: Omit<CartItem, "key">) => void
  openProduct: (id: string) => void
  setPage: (page: Page) => void
  openCatalog: (category: Category) => void
}) {
  const [size, setSize] = useState(
    product.sizes.includes("M") ? "M" : product.sizes[0],
  )
  const [color, setColor] = useState(product.colors[0].name)
  const [imageIndex, setImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [guideOpen, setGuideOpen] = useState(false)
  const [added, setAdded] = useState(false)
  const addedRef = useRef(false)

  useEffect(() => {
    setSize(product.sizes.includes("M") ? "M" : product.sizes[0])
    setColor(product.colors[0].name)
    setImageIndex(0)
    setQuantity(1)
    setAdded(false)
    addedRef.current = false
  }, [product.id, product.stock])

  const related = products.filter(
    (item) => item.id !== product.id && item.type === product.type,
  )
  const more = related.length
    ? related
    : products.filter((item) => item.id !== product.id)

  return (
    <main className="detail-page">
      <Breadcrumbs
        items={[
          { label: "Catalog", onClick: () => openCatalog("All pieces") },
          { label: product.type, onClick: () => openCatalog(product.type) },
          { label: product.name },
        ]}
      />
      <section className="detail-grid">
        <div className="detail-photo">
          <img src={getApiUrl(product.images[imageIndex])} alt={product.name} />
          <div className="photo-controls">
            <button
              aria-label="Previous image"
              onClick={() =>
                setImageIndex((index) =>
                  index === 0 ? product.images.length - 1 : index - 1,
                )
              }
            >
              <Icon name="arrow" size={16} />
            </button>
            <span>
              {String(imageIndex + 1).padStart(2, "0")} /{" "}
              {String(product.images.length).padStart(2, "0")}
            </span>
            <button
              aria-label="Next image"
              onClick={() =>
                setImageIndex((index) => (index + 1) % product.images.length)
              }
            >
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
        <div className="detail-info">
          <p className="eyebrow">
            {product.type} / No. 0{product.id}
          </p>
          <h1>{product.name}</h1>
          <p className="price">{money(product.price)}</p>
          <p className="stock-label detail-stock">
            {product.stock > 0
              ? `${product.stock} available`
              : "Currently out of stock"}
          </p>
          <p className="product-code">Product code · {product.productCode}</p>
          <p className="description">{product.description}</p>
          <div className="choice-block">
            <div className="choice-label">
              <span>Color</span>
              <b>{color}</b>
            </div>
            <div className="swatches">
              {product.colors.map((item) => (
                <button
                  className={`swatch ${item.className} ${
                    color === item.name ? "active" : ""
                  }`}
                  aria-label={item.name}
                  aria-pressed={color === item.name}
                  key={item.name}
                  disabled={added}
                  onClick={() => setColor(item.name)}
                />
              ))}
            </div>
          </div>
          <div className="choice-block">
            <div className="choice-label">
              <span>Select size</span>
              {product.sizes.length > 1 && (
                <button type="button" onClick={() => setGuideOpen(true)}>
                  Size guide
                </button>
              )}
            </div>
            <div className={`sizes ${product.sizes.length < 5 ? "few" : ""}`}>
              {product.sizes.map((item) => (
                <button
                  className={size === item ? "active" : ""}
                  aria-pressed={size === item}
                  key={item}
                  disabled={added}
                  onClick={() => setSize(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="choice-block qty-block">
            <div className="choice-label">
              <span>Quantity</span>
              <b>{quantity}</b>
            </div>
            <div className="qty-controls">
              <button
                aria-label="Decrease quantity"
                disabled={added || quantity <= 1 || product.stock <= 0}
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                <Icon name="minus" size={16} />
              </button>
              <span>{quantity}</span>
              <button
                aria-label="Increase quantity"
                disabled={added || quantity >= Math.min(99, product.stock)}
                onClick={() =>
                  setQuantity((value) => Math.min(99, product.stock, value + 1))
                }
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>
          <button
            className="order-button"
            disabled={product.stock <= 0}
            onClick={() => {
              if (addedRef.current) {
                setPage("basket")
                return
              }
              addedRef.current = true
              addToCart({ productId: product.id, color, size, quantity })
              setAdded(true)
            }}
          >
            <span>
              {product.stock <= 0
                ? "Unavailable"
                : added
                  ? "Go to basket"
                  : "Add to basket"}
            </span>
            <span>{money(product.price * quantity)}</span>
          </button>
          <div className="detail-notes">
            <p>
              <b>Composition</b>
              <span>{product.composition}</span>
            </p>
            <p>
              <b>Delivery</b>
              <span>Complimentary over $150</span>
            </p>
          </div>
        </div>
      </section>
      <section className="recommended">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Complete the look</p>
            <h2>You may also like</h2>
          </div>
          <button onClick={() => setPage("catalog")}>
            View all <Icon name="arrow" />
          </button>
        </div>
        <div className="recommend-grid">
          {more.slice(0, 3).map((item) => (
            <ProductCard
              compact
              product={item}
              onClick={() => openProduct(item.id)}
              key={item.id}
            />
          ))}
        </div>
      </section>
      {guideOpen && (
        <div className="modal-backdrop" onClick={() => setGuideOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <p className="eyebrow">Fit notes</p>
              <button
                aria-label="Close size guide"
                onClick={() => setGuideOpen(false)}
              >
                <Icon name="plus" />
              </button>
            </div>
            <h2>Size guide</h2>
            <p>
              Designed for an easy, slightly relaxed fit. If you prefer a closer
              shape, consider sizing down.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Chest</th>
                  <th>Length</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["XS", "86 cm", "66 cm"],
                  ["S", "92 cm", "68 cm"],
                  ["M", "98 cm", "70 cm"],
                  ["L", "104 cm", "72 cm"],
                  ["XL", "110 cm", "74 cm"],
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell) => (
                      <td key={cell}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  )
}

function Support() {
  const [open, setOpen] = useState<number | null>(0)
  const [sent, setSent] = useState(false)
  const faqs = [
    [
      "When will my order arrive?",
      "Orders are prepared within 1–2 business days. Standard delivery typically takes 3–5 business days.",
    ],
    [
      "Can I change or cancel an order?",
      "Contact us as soon as possible. If your order has not been packed, we’ll be happy to make changes.",
    ],
    [
      "What is your return policy?",
      "Unworn pieces may be returned in their original condition within 30 days of delivery.",
    ],
  ]
  return (
    <main className="utility-page">
      <div className="utility-intro">
        <p className="eyebrow">Here when you need us</p>
        <h1>Support</h1>
        <p>
          Questions about a piece, your order, or delivery? Our small customer
          care team is ready to help.
        </p>
      </div>
      <section className="contact-panel">
        <p className="panel-label">Contact us</p>
        <a href="https://t.me/" target="_blank" rel="noreferrer">
          <span className="contact-icon">
            <Icon name="telegram" />
          </span>
          <span>
            <b>Telegram</b>
            <small>Typically replies within an hour</small>
          </span>
          <Icon name="arrow" />
        </a>
        <a href="mailto:hello@six-seven.market">
          <span className="contact-icon">
            <Icon name="mail" />
          </span>
          <span>
            <b>Email</b>
            <small>hello@six-seven.market</small>
          </span>
          <Icon name="arrow" />
        </a>
      </section>
      <form
        className="support-form"
        onSubmit={(event) => {
          event.preventDefault()
          setSent(true)
        }}
      >
        <p className="eyebrow">Write to us</p>
        <h2>Send a note</h2>
        <label>
          Name
          <input name="name" required defaultValue="Matthew Coll" />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            defaultValue="alex@six-seven.market"
          />
        </label>
        <label>
          Message
          <textarea
            name="message"
            required
            rows={4}
            placeholder="How can we help?"
          />
        </label>
        <button className="order-button" type="submit">
          <span>{sent ? "Message sent" : "Send message"}</span>
          <Icon name="arrow" />
        </button>
      </form>
      <section className="faq-section">
        <div>
          <p className="eyebrow">Default info</p>
          <h2>Frequently asked</h2>
        </div>
        <div className="faq-list">
          {faqs.map(([question, answer], index) => (
            <div className="faq" key={question}>
              <button
                onClick={() => setOpen(open === index ? null : index)}
                aria-expanded={open === index}
                aria-controls={`faq-answer-${index}`}
              >
                <span>{question}</span>
                <Icon name={open === index ? "minus" : "plus"} />
              </button>
              <p id={`faq-answer-${index}`} hidden={open !== index}>
                {answer}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function Profile({
  account,
  authLoading,
  authError,
  onLogin,
  onRegister,
  onLogout,
  saveProfile,
  products,
  orders,
  ordersLoading,
  ordersError,
  setPage,
}: {
  account: Account | null
  authLoading: boolean
  authError: string
  onLogin: (username: string, password: string) => Promise<void>
  onRegister: (username: string, password: string) => Promise<void>
  onLogout: () => Promise<void>
  saveProfile: (profile: ProfileData) => Promise<void>
  products: Product[]
  orders: Order[]
  ordersLoading: boolean
  ordersError: string
  setPage: (page: Page) => void
}) {
  const [active, setActive] = useState<ProfileTab>("Overview")
  const profile: ProfileData = {
    name: account?.displayName ?? "",
    email: account?.email ?? "",
    phone: account?.phone ?? "",
    address: account?.address ?? "",
    city: account?.city ?? "",
  }
  const [draft, setDraft] = useState(profile)
  const [saved, setSaved] = useState(false)
  const [loginName, setLoginName] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [authMode, setAuthMode] = useState<"login" | "register">("login")
  const [loginError, setLoginError] = useState("")
  const [loginPending, setLoginPending] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [savePending, setSavePending] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)
  const [emailAlerts, setEmailAlerts] = usePersistedState(
    "s67-email-alerts",
    true,
  )
  const [orderAlerts, setOrderAlerts] = usePersistedState(
    "s67-order-alerts",
    true,
  )
  const sections: ProfileTab[] = [
    "Overview",
    "Current orders",
    "Order history",
    "Profile info",
    "Settings",
  ]
  const current = orders.filter((order) =>
    ["pending", "processing", "shipped"].includes(order.status),
  )
  const history = orders.filter((order) =>
    ["delivered", "cancelled"].includes(order.status),
  )

  useEffect(() => {
    setDraft(profile)
    setSaved(false)
  }, [
    account?.id,
    account?.displayName,
    account?.email,
    account?.phone,
    account?.address,
    account?.city,
  ])

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginError("")
    if (authMode === "register" && loginPassword !== confirmPassword) {
      setLoginError("Passwords do not match.")
      return
    }
    setLoginPending(true)
    try {
      if (authMode === "register") {
        await onRegister(loginName, loginPassword)
      } else {
        await onLogin(loginName, loginPassword)
      }
      setLoginPassword("")
      setConfirmPassword("")
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : authMode === "register"
            ? "Could not create your account."
            : "Could not sign in.",
      )
    } finally {
      setLoginPending(false)
    }
  }

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaveError("")
    setSavePending(true)
    try {
      await saveProfile(draft)
      setSaved(true)
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save profile.",
      )
    } finally {
      setSavePending(false)
    }
  }

  return (
    <main className="profile-page">
      <div className="profile-title">
        <p className="eyebrow">Your space</p>
        <h1>Profile</h1>
      </div>
      {!account ? (
        <section className="profile-shell auth-shell">
          <div className="profile-content">
            <p className="eyebrow">Welcome back</p>
            <h2>
              {authMode === "login"
                ? "Sign in to your account"
                : "Create your account"}
            </h2>
            {authLoading ? (
              <p className="store-message" role="status">
                Checking your sign-in…
              </p>
            ) : (
              <form className="profile-form login-form" onSubmit={submitAuth}>
                <label>
                  Username
                  <input
                    autoComplete="username"
                    value={loginName}
                    onChange={(event) => setLoginName(event.target.value)}
                    minLength={authMode === "register" ? 3 : 1}
                    maxLength={authMode === "register" ? 32 : 64}
                    pattern={
                      authMode === "register"
                        ? "[a-zA-Z0-9_\\-]{3,32}"
                        : undefined
                    }
                    title="Use letters, numbers, underscores, or hyphens."
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete={
                      authMode === "register"
                        ? "new-password"
                        : "current-password"
                    }
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    minLength={authMode === "register" ? 8 : undefined}
                    maxLength={72}
                    required
                  />
                </label>
                {authMode === "register" && (
                  <label>
                    Confirm password
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      minLength={8}
                      maxLength={72}
                      required
                    />
                  </label>
                )}
                {(loginError || authError) && (
                  <p className="form-error" role="alert">
                    {loginError || authError}
                  </p>
                )}
                <button
                  className="order-button"
                  type="submit"
                  disabled={loginPending}
                >
                  <span>
                    {loginPending
                      ? authMode === "register"
                        ? "Creating account…"
                        : "Signing in…"
                      : authMode === "register"
                        ? "Create account"
                        : "Sign in"}
                  </span>
                  {loginPending && (
                    <span className="loading-indicator" aria-hidden="true" />
                  )}
                </button>
                <p className="form-hint">
                  {authMode === "register"
                    ? "Usernames can use letters, numbers, underscores, and hyphens. Passwords must be at least 8 characters."
                    : "Sign in with your username and password."}
                </p>
                <button
                  className="auth-mode-toggle"
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === "login" ? "register" : "login")
                    setLoginError("")
                    setLoginPassword("")
                    setConfirmPassword("")
                  }}
                  disabled={loginPending}
                >
                  {authMode === "login"
                    ? "New here? Create an account"
                    : "Already have an account? Sign in"}
                </button>
              </form>
            )}
          </div>
        </section>
      ) : (
        <section className="profile-shell">
          <aside className="account-nav">
            <div className="account-person">
              <span className="avatar-small">
                <Icon name="user" />
              </span>
              <div>
                <b>{profile.name || account.username}</b>
                <small>
                  {account.role === "admin"
                    ? "Administrator"
                    : account.username}
                </small>
              </div>
            </div>
            <nav aria-label="Account navigation">
              {sections.map((section, index) => (
                <button
                  className={active === section ? "active" : ""}
                  onClick={() => setActive(section)}
                  key={section}
                >
                  <span>0{index + 1}</span>
                  {section}
                  <Icon name="arrow" size={17} />
                </button>
              ))}
            </nav>
          </aside>
          <div className="profile-content">
            <div className="profile-content-head">
              <div>
                <p className="eyebrow">
                  {account.role === "admin"
                    ? "Administrator account"
                    : "Account"}
                </p>
                <h2>{active}</h2>
              </div>
              <div className="avatar-large">
                <span>{initials(profile.name)}</span>
                <small>Profile pic</small>
              </div>
            </div>
            {active === "Overview" && (
              <>
                <div className="account-stats">
                  <div>
                    <span>Current orders</span>
                    <b>
                      {ordersLoading
                        ? "…"
                        : String(current.length).padStart(2, "0")}
                    </b>
                  </div>
                  <div>
                    <span>Member since</span>
                    <b>2023</b>
                  </div>
                </div>
                {ordersLoading ? (
                  <p className="store-message" role="status">
                    Loading your orders…
                  </p>
                ) : ordersError ? (
                  <p className="form-error" role="alert">
                    {ordersError}
                  </p>
                ) : current[0] ? (
                  <div className="active-order">
                    <div>
                      <span>{current[0].id}</span>
                      <b>{current[0].items[0]?.name}</b>
                      <small>
                        Placed ·{" "}
                        {new Date(current[0].createdAt).toLocaleDateString()}
                      </small>
                    </div>
                    <span className="status">{current[0].status}</span>
                  </div>
                ) : (
                  <div className="empty-state">
                    <span>00</span>
                    <h3>No current orders</h3>
                    <p>When you place an order, it will appear here.</p>
                    <button
                      className="text-link"
                      onClick={() => setPage("catalog")}
                    >
                      Browse the catalog
                    </button>
                  </div>
                )}
              </>
            )}
            {active === "Current orders" &&
              (ordersLoading ? (
                <p className="store-message" role="status">
                  Loading your orders…
                </p>
              ) : ordersError ? (
                <p className="form-error" role="alert">
                  {ordersError}
                </p>
              ) : (
                <OrderList orders={current} empty="No orders on the way." />
              ))}
            {active === "Order history" &&
              (ordersLoading ? (
                <p className="store-message" role="status">
                  Loading your orders…
                </p>
              ) : ordersError ? (
                <p className="form-error" role="alert">
                  {ordersError}
                </p>
              ) : (
                <OrderList orders={history} empty="No completed orders yet." />
              ))}
            {active === "Profile info" && (
              <form className="profile-form" onSubmit={submitProfile}>
                <label>
                  Full name
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(event) =>
                      setDraft({ ...draft, email: event.target.value })
                    }
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={draft.phone}
                    onChange={(event) =>
                      setDraft({ ...draft, phone: event.target.value })
                    }
                  />
                </label>
                <label>
                  Address
                  <input
                    value={draft.address}
                    onChange={(event) =>
                      setDraft({ ...draft, address: event.target.value })
                    }
                  />
                </label>
                <label>
                  City
                  <input
                    value={draft.city}
                    onChange={(event) =>
                      setDraft({ ...draft, city: event.target.value })
                    }
                  />
                </label>
                <button className="order-button" type="submit">
                  <span>
                    {savePending ? "Saving…" : saved ? "Saved" : "Save details"}
                  </span>
                </button>
                {saveError && (
                  <p className="form-error" role="alert">
                    {saveError}
                  </p>
                )}
              </form>
            )}
            {active === "Settings" && (
              <div className="settings-list">
                <button
                  className={emailAlerts ? "setting on" : "setting"}
                  onClick={() => setEmailAlerts(!emailAlerts)}
                  aria-pressed={emailAlerts}
                >
                  <span>
                    <b>Email notes</b>
                    <small>Occasional product drops and seasonal edits</small>
                  </span>
                  <i />
                </button>
                <button
                  className={orderAlerts ? "setting on" : "setting"}
                  onClick={() => setOrderAlerts(!orderAlerts)}
                  aria-pressed={orderAlerts}
                >
                  <span>
                    <b>Order updates</b>
                    <small>Delivery and packing notifications</small>
                  </span>
                  <i />
                </button>
              </div>
            )}
            {account.role === "admin" && (
              <button
                className="ghost-button profile-logout"
                onClick={async () => {
                  setLogoutPending(true)
                  try {
                    await onLogout()
                  } finally {
                    setLogoutPending(false)
                  }
                }}
                disabled={logoutPending}
              >
                <span>{logoutPending ? "Signing out…" : "Sign out"}</span>
                <Icon name="arrow" />
              </button>
            )}
            {account.role !== "admin" && (
              <button
                className="ghost-button profile-logout"
                onClick={async () => {
                  setLogoutPending(true)
                  try {
                    await onLogout()
                  } finally {
                    setLogoutPending(false)
                  }
                }}
                disabled={logoutPending}
              >
                <span>{logoutPending ? "Signing out…" : "Sign out"}</span>
                <Icon name="arrow" />
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  )
}

function OrderList({ orders, empty }: OrderListProps) {
  if (!orders.length) {
    return (
      <div className="empty-state">
        <span>00</span>
        <h3>{empty}</h3>
        <p>Orders you place will live in this space.</p>
      </div>
    )
  }

  return (
    <div className="order-list">
      {orders.map((order) => (
        <article className="order-card" key={order.id}>
          <div>
            <span>{order.id}</span>
            <b>{money(order.total)}</b>
            <small>
              {order.items.reduce((count, item) => count + item.quantity, 0)}{" "}
              item
              {order.items.reduce((count, item) => count + item.quantity, 0) ===
              1
                ? ""
                : "s"}{" "}
              · {new Date(order.createdAt).toLocaleString()}
            </small>
            <span className="order-items">
              {order.items
                .map((item) => `${item.name} × ${item.quantity}`)
                .join(", ")}
            </span>
          </div>
          <span className="status">{order.status}</span>
        </article>
      ))}
    </div>
  )
}

function Basket({
  products,
  isLoggedIn,
  customerDefaults,
  items,
  setItems,
  setPage,
  openProduct,
  placeOrder,
  requestOrderQuote,
  placingOrder,
}: {
  products: Product[]
  isLoggedIn: boolean
  customerDefaults: CheckoutCustomer
  items: CartItem[]
  setItems: (items: CartItem[]) => void
  setPage: (page: Page) => void
  openProduct: (id: string) => void
  placeOrder: (quote: StoreOrderQuote) => Promise<Order>
  requestOrderQuote: (customer: CheckoutCustomer) => Promise<StoreOrderQuote>
  placingOrder: boolean
}) {
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null)
  const [checkoutError, setCheckoutError] = useState("")
  const [customer, setCustomer] = useState(customerDefaults)
  const [quote, setQuote] = useState<StoreOrderQuote | null>(null)
  const [reviewPending, setReviewPending] = useState(false)
  const availableItems = items
    .map((item) => ({ item, product: productById(products, item.productId) }))
    .filter((entry): entry is CartProductEntry => Boolean(entry.product))
  const subtotal = availableItems.reduce(
    (sum, { item, product }) => sum + product.price * item.quantity,
    0,
  )
  const shipping = subtotal >= 150 || subtotal === 0 ? 0 : 12
  const total = subtotal + shipping
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  const unavailableItems = items.filter(
    (item) => !productById(products, item.productId),
  )

  useEffect(() => {
    setCustomer((current) => ({
      legalName: current.legalName || customerDefaults.legalName,
      email: current.email || customerDefaults.email,
      phone: current.phone || customerDefaults.phone,
    }))
  }, [
    customerDefaults.email,
    customerDefaults.legalName,
    customerDefaults.phone,
  ])

  const reviewOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCheckoutError("")
    setReviewPending(true)
    try {
      setQuote(await requestOrderQuote(customer))
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Could not review this order.",
      )
    } finally {
      setReviewPending(false)
    }
  }

  const confirmOrder = async () => {
    if (!quote) return
    setCheckoutError("")
    try {
      setPlacedOrder(await placeOrder(quote))
    } catch (error) {
      setQuote(null)
      setCheckoutError(
        error instanceof Error ? error.message : "Could not submit your order.",
      )
    }
  }

  const updateQty = (key: string, quantity: number) => {
    if (quantity < 1) {
      setItems(items.filter((item) => item.key !== key))
      return
    }
    setItems(
      items.map((item) => (item.key === key ? { ...item, quantity } : item)),
    )
  }

  return (
    <main className="basket-page">
      <p className="eyebrow">Your selection</p>
      <h1>Basket</h1>
      {placedOrder ? (
        <div className="empty-state" role="status">
          <span>Order received</span>
          <h3>Thank you</h3>
          <p>{placedOrder.id} is pending. No payment has been taken.</p>
        </div>
      ) : items.length ? (
        <>
          {unavailableItems.length > 0 && (
            <p className="form-error" role="alert">
              Some basket products are no longer available. Remove them before
              checkout.
            </p>
          )}
          {availableItems.map(({ item, product }) => {
            return (
              <div className="basket-card" key={item.key}>
                <button
                  className="basket-thumb"
                  onClick={() => openProduct(product.id)}
                >
                  <img src={getApiUrl(product.images[0])} alt={product.name} />
                </button>
                <div>
                  <span>
                    {product.type} · {item.color} · {item.size}
                  </span>
                  <h2>{product.name}</h2>
                  <div className="qty-controls">
                    <button
                      aria-label="Decrease quantity"
                      onClick={() => updateQty(item.key, item.quantity - 1)}
                    >
                      <Icon name="minus" size={16} />
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      aria-label="Increase quantity"
                      disabled={item.quantity >= Math.min(99, product.stock)}
                      onClick={() =>
                        updateQty(
                          item.key,
                          Math.min(99, product.stock, item.quantity + 1),
                        )
                      }
                    >
                      <Icon name="plus" size={16} />
                    </button>
                  </div>
                </div>
                <div className="basket-side">
                  <b>{money(product.price * item.quantity)}</b>
                  <button
                    aria-label={`Remove ${product.name}`}
                    onClick={() => updateQty(item.key, 0)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            )
          })}
          <div className="basket-summary">
            <p>
              <span>Items</span>
              <b>{count}</b>
            </p>
            <p>
              <span>Subtotal</span>
              <b>{money(subtotal)}</b>
            </p>
            <p>
              <span>Delivery</span>
              <b>{shipping ? money(shipping) : "Complimentary"}</b>
            </p>
            <p className="total">
              <span>Total</span>
              <b>{money(total)}</b>
            </p>
          </div>
          {isLoggedIn ? (
            quote ? (
              <section
                className="order-confirmation"
                aria-labelledby="confirm-order-title"
              >
                <p className="eyebrow">Final review</p>
                <h2 id="confirm-order-title">
                  Would you like to place this order?
                </h2>
                <p>
                  Confirm to reserve the reviewed quantities at the prices
                  shown. Or continue browsing; nothing has been ordered yet.
                </p>
                <p className="quote-customer">
                  {quote.customer.legalName} · {quote.customer.email} ·{" "}
                  {quote.customer.phone}
                </p>
                <div className="quote-lines">
                  {quote.items.map((item, index) => (
                    <p
                      key={`${item.productId}-${item.color}-${item.size}-${index}`}
                    >
                      <span>
                        {item.name} · {item.color} · {item.size} ×{" "}
                        {item.quantity}
                      </span>
                      <b>{money(item.lineTotal)}</b>
                    </p>
                  ))}
                  <p>
                    <span>Subtotal</span>
                    <b>{money(quote.subtotal)}</b>
                  </p>
                  <p>
                    <span>Delivery</span>
                    <b>
                      {quote.shipping ? money(quote.shipping) : "Complimentary"}
                    </b>
                  </p>
                  <p className="total">
                    <span>Total</span>
                    <b>{money(quote.total)}</b>
                  </p>
                </div>
                <div className="confirmation-actions">
                  <button
                    className="order-button"
                    disabled={placingOrder}
                    onClick={() => void confirmOrder()}
                  >
                    <span>
                      {placingOrder ? "Confirming…" : "Yes, place order"}
                    </span>
                    <span>{money(quote.total)}</span>
                  </button>
                  <button
                    className="ghost-button"
                    disabled={placingOrder}
                    onClick={() => {
                      setQuote(null)
                      setPage("catalog")
                    }}
                  >
                    Continue browsing
                  </button>
                </div>
              </section>
            ) : (
              <form className="checkout-contact" onSubmit={reviewOrder}>
                <p className="eyebrow">Delivery contact</p>
                <h2>Who is placing this order?</h2>
                <label>
                  Legal name
                  <input
                    autoComplete="name"
                    maxLength={120}
                    required
                    value={customer.legalName}
                    onChange={(event) =>
                      setCustomer({
                        ...customer,
                        legalName: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Phone number
                  <input
                    autoComplete="tel"
                    type="tel"
                    minLength={7}
                    maxLength={40}
                    required
                    value={customer.phone}
                    onChange={(event) =>
                      setCustomer({ ...customer, phone: event.target.value })
                    }
                  />
                </label>
                <label>
                  Email address
                  <input
                    autoComplete="email"
                    type="email"
                    maxLength={254}
                    required
                    value={customer.email}
                    onChange={(event) =>
                      setCustomer({ ...customer, email: event.target.value })
                    }
                  />
                </label>
                <button
                  className="order-button"
                  type="submit"
                  disabled={reviewPending || unavailableItems.length > 0}
                >
                  <span>
                    {reviewPending
                      ? "Checking stock and prices…"
                      : "Review order"}
                  </span>
                  <span>{money(total)}</span>
                </button>
              </form>
            )
          ) : (
            <button className="order-button" onClick={() => setPage("profile")}>
              <span>Sign in to place order</span>
              <span>{money(total)}</span>
            </button>
          )}
          {checkoutError && (
            <p className="form-error" role="alert">
              {checkoutError}
            </p>
          )}
        </>
      ) : (
        <div className="empty-state">
          <span>00</span>
          <h3>Your basket is empty</h3>
          <p>Explore lasting pieces designed for everyday wear.</p>
        </div>
      )}
      <button
        className="ghost-button"
        onClick={() => setPage(placedOrder ? "profile" : "catalog")}
      >
        <span>{placedOrder ? "View profile" : "Continue shopping"}</span>
        <Icon name="arrow" />
      </button>
    </main>
  )
}

function AdminCreate({
  products,
  onCreated,
  onStockUpdated,
}: {
  products: Product[]
  onCreated: (product: Product) => void
  onStockUpdated: (product: Product) => void
}) {
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    price: "",
    stock: "0",
    category: "Outerwear",
    composition: "",
    tag: "",
  })
  const [images, setImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [adminOrders, setAdminOrders] = useState<Order[]>([])
  const [ordersError, setOrdersError] = useState("")

  useEffect(() => {
    const objectUrls = images.map((image) => URL.createObjectURL(image))
    setPreviews(objectUrls)
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url))
  }, [images])

  useEffect(() => {
    let active = true
    api
      .getAdminOrders()
      .then((orders) => {
        if (active) setAdminOrders(orders)
      })
      .catch((requestError: unknown) => {
        if (active)
          setOrdersError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load administrator orders.",
          )
      })
    return () => {
      active = false
    }
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSuccess("")
    if (!/[a-z]/i.test(draft.name)) {
      setError("Product name must contain at least one English letter (A-Z).")
      return
    }
    if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(draft.price)) {
      setError("Enter a non-negative price with up to two decimal places.")
      return
    }
    if (
      draft.description.trim().length < 1 ||
      draft.description.length > 5000
    ) {
      setError("Description is required and must be 5,000 characters or fewer.")
      return
    }
    if (images.length < 1 || images.length > 6) {
      setError("Choose between 1 and 6 product images.")
      return
    }
    if (
      images.some(
        (image) =>
          !["image/jpeg", "image/png", "image/webp"].includes(image.type) ||
          image.size > 5 * 1024 * 1024,
      )
    ) {
      setError(
        "Images must be JPEG, PNG, or WebP files no larger than 5 MB each.",
      )
      return
    }

    setPending(true)
    try {
      const product = await api.createProduct({
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim(),
        images,
      })
      onCreated(product)
      setDraft({
        name: "",
        description: "",
        price: "",
        stock: "0",
        category: "Outerwear",
        composition: "",
        tag: "",
      })
      setImages([])
      setSuccess(`Product created with code ${product.productCode}.`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not create the product.",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="admin-page">
      <div className="profile-title">
        <p className="eyebrow">Administrator tools</p>
        <h1>Create</h1>
      </div>
      <section className="admin-create-layout">
        <form className="profile-form admin-form" onSubmit={submit}>
          <p className="eyebrow">New listing</p>
          <h2>Create a product</h2>
          <label>
            Product name
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              maxLength={160}
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              maxLength={5000}
              rows={5}
              required
            />
          </label>
          <div className="admin-form-row">
            <label>
              Price (USD)
              <input
                type="number"
                min="0"
                max="99999999.99"
                step="0.01"
                value={draft.price}
                onChange={(event) =>
                  setDraft({ ...draft, price: event.target.value })
                }
                required
              />
            </label>
            <label>
              Available stock
              <input
                type="number"
                min="0"
                max="1000000"
                step="1"
                value={draft.stock}
                onChange={(event) =>
                  setDraft({ ...draft, stock: event.target.value })
                }
                required
              />
            </label>
          </div>
          <div className="admin-form-row">
            <label>
              Category
              <select
                value={draft.category}
                onChange={(event) =>
                  setDraft({ ...draft, category: event.target.value })
                }
              >
                {categories
                  .filter((item) => item !== "All pieces")
                  .map((item) => (
                    <option key={item}>{item}</option>
                  ))}
              </select>
            </label>
          </div>
          <label>
            Composition (optional)
            <input
              value={draft.composition}
              onChange={(event) =>
                setDraft({ ...draft, composition: event.target.value })
              }
              maxLength={255}
            />
          </label>
          <label>
            Product label (optional)
            <input
              value={draft.tag}
              onChange={(event) =>
                setDraft({ ...draft, tag: event.target.value })
              }
              maxLength={80}
            />
          </label>
          <label>
            Product images (1–6, JPEG, PNG, or WebP; 5 MB maximum each)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              required
              onChange={(event) =>
                setImages(Array.from(event.target.files ?? []))
              }
            />
          </label>
          {previews.length > 0 && (
            <div
              className="image-previews"
              aria-label="Selected image previews"
            >
              {previews.map((url, index) => (
                <img key={url} src={url} alt={`Preview ${index + 1}`} />
              ))}
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="form-success" role="status">
              {success}
            </p>
          )}
          <button className="order-button" type="submit" disabled={pending}>
            <span>{pending ? "Creating product…" : "Create product"}</span>
            {pending && (
              <span className="loading-indicator" aria-hidden="true" />
            )}
          </button>
        </form>
        <div className="admin-products">
          <p className="eyebrow">Saved in the store</p>
          <h2>Products ({products.length})</h2>
          {products.length ? (
            products.map((product) => (
              <article className="admin-product-row" key={product.id}>
                <img src={getApiUrl(product.images[0])} alt="" />
                <div>
                  <b>{product.name}</b>
                  <span>{product.productCode}</span>
                  <small>
                    {product.category} · {money(product.price)} ·{" "}
                    {product.stock} in stock
                  </small>
                  <ProductStockEditor
                    product={product}
                    onUpdated={onStockUpdated}
                  />
                </div>
              </article>
            ))
          ) : (
            <p>No products are available yet.</p>
          )}
        </div>
      </section>
      <section className="admin-orders">
        <p className="eyebrow">Protected order view</p>
        <h2>Recent orders</h2>
        {ordersError ? (
          <p className="form-error" role="alert">
            {ordersError}
          </p>
        ) : (
          <OrderList orders={adminOrders} empty="No orders have been placed." />
        )}
      </section>
    </main>
  )
}

function ProductStockEditor({
  product,
  onUpdated,
}: {
  product: Product
  onUpdated: (product: Product) => void
}) {
  const [stock, setStock] = useState(String(product.stock))
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => setStock(String(product.stock)), [product.stock])

  const save = async () => {
    const quantity = Number(stock)
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      quantity > 1_000_000
    ) {
      setError("Stock must be a whole number from 0 to 1,000,000.")
      setMessage("")
      return
    }
    setPending(true)
    setError("")
    setMessage("")
    try {
      const updated = await api.updateProductStock(product.id, quantity)
      onUpdated(updated)
      setMessage("Stock saved.")
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update stock.",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="stock-editor">
      <label>
        Available
        <input
          type="number"
          min="0"
          max="1000000"
          step="1"
          value={stock}
          onChange={(event) => setStock(event.target.value)}
        />
      </label>
      <button type="button" disabled={pending} onClick={save}>
        {pending ? "Saving…" : "Update stock"}
      </button>
      {error && (
        <small className="form-error" role="alert">
          {error}
        </small>
      )}
      {message && (
        <small className="form-success" role="status">
          {message}
        </small>
      )}
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    window.location.hash === "#create" ? "create" : "main",
  )
  const [productId, setProductId] = useState<string | null>(null)
  const [category, setCategory] = useState<Category>("All pieces")
  const [sort, setSort] = useState<SortKey>("featured")
  const [cart, setCart] = usePersistedCart()
  const [products, setProducts] = useState<Product[]>([])
  const [availableCategories, setAvailableCategories] =
    useState<ProductCategory[]>(
      categories.filter(
        (item): item is ProductCategory => item !== "All pieces",
      ),
    )
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState("")
  const [account, setAccount] = useState<Account | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState("")
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState("")
  const [placingOrder, setPlacingOrder] = useState(false)
  const [toast, setToast] = useState("")
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const navigate = (next: Page) => {
    if (next === "create" && account?.role !== "admin") {
      setToast("Administrator access is required.")
      next = "profile"
    }
    if (next === "create") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#create`,
      )
    } else if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      )
    }
    setPage(next)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const refreshProducts = async () => {
    setProductsLoading(true)
    setProductsError("")
    try {
      setProducts(await api.getProducts())
    } catch (error) {
      setProductsError(
        error instanceof Error
          ? error.message
          : "Could not load the product catalog.",
      )
    } finally {
      setProductsLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void initializeApi()
      .then(async () => {
        const [accountResult, productsResult, categoriesResult] =
          await Promise.allSettled([
            api.getCurrentAccount(),
            api.getProducts(),
            api.getCategories(),
          ])
        if (!active) return
        if (accountResult.status === "fulfilled") {
          setAccount(accountResult.value)
        } else {
          setAuthError(
            accountResult.reason instanceof Error
              ? accountResult.reason.message
              : "Could not check your sign-in.",
          )
        }
        if (productsResult.status === "fulfilled") {
          setProducts(productsResult.value)
        } else {
          setProductsError(
            productsResult.reason instanceof Error
              ? productsResult.reason.message
              : "Could not load the product catalog.",
          )
        }
        if (categoriesResult.status === "fulfilled") {
          setAvailableCategories(categoriesResult.value)
        } else {
          setToast(
            categoriesResult.reason instanceof Error
              ? categoriesResult.reason.message
              : "Could not load product categories.",
          )
        }
        setAuthLoading(false)
        setProductsLoading(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        const message =
          error instanceof Error
            ? error.message
            : "The store API is unavailable."
        setAuthError(message)
        setProductsError(message)
        setAuthLoading(false)
        setProductsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (page === "create" && account?.role !== "admin") {
      setToast("Administrator access is required.")
      navigate("profile")
    }
  }, [account, authLoading, page])

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === "#create") {
        if (authLoading) {
          setPage("create")
        } else if (account?.role === "admin") {
          setPage("create")
        } else {
          navigate("profile")
        }
      }
    }
    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [account, authLoading])

  useEffect(() => {
    if (!account) {
      setOrders([])
      setOrdersError("")
      setOrdersLoading(false)
      return
    }
    let active = true
    setOrdersLoading(true)
    setOrdersError("")
    void api
      .getMyOrders()
      .then((result) => {
        if (active) setOrders(result)
      })
      .catch((error: unknown) => {
        if (active) {
          setOrdersError(
            error instanceof Error
              ? error.message
              : "Could not load order history.",
          )
        }
      })
      .finally(() => {
        if (active) setOrdersLoading(false)
      })
    return () => {
      active = false
    }
  }, [account?.id])

  const openProduct = (id: string) => {
    setProductId(id)
    navigate("product")
  }

  const openCatalog = (nextCategory: Category) => {
    setCategory(nextCategory)
    navigate("catalog")
  }

  const addToCart = (item: Omit<CartItem, "key">) => {
    const product = productById(products, item.productId)
    if (!product) {
      setToast("This product is no longer available.")
      return
    }
    const key = cartKey(item.productId, item.color, item.size)
    const existing = cart.find((entry) => entry.key === key)
    const nextQuantity = (existing?.quantity ?? 0) + item.quantity
    if (nextQuantity > Math.min(99, product.stock)) {
      setToast(
        `Only ${product.stock} ${product.name} item(s) are currently available.`,
      )
      return
    }
    setCart(
      existing
        ? cart.map((entry) =>
            entry.key === key
              ? { ...entry, quantity: entry.quantity + item.quantity }
              : entry,
          )
        : [...cart, { ...item, key }],
    )
    setToast(`${product.name} added to basket`)
  }

  const login = async (username: string, password: string) => {
    const current = await api.login(username, password)
    setAccount(current)
    setAuthError("")
    setToast(`Signed in as ${current.username}`)
  }

  const register = async (username: string, password: string) => {
    const current = await api.register(username, password)
    setAccount(current)
    setAuthError("")
    setToast(`Account created for ${current.username}`)
  }

  const logout = async () => {
    try {
      await api.logout()
      await initializeApi()
      setAccount(null)
      setOrders([])
      if (page === "create") navigate("profile")
      setToast("You have signed out.")
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not sign out.")
    }
  }

  const saveProfile = async (draft: ProfileData) => {
    const updated = await api.updateProfile({
      displayName: draft.name,
      email: draft.email,
      phone: draft.phone,
      address: draft.address,
      city: draft.city,
    })
    setAccount(updated)
  }

  const requestOrderQuote = async (
    customer: CheckoutCustomer,
  ): Promise<StoreOrderQuote> => {
    if (!account) {
      navigate("profile")
      setToast("Sign in before placing an order.")
      throw new Error("Sign in before placing an order.")
    }
    if (!cart.length) throw new Error("Your basket is empty.")
    const { quote } = await api.quoteOrder(
      cart.map(({ productId, color, size, quantity }) => ({
        productId,
        color,
        size,
        quantity,
      })),
      customer,
    )
    return quote
  }

  const placeOrder = async (quote: StoreOrderQuote): Promise<Order> => {
    if (!account) {
      navigate("profile")
      throw new Error("Sign in before placing an order.")
    }
    setPlacingOrder(true)
    try {
      const { order } = await api.createOrder(quote.token)
      setCart([])
      setOrders((previous) => [order, ...previous])
      setToast(`Order ${order.id} submitted. No payment was taken.`)
      void refreshProducts()
      return order
    } finally {
      setPlacingOrder(false)
    }
  }

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <div className="app">
      <Header
        page={page}
        setPage={navigate}
        cartCount={cartCount}
        account={account}
      />
      {page === "main" && (
        <MainMenu
          products={products}
          productsLoading={productsLoading}
          productsError={productsError}
          availableCategories={availableCategories}
          onRetry={() => void refreshProducts()}
          openCatalog={openCatalog}
          openProduct={openProduct}
        />
      )}
      {page === "catalog" && (
        <Catalog
          products={products}
          productsLoading={productsLoading}
          productsError={productsError}
          category={category}
          setCategory={setCategory}
          sort={sort}
          setSort={setSort}
          openProduct={openProduct}
          setPage={navigate}
        />
      )}
      {page === "product" && productById(products, productId ?? "") && (
        <ProductDetail
          products={products}
          product={productById(products, productId ?? "")!}
          addToCart={addToCart}
          openProduct={openProduct}
          setPage={navigate}
          openCatalog={openCatalog}
        />
      )}
      {page === "support" && <Support />}
      {page === "profile" && (
        <Profile
          account={account}
          authLoading={authLoading}
          authError={authError}
          onLogin={login}
          onRegister={register}
          onLogout={logout}
          saveProfile={saveProfile}
          products={products}
          orders={orders}
          ordersLoading={ordersLoading}
          ordersError={ordersError || authError}
          setPage={navigate}
        />
      )}
      {page === "create" && account?.role === "admin" && (
        <AdminCreate
          products={products}
          onCreated={(product) => {
            setProducts((existing) => [product, ...existing])
            setToast(`${product.name} was added to the catalog.`)
          }}
          onStockUpdated={(updated) => {
            setProducts((existing) =>
              existing.map((product) =>
                product.id === updated.id ? updated : product,
              ),
            )
          }}
        />
      )}
      {page === "basket" && (
        <Basket
          products={products}
          isLoggedIn={Boolean(account)}
          customerDefaults={{
            legalName: account?.displayName ?? "",
            email: account?.email ?? "",
            phone: account?.phone ?? "",
          }}
          items={cart}
          setItems={setCart}
          setPage={navigate}
          openProduct={openProduct}
          placeOrder={placeOrder}
          requestOrderQuote={requestOrderQuote}
          placingOrder={placingOrder}
        />
      )}
      <footer>
        <span>six-seven market / Make your day 6 and 7</span>
        <span>Buxoroi Sharif 2067</span>
      </footer>
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}
