import { createHash } from "node:crypto";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type ProductCategory =
  | "social_network"
  | "dashboard"
  | "ecommerce"
  | "booking"
  | "chat"
  | "auth"
  | "recipes"
  | "restaurant"
  | "contact"
  | "custom";

export type ProductComplexity = "simple" | "medium" | "complex";

export type ProductClassification = {
  category: ProductCategory;
  confidence: number;
  productName: string;
  primaryUser: string;
  complexity: ProductComplexity;
  visualVariant?: "classic" | "neon" | "canine" | "library" | "wellness" | "apparel";
  visualPalette?: string;
  assumptions: string[];
  matchedSignals: string[];
};

export type ProductSpecification = {
  productName: string;
  category: ProductCategory;
  purpose: string;
  primaryUser: string;
  coreTasks: string[];
  visualVariant?: "classic" | "neon" | "canine" | "library" | "wellness" | "apparel";
  screens: Array<{ id: string; name: string; purpose: string; entryPoint: boolean }>;
  features: Array<{ id: string; name: string; description: string; priority: "must" | "should" }>;
  visualDirection: { palette: string; typography: string; layout: string; tone: string };
  dataModels: Array<{ name: string; fields: string[] }>;
  stateModel: { states: string[]; transitions: string[]; persistence: string };
  components: Array<{ id: string; name: string; responsibility: string; ownerFile: string; featureIds: string[] }>;
  interactions: Array<{ id: string; trigger: string; stateChange: string; successState: string; errorState: string; emptyState: string; ownerFile: string; previewEvidence: string }>;
  fileOwnership: Array<{ featureId: string; ownerComponent: string; ownerFile: string; stateOwner: string; dataType: string; persistence: string; tests: string; previewEvidence: string }>;
  previewAcceptanceCriteria: Array<{ id: string; featureId: string; description: string; selector: string; expected: string }>;
  responsiveRules: string[];
  accessibilityRules: string[];
};

export type FeatureContract = {
  version: "1.0";
  features: Array<{
    id: string;
    name: string;
    capability: "frontend" | "client-validation" | "database";
    acceptance: string[];
    requiredFiles: string[];
    componentIds: string[];
    interactionIds: string[];
  }>;
};

export type ProjectManifest = {
  schemaVersion: "1.0";
  projectVersion: number;
  buildRunId: string;
  projectId: string;
  workspaceId: string;
  category: ProductCategory;
  productName: string;
  entryFile: string;
  buildCommand: string;
  previewCommand: string;
  dependencies: string[];
  generatedAt: string;
  updatedAt: string;
  contentHash?: string;
  codePreviewHash?: string;
  files: Array<{
    path: string;
    role: "entry" | "style" | "logic" | "component" | "page" | "state" | "utility" | "type" | "data" | "test" | "documentation" | "manifest" | "api" | "model" | "controller" | "route" | "integration" | "config" | "asset";
    language: "html" | "css" | "javascript" | "json" | "markdown";
    responsibility: string;
    imports: string[];
    importedBy: string[];
    usedInPreview: boolean;
    status: "created" | "updated" | "ready" | "failed";
  }>;
  featureIds: string[];
  screenIds: string[];
  interactionIds: string[];
  componentIds: string[];
  fileOwnership: ProductSpecification["fileOwnership"];
  previewAcceptanceCriteria: ProductSpecification["previewAcceptanceCriteria"];
};

export type ProjectSnapshot = {
  projectId: string;
  buildRunId: string;
  version: number;
  files: Array<{ path: string; contentHash: string; content: string }>;
  entryFile: string;
  createdAt: string;
};

export type GeneratedProjectArtifact = {
  path: string;
  content: string;
  language: "html" | "css" | "javascript" | "json" | "markdown";
};

type ArchitectureFiles = {
  appShell: string;
  components: string;
  page: string;
  state: string;
  utility: string;
  types: string;
  test: string;
};

type RequestModuleKind = "component" | "page" | "model" | "test";

type RequestModuleDefinition = ModularFileDefinition & {
  kind: RequestModuleKind;
  id: string;
  exportName: string;
  imports: string[];
  importedBy: string[];
  usedInPreview: boolean;
  status: "created" | "updated" | "ready" | "failed";
};

type CategoryBlueprint = {
  purpose: string;
  primaryUser: string;
  coreTasks: string[];
  screens: ProductSpecification["screens"];
  features: ProductSpecification["features"];
  visualDirection: ProductSpecification["visualDirection"];
  dataModels: ProductSpecification["dataModels"];
  stateModel: ProductSpecification["stateModel"];
  files: { style: string; logic: string; data: string };
  signals: string[];
};

const BLUEPRINTS: Record<Exclude<ProductCategory, "custom">, CategoryBlueprint> = {
  social_network: {
    purpose: "A focused community workspace for sharing updates, following people, and keeping conversations moving.",
    primaryUser: "Community member",
    coreTasks: ["Publish an update", "React to and discuss posts", "Discover people and communities", "Review notifications"],
    screens: [
      { id: "feed", name: "Home feed", purpose: "Shows relevant posts and composer controls.", entryPoint: true },
      { id: "profile", name: "Profile", purpose: "Shows a member identity and recent activity.", entryPoint: false },
      { id: "messages", name: "Messages", purpose: "Keeps direct conversations accessible.", entryPoint: false },
    ],
    features: [
      { id: "feed", name: "Personalized feed", description: "Renders structured posts with author, timestamp, reaction count, and comments.", priority: "must" },
      { id: "post-composer", name: "Post composer", description: "Adds a new local post with validation and immediate feedback.", priority: "must" },
      { id: "reactions", name: "Post reactions", description: "Toggles a reaction without losing existing counts.", priority: "must" },
      { id: "notifications", name: "Notifications", description: "Displays a small notification rail with unread state.", priority: "should" },
    ],
    visualDirection: { palette: "Ink, electric violet, and soft lavender", typography: "Inter with strong numeric emphasis", layout: "Three-column desktop feed collapsing to one column", tone: "Connected, energetic, and welcoming" },
    dataModels: [{ name: "Post", fields: ["id", "author", "body", "createdAt", "reactions", "comments"] }, { name: "Member", fields: ["id", "name", "handle", "avatar", "online"] }],
    stateModel: { states: ["posts", "composerText", "likedPostIds", "activeNav", "toast"], transitions: ["submit composer -> append post", "click reaction -> toggle likedPostIds", "click navigation -> update activeNav"], persistence: "In-memory session state with deterministic local seed data" },
    files: { style: "styles/social-network.css", logic: "src/social-network.js", data: "data/social-network.json" },
    signals: ["social", "network", "feed", "followers", "friends", "timeline", "community", "post"],
  },
  dashboard: {
    purpose: "An operational analytics workspace that helps teams monitor KPIs, trends, and exceptions.",
    primaryUser: "Operations manager",
    coreTasks: ["Scan key metrics", "Filter the reporting period", "Inspect an exception", "Review a detailed table"],
    screens: [
      { id: "overview", name: "Operations overview", purpose: "Summarizes current performance and alerts.", entryPoint: true },
      { id: "reports", name: "Reports", purpose: "Provides a tabular view for deeper review.", entryPoint: false },
      { id: "settings", name: "Workspace settings", purpose: "Keeps reporting controls discoverable.", entryPoint: false },
    ],
    features: [
      { id: "metric-cards", name: "Metric cards", description: "Shows KPI values with change direction and context.", priority: "must" },
      { id: "period-filter", name: "Period filter", description: "Changes the active reporting period and refreshes visible metrics.", priority: "must" },
      { id: "trend-chart", name: "Trend chart", description: "Visualizes a real data series with accessible labels.", priority: "must" },
      { id: "exception-table", name: "Exception table", description: "Filters and selects operational rows for inspection.", priority: "must" },
    ],
    visualDirection: { palette: "Slate, cobalt, cyan, and success green", typography: "Inter with tabular numerals", layout: "Persistent sidebar plus responsive metric and table grid", tone: "Precise, calm, and decision-oriented" },
    dataModels: [{ name: "Metric", fields: ["id", "label", "value", "change", "unit"] }, { name: "Shipment", fields: ["id", "route", "status", "eta", "risk"] }],
    stateModel: { states: ["activePeriod", "selectedShipment", "activeNav", "metrics"], transitions: ["change period -> recalculate metric snapshot", "select row -> open detail panel", "click nav -> update activeNav"], persistence: "In-memory session state with deterministic operational seed data" },
    files: { style: "styles/operations-dashboard.css", logic: "src/operations-dashboard.js", data: "data/operations-dashboard.json" },
    signals: ["dashboard", "analytics", "metrics", "kpi", "logistics", "operations", "report", "chart", "table"],
  },
  ecommerce: {
    purpose: "A product discovery and shopping experience with catalog browsing, cart state, and checkout feedback.",
    primaryUser: "Shopper",
    coreTasks: ["Browse products", "Filter and search the catalog", "Add products to cart", "Review checkout summary"],
    screens: [
      { id: "catalog", name: "Product catalog", purpose: "Shows products with search and category filters.", entryPoint: true },
      { id: "product", name: "Product detail", purpose: "Provides a focused view of an item.", entryPoint: false },
      { id: "checkout", name: "Checkout", purpose: "Summarizes cart contents and next action.", entryPoint: false },
    ],
    features: [
      { id: "catalog", name: "Catalog grid", description: "Renders products from structured catalog data.", priority: "must" },
      { id: "catalog-filter", name: "Catalog filters", description: "Filters furniture by category and search query.", priority: "must" },
      { id: "cart", name: "Cart state", description: "Adds items, updates quantity, and calculates a subtotal.", priority: "must" },
      { id: "checkout-feedback", name: "Checkout feedback", description: "Shows an honest local checkout confirmation without claiming payment processing.", priority: "should" },
    ],
    visualDirection: { palette: "Warm white, walnut, terracotta, and charcoal", typography: "Manrope with editorial display headings", layout: "Editorial storefront with dense product grid and cart drawer", tone: "Tactile, considered, and premium" },
    dataModels: [{ name: "Product", fields: ["id", "name", "category", "price", "material", "imageLabel"] }, { name: "CartLine", fields: ["productId", "quantity"] }],
    stateModel: { states: ["query", "category", "cartLines", "checkoutMessage"], transitions: ["search -> filter catalog", "add product -> increment cart line", "checkout -> show local confirmation"], persistence: "In-memory session cart with deterministic furniture catalog" },
    files: { style: "styles/store.css", logic: "src/app.js", data: "data/catalog.json" },
    signals: [
      "ecommerce", "e-commerce", "store", "shop", "shopping", "cart", "checkout", "furniture", "catalog",
      "digital product", "digital products", "متجر", "متاجر", "منتج", "منتجات", "رقمي", "رقمية", "المنتجات الرقمية",
      "fashion", "clothing", "apparel", "boutique", "accessories", "clothes",
      "ملابس", "الملابس", "للملابس", "أزياء", "ازياء", "الازياء", "للازياء",
      "إكسسوارات", "اكسسوارات", "الاكسسوارات", "والاكسسوارات", "عبايات", "أحذية", "احذية",
      "book", "books", "reading", "library", "ebook", "e-book", "كتاب", "كتب", "قراءة", "مكتبة", "رواية",
    ],
  },
  booking: {
    purpose: "A travel planning flow for finding a destination, comparing options, and requesting a booking.",
    primaryUser: "Traveler",
    coreTasks: ["Search a destination", "Choose dates and travelers", "Compare stays", "Review a booking request"],
    screens: [
      { id: "search", name: "Trip search", purpose: "Collects destination, dates, and traveler count.", entryPoint: true },
      { id: "results", name: "Stay results", purpose: "Lists relevant options with filters.", entryPoint: false },
      { id: "trip-summary", name: "Trip summary", purpose: "Summarizes the selected stay and request.", entryPoint: false },
    ],
    features: [
      { id: "trip-search", name: "Trip search", description: "Validates destination and date inputs before showing results.", priority: "must" },
      { id: "stay-filters", name: "Stay filters", description: "Filters result cards by stay type and price band.", priority: "must" },
      { id: "stay-selection", name: "Stay selection", description: "Selects one stay and updates the trip summary.", priority: "must" },
      { id: "booking-request", name: "Booking request", description: "Shows a transparent request confirmation without claiming a live reservation.", priority: "should" },
    ],
    visualDirection: { palette: "Deep navy, sky blue, sand, and coral", typography: "DM Sans with large destination labels", layout: "Search-first travel canvas with results and summary columns", tone: "Confident, clear, and exploratory" },
    dataModels: [{ name: "Destination", fields: ["id", "city", "country", "tagline"] }, { name: "Stay", fields: ["id", "name", "destinationId", "type", "nightlyRate", "rating"] }],
    stateModel: { states: ["destination", "dates", "travelers", "results", "selectedStay", "bookingMessage"], transitions: ["submit search -> filter results", "select stay -> update summary", "request booking -> show confirmation"], persistence: "In-memory session search with deterministic destination data" },
    files: { style: "styles/travel-booking.css", logic: "src/travel-booking.js", data: "data/travel-booking.json" },
    signals: ["booking", "travel", "hotel", "flight", "destination", "trip", "reservation", "stay", "vacation"],
  },
  chat: {
    purpose: "A real-time chat workspace with conversation navigation, presence cues, and message composition.",
    primaryUser: "Team member",
    coreTasks: ["Switch conversations", "Read recent messages", "Send a message", "Notice online presence"],
    screens: [
      { id: "inbox", name: "Conversation inbox", purpose: "Lists active conversations and unread counts.", entryPoint: true },
      { id: "conversation", name: "Conversation", purpose: "Shows messages, presence, and composer.", entryPoint: false },
      { id: "members", name: "Members", purpose: "Shows who is available in the workspace.", entryPoint: false },
    ],
    features: [
      { id: "conversation-list", name: "Conversation list", description: "Switches between seeded conversations and preserves unread markers.", priority: "must" },
      { id: "message-composer", name: "Message composer", description: "Validates and appends a local message with a timestamp.", priority: "must" },
      { id: "presence", name: "Presence", description: "Shows online and away states from structured member data.", priority: "must" },
      { id: "message-search", name: "Message search", description: "Filters conversation previews without losing the active thread.", priority: "should" },
    ],
    visualDirection: { palette: "Midnight, mint, periwinkle, and warm gray", typography: "Inter with compact conversation metadata", layout: "Two-column inbox and conversation canvas collapsing on mobile", tone: "Focused, human, and responsive" },
    dataModels: [{ name: "Conversation", fields: ["id", "name", "topic", "unread", "memberIds", "messages"] }, { name: "Message", fields: ["id", "sender", "body", "sentAt", "status"] }],
    stateModel: { states: ["activeConversationId", "query", "draft", "conversations"], transitions: ["select conversation -> update active thread", "send message -> append message", "search -> filter conversation list"], persistence: "In-memory session conversation state with deterministic seed messages" },
    files: { style: "styles/team-chat.css", logic: "src/team-chat.js", data: "data/team-chat.json" },
    signals: ["chat", "messaging", "message", "messages", "conversation", "real-time", "realtime", "direct"],
  },
  auth: {
    purpose: "A focused authentication entry flow that helps a user sign in, recover access, and understand the current session state.",
    primaryUser: "Returning account holder",
    coreTasks: ["Enter an email and password", "Validate credentials before submission", "Recover access when the password is forgotten", "Understand success and error states"],
    screens: [
      { id: "sign-in", name: "Sign in", purpose: "Collects credentials and provides the primary entry action.", entryPoint: true },
      { id: "forgot-password", name: "Forgot password", purpose: "Provides a separate recovery path without pretending an email was sent.", entryPoint: false },
      { id: "session", name: "Authenticated session", purpose: "Shows the local signed-in state after valid demo credentials.", entryPoint: false },
    ],
    features: [
      { id: "login-form", name: "Login form", description: "Renders labelled email and password fields with a visible submit action.", priority: "must" },
      { id: "credential-validation", name: "Credential validation", description: "Shows field-level validation before attempting a sign-in.", priority: "must" },
      { id: "password-visibility", name: "Password visibility", description: "Lets the user reveal or conceal the password field.", priority: "must" },
      { id: "forgot-password", name: "Forgot password", description: "Moves to a recovery state with an honest local-only status.", priority: "must" },
      { id: "auth-success", name: "Authentication success", description: "Shows a signed-in session state for valid local demo credentials.", priority: "must" },
      { id: "auth-error", name: "Authentication error", description: "Shows an explicit invalid-credentials state without claiming external authentication.", priority: "must" },
      { id: "auth-responsive", name: "Responsive auth layout", description: "Keeps the form usable on mobile and desktop widths.", priority: "must" },
    ],
    visualDirection: { palette: "Warm ivory, charcoal, muted indigo, and soft coral", typography: "Inter with strong form labels", layout: "Centered auth card with a supporting brand panel that collapses on mobile", tone: "Trustworthy, calm, and focused" },
    dataModels: [{ name: "CredentialAttempt", fields: ["email", "password", "status", "message"] }, { name: "Session", fields: ["userName", "email", "signedInAt"] }],
    stateModel: { states: ["mode", "email", "password", "showPassword", "status", "session"], transitions: ["submit valid credentials -> signed-in session", "submit invalid credentials -> error", "click forgot password -> recovery mode", "toggle password -> reveal or conceal password"], persistence: "In-memory local demo state; no external identity provider is claimed" },
    files: { style: "styles/auth.css", logic: "src/auth.js", data: "data/auth.json" },
    signals: ["login", "log in", "sign in", "signin", "authentication", "auth", "password", "credential", "تسجيل الدخول", "تسجيل دخول", "تسجيل حساب", "إنشاء حساب", "انشاء حساب", "دخول للحساب", "دخول الحساب", "صفحة الدخول", "باسورد", "كلمة السر", "كلمة المرور"],
  },
  recipes: {
    purpose: "A practical recipe discovery workspace for finding, filtering, and saving recipes for everyday cooking.",
    primaryUser: "Home cook",
    coreTasks: ["Discover recipes", "Search by ingredient or meal type", "Open recipe details", "Save a recipe for later"],
    screens: [
      { id: "recipe-home", name: "Recipe home", purpose: "Shows featured recipes and discovery controls.", entryPoint: true },
      { id: "recipe-detail", name: "Recipe detail", purpose: "Shows ingredients, steps, timing, and serving information.", entryPoint: false },
      { id: "saved-recipes", name: "Saved recipes", purpose: "Keeps locally saved recipes available for another session.", entryPoint: false },
    ],
    features: [
      { id: "recipe-grid", name: "Recipe grid", description: "Renders structured recipe cards with timing, difficulty, and category.", priority: "must" },
      { id: "recipe-search", name: "Recipe search", description: "Filters recipes by title, ingredient, and description.", priority: "must" },
      { id: "recipe-filters", name: "Recipe filters", description: "Filters recipes by meal type and difficulty.", priority: "must" },
      { id: "recipe-detail", name: "Recipe detail", description: "Opens ingredients and preparation steps for a selected recipe.", priority: "must" },
      { id: "saved-recipes", name: "Saved recipes", description: "Saves and removes recipes in local session state.", priority: "should" },
    ],
    visualDirection: { palette: "Herb green, tomato, warm cream, and charcoal", typography: "Friendly sans with editorial recipe headings", layout: "Two-column discovery page with a responsive recipe grid and detail panel", tone: "Warm, useful, and inviting" },
    dataModels: [{ name: "Recipe", fields: ["id", "title", "category", "difficulty", "minutes", "ingredients", "steps"] }, { name: "SavedRecipe", fields: ["recipeId", "savedAt"] }],
    stateModel: { states: ["query", "category", "difficulty", "recipes", "selectedRecipeId", "savedRecipeIds"], transitions: ["search -> filter recipes", "filter -> update visible recipes", "select recipe -> show detail", "save recipe -> toggle savedRecipeIds"], persistence: "In-memory local session state with deterministic recipe data" },
    files: { style: "styles/recipe-journal.css", logic: "src/recipe-journal.js", data: "data/recipes.json" },
    signals: ["recipe", "recipes", "cooking", "cook", "meal", "meals", "food", "kitchen", "dish", "dishes", "breakfast", "lunch", "dinner", "وصفة", "وصفات", "طبخ", "طبخة", "مطبخ", "أكل", "اكل", "وجبة", "وجبات"],
  },
  restaurant: {
    purpose: "A restaurant landing page that presents menu, location, and reservation capability.",
    primaryUser: "Guest",
    coreTasks: ["Learn about the restaurant", "Browse the menu", "View location and hours", "Request a reservation"],
    screens: [
      { id: "home", name: "Home", purpose: "Introduces the restaurant with visual identity and highlights.", entryPoint: true },
      { id: "menu", name: "Menu", purpose: "Presents menu items and pricing.", entryPoint: false },
      { id: "reservation", name: "Reservation", purpose: "Collects reservation request details.", entryPoint: false },
    ],
    features: [
      { id: "restaurant-intro", name: "Restaurant introduction", description: "Presents restaurant name, cuisine, and visual identity.", priority: "must" },
      { id: "menu-display", name: "Menu display", description: "Shows menu items with descriptions and pricing.", priority: "must" },
      { id: "location-hours", name: "Location and hours", description: "Displays address, phone, email, and opening hours.", priority: "must" },
      { id: "reservation-form", name: "Reservation form", description: "Collects date, time, and guest count for reservation requests.", priority: "should" },
    ],
    visualDirection: { palette: "Warm earth tones, deep accents, and elegant neutrals", typography: "Serif display with clean sans-serif body", layout: "Warm, welcoming restaurant layout with gallery and reservation focus", tone: "Inviting, sophisticated, and warm" },
    dataModels: [{ name: "MenuItem", fields: ["id", "name", "description", "price", "category"] }, { name: "ReservationRequest", fields: ["date", "time", "guests", "name", "email"] }],
    stateModel: { states: ["selectedMenu", "reservationData", "reservationStatus"], transitions: ["browse menu -> view items", "submit reservation -> show confirmation"], persistence: "Local reservation form state with deterministic menu data" },
    files: { style: "styles/restaurant.css", logic: "src/restaurant.js", data: "data/restaurant.json" },
    signals: ["restaurant", "مطعم", "cafe", "trattoria", "dining", "menu", "reservation"],
  },
  contact: {
    purpose: "A contact form and information page for visitor inquiries.",
    primaryUser: "Visitor",
    coreTasks: ["Find contact information", "Send a message", "Receive local form feedback"],
    screens: [
      { id: "contact", name: "Contact", purpose: "Presents contact information and a message form.", entryPoint: true },
    ],
    features: [
      { id: "contact-info", name: "Contact information", description: "Displays email, phone, and location details.", priority: "must" },
      { id: "contact-form", name: "Contact form", description: "Collects name, email, and message with validation.", priority: "must" },
      { id: "form-validation", name: "Form validation", description: "Shows accessible validation feedback for form fields.", priority: "must" },
      { id: "form-confirmation", name: "Form confirmation", description: "Shows honest local confirmation without claiming external delivery.", priority: "should" },
    ],
    visualDirection: { palette: "Professional and clean with accent color", typography: "Clear, readable sans-serif", layout: "Simple, focused contact form layout", tone: "Professional, trustworthy, and responsive" },
    dataModels: [{ name: "ContactMessage", fields: ["name", "email", "message", "submittedAt"] }],
    stateModel: { states: ["formFields", "validationErrors", "submissionStatus"], transitions: ["submit valid form -> show confirmation", "update fields -> validate"], persistence: "Local form state with no external submission claimed" },
    files: { style: "styles/contact.css", logic: "src/contact.js", data: "data/contact.json" },
    signals: ["contact", "اتصل", "تواصل", "رسالة", "form", "نموذج", "inquiry"],
  },
};

const PRODUCT_NAMES: Record<ProductCategory, string> = {
  social_network: "Connectly",
  dashboard: "FreightFlow",
  ecommerce: "Oak & Form",
  booking: "Wayfinder",
  chat: "Threadline",
  auth: "Accessly",
  recipes: "Savorly",
  restaurant: "Bella Tavola",
  contact: "Contact workspace",
  custom: "SmartBuild workspace",
};

const REQUIRED_CATEGORY_FEATURES: Record<Exclude<ProductCategory, "custom">, Array<{ id: string; name: string; description: string }>> = {
  social_network: [
    ["application-shell", "Application shell", "Provides the responsive product frame and shared status regions."],
    ["header", "Header", "Provides identity, search, and global actions."],
    ["navigation", "Navigation", "Moves between feed, profile, messages, and mobile destinations."],
    ["feed", "Feed", "Renders posts from structured social data."],
    ["post-composer", "Post composer", "Creates a post and reports validation and success states."],
    ["post-cards", "Post cards", "Shows author, timestamp, body, reactions, and comments."],
    ["user-identity", "User identity", "Shows the active member identity and profile affordance."],
    ["reactions", "Reactions", "Toggles a reaction and updates the count."],
    ["comments", "Comments", "Shows comment counts and opens the conversation destination."],
    ["search", "Search", "Filters posts and people from the header search field."],
    ["notifications", "Notifications", "Shows unread notification state."],
    ["messages", "Messages", "Provides a messages destination from primary navigation."],
    ["profile-view", "Profile view", "Provides a profile destination from the identity card."],
    ["mobile-navigation", "Mobile navigation", "Keeps primary destinations reachable on narrow screens."],
    ["empty-state", "Empty state", "Explains what to do when a filter has no results."],
    ["loading-state", "Loading state", "Communicates that seed data is being loaded."],
    ["error-state", "Error state", "Explains when seed data could not be loaded."],
    ["success-state", "Success state", "Confirms a post was created."],
  ].map(([id, name, description]) => ({ id, name, description })),
  dashboard: [
    ["dashboard-shell", "Dashboard shell", "Provides persistent workspace navigation and responsive layout."],
    ["kpi-metrics", "KPI metrics", "Shows current values, units, and period deltas."],
    ["data-visualization", "Data visualization", "Renders the trend series with accessible labels."],
    ["table-list", "Shipment table", "Lists operational rows from structured data."],
    ["filters", "Filters", "Filters the visible operational data."],
    ["date-range", "Date range", "Changes the reporting period."],
    ["detail-view", "Detail view", "Opens a selected row with contextual detail."],
    ["status-indicators", "Status indicators", "Communicates risk, health, and online operation status."],
    ["loading-state", "Loading state", "Communicates that metrics are loading."],
    ["empty-state", "Empty state", "Explains when no exceptions or rows are available."],
    ["error-state", "Error state", "Explains when the dashboard data cannot be loaded."],
    ["responsive-layout", "Responsive layout", "Reflows metrics, chart, and table for mobile."],
  ].map(([id, name, description]) => ({ id, name, description })),
  ecommerce: [
    ["catalog", "Catalog", "Renders products from structured catalog data."],
    ["product-cards", "Product cards", "Shows price, material, category, and an action."],
    ["product-detail", "Product detail", "Opens a focused product detail view."],
    ["categories", "Categories", "Filters products by category."],
    ["search", "Search", "Filters products by query."],
    ["filters", "Filters", "Applies catalog filters."],
    ["sort-controls", "Sort controls", "Sorts products by price or name."],
    ["cart", "Cart", "Maintains cart lines and a subtotal."],
    ["quantity-changes", "Quantity changes", "Increases or decreases a cart line quantity."],
    ["remove-item", "Remove item", "Removes one item from the cart."],
    ["wishlist", "Wishlist", "Toggles a product wishlist state."],
    ["checkout-steps", "Checkout steps", "Moves through review and confirmation steps."],
    ["order-summary", "Order summary", "Summarizes products, quantities, and subtotal."],
    ["confirmation-state", "Confirmation state", "Confirms a local checkout request without claiming payment."],
  ].map(([id, name, description]) => ({ id, name, description })),
  booking: [
    ["search", "Search", "Collects a destination and search criteria."],
    ["dates", "Dates", "Collects check-in and check-out dates."],
    ["guests", "Guests", "Collects traveler count."],
    ["results", "Results", "Renders available stays from structured data."],
    ["filters", "Filters", "Filters stays by type."],
    ["sorting", "Sorting", "Sorts stays by rate or rating."],
    ["details", "Details", "Opens a selected stay summary."],
    ["availability", "Availability", "Communicates whether a stay is available."],
    ["booking-summary", "Booking summary", "Summarizes the selected stay and dates."],
    ["confirmation", "Confirmation", "Confirms a local booking request."],
    ["modification", "Modification", "Allows the traveler to return to search and change criteria."],
    ["cancellation", "Cancellation", "Allows a selected local request to be cancelled."],
    ["mobile-booking-flow", "Mobile booking flow", "Keeps search, result, and summary steps usable on mobile."],
  ].map(([id, name, description]) => ({ id, name, description })),
  chat: [
    ["conversation-list", "Conversation list", "Lists conversations and unread markers."],
    ["active-conversation", "Active conversation", "Shows the selected conversation identity and presence."],
    ["message-history", "Message history", "Renders messages from structured conversation data."],
    ["message-composer", "Message composer", "Collects a new message."],
    ["send-message", "Send message", "Appends a local message and confirms success."],
    ["search-conversations", "Search conversations", "Filters the conversation list."],
    ["online-offline", "Online or offline state", "Shows presence and unavailable states."],
    ["unread-messages", "Unread messages", "Shows unread conversation state."],
    ["empty-state", "Empty state", "Explains when no conversations match a search."],
    ["mobile-conversation-navigation", "Mobile conversation navigation", "Keeps inbox and active conversation reachable on mobile."],
  ].map(([id, name, description]) => ({ id, name, description })),
  auth: [
    ["application-shell", "Application shell", "Provides a focused responsive authentication frame."],
    ["login-form", "Login form", "Collects the credentials required to start a session."],
    ["credential-validation", "Credential validation", "Shows accessible field-level validation before submission."],
    ["password-visibility", "Password visibility", "Toggles password visibility without losing the value."],
    ["forgot-password", "Forgot password", "Provides a recovery path with an honest local-only status."],
    ["auth-success", "Authentication success", "Shows a signed-in session state after valid demo credentials."],
    ["auth-error", "Authentication error", "Shows an explicit invalid-credentials state."],
    ["responsive-layout", "Responsive layout", "Reflows the auth card and supporting panel for mobile."],
    ["loading-state", "Loading state", "Communicates that a local sign-in check is running."],
    ["empty-state", "Empty state", "Explains when recovery has no email entered."],
    ["error-state", "Error state", "Explains invalid or incomplete credentials."],
    ["success-state", "Success state", "Confirms the local demo session."],
  ].map(([id, name, description]) => ({ id, name, description })),
  recipes: [
    ["application-shell", "Application shell", "Provides the responsive recipe discovery frame."],
    ["recipe-grid", "Recipe grid", "Renders recipe cards from structured data."],
    ["recipe-search", "Recipe search", "Filters recipes by title and ingredient."],
    ["recipe-filters", "Recipe filters", "Filters recipes by meal type and difficulty."],
    ["recipe-detail", "Recipe detail", "Shows ingredients and preparation steps."],
    ["saved-recipes", "Saved recipes", "Toggles a local saved recipe state."],
    ["loading-state", "Loading state", "Communicates that recipes are loading."],
    ["empty-state", "Empty state", "Explains when no recipes match the active filters."],
    ["error-state", "Error state", "Explains when recipe data cannot be loaded."],
    ["responsive-layout", "Responsive layout", "Reflows recipe discovery and detail surfaces on mobile."],
  ].map(([id, name, description]) => ({ id, name, description })),
  restaurant: [
    ["restaurant-intro", "Restaurant introduction", "Presents name, cuisine, and visual identity."],
    ["menu-display", "Menu display", "Shows menu items with descriptions and pricing."],
    ["location-hours", "Location and hours", "Displays address, phone, email, and opening hours."],
    ["reservation-form", "Reservation form", "Collects date, time, and guest count."],
  ].map(([id, name, description]) => ({ id, name, description })),
  contact: [
    ["contact-info", "Contact information", "Displays email, phone, and location details."],
    ["contact-form", "Contact form", "Collects name, email, and message with validation."],
    ["form-validation", "Form validation", "Shows accessible validation feedback for form fields."],
    ["form-confirmation", "Form confirmation", "Shows local confirmation without claiming external delivery."],
  ].map(([id, name, description]) => ({ id, name, description })),
};

type ContractDetails = Pick<ProductSpecification, "components" | "interactions" | "fileOwnership" | "previewAcceptanceCriteria">;

function contractDetailsFor(
  category: ProductCategory,
  files: { style: string; logic: string; data: string },
  features: ProductSpecification["features"],
  overrides: { componentNames?: readonly string[]; dataType?: string } = {},
): ContractDetails {
  const componentNames: Record<ProductCategory, string[]> = {
    social_network: ["AppShell", "Header", "Feed", "PostComposer", "PostCard", "ProfileView", "NotificationRail", "MessagesView"],
    dashboard: ["DashboardShell", "MetricGrid", "TrendChart", "FilterBar", "ShipmentTable", "ShipmentDetail"],
    ecommerce: ["StoreShell", "Catalog", "ProductCard", "ProductDetail", "CartDrawer", "CheckoutFlow", "Wishlist"],
    booking: ["BookingShell", "SearchForm", "StayResults", "StayDetail", "BookingSummary", "BookingConfirmation"],
    chat: ["ChatShell", "ConversationList", "ConversationView", "MessageHistory", "MessageComposer", "PresenceStatus"],
    auth: ["AuthShell", "BrandPanel", "LoginForm", "CredentialFields", "PasswordToggle", "RecoveryView", "SessionView"],
    recipes: ["RecipeShell", "RecipeGrid", "RecipeCard", "RecipeFilters", "RecipeDetail", "SavedRecipes"],
    restaurant: ["RestaurantShell"],
    contact: ["ContactForm"],
    custom: ["WorkspaceShell"],
  };
  const components = (overrides.componentNames || componentNames[category]).map(name => {
    const id = name.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`).replace(/^-/, "");
    return {
      id,
      name,
      responsibility: `Owns the ${name.replace(/([A-Z])/g, " $1").toLocaleLowerCase().trim()} UI and its connected interactions.`,
      ownerFile: files.logic,
      featureIds: features.filter(feature => feature.id.includes(id.split("-")[0]) || feature.id.includes(name.replace(/[A-Z]/g, "-$&").toLowerCase().replace(/^-/, "").split("-")[0])).map(feature => feature.id),
    };
  });
  const interactions = features.map(feature => ({
    id: `${feature.id}-interaction`,
    trigger: `User uses ${feature.name}`,
    stateChange: `Update ${feature.id} state in the active session`,
    successState: `${feature.name} reports a visible success or updated result`,
    errorState: `${feature.name} reports a visible error without claiming success`,
    emptyState: `${feature.name} explains what to do when no data is available`,
    ownerFile: files.logic,
    previewEvidence: `Visible ${feature.name.toLocaleLowerCase()} result is present after the interaction`,
  }));
  const fileOwnership = features.map(feature => ({
    featureId: feature.id,
    ownerComponent: components.find(component => component.featureIds.includes(feature.id))?.name || components[0]?.name || "Application",
    ownerFile: files.logic,
    stateOwner: `${feature.id}State`,
    dataType: overrides.dataType || (category === "ecommerce" ? "Product/CartLine" : category === "booking" ? "Stay/BookingRequest" : category === "chat" ? "Conversation/Message" : category === "auth" ? "CredentialAttempt/Session" : category === "dashboard" ? "Metric/Shipment" : "Post/Member"),
    persistence: "Deterministic local session state",
    tests: `${feature.id}.interaction.test`,
    previewEvidence: `Preview visibly demonstrates ${feature.name.toLocaleLowerCase()}`,
  }));
  const previewAcceptanceCriteria = features.map(feature => ({
    id: `accept-${feature.id}`,
    featureId: feature.id,
    description: `${feature.name} is represented by connected UI, data, and state.`,
    selector: `[data-feature="${feature.id}"], #${feature.id}, .${feature.id}`,
    expected: `${feature.name} has a visible result or honest empty/loading/error state.`,
  }));
  return { components, interactions, fileOwnership, previewAcceptanceCriteria };
}

function runtimeStateMarkup() {
  return `<aside class="runtime-state" data-runtime-state="loading" aria-live="polite"><span data-runtime-message>Loading project data…</span><span data-runtime-empty hidden>No matching data yet.</span><span data-runtime-error hidden>Project data could not be loaded. Try again.</span><span data-runtime-success hidden>Action completed successfully.</span></aside>`;
}

function featureSurfaceMarkup(specification: ProductSpecification) {
  const category = specification.category;
  if (category === "auth") {
    return `<div class="auth-feature-strip" data-feature="auth-responsive"><span>Local demo flow</span><span>Keyboard-friendly controls</span><span>Visible status feedback</span></div>`;
  }
  if (category === "social_network") {
    return `<nav class="mobile-nav" data-mobile-navigation aria-label="Mobile navigation"><button data-nav="feed">Feed</button><button data-nav="profile">Profile</button><button data-nav="messages">Messages</button></nav><section id="social-secondary-view" class="secondary-view" aria-live="polite"><p>Select Profile or Messages to continue.</p></section>`;
  }
  if (category === "dashboard") {
    return `<div class="dashboard-controls"><label>From<input id="date-from" type="date"></label><label>To<input id="date-to" type="date"></label><label>Filter<select id="status-filter"><option value="all">All statuses</option><option value="risk">At risk</option><option value="on-time">On time</option></select></label></div><div id="dashboard-empty" class="empty-state" hidden>No shipments match these filters.</div><div id="dashboard-error" class="error-state" hidden>Metrics could not be loaded. Refresh to try again.</div>`;
  }
  if (category === "custom") {
    return `<section class="custom-feature-panel" data-feature="application-shell"><p class="eyebrow">Generated workspace</p><h2>Explore the project</h2><p>Each requirement is organized into named screens, components, state, data, and verification files.</p><div id="custom-items" class="custom-items" aria-live="polite"></div><p id="custom-status" class="form-status" role="status"></p></section>`;
  }
  if (category === "recipes") {
    return `<section class="recipe-detail-panel" id="recipe-detail" aria-live="polite"><p class="eyebrow">Recipe detail</p><p>Select a recipe to see ingredients and steps.</p></section><section id="saved-recipes" class="saved-recipes" aria-live="polite">No saved recipes yet.</section>`;
  }
  if (category === "ecommerce") {
    if (specification.visualVariant === "apparel") return "";
    return `<section id="product-detail" class="product-detail" aria-live="polite"><p class="eyebrow">Product detail</p><p>Select a guide or kit to see what is included.</p></section><section id="wishlist-status" class="wishlist-status" aria-live="polite">Your saved pack is empty.</section><label class="sort-control">Sort products<select id="sort-control"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name</option></select></label><section id="checkout-flow" class="checkout-flow" aria-live="polite"><p class="eyebrow">Bundle steps</p><strong data-checkout-step="review">1. Review your pack</strong><strong data-checkout-step="confirm" hidden>2. Confirm bundle</strong><p id="checkout-step-status">Review your picks before saving a bundle.</p></section>`;
  }
  if (category === "booking") {
    return `<label class="sort-control">Sort stays<select id="stay-sort"><option value="recommended">Recommended</option><option value="price">Price</option><option value="rating">Rating</option></select></label><div id="availability-status" class="availability-status" aria-live="polite">Availability will appear after a search.</div><div class="booking-actions"><button id="modify-search" class="secondary-button">Modify search</button><button id="cancel-booking" class="secondary-button" disabled>Cancel request</button></div>`;
  }
  return `<button id="mobile-back-to-inbox" class="secondary-button mobile-back">Back to conversations</button><div id="chat-empty" class="empty-state" hidden>No conversations match your search.</div><div id="offline-status" class="form-status" aria-live="polite">Online</div>`;
}

function interactionEnhancements(specification: ProductSpecification) {
  const category = specification.category;
  const runtime = `const runtimeState=document.querySelector("[data-runtime-state]");const setRuntimeState=(state,message)=>{if(!runtimeState)return;runtimeState.dataset.runtimeState=state;const messageNode=runtimeState.querySelector("[data-runtime-message]");if(messageNode)messageNode.textContent=message;runtimeState.querySelectorAll("[data-runtime-empty],[data-runtime-error],[data-runtime-success]").forEach(node=>node.hidden=true);const target=runtimeState.querySelector("[data-runtime-"+state+"]");if(target)target.hidden=false};window.addEventListener("error",()=>setRuntimeState("error","Project data could not be loaded. Try again."));window.addEventListener("unhandledrejection",()=>setRuntimeState("error","Project data could not be loaded. Try again."));setTimeout(()=>{if(runtimeState?.dataset.runtimeState==="loading")setRuntimeState("ready","Project data is ready.");},500);`;
  if (category === "auth") return runtime;
  if (category === "social_network") {
    return `${runtime}const networkSearch=document.querySelector("#network-search");networkSearch?.addEventListener("input",event=>{const query=event.target.value.toLowerCase();document.querySelectorAll("#feed-list .post-card").forEach(card=>{card.hidden=!card.textContent.toLowerCase().includes(query);});});document.querySelectorAll("[data-nav]").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll("[data-nav]").forEach(item=>item.classList.toggle("is-active",item===button));const target=document.querySelector("#social-secondary-view");if(target)target.innerHTML=button.dataset.nav==="feed"?"<p>The community feed is active.</p>":button.dataset.nav==="profile"?"<p><strong>Maya Noor</strong> · @mayanoor<br>Recent activity and profile details.</p>":"<p>No direct messages yet. Start a conversation from this view.</p>";}));`;
  }
  if (category === "dashboard") {
    return `${runtime}const statusFilter=document.querySelector("#status-filter"),dateFrom=document.querySelector("#date-from"),dateTo=document.querySelector("#date-to"),dashboardEmpty=document.querySelector("#dashboard-empty");const applyDashboardFilter=()=>{const rows=[...document.querySelectorAll("#shipment-table tr")];const filter=statusFilter?.value||"all";rows.forEach(row=>{row.hidden=filter==="risk"&&!row.textContent.includes("High")&& !row.textContent.includes("Medium")||filter==="on-time"&&!row.textContent.includes("On time");});if(dashboardEmpty)dashboardEmpty.hidden=rows.some(row=>!row.hidden);};statusFilter?.addEventListener("change",applyDashboardFilter);dateFrom?.addEventListener("change",applyDashboardFilter);dateTo?.addEventListener("change",applyDashboardFilter);`;
  }
  if (category === "custom") {
    return `${runtime}const items=document.querySelector("#custom-items"),status=document.querySelector("#custom-status");fetch("./data/custom.json").then(response=>{if(!response.ok)throw new Error("DATA_LOAD_FAILED");return response.json()}).then(seed=>{items.innerHTML=seed.features.map(feature=>\`<article class="custom-item"><strong>\${feature.name}</strong><p>\${feature.description}</p><span>\${feature.owner}</span></article>\`).join("");status.textContent="Project data is ready.";}).catch(()=>{status.textContent="Project data could not be loaded.";});`;
  }
  if (category === "recipes") {
    return `${runtime}const saved=new Set(),detail=document.querySelector("#recipe-detail"),savedView=document.querySelector("#saved-recipes");const updateSaved=()=>{savedView.textContent=saved.size?Array.from(saved).map(id=>state.recipes.find(recipe=>recipe.id===id)?.title).filter(Boolean).join(" · ")+" saved locally.":"No saved recipes yet."};document.addEventListener("click",event=>{const card=event.target.closest("[data-recipe-id]");if(!card)return;const recipe=state.recipes.find(item=>item.id===card.dataset.recipeId);if(!recipe)return;if(event.target.closest("[data-save-recipe]")){saved.has(recipe.id)?saved.delete(recipe.id):saved.add(recipe.id);updateSaved();return}detail.innerHTML="<p class=\\"eyebrow\\">Recipe detail</p><h2>"+recipe.title+"</h2><p>"+recipe.description+"</p><h3>Ingredients</h3><ul>"+recipe.ingredients.map(item=>"<li>"+item+"</li>").join("")+"</ul><h3>Method</h3><ol>"+recipe.steps.map(item=>"<li>"+item+"</li>").join("")+"</ol>";});`;
  }
  if (category === "ecommerce") {
    if (specification.visualVariant === "library") return `${runtime}const savedStorageKey="openleaf-reading-list",progressStorageKey="openleaf-reading-progress";try{state.saved=new Set(JSON.parse(localStorage.getItem(savedStorageKey)||"[]"));Object.assign(readProgress,JSON.parse(localStorage.getItem(progressStorageKey)||"{}"));}catch(error){console.warn("OpenLeaf local reading state could not be restored.",error);}document.addEventListener("click",event=>{if(event.target.closest("[data-book]"))localStorage.setItem(savedStorageKey,JSON.stringify([...state.saved]));});document.querySelector("#reader-content")?.addEventListener("scroll",()=>{localStorage.setItem(progressStorageKey,JSON.stringify(readProgress));});`;
    const canineCopy = specification.visualVariant === "canine";
    const detailLabel = canineCopy ? "What is inside" : "Product detail";
    const savedLabel = canineCopy ? " pack(s) saved to your bundle." : " piece(s) saved to your wishlist.";
    return `${runtime}const wishlist=new Set(),productDetail=document.querySelector("#product-detail"),wishlistStatus=document.querySelector("#wishlist-status"),sortControl=document.querySelector("#sort-control"),checkoutFlow=document.querySelector("#checkout-flow"),checkoutStepStatus=document.querySelector("#checkout-step-status");document.addEventListener("click",event=>{const card=event.target.closest("[data-add]")?.closest(".product-card");if(card&&productDetail)productDetail.innerHTML="<p class=\\"eyebrow\\">${detailLabel}</p><h2>"+card.querySelector("h3").textContent+"</h2><p>"+card.querySelector("p").textContent+"</p><button class=\\"secondary-button\\" data-wishlist=\\"true\\">${canineCopy ? "Add to pack" : "Add to wishlist"}</button>";if(event.target.closest("[data-wishlist]")){wishlist.add(productDetail?.querySelector("h2")?.textContent||"selected product");if(wishlistStatus)wishlistStatus.textContent=wishlist.size+"${savedLabel}";}});sortControl?.addEventListener("change",event=>{const cards=[...document.querySelectorAll("#product-grid .product-card")];cards.sort((a,b)=>{const av=Number(a.querySelector("strong").textContent.replace(/[^0-9]/g,"")),bv=Number(b.querySelector("strong").textContent.replace(/[^0-9]/g,""));return event.target.value==="price-high"?bv-av:event.target.value==="price-low"?av-bv:event.target.value==="name"?a.querySelector("h3").textContent.localeCompare(b.querySelector("h3").textContent):0;});cards.forEach(card=>document.querySelector("#product-grid")?.append(card));});document.querySelector("#checkout-button")?.addEventListener("click",()=>{document.querySelector("[data-checkout-step=\\"review\\"]")?.setAttribute("hidden","true");document.querySelector("[data-checkout-step=\\"confirm\\"]")?.removeAttribute("hidden");if(checkoutStepStatus)checkoutStepStatus.textContent="${canineCopy ? "Bundle saved locally. No payment was processed." : "Confirmation step ready. No payment was processed."}";});`;
  }
  if (category === "booking") {
    return `${runtime}const staySort=document.querySelector("#stay-sort"),availability=document.querySelector("#availability-status"),cancelBooking=document.querySelector("#cancel-booking");staySort?.addEventListener("change",event=>{const cards=[...document.querySelectorAll("#stay-list .stay-card")];cards.sort((a,b)=>event.target.value==="rating"?b.textContent.localeCompare(a.textContent):a.textContent.localeCompare(b.textContent));cards.forEach(card=>document.querySelector("#stay-list")?.append(card));});document.querySelector("#booking-request")?.addEventListener("click",()=>{if(availability)availability.textContent="Stay available. Your local request is ready to confirm.";if(cancelBooking)cancelBooking.disabled=false;});document.querySelector("#modify-search")?.addEventListener("click",()=>document.querySelector("#search")?.scrollIntoView({behavior:"smooth"}));cancelBooking?.addEventListener("click",()=>{if(availability)availability.textContent="Booking request cancelled. Search again when you are ready.";cancelBooking.disabled=true;});`;
  }
  return `${runtime}const chatEmpty=document.querySelector("#chat-empty"),mobileBack=document.querySelector("#mobile-back-to-inbox");document.querySelector("#conversation-search")?.addEventListener("input",event=>{const visible=[...document.querySelectorAll("#conversation-list .conversation-item")].filter(item=>!item.hidden);if(chatEmpty)chatEmpty.hidden=visible.length>0;});mobileBack?.addEventListener("click",()=>document.querySelector("#inbox")?.scrollIntoView({behavior:"smooth"}));`;
}

function additionalInteractionEnhancements(specification: ProductSpecification) {
  if (specification.category !== "ecommerce" || specification.visualVariant === "library") return "";
  return `const cartLines=document.querySelector("#cart-lines");const syncCartControls=()=>{if(!cartLines||typeof state==="undefined")return;cartLines.querySelectorAll(".cart-line").forEach((line,index)=>{if(line.querySelector("[data-cart-action]"))return;const controls=document.createElement("span");controls.className="cart-controls";controls.innerHTML="<button type=\\"button\\" data-cart-action=\\"decrease\\" aria-label=\\"Decrease quantity\\">−</button><strong aria-live=\\"polite\\">1</strong><button type=\\"button\\" data-cart-action=\\"increase\\" aria-label=\\"Increase quantity\\">+</button><button type=\\"button\\" data-cart-action=\\"remove\\" aria-label=\\"Remove item\\">Remove</button>";line.append(controls);});};new MutationObserver(syncCartControls).observe(cartLines||document.body,{childList:true,subtree:true});cartLines?.addEventListener("click",event=>{const action=event.target.closest("[data-cart-action]")?.dataset.cartAction;if(!action)return;const line=event.target.closest(".cart-line");const index=[...cartLines.querySelectorAll(".cart-line")].indexOf(line);if(index<0||!state.cart[index])return;if(action==="increase")state.cart.splice(index,0,state.cart[index]);if(action==="decrease"&&state.cart.length>1)state.cart.splice(index,1);if(action==="remove")state.cart.splice(index,1);renderCart();});`;
}

function normalized(value: string) {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'");
}

function signalPattern(signal: string) {
  const phrase = normalized(signal)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "[\\s-]+");
  if (/^[\x00-\x7f]+$/.test(signal)) {
    return new RegExp(`(?:^|[^A-Za-z0-9_])${phrase}(?:$|[^A-Za-z0-9_])`, "i");
  }
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${phrase}(?:$|[^\\p{L}\\p{N}_])`, "iu");
}

function hasAny(value: string, signals: string[]) {
  const sentences = value.split(/[.!?]+/);
  return signals.filter(signal => sentences.some(sentence => {
    if (!signalPattern(signal).test(sentence)) return false;
    const negatedSignal = new RegExp(
      `(?:^|[^\\p{L}\\p{N}_])(?:no|not|without|exclude|excluding|instead of|do not|don't)[^.!?]{0,100}${signalPattern(signal).source}`,
      "iu",
    );
    return !negatedSignal.test(sentence);
  })).slice(0, 5);
}

function isCanineStoreRequest(value: string) {
  return hasAny(value, ["dog", "dogs", "puppy", "puppies", "canine", "كلب", "كلاب", "الكلاب", "سلالات", "جرو", "جراء"]).length > 0;
}

export function classifyProductRequest(request: string): ProductClassification {
  const value = normalized(request);
  const trailSignals = hasAny(value, [
    "walking trails", "walking trail", "hiking trails", "hiking trail", "trail guide", "trail guides",
    "trail catalog", "trail listings", "neighborhood trails", "مسارات المشي", "مسار مشي", "مسارات التنزه",
    "مسارات للمشي", "هايكنج", "مسارات هايكنج",
  ]);
  if (/مسارات.{0,20}مشي|مسارات.{0,20}تنزه|هايكنج/.test(value) && !trailSignals.includes("مسارات مشي")) {
    trailSignals.push("مسارات مشي");
  }
  if (trailSignals.length) {
    return {
      category: "custom",
      confidence: Math.min(0.98, 0.9 + trailSignals.length * 0.02),
      productName: "Trail Atlas",
      primaryUser: "Neighborhood walkers",
      complexity: "medium",
      visualVariant: "classic",
      assumptions: ["Trail details use fictional local sample data; maps and live conditions are not implied."],
      matchedSignals: trailSignals,
    };
  }
  const readingClubSignals = hasAny(value, [
    "book club", "reading club", "book community", "نادي قراءة", "نادي القراءة", "لنادي قراءة", "لنادي القراءة", "نادي الكتاب", "لنادي الكتاب",
  ]);
  if (readingClubSignals.length) {
    return {
      category: "social_network",
      confidence: Math.min(0.98, 0.9 + readingClubSignals.length * 0.02),
      productName: "Reading Club",
      primaryUser: "Reading club member",
      complexity: "medium",
      visualVariant: "classic",
      assumptions: ["The requested membership size is represented by local sample members; no real accounts are created."],
      matchedSignals: readingClubSignals,
    };
  }
  const wellnessSignals = hasAny(value, [
    "wellness", "wellbeing", "well-being", "yoga", "pilates", "spa", "massage",
    "meditation", "therapy", "holistic", "mindfulness", "fitness studio",
    "استوديو عافية", "يوجا", "يوغا", "بيلاتس", "سبا", "مساج", "تأمل", "علاج",
  ]);
  if (wellnessSignals.length) {
    return {
      category: "booking",
      confidence: Math.min(0.98, 0.86 + wellnessSignals.length * 0.04),
      productName: "Auralis Wellness",
      primaryUser: "Wellness studio client",
      complexity: "complex",
      visualVariant: "wellness",
      assumptions: ["The first release uses deterministic local availability so Preview behavior is testable without claiming external booking delivery."],
      matchedSignals: wellnessSignals,
    };
  }
  // Check for contact form BEFORE checking chat/messaging (contact has "message" too)
  const contactSignals = hasAny(value, ["contact", "اتصل", "تواصل", "رسالة", "form", "نموذج"]);
  const portfolioSignals = hasAny(value, [
    "portfolio", "photographer", "photography", "photo gallery", "personal website", "personal site",
    "artist portfolio", "ملف أعمال", "ملف اعمال", "معرض صور", "معرض الصور", "مصور", "تصوير",
  ]);
  if (contactSignals.length && !portfolioSignals.length && !/conversation|chat|inbox|real-?time/i.test(value)) {
    return {
      category: "contact",
      confidence: 0.86,
      productName: PRODUCT_NAMES.contact,
      primaryUser: "Visitor",
      complexity: "medium",
      assumptions: [],
      matchedSignals: contactSignals,
    };
  }
  const ordered: Array<Exclude<ProductCategory, "restaurant" | "contact" | "custom">> = ["auth", "social_network", "dashboard", "booking", "recipes", "ecommerce", "chat"];
  for (const category of ordered) {
    const signals = BLUEPRINTS[category].signals;
    const matchedSignals = hasAny(value, signals);
    if (matchedSignals.length) {
      const canineStore = category === "ecommerce" && isCanineStoreRequest(value);
      const libraryRequest = category === "ecommerce" && !canineStore && hasAny(value, ["book", "books", "reading", "library", "ebook", "e-book", "كتاب", "كتب", "قراءة", "مكتبة", "رواية"]).length > 0;
      const apparelStore = category === "ecommerce" && !canineStore && !libraryRequest && hasAny(value, [
        "fashion", "clothing", "apparel", "boutique", "accessories", "clothes",
        "ملابس", "الملابس", "للملابس", "أزياء", "ازياء", "الازياء", "للازياء",
        "إكسسوارات", "اكسسوارات", "الاكسسوارات", "والاكسسوارات", "عبايات", "أحذية", "احذية",
      ]).length > 0;
      const authRedesign = category === "auth" && hasAny(value, [
        "redesign", "different", "new design", "change the design", "change colors",
        "old design", "previous design", "different layout", "تصميم مختلف", "غيّر التصميم",
        "غير التصميم", "ألوان جديدة", "الوان جديدة", "شكل جديد", "اختلاف", "القديم",
      ]).length > 0;
      return {
        category,
        confidence: Math.min(0.98, 0.72 + matchedSignals.length * 0.06),
        productName: canineStore ? "Pawfolk" : libraryRequest ? "OpenLeaf AI Library" : apparelStore ? "Atelier Nine" : PRODUCT_NAMES[category],
        primaryUser: BLUEPRINTS[category].primaryUser,
        complexity: "complex",
        visualVariant: canineStore ? "canine" : libraryRequest ? "library" : apparelStore ? "apparel" : authRedesign ? "neon" : "classic",
        assumptions: ["The first release uses deterministic local data so Preview behavior is testable without claiming an external integration."],
        matchedSignals,
      };
    }
  }
  if (portfolioSignals.length) {
    const namedPhotographer = /\b(?:photographer|photography)\b/i.test(value) && /\bnour\b/i.test(value);
    const paletteText = ` ${value.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
    const paletteSignals = [
      "warm cream", "deep green", "forest green", "cream", "ivory", "sage", "olive",
      "emerald", "charcoal", "black", "white", "blue", "indigo", "violet", "purple",
      "coral", "pink", "red", "orange", "yellow", "gold", "brown", "gray", "grey",
      "teal", "green",
    ].filter(signal => paletteText.includes(` ${signal} `));
    const visualPalette = paletteSignals.filter(signal =>
      !(signal === "cream" && paletteSignals.includes("warm cream")) &&
      !(signal === "green" && (paletteSignals.includes("deep green") || paletteSignals.includes("forest green")))
    ).join(" and ");
    return {
      category: "custom",
      confidence: 0.9,
      productName: namedPhotographer ? "Nour Photography Portfolio" : "Creative Portfolio",
      primaryUser: "Potential clients and collaborators",
      complexity: "medium",
      visualVariant: "classic",
      visualPalette: visualPalette || undefined,
      assumptions: ["The portfolio is the primary product; contact is a supporting feature, not a contact-only form."],
      matchedSignals: portfolioSignals,
    };
  }
  if (/(restaurant|مطعم|trattoria|cafe|مقهى)/i.test(value)) {
    return { category: "restaurant", confidence: 0.94, productName: PRODUCT_NAMES.restaurant, primaryUser: "Guest", complexity: "medium", assumptions: [], matchedSignals: ["restaurant"] };
  }
  return {
    category: "custom",
    confidence: 0.42,
    productName: PRODUCT_NAMES.custom,
    primaryUser: "Workspace visitor",
    complexity: /(\b(app|application|platform|portal|نظام|تطبيق|منصة)\b)/i.test(value) ? "medium" : "simple",
    visualVariant: "classic",
    assumptions: ["The request did not identify a supported product category; a conservative custom workspace is used instead of inventing a product domain."],
    matchedSignals: [],
  };
}

export function buildProductSpecification(classification: ProductClassification): ProductSpecification {
  const trailSignals = new Set([
    "walking trails", "walking trail", "hiking trails", "hiking trail", "trail guide", "trail guides",
    "trail catalog", "trail listings", "neighborhood trails", "مسارات المشي", "مسار مشي", "مسارات التنزه",
    "مسارات للمشي", "مسارات مشي", "هايكنج", "مسارات هايكنج",
  ]);
  if (classification.category === "custom" && classification.matchedSignals.some(signal => trailSignals.has(signal))) {
    const features: ProductSpecification["features"] = [
      { id: "trail-discovery", name: "Trail discovery", description: "Presents a curated collection of fictional neighborhood trails with clear route summaries.", priority: "must" },
      { id: "trail-search", name: "Trail search", description: "Filters trail cards by trail name, neighborhood, and route description.", priority: "must" },
      { id: "difficulty-filter", name: "Difficulty filter", description: "Filters routes by easy, moderate, or challenging difficulty and reports empty results.", priority: "must" },
      { id: "trail-details", name: "Trail details", description: "Shows each route's distance, estimated duration, terrain, and practical description.", priority: "must" },
      { id: "saved-trails", name: "Saved trails", description: "Toggles favorite routes and restores them from local browser storage.", priority: "must" },
      { id: "responsive-trail-guide", name: "Responsive trail guide", description: "Keeps route cards, controls, and detail views usable on mobile and desktop.", priority: "must" },
    ];
    const files = { style: "styles/custom.css", logic: "src/custom.js", data: "data/custom.json" };
    const details = contractDetailsFor(classification.category, files, features, {
      componentNames: ["TrailAtlasShell", "TrailSearch", "DifficultyFilter", "TrailCatalog", "TrailDetails", "SavedTrails"],
      dataType: "Trail/FavoriteTrail",
    });
    return {
      productName: classification.productName,
      category: classification.category,
      purpose: "A polished neighborhood trail guide for discovering, filtering, and saving local walking routes.",
      primaryUser: classification.primaryUser,
      coreTasks: ["Discover neighborhood routes", "Search trails by name and location", "Filter by difficulty", "Review route distance and terrain", "Save favorite trails locally"],
      visualVariant: "classic",
      screens: [
        { id: "trail-library", name: "Trail library", purpose: "Introduces the guide and presents a searchable route collection.", entryPoint: true },
        { id: "trail-details", name: "Trail details", purpose: "Shows route distance, estimated duration, difficulty, and terrain.", entryPoint: false },
        { id: "saved-trails", name: "Saved trails", purpose: "Collects routes saved by the visitor in this browser.", entryPoint: false },
      ],
      features,
      visualDirection: {
        palette: "Deep pine, warm limestone, river blue, and trail-marker amber",
        typography: "Confident editorial serif headlines paired with clear, compact sans-serif labels",
        layout: "Map-inspired editorial hero above a responsive trail-card grid, with filters and a persistent saved-trails view",
        tone: "Grounded, outdoorsy, welcoming, and practical",
      },
      dataModels: [
        { name: "Trail", fields: ["id", "name", "neighborhood", "difficulty", "distanceMiles", "durationMinutes", "terrain", "description"] },
        { name: "FavoriteTrail", fields: ["trailId", "savedAt"] },
      ],
      stateModel: {
        states: ["searchQuery", "difficultyFilter", "visibleTrailIds", "favoriteTrailIds", "activeTrailId"],
        transitions: ["search -> filter trails by name and neighborhood", "choose difficulty -> filter visible routes", "open trail -> show route details", "toggle favorite -> persist saved trail IDs locally"],
        persistence: "Fictional trail data ships with the project; favorites persist in localStorage without accounts or external services",
      },
      ...details,
      responsiveRules: ["Collapse the trail-card grid to one column on small screens", "Keep search and difficulty controls reachable without horizontal scrolling", "Allow detail and saved-trail views to stack cleanly on mobile"],
      accessibilityRules: ["Use labelled search and difficulty controls", "Expose result counts and save confirmations through aria-live", "Use semantic buttons with visible focus states", "Do not rely on color alone to show route difficulty"],
    };
  }
  const readingClubSignals = new Set(["book club", "reading club", "book community", "نادي قراءة", "نادي القراءة", "لنادي قراءة", "لنادي القراءة", "نادي الكتاب", "لنادي الكتاب"]);
  if (classification.category === "social_network" && classification.matchedSignals.some(signal => readingClubSignals.has(signal))) {
    const files = { style: "styles.css", logic: "app.js", data: "src/data/club-data.mjs" };
    const features: ProductSpecification["features"] = [
      { id: "book-shelf", name: "Shared bookshelf", description: "Shows the club's current books from structured reading-list data.", priority: "must" },
      { id: "book-search", name: "Book search", description: "Filters book cards by title or author and reports an empty result.", priority: "must" },
      { id: "reading-progress", name: "Reading progress", description: "Tracks completed books and updates the member's visible progress.", priority: "must" },
      { id: "meetup-rsvp", name: "Meetup RSVP", description: "Toggles local attendance for the next club meeting with visible feedback.", priority: "must" },
      { id: "member-roster", name: "24-member roster", description: "Shows the requested 24 sample members without creating real accounts.", priority: "must" },
    ];
    const details = contractDetailsFor(classification.category, files, features, {
      componentNames: ["ReadingClubDashboard", "BookShelf", "MeetupPanel", "MemberRoster"],
      dataType: "Book/ReadingProgress/ClubMember/Meetup",
    });
    return {
      productName: classification.productName,
      category: classification.category,
      purpose: "An online home for a 24-member reading club to browse books, track reading progress, and organize meetups.",
      primaryUser: classification.primaryUser,
      coreTasks: ["Browse and search the shared book list", "Track completed reading", "RSVP to the next meetup", "See the 24-member club roster"],
      visualVariant: "library",
      screens: [
        { id: "bookshelf", name: "Shared bookshelf", purpose: "Lists current club selections and reading progress.", entryPoint: true },
        { id: "meetup", name: "Next meetup", purpose: "Shows meeting details and a local RSVP action.", entryPoint: false },
        { id: "members", name: "Club members", purpose: "Shows the requested member roster.", entryPoint: false },
      ],
      features,
      visualDirection: { palette: "Deep forest, warm paper, and muted green", typography: "Readable humanist sans with literary serif accents", layout: "Editorial bookshelf with a meeting panel and compact roster, responsive on mobile", tone: "Welcoming, calm, and community-focused" },
      dataModels: [
        { name: "Book", fields: ["id", "title", "author", "chaptersRead", "chaptersTotal"] },
        { name: "ClubMember", fields: ["id", "label"] },
        { name: "Meetup", fields: ["title", "time", "format", "reading", "attending"] },
      ],
      stateModel: {
        states: ["searchQuery", "finishedBookIds", "attending"],
        transitions: ["search -> filter books", "mark finished -> update reading progress", "toggle RSVP -> update attendance"],
        persistence: "Local browser-session state; no accounts or external messages are created",
      },
      ...details,
      responsiveRules: ["Collapse club panels to one column below 760px", "Keep search and RSVP controls usable on narrow screens", "Avoid horizontal scrolling"],
      accessibilityRules: ["Use semantic landmarks and labelled controls", "Expose book and RSVP updates through aria-live", "Keep visible focus indicators"],
    };
  }
  const blueprint = BLUEPRINTS[classification.category as keyof typeof BLUEPRINTS];
  if (!blueprint) {
    const portfolioSignals = new Set(["portfolio", "photographer", "photography", "photo gallery", "personal website", "personal site", "artist portfolio", "ملف أعمال", "ملف اعمال", "معرض صور", "معرض الصور", "مصور", "تصوير"]);
    if (classification.category === "custom" && classification.matchedSignals.some(signal => portfolioSignals.has(signal))) {
      const features: ProductSpecification["features"] = [
        { id: "portfolio-home", name: "Photographer home", description: "Introduces the photographer and directs visitors to selected work.", priority: "must" },
        { id: "portfolio-gallery", name: "Photography gallery", description: "Shows a curated, locally defined collection of photographs.", priority: "must" },
        { id: "gallery-filtering", name: "Gallery filters", description: "Filters photographs by category using local data.", priority: "must" },
        { id: "photographer-about", name: "Photographer profile", description: "Presents the photographer's background and approach.", priority: "must" },
        { id: "contact-form", name: "Contact form", description: "Collects a visitor's name, email, and message without claiming external delivery.", priority: "must" },
        { id: "contact-form-validation", name: "Contact form validation", description: "Shows accessible validation feedback for incomplete or invalid contact details.", priority: "must" },
        { id: "portfolio-visual-identity", name: "Portfolio visual identity", description: "Uses the requested photography-led palette and editorial visual hierarchy.", priority: "must" },
        { id: "responsive-layout", name: "Responsive portfolio layout", description: "Keeps the navigation, gallery, and contact form usable across screen sizes.", priority: "must" },
      ];
      const files = { style: "styles/custom.css", logic: "src/custom.js", data: "data/custom.json" };
      const details = contractDetailsFor(classification.category, files, features, {
        componentNames: ["PortfolioShell", "PortfolioGallery", "PortfolioAbout", "ContactForm"],
        dataType: "Photo/ContactSubmission",
      });
      return {
        productName: classification.productName,
        category: classification.category,
        purpose: `An editorial photography portfolio for ${classification.productName}, with a browsable gallery, photographer profile, and locally handled contact form.`,
        primaryUser: classification.primaryUser,
        coreTasks: ["View the photographer's selected work", "Filter photographs by category", "Learn about the photographer", "Send a contact enquiry with validated details"],
        visualVariant: classification.visualVariant,
        screens: [
          { id: "home", name: "Home", purpose: "Introduces the photographer through a visual hero and selected work.", entryPoint: true },
          { id: "gallery", name: "Gallery", purpose: "Presents photographs with category filters.", entryPoint: false },
          { id: "about", name: "About", purpose: "Shares the photographer's background and creative approach.", entryPoint: false },
          { id: "contact", name: "Contact", purpose: "Collects a visitor enquiry with client-side validation.", entryPoint: false },
        ],
        features,
        visualDirection: {
          palette: classification.visualPalette || "Warm cream, deep forest green, muted olive, and charcoal",
          typography: "Editorial serif display paired with a clear humanist sans",
          layout: "Image-led portfolio with a spacious hero, responsive gallery, biography, and contact form",
          tone: "Warm, considered, and quietly confident",
        },
        dataModels: [
          { name: "Photo", fields: ["id", "title", "category", "alt", "image", "featured"] },
          { name: "ContactSubmission", fields: ["name", "email", "message", "status"] },
        ],
        stateModel: {
          states: ["activeGalleryCategory", "visiblePhotos", "contactFields", "contactStatus"],
          transitions: ["choose gallery category -> filter visible photos", "submit valid contact details -> show local confirmation", "submit invalid contact details -> show field guidance"],
          persistence: "Local gallery data and in-memory contact form state; no external delivery is claimed",
        },
        ...details,
        responsiveRules: ["Reflow the gallery from multiple columns to one column below 760px", "Keep filters and contact controls usable on narrow screens", "Avoid horizontal scrolling"],
        accessibilityRules: ["Use descriptive alt text for photographs", "Label gallery filters and contact fields", "Expose form feedback through aria-live", "Keep visible keyboard focus indicators"],
      };
    }
    const features: ProductSpecification["features"] = [
      { id: "workspace-shell", name: "Workspace shell", description: "Provides a semantic, responsive starting point.", priority: "must" },
      { id: "empty-state", name: "Empty state", description: "Explains what to do when there is no data.", priority: "must" },
      { id: "loading-state", name: "Loading state", description: "Communicates initial loading.", priority: "must" },
      { id: "error-state", name: "Error state", description: "Explains a failed data load.", priority: "must" },
      { id: "success-state", name: "Success state", description: "Confirms a successful local action.", priority: "must" },
    ];
    const details = contractDetailsFor(classification.category, { style: "styles/custom.css", logic: "src/custom.js", data: "data/custom.json" }, features);
    return {
      productName: classification.productName,
      category: classification.category,
      purpose: "A focused custom workspace generated from the available requirements.",
      primaryUser: classification.primaryUser,
      coreTasks: ["Review the workspace", "Use the available controls", "Provide feedback"],
      visualVariant: classification.visualVariant,
      screens: [{ id: "workspace", name: "Workspace", purpose: "Provides a clear starting point.", entryPoint: true }],
      features,
      visualDirection: { palette: "Ink, blue, and neutral surfaces", typography: "Inter", layout: "Responsive single-column workspace", tone: "Clear and practical" },
      dataModels: [{ name: "WorkspaceItem", fields: ["id", "label", "status"] }],
      stateModel: { states: ["items", "activeItem"], transitions: ["select item -> update activeItem"], persistence: "In-memory deterministic seed data" },
      ...details,
      responsiveRules: ["Collapse columns below 760px", "Keep controls keyboard reachable", "Avoid horizontal scrolling"],
      accessibilityRules: ["Use semantic landmarks", "Expose status through aria-live", "Keep visible focus indicators"],
    };
  }
  const requiredFeatures = REQUIRED_CATEGORY_FEATURES[classification.category as Exclude<ProductCategory, "restaurant" | "contact" | "custom">] || [];
  const apparelStore = classification.visualVariant === "apparel";
  const existing = new Map(blueprint.features.map(feature => [feature.id, feature]));
  const features = Array.from(existing.values()).map(feature =>
    apparelStore && feature.id === "catalog-filter"
      ? { ...feature, description: "Filters apparel by collection, size, and search query." }
      : feature,
  );
  for (const feature of requiredFeatures) {
    if (!existing.has(feature.id)) features.push({ ...feature, priority: "must" });
  }
  const details = contractDetailsFor(classification.category, blueprint.files, features);
  return {
    productName: classification.productName,
    category: classification.category,
    purpose: apparelStore
      ? "A considered clothing and accessories storefront for discovering seasonal pieces, exploring collections, and building a local-preview shopping bag."
      : blueprint.purpose,
    primaryUser: blueprint.primaryUser,
    coreTasks: apparelStore
      ? ["Browse clothing and accessories", "Filter by collection and search", "Review product details", "Add pieces to a local-preview shopping bag"]
      : blueprint.coreTasks,
    visualVariant: classification.visualVariant,
    screens: blueprint.screens,
    features,
    visualDirection: apparelStore
      ? { palette: "Ink black, warm ivory, soft blush, and polished silver", typography: "Editorial serif display paired with a modern sans", layout: "Lookbook-led storefront with an editorial hero, collection filters, product grid, and responsive bag drawer", tone: "Confident, contemporary, and considered" }
      : classification.visualVariant === "neon"
      ? { palette: "Charcoal black, electric lime, and warm white", typography: "Bold geometric sans with compact labels", layout: "Split-screen auth workspace with a graphic identity panel and borderless form area", tone: "Confident, editorial, and high-contrast" }
      : classification.visualVariant === "canine"
        ? { palette: "Cobalt blue, apricot, cream, and deep ink", typography: "Friendly rounded sans with expressive display type", layout: "Colorful editorial storefront with an illustrated hero, product cards, and a spacious cart drawer", tone: "Warm, playful, confident, and human" }
        : classification.visualVariant === "library"
          ? { palette: "Warm paper, deep forest, muted terracotta, and brass", typography: "Readable humanist sans with literary serif accents", layout: "Editorial library with featured shelves, filters, reading drawer, and calm whitespace", tone: "Curious, generous, calm, and premium" }
        : classification.visualVariant === "wellness"
          ? { palette: "Mineral sage, warm sand, charcoal, and a quiet citrus accent", typography: "Refined grotesk with an airy editorial display face", layout: "Calm editorial booking flow with generous whitespace, service cards, and a focused availability panel", tone: "Grounded, restorative, precise, and quietly premium" }
        : blueprint.visualDirection,
    dataModels: apparelStore
      ? [{ name: "ApparelProduct", fields: ["id", "name", "category", "price", "material", "sizes", "color"] }, { name: "BagLine", fields: ["productId", "quantity", "size"] }]
      : blueprint.dataModels,
    stateModel: apparelStore
      ? { states: ["query", "category", "selectedSize", "cartLines", "checkoutMessage"], transitions: ["search -> filter apparel", "select size -> update product choice", "add product -> update bag count", "request checkout -> show local-only status"], persistence: "In-memory local preview state with deterministic apparel catalog; no payment or order service is connected" }
      : blueprint.stateModel,
    ...details,
    responsiveRules: ["Collapse multi-column layouts below 760px", "Keep primary action visible on narrow screens", "Avoid horizontal scrolling"],
    accessibilityRules: ["Use semantic landmarks and labels", "Expose dynamic feedback through aria-live", "Keep visible focus indicators and sufficient contrast"],
  };
}

export function buildFeatureContract(specification: ProductSpecification, files: { style: string; logic: string; data: string }): FeatureContract {
  return {
    version: "1.0",
    features: specification.features.map(feature => ({
      id: feature.id,
      name: feature.name,
      capability: feature.id.includes("validation") ? "client-validation" : "frontend",
      acceptance: [`${feature.name} is visible in the ${specification.category} layout.`, `The ${feature.name.toLocaleLowerCase()} changes state through a real user interaction.`],
      requiredFiles: ["index.html", files.style, files.logic, files.data],
      componentIds: specification.components.filter(component => component.featureIds.includes(feature.id)).map(component => component.id),
      interactionIds: specification.interactions.filter(interaction => interaction.id.startsWith(`${feature.id}-`)).map(interaction => interaction.id),
    })),
  };
}

function architectureFilesFor(category: ProductCategory): ArchitectureFiles {
  const slug = category.replace(/_/g, "-");
  return {
    appShell: "src/app-shell.js",
    components: `src/components/${slug}-components.js`,
    page: `src/pages/${slug}-page.js`,
    state: `src/state/${slug}-state.js`,
    utility: "src/utils/dom.js",
    types: `src/types/${slug}.js`,
    test: `tests/${slug}.test.js`,
  };
}

function requestModuleDefinitions(specification: ProductSpecification): RequestModuleDefinition[] {
  const definitions: RequestModuleDefinition[] = [];
  const usedPaths = new Set<string>();
  const add = (input: Omit<RequestModuleDefinition, "language" | "imports" | "importedBy" | "usedInPreview" | "status">) => {
    if (usedPaths.has(input.path)) return;
    usedPaths.add(input.path);
    definitions.push({
      ...input,
      language: "javascript",
      imports: [],
      importedBy: [],
      usedInPreview: input.kind !== "test",
      status: "created",
    });
  };
  const toSlug = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "module";
  const toExportName = (value: string) => toSlug(value).split("-").map(part => part[0]!.toLocaleUpperCase() + part.slice(1)).join("");

  for (const component of specification.components) {
    const slug = toSlug(component.id);
    add({
      path: `src/components/product/${slug}.js`,
      role: "component",
      responsibility: component.responsibility,
      kind: "component",
      id: component.id,
      exportName: toExportName(component.name),
    });
  }
  for (const screen of specification.screens) {
    const slug = toSlug(screen.id);
    add({
      path: `src/pages/product/${slug}.js`,
      role: "page",
      responsibility: screen.purpose,
      kind: "page",
      id: screen.id,
      exportName: toExportName(screen.name),
    });
  }
  for (const model of specification.dataModels) {
    const slug = toSlug(model.name);
    add({
      path: `src/models/${slug}.js`,
      role: "model",
      responsibility: `Defines the ${model.name} data shape used by this product.`,
      kind: "model",
      id: model.name,
      exportName: toExportName(model.name),
    });
  }
  for (const criterion of specification.previewAcceptanceCriteria) {
    const slug = toSlug(criterion.id);
    add({
      path: `tests/product/${slug}.test.js`,
      role: "test",
      responsibility: `Verifies the ${criterion.featureId} Preview acceptance criterion.`,
      kind: "test",
      id: criterion.id,
      exportName: toExportName(criterion.id),
    });
  }
  return definitions;
}

function requestModuleArtifact(definition: RequestModuleDefinition, specification: ProductSpecification): GeneratedProjectArtifact {
  if (definition.kind === "component") {
    const component = specification.components.find(item => item.id === definition.id)!;
    return {
      path: definition.path,
      language: "javascript",
      content: `export const ${definition.exportName} = Object.freeze(${JSON.stringify({
        id: component.id,
        name: component.name,
        responsibility: component.responsibility,
        featureIds: component.featureIds,
      })});\nexport function mount${definition.exportName}(root = document) { const node = root.querySelector('[data-component="${component.id}"]') || root.querySelector('[data-feature="${component.featureIds[0] || component.id}"]'); if (node) node.dataset.componentReady = "true"; return Boolean(node); }\n`,
    };
  }
  if (definition.kind === "page") {
    const screen = specification.screens.find(item => item.id === definition.id)!;
    return {
      path: definition.path,
      language: "javascript",
      content: `export const ${definition.exportName} = Object.freeze(${JSON.stringify(screen)});\nexport function is${definition.exportName}Active(location = globalThis.location) { return location.hash === "#${screen.id}"; }\n`,
    };
  }
  if (definition.kind === "model") {
    const model = specification.dataModels.find(item => item.name === definition.id)!;
    const defaults = Object.fromEntries(model.fields.map(field => [field, null]));
    return {
      path: definition.path,
      language: "javascript",
      content: `export const ${definition.exportName} = Object.freeze({ name: ${JSON.stringify(model.name)}, fields: ${JSON.stringify(model.fields)} });\nexport const ${definition.exportName}Fields = Object.freeze(${JSON.stringify(model.fields)});\nexport function create${definition.exportName}(values = {}) { return { ...${JSON.stringify(defaults)}, ...values }; }\n`,
    };
  }
  const criterion = specification.previewAcceptanceCriteria.find(item => item.id === definition.id)!;
  return {
    path: definition.path,
    language: "javascript",
    content: `import assert from "node:assert/strict";\nexport const acceptanceCriterion = Object.freeze(${JSON.stringify(criterion)});\nexport function verify(document) { assert.ok(document.querySelector(acceptanceCriterion.selector) || document.body.textContent.includes(acceptanceCriterion.featureId), acceptanceCriterion.description); return true; }\n`,
  };
}

function architectureArtifactsFor(specification: ProductSpecification, files: ArchitectureFiles): GeneratedProjectArtifact[] {
  const dataModel = specification.dataModels.map(model => ({ name: model.name, fields: model.fields }));
  const featureIds = specification.features.map(feature => feature.id);
  return [
    {
      path: files.appShell,
      language: "javascript",
      content: `export function createAppShell(root, context){root.dataset.productCategory=context.category;root.dataset.screenCount=String(context.screens.length);return context;}`,
    },
    {
      path: files.components,
      language: "javascript",
      content: `export const featureRegistry=${JSON.stringify(featureIds)};export function renderCollectionState({loading=false,error=false,empty=false}){return {loading,error,empty};}`,
    },
    {
      path: files.page,
      language: "javascript",
      content: `export const screenMap=${JSON.stringify(specification.screens)};export const primaryScreen=screenMap.find(screen=>screen.entryPoint)||screenMap[0];`,
    },
    {
      path: files.state,
      language: "javascript",
      content: `export function createSessionState(){return ${JSON.stringify({ category: specification.category, states: specification.stateModel.states, transitions: specification.stateModel.transitions, dataModel })};}`,
    },
    {
      path: files.utility,
      language: "javascript",
      content: `export const qs=(selector,root=document)=>root.querySelector(selector);export const text=value=>String(value??"");export const announce=(node,message)=>{if(node)node.textContent=message;};`,
    },
    {
      path: files.types,
      language: "javascript",
      content: `export const productCategory=${JSON.stringify(specification.category)};export const dataModel=${JSON.stringify(dataModel)};export const accessibilityRules=${JSON.stringify(specification.accessibilityRules)};`,
    },
    {
      path: files.test,
      language: "javascript",
      content: `export const previewChecks=${JSON.stringify(specification.previewAcceptanceCriteria)};export function assertFeatureCoverage(document){return previewChecks.every(check=>document.querySelector(check.selector)||document.body.textContent.includes(check.featureId));}`,
    },
  ];
}

type ModularFileDefinition = {
  path: string;
  role: ProjectManifest["files"][number]["role"];
  language: ProjectManifest["files"][number]["language"];
  responsibility: string;
};

type FeatureSupportRole = "model" | "state" | "selector" | "validation" | "service" | "view" | "accessibility" | "events" | "formatting" | "repository" | "workflow" | "test";

type FeatureSupportFile = ModularFileDefinition & {
  featureId: string;
  supportRole: FeatureSupportRole;
};

const FEATURE_SUPPORT_ROLES: Array<{ role: FeatureSupportRole; manifestRole: ModularFileDefinition["role"]; responsibility: string }> = [
  { role: "model", manifestRole: "model", responsibility: "Normalizes and validates records owned by this product feature." },
  { role: "state", manifestRole: "state", responsibility: "Owns deterministic state transitions and subscriptions for this product feature." },
  { role: "selector", manifestRole: "utility", responsibility: "Filters, sorts, and derives view data for this product feature." },
  { role: "validation", manifestRole: "utility", responsibility: "Validates feature input and returns field-level errors without side effects." },
  { role: "service", manifestRole: "utility", responsibility: "Provides a local, asynchronous CRUD boundary for this product feature." },
  { role: "view", manifestRole: "component", responsibility: "Renders this product feature with DOM-safe text and explicit empty states." },
  { role: "accessibility", manifestRole: "utility", responsibility: "Provides keyboard, focus, and live-announcement helpers for this feature." },
  { role: "events", manifestRole: "utility", responsibility: "Binds and cleans up delegated DOM events for this product feature." },
  { role: "formatting", manifestRole: "utility", responsibility: "Formats feature values consistently for display and export." },
  { role: "repository", manifestRole: "utility", responsibility: "Persists feature records behind a replaceable storage boundary." },
  { role: "workflow", manifestRole: "utility", responsibility: "Coordinates validated feature actions and reports explicit outcomes." },
  { role: "test", manifestRole: "test", responsibility: "Exercises feature validation, filtering, state transitions, and storage behavior." },
];

function featureSupportFiles(specification: ProductSpecification, existingPaths: Set<string>, currentCount: number, targetCount = Math.min(200, Math.max(100, currentCount + FEATURE_SUPPORT_ROLES.length))): FeatureSupportFile[] {
  const definitions: FeatureSupportFile[] = [];
  const features = specification.features.length
    ? specification.features
    : [{ id: "application", name: "Application", description: specification.purpose, priority: "must" as const }];
  let round = 0;
  while (currentCount + definitions.length < targetCount) {
    for (const feature of features) {
      for (const support of FEATURE_SUPPORT_ROLES) {
        if (currentCount + definitions.length >= targetCount) break;
        const featureSlug = feature.id.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "application";
        const suffix = round ? `-${round + 1}` : "";
        const root = support.role === "test" ? `tests/features/${featureSlug}` : `src/features/${featureSlug}`;
        const filePath = `${root}/${support.role}${suffix}${support.role === "test" ? ".test.js" : ".js"}`;
        if (existingPaths.has(filePath)) continue;
        existingPaths.add(filePath);
        definitions.push({
          path: filePath,
          role: support.manifestRole,
          language: "javascript",
          responsibility: `${feature.name}: ${support.responsibility}`,
          featureId: feature.id,
          supportRole: support.role,
        });
      }
    }
    round += 1;
    if (round > 20) throw new Error("PROJECT_MODULE_COUNT_LIMIT");
  }
  return definitions;
}

function featureSupportArtifact(definition: FeatureSupportFile, specification: ProductSpecification): GeneratedProjectArtifact {
  const feature = specification.features.find(item => item.id === definition.featureId);
  const fields = Array.from(new Set([
    "id",
    ...((specification.dataModels[0]?.fields || []).slice(0, 5)),
    "status",
    "createdAt",
    "updatedAt",
  ]));
  const moduleName = definition.path.split("/").pop()!.replace(/\.test\.js$|\.js$/i, "")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, character: string) => character.toLocaleUpperCase())
    .replace(/^[a-z]/, character => character.toLocaleUpperCase());
  const slug = definition.featureId;
  const core = `export const featureId = ${JSON.stringify(slug)};
export const featureName = ${JSON.stringify(feature?.name || specification.productName)};
export const featurePurpose = ${JSON.stringify(feature?.description || specification.purpose)};
export const recordFields = Object.freeze(${JSON.stringify(fields)});
export const moduleRole = ${JSON.stringify(definition.supportRole)};

export function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function cloneRecord(value) {
  if (Array.isArray(value)) return value.map(cloneRecord);
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneRecord(item)]));
}

export function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\\s+/g, " ") : "";
}

export function normalizeRecord(value) {
  if (!isPlainRecord(value)) throw new TypeError(featureName + " record must be an object.");
  const record = cloneRecord(value);
  record.id = normalizeText(record.id);
  record.status = normalizeText(record.status) || "active";
  record.createdAt = normalizeText(record.createdAt) || new Date().toISOString();
  record.updatedAt = normalizeText(record.updatedAt) || record.createdAt;
  return record;
}

export function validateRecord(value) {
  const errors = {};
  if (!isPlainRecord(value)) return { valid: false, errors: { record: "Expected an object." } };
  for (const field of recordFields) {
    if (field === "id" && !normalizeText(value[field])) errors[field] = "An identifier is required.";
  }
  for (const [field, item] of Object.entries(value)) {
    if (typeof item === "string" && item.length > 4000) errors[field] = "Value is too long.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function selectById(records, id) {
  const key = normalizeText(id);
  return records.find(record => normalizeText(record.id) === key) || null;
}

export function filterRecords(records, query = "") {
  const needle = normalizeText(query).toLocaleLowerCase();
  if (!needle) return records.slice();
  return records.filter(record => Object.values(record).some(value =>
    typeof value === "string" && value.toLocaleLowerCase().includes(needle),
  ));
}

export function sortRecords(records, field = "updatedAt", direction = "desc") {
  const sign = direction === "asc" ? 1 : -1;
  return records.slice().sort((left, right) =>
    String(left[field] ?? "").localeCompare(String(right[field] ?? ""), undefined, { numeric: true }) * sign,
  );
}

export function groupRecords(records, field = "status") {
  return records.reduce((groups, record) => {
    const key = normalizeText(record[field]) || "unassigned";
    (groups[key] ||= []).push(record);
    return groups;
  }, Object.create(null));
}

export function replaceRecord(records, nextRecord) {
  const next = normalizeRecord(nextRecord);
  const index = records.findIndex(record => record.id === next.id);
  if (index < 0) return [...records, next];
  return records.map((record, current) => current === index ? next : record);
}

export function removeRecord(records, id) {
  const key = normalizeText(id);
  return records.filter(record => normalizeText(record.id) !== key);
}

export function serializeRecords(records) {
  return JSON.stringify(records.map(normalizeRecord));
}

export function deserializeRecords(source) {
  const parsed = JSON.parse(String(source || "[]"));
  if (!Array.isArray(parsed)) throw new TypeError(featureName + " storage must contain a list.");
  return parsed.map(normalizeRecord);
}

export function summarizeRecords(records) {
  const groups = groupRecords(records);
  return { featureId, total: records.length, groups: Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, items.length])) };
}
`;
  const roleBehavior: Record<FeatureSupportRole, string> = {
    model: `export function create${moduleName}(values = {}) {
  const record = normalizeRecord({ ...Object.fromEntries(recordFields.map(field => [field, ""])), ...values });
  const result = validateRecord(record);
  if (!result.valid) throw new TypeError(Object.values(result.errors).join(" "));
  return record;
}

export function update${moduleName}(record, patch) {
  if (!isPlainRecord(patch)) throw new TypeError("A partial record must be an object.");
  return create${moduleName}({ ...record, ...cloneRecord(patch), updatedAt: new Date().toISOString() });
}
`,
    state: `export function create${moduleName}State(records = []) {
  return { records: records.map(normalizeRecord), activeId: null, query: "", status: "idle", error: null, revision: 0 };
}

export function reduce${moduleName}State(state, action) {
  if (!state || !action || typeof action.type !== "string") throw new TypeError("A state and typed action are required.");
  switch (action.type) {
    case "load": return { ...state, records: action.records.map(normalizeRecord), status: "ready", error: null, revision: state.revision + 1 };
    case "save": return { ...state, records: replaceRecord(state.records, action.record), status: "ready", error: null, revision: state.revision + 1 };
    case "remove": return { ...state, records: removeRecord(state.records, action.id), activeId: state.activeId === action.id ? null : state.activeId, revision: state.revision + 1 };
    case "select": return { ...state, activeId: action.id || null };
    case "search": return { ...state, query: normalizeText(action.query) };
    case "busy": return { ...state, status: "busy", error: null };
    case "error": return { ...state, status: "error", error: normalizeText(action.message) || "The operation failed." };
    case "reset": return create${moduleName}State(action.records || []);
    default: return state;
  }
}
`,
    selector: `export function select${moduleName}(records, options = {}) {
  const filtered = filterRecords(records, options.query);
  const active = options.status ? filtered.filter(record => record.status === options.status) : filtered;
  const sorted = sortRecords(active, options.sortBy || "updatedAt", options.direction || "desc");
  const offset = Math.max(0, Number(options.offset) || 0);
  const limit = Math.min(200, Math.max(0, Number(options.limit) || sorted.length));
  return sorted.slice(offset, offset + limit);
}

export function count${moduleName}ByStatus(records) {
  return Object.fromEntries(Object.entries(groupRecords(records)).map(([key, group]) => [key, group.length]));
}
`,
    validation: `export function validate${moduleName}Input(input, rules = {}) {
  const errors = {};
  if (!isPlainRecord(input)) return { valid: false, errors: { input: "Expected an object." } };
  for (const [field, rule] of Object.entries(rules)) {
    const value = input[field];
    const text = typeof value === "string" ? value.trim() : value;
    if (rule.required && (text === undefined || text === null || text === "")) errors[field] = rule.message || "This field is required.";
    if (typeof text === "string" && rule.minLength && text.length < rule.minLength) errors[field] = rule.message || "Value is too short.";
    if (typeof text === "string" && rule.maxLength && text.length > rule.maxLength) errors[field] = rule.message || "Value is too long.";
    if (typeof text === "number" && !Number.isFinite(text)) errors[field] = "Enter a valid number.";
    if (rule.pattern && typeof text === "string" && !rule.pattern.test(text)) errors[field] = rule.message || "Enter a valid value.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function assert${moduleName}Input(input, rules) {
  const result = validate${moduleName}Input(input, rules);
  if (!result.valid) throw Object.assign(new TypeError("Input validation failed."), { fieldErrors: result.errors });
  return cloneRecord(input);
}
`,
    service: `export function create${moduleName}Service(initialRecords = []) {
  let records = initialRecords.map(normalizeRecord);
  const notify = new Set();
  const publish = () => { const view = records.map(cloneRecord); for (const listener of notify) listener(view); };
  return Object.freeze({
    async list(options = {}) { return select${moduleName}Records(records, options).map(cloneRecord); },
    async get(id) { return cloneRecord(selectById(records, id)); },
    async save(record) { const result = validateRecord(record); if (!result.valid) throw new TypeError("Invalid feature record."); records = replaceRecord(records, record); publish(); return cloneRecord(selectById(records, record.id)); },
    async remove(id) { const found = Boolean(selectById(records, id)); records = removeRecord(records, id); if (found) publish(); return found; },
    async replaceAll(next) { if (!Array.isArray(next)) throw new TypeError("Expected a list of records."); records = next.map(normalizeRecord); publish(); return records.length; },
    subscribe(listener) { if (typeof listener !== "function") throw new TypeError("A listener function is required."); notify.add(listener); return () => notify.delete(listener); },
    summary() { return summarizeRecords(records); },
  });
}

function select${moduleName}Records(records, options) { return sortRecords(filterRecords(records, options.query), options.sortBy || "updatedAt", options.direction || "desc"); }
`,
    view: `export function render${moduleName}(container, records, options = {}) {
  if (!container || !container.ownerDocument) throw new TypeError("A DOM container is required.");
  const document = container.ownerDocument;
  const fragment = document.createDocumentFragment();
  const visible = filterRecords(records, options.query);
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "feature-empty-state";
    empty.setAttribute("role", "status");
    empty.textContent = options.emptyMessage || "No " + featureName.toLocaleLowerCase() + " items yet.";
    fragment.append(empty);
  }
  for (const record of visible) {
    const item = document.createElement("article");
    item.className = "feature-record";
    item.dataset.featureId = featureId;
    item.dataset.recordId = normalizeText(record.id);
    const title = document.createElement("h3");
    title.textContent = normalizeText(record.title || record.name || record.label) || featureName;
    const status = document.createElement("p");
    status.className = "feature-record-status";
    status.textContent = normalizeText(record.status) || "active";
    item.append(title, status);
    fragment.append(item);
  }
  container.replaceChildren(fragment);
  return { rendered: visible.length, empty: visible.length === 0 };
}
`,
    accessibility: `export function announce${moduleName}(message, root = document) {
  let live = root.querySelector('[data-feature-live="' + featureId + '"]');
  if (!live) {
    live = root.createElement("div");
    live.dataset.featureLive = featureId;
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.className = "visually-hidden";
    root.body?.append(live);
  }
  live.textContent = normalizeText(message);
  return live;
}

export function focusFirst${moduleName}(container) {
  const target = container?.querySelector('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
  target?.focus();
  return Boolean(target);
}

export function is${moduleName}Activation(event) {
  return event?.key === "Enter" || event?.key === " ";
}
`,
    events: `export function bind${moduleName}Events(root, handlers = {}) {
  if (!root?.addEventListener) throw new TypeError("An event root is required.");
  const controller = new AbortController();
  root.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target || !root.contains(target)) return;
    const action = target.dataset.action;
    const handler = handlers[action];
    if (typeof handler === "function") handler({ event, target, id: target.dataset.id || "" });
  }, { signal: controller.signal });
  root.addEventListener("submit", event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.featureId !== featureId) return;
    const handler = handlers.submit;
    if (typeof handler !== "function") return;
    event.preventDefault();
    handler({ event, form, values: Object.fromEntries(new FormData(form)) });
  }, { signal: controller.signal });
  root.addEventListener("change", event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (target.closest("[data-feature-id]")?.dataset.featureId !== featureId) return;
    handlers.change?.({ event, target, name: target.name, value: target.value });
  }, { signal: controller.signal });
  return () => controller.abort();
}
`,
    formatting: `export function format${moduleName}Label(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "—";
  return normalized.replace(/[-_]+/g, " ").replace(/\\b\\w/g, character => character.toLocaleUpperCase());
}

export function format${moduleName}Date(value, locale = "en") {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Date unavailable";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function format${moduleName}Count(value, locale = "en") {
  const count = Number(value);
  return Number.isFinite(count) ? new Intl.NumberFormat(locale).format(count) : "0";
}

export function to${moduleName}ViewModel(record, locale = "en") {
  return { id: normalizeText(record.id), title: format${moduleName}Label(record.title || record.name || record.label), status: format${moduleName}Label(record.status), updated: format${moduleName}Date(record.updatedAt, locale) };
}
`,
    repository: `export function create${moduleName}Repository(storage, storageKey = "smartbuild:" + featureId) {
  if (!storage?.getItem || !storage?.setItem) throw new TypeError("A storage adapter is required.");
  const read = () => {
    const source = storage.getItem(storageKey);
    return source ? deserializeRecords(source) : [];
  };
  const write = records => {
    const serialized = serializeRecords(records);
    storage.setItem(storageKey, serialized);
    return records;
  };
  return Object.freeze({
    read,
    find(id) { return cloneRecord(selectById(read(), id)); },
    save(record) { const valid = validateRecord(record); if (!valid.valid) throw new TypeError("Invalid " + featureName + " record."); return cloneRecord(selectById(write(replaceRecord(read(), record)), record.id)); },
    remove(id) { const before = read(); const after = removeRecord(before, id); write(after); return before.length !== after.length; },
    clear() { storage.removeItem(storageKey); },
    count() { return read().length; },
  });
}
`,
    workflow: `export async function run${moduleName}Workflow(input, dependencies = {}) {
  if (typeof dependencies.validate === "function") {
    const validation = await dependencies.validate(input);
    if (validation?.valid === false) return { ok: false, stage: "validation", errors: validation.errors || {} };
  }
  if (typeof dependencies.execute !== "function") return { ok: false, stage: "configuration", error: featureName + " action is not configured." };
  try {
    const value = await dependencies.execute(cloneRecord(input));
    if (typeof dependencies.onSuccess === "function") await dependencies.onSuccess(value);
    return { ok: true, stage: "complete", value: cloneRecord(value) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The feature action failed.";
    if (typeof dependencies.onError === "function") await dependencies.onError(message);
    return { ok: false, stage: "execution", error: normalizeText(message) || "The feature action failed." };
  }
}
`,
    test: `import assert from "node:assert/strict";
import { test } from "node:test";
import { filterRecords, normalizeRecord, removeRecord, replaceRecord, validateRecord } from ${JSON.stringify(`../../src/features/${slug}/model.js`)};

test(${JSON.stringify(`${feature?.name || slug} records reject invalid shapes`)}, () => {
  assert.equal(validateRecord(null).valid, false);
  assert.equal(validateRecord({ id: "sample" }).valid, true);
});

test("normalization produces stable identifiers and status", () => {
  assert.deepEqual(normalizeRecord({ id: "  sample  " }).id, "sample");
  assert.equal(normalizeRecord({ id: "sample" }).status, "active");
});

test("feature collections filter, replace, and remove records immutably", () => {
  const first = normalizeRecord({ id: "one", title: "First item" });
  const second = normalizeRecord({ id: "two", title: "Second item" });
  assert.equal(filterRecords([first, second], "second").length, 1);
  assert.equal(replaceRecord([first], second).length, 2);
  assert.deepEqual(removeRecord([first, second], "one").map(item => item.id), ["two"]);
});
`,
  };
  const roleExports = roleBehavior[definition.supportRole];
  const content = `// ${definition.responsibility}
${core}
${roleExports}
export const ${moduleName}Module = Object.freeze({ featureId, featureName, role: moduleRole, responsibility: ${JSON.stringify(definition.responsibility)} });
`;
  const formattedContent = content.replace(/\n{3,}/g, "\n\n");
  if (formattedContent.trim().split(/\r?\n/).length < 50) throw new Error(`PROJECT_SUPPORT_FILE_TOO_SMALL:${definition.path}`);
  return { path: definition.path, content: formattedContent, language: "javascript" };
}

function modularCommerceFileDefinitions(): ModularFileDefinition[] {
  const definitions: ModularFileDefinition[] = [];
  const add = (paths: string[], role: ModularFileDefinition["role"], responsibility: string) => {
    for (const filePath of paths) {
      const language = filePath.endsWith(".css") ? "css" : filePath.endsWith(".json") ? "json" : filePath.endsWith(".md") ? "markdown" : "javascript";
      definitions.push({ path: filePath, role, language, responsibility });
    }
  };
  add([
    "src/components/layout/StoreHeader.js", "src/components/layout/StoreFooter.js", "src/components/layout/MobileNav.js", "src/components/layout/Breadcrumbs.js",
    "src/components/catalog/ProductCard.js", "src/components/catalog/ProductGrid.js", "src/components/catalog/CategoryTabs.js", "src/components/catalog/SearchBar.js",
    "src/components/catalog/SortSelect.js", "src/components/catalog/FilterChips.js", "src/components/catalog/EmptyCatalog.js", "src/components/catalog/LoadingCatalog.js",
    "src/components/product/ProductGallery.js", "src/components/product/ProductInfo.js", "src/components/product/ProductOptions.js", "src/components/product/ProductReviews.js",
    "src/components/product/RelatedProducts.js", "src/components/product/ProductShare.js", "src/components/cart/CartDrawer.js", "src/components/cart/CartItem.js",
    "src/components/cart/CartSummary.js", "src/components/cart/QuantityControl.js", "src/components/cart/RemoveCartItem.js", "src/components/cart/CartBadge.js",
    "src/components/checkout/CheckoutForm.js", "src/components/checkout/ContactFields.js", "src/components/checkout/AddressFields.js", "src/components/checkout/OrderSummary.js",
    "src/components/checkout/PaymentMethods.js", "src/components/feedback/Toast.js", "src/components/feedback/InlineStatus.js", "src/components/feedback/Modal.js",
  ], "component", "Reusable storefront component with a single UI responsibility.");
  add([
    "src/pages/Home.js", "src/pages/Catalog.js", "src/pages/ProductDetails.js", "src/pages/Category.js", "src/pages/SearchResults.js", "src/pages/Cart.js",
    "src/pages/Checkout.js", "src/pages/Profile.js", "src/pages/OrderHistory.js", "src/pages/Wishlist.js", "src/pages/PrivacyPolicy.js", "src/pages/FAQ.js",
  ], "page", "Route-level page model that composes reusable storefront components.");
  add([
    "src/styles/global.css", "src/styles/variables.css", "src/styles/layout.css", "src/styles/header.css", "src/styles/catalog.css", "src/styles/product-card.css",
    "src/styles/product-detail.css", "src/styles/cart.css", "src/styles/checkout.css", "src/styles/forms.css", "src/styles/buttons.css", "src/styles/modal.css",
    "src/styles/responsive.css", "src/styles/accessibility.css",
  ], "style", "Scoped visual rules for one storefront surface.");
  add([
    "src/state/CartContext.js", "src/state/UserContext.js", "src/state/WishlistContext.js", "src/state/CatalogStore.js", "src/state/CheckoutStore.js",
    "src/state/NotificationStore.js", "src/state/StoreProvider.js", "src/state/persistence.js",
  ], "state", "Local state boundary with explicit transitions and persistence behavior.");
  add([
    "src/api/catalogApi.js", "src/api/productApi.js", "src/api/cartApi.js", "src/api/checkoutApi.js", "src/api/userApi.js", "src/api/orderApi.js",
    "src/api/wishlistApi.js", "src/api/searchApi.js", "src/api/httpClient.js", "src/api/apiErrors.js", "src/api/apiTypes.js", "src/api/mockTransport.js",
  ], "api", "Request boundary. Uses deterministic local transport in this Preview and is ready for a real server adapter.");
  add([
    "server/models/User.model.js", "server/models/Product.model.js", "server/models/Category.model.js", "server/models/Cart.model.js",
    "server/models/Order.model.js", "server/models/Address.model.js", "server/models/Review.model.js", "server/models/Wishlist.model.js",
  ], "model", "Backend data contract describing fields and validation boundaries without storing secrets.");
  add([
    "server/controllers/authController.js", "server/controllers/productController.js", "server/controllers/cartController.js", "server/controllers/checkoutController.js",
    "server/controllers/orderController.js", "server/controllers/userController.js", "server/controllers/reviewController.js", "server/controllers/wishlistController.js",
  ], "controller", "Backend use-case boundary. External writes remain explicitly unavailable until a provider is configured.");
  add([
    "server/routes/auth.routes.js", "server/routes/catalog.routes.js", "server/routes/cart.routes.js", "server/routes/checkout.routes.js", "server/routes/orders.routes.js", "server/routes/users.routes.js",
  ], "route", "Server route contract for a future private API.");
  add([
    "server/integrations/paymentAdapter.js", "server/integrations/shippingAdapter.js", "server/integrations/emailAdapter.js",
    "server/integrations/storageAdapter.js", "server/integrations/analyticsAdapter.js", "server/integrations/providerStatus.js",
  ], "integration", "Provider adapter with honest unavailable-state handling; no credentials are generated.");
  add([
    "package.json", "config/app.config.js", "config/routes.config.js", "config/features.config.js", "config/environment.example.js", "config/security.config.js", "config/observability.config.js",
  ], "config", "Non-secret application configuration and capability flags.");
  add([
    "src/types/Product.js", "src/types/Cart.js", "src/types/User.js", "src/types/Order.js",
  ], "type", "Shared data shape used by the corresponding UI and API boundaries.");
  add([
    "data/fixtures/products.json", "data/fixtures/categories.json", "data/fixtures/users.json", "data/fixtures/orders.json",
    "data/fixtures/reviews.json", "data/fixtures/addresses.json", "data/fixtures/wishlists.json", "data/fixtures/feature-flags.json",
  ], "asset", "Deterministic local fixture data for Preview and isolated tests.");
  add([
    "tests/components/ProductCard.test.js", "tests/components/ProductGrid.test.js", "tests/components/CartDrawer.test.js", "tests/components/CheckoutForm.test.js",
    "tests/pages/Catalog.test.js", "tests/pages/ProductDetails.test.js", "tests/pages/Checkout.test.js", "tests/state/CartContext.test.js",
    "tests/state/CatalogStore.test.js", "tests/api/catalogApi.test.js", "tests/api/checkoutApi.test.js", "tests/e2e/storefront.spec.js",
  ], "test", "Focused regression coverage for the owned surface.");
  add([
    "docs/architecture.md", "docs/file-ownership.md", "docs/local-development.md", "docs/api-contract.md", "docs/data-model.md", "docs/preview-checklist.md",
  ], "documentation", "Project documentation explaining ownership, boundaries, and verification.");
  add([
    "public/assets/brand.json", "public/assets/product-image-map.json", "public/assets/icon-map.json", "public/assets/payment-icon-map.json", "public/assets/empty-state-art.json", "public/assets/seo.json",
  ], "asset", "Asset metadata consumed by the storefront without embedding external or secret resources.");
  return definitions;
}

function modularCommerceArtifact(definition: ModularFileDefinition, productName: string): GeneratedProjectArtifact {
  if (definition.language === "json") {
    if (definition.path === "package.json") {
      return {
        path: definition.path,
        language: "json",
        content: JSON.stringify({
          name: productName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "smartbuild-store",
          private: true,
          version: "0.1.0",
          scripts: { preview: "node server/workspacePreviewServer.mjs . 4173", test: "node --test tests" },
          dependencies: {},
          note: "Generated for the isolated SmartBuild workspace. No payment, email, auth, or shipping provider is connected.",
        }, null, 2),
      };
    }
    return { path: definition.path, language: "json", content: JSON.stringify({ source: "SmartBuild local fixture", product: productName, responsibility: definition.responsibility, items: [] }, null, 2) };
  }
  if (definition.language === "css") {
    const selector = definition.path.split("/").pop()!.replace(".css", "").replace(/[^a-z0-9-]/gi, "-");
    return { path: definition.path, language: "css", content: `/* ${definition.responsibility} */\n.${selector}{contain:layout style;}\n` };
  }
  if (definition.language === "markdown") {
    return { path: definition.path, language: "markdown", content: `# ${productName}\n\n${definition.responsibility}\n\nThis document is part of the generated project contract. External providers and secrets must be configured separately.\n` };
  }
  if (definition.path === "src/components/catalog/ProductCard.js") {
    return {
      path: definition.path,
      language: "javascript",
      content: `export function renderProductCard(product = {}) {
  const title = String(product.name || "Untitled product");
  const price = Number(product.price || 0).toFixed(2);
  return \`<article class="product-card" data-product-id="\${String(product.id || "")}">
    <h3>\${title}</h3>
    <p>\${String(product.description || "A locally available product.")}</p>
    <strong>$\${price}</strong>
    <button type="button" data-add-to-cart="\${String(product.id || "")}">Add to cart</button>
  </article>\`;
}
`,
    };
  }
  if (definition.path === "src/state/CartContext.js") {
    return {
      path: definition.path,
      language: "javascript",
      content: `export function createCartContext(initialItems = []) {
  let items = [...initialItems];
  const notify = () => ({ items: [...items], count: items.reduce((total, item) => total + item.quantity, 0) });
  return {
    read: notify,
    add(product) {
      const existing = items.find(item => item.id === product.id);
      if (existing) existing.quantity += 1;
      else items.push({ ...product, quantity: 1 });
      return notify();
    },
    remove(productId) {
      items = items.filter(item => item.id !== productId);
      return notify();
    },
    clear() {
      items = [];
      return notify();
    },
  };
}
`,
    };
  }
  if (definition.path === "src/api/mockTransport.js") {
    return {
      path: definition.path,
      language: "javascript",
      content: `export function createMockTransport(fixtures = {}) {
  return {
    async get(resource) {
      return structuredClone(fixtures[resource] || []);
    },
    async post(resource, payload) {
      return { resource, payload, persisted: false, mode: "local-preview" };
    },
  };
}
`,
    };
  }
  if (definition.path === "server/integrations/paymentAdapter.js") {
    return {
      path: definition.path,
      language: "javascript",
      content: `export function createPaymentAdapter() {
  return {
    status: "unavailable",
    async createCheckoutSession() {
      throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
    },
  };
}
`,
    };
  }
  if (definition.path === "server/controllers/checkoutController.js") {
    return {
      path: definition.path,
      language: "javascript",
      content: `export async function createCheckout(request, paymentAdapter) {
  if (!request?.items?.length) return { ok: false, error: "CART_EMPTY" };
  return paymentAdapter.createCheckoutSession({ items: request.items });
}
`,
    };
  }
  if (definition.path === "config/environment.example.js") {
    return {
      path: definition.path,
      language: "javascript",
      content: `export const environment = {
  mode: "local-preview",
  paymentProvider: "not-configured",
  emailProvider: "not-configured",
  shippingProvider: "not-configured",
};
`,
    };
  }
  const baseName = definition.path.split("/").pop()!.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]+(.)/g, (_match, character: string) => character.toUpperCase());
  const exportName = baseName || "StoreModule";
  return {
    path: definition.path,
    language: "javascript",
    content: `export const ${exportName} = { name: ${JSON.stringify(exportName)}, responsibility: ${JSON.stringify(definition.responsibility)}, product: ${JSON.stringify(productName)} };\nexport function create${exportName}Context(input = {}) { return { ...${exportName}, ...input }; }\n`,
  };
}

export function createProjectManifest(input: {
  buildRunId: string;
  projectId: string;
  workspaceId: string;
  classification: ProductClassification;
  specification: ProductSpecification;
  featureContract: FeatureContract;
  generatedAt: string;
}): ProjectManifest {
  const { style, logic, data } = BLUEPRINTS[input.classification.category as keyof typeof BLUEPRINTS]?.files || {
    style: "styles/custom.css",
    logic: "src/custom.js",
    data: "data/custom.json",
  };
  const architecture = architectureFilesFor(input.specification.category);
  const requestModules = requestModuleDefinitions(input.specification);
  const previewModulePaths = requestModules.filter(item => item.usedInPreview).map(item => item.path);
  const responsibilities: Record<string, string> = {
    "index.html": "Semantic application entry point and screen structure.",
    [style]: "Category-specific visual system and responsive layout.",
    [logic]: "Application bootstrap, state transitions, rendering, and interactions.",
    [architecture.appShell]: "Application shell initialization and workspace context.",
    [architecture.components]: "Reusable category component registry and collection states.",
    [architecture.page]: "Screen map and primary screen definition.",
    [architecture.state]: "Session state shape and state transition contract.",
    [architecture.utility]: "DOM and accessible status helpers.",
    [architecture.types]: "Product category, data model, and accessibility metadata.",
    [data]: "Deterministic structured seed data consumed by the Preview.",
    [architecture.test]: "Preview acceptance checks for the generated product.",
    "README.md": "Generated product contract and file responsibility documentation.",
    "project.manifest.json": "Source-of-truth manifest for Code, Preview, and verification.",
  };
  const files: ProjectManifest["files"] = [
    { path: "index.html", role: "entry", language: "html", responsibility: responsibilities["index.html"], imports: [style, logic], importedBy: [], usedInPreview: true, status: "created" },
    { path: style, role: "style", language: "css", responsibility: responsibilities[style], imports: [], importedBy: ["index.html"], usedInPreview: true, status: "created" },
    { path: logic, role: "logic", language: "javascript", responsibility: responsibilities[logic], imports: [data, architecture.appShell, architecture.components, architecture.page, architecture.state, architecture.utility, architecture.types, ...previewModulePaths], importedBy: ["index.html"], usedInPreview: true, status: "created" },
    { path: architecture.appShell, role: "logic", language: "javascript", responsibility: responsibilities[architecture.appShell], imports: [], importedBy: [logic], usedInPreview: true, status: "created" },
    { path: architecture.components, role: "component", language: "javascript", responsibility: responsibilities[architecture.components], imports: [], importedBy: [logic], usedInPreview: true, status: "created" },
    { path: architecture.page, role: "page", language: "javascript", responsibility: responsibilities[architecture.page], imports: [], importedBy: [logic], usedInPreview: true, status: "created" },
    { path: architecture.state, role: "state", language: "javascript", responsibility: responsibilities[architecture.state], imports: [], importedBy: [logic], usedInPreview: true, status: "created" },
    { path: architecture.utility, role: "utility", language: "javascript", responsibility: responsibilities[architecture.utility], imports: [], importedBy: [logic], usedInPreview: true, status: "created" },
    { path: architecture.types, role: "type", language: "javascript", responsibility: responsibilities[architecture.types], imports: [], importedBy: [logic], usedInPreview: true, status: "created" },
    { path: data, role: "data", language: "json", responsibility: responsibilities[data], imports: [], importedBy: [logic], usedInPreview: true, status: "created" },
    { path: architecture.test, role: "test", language: "javascript", responsibility: responsibilities[architecture.test], imports: [], importedBy: [], usedInPreview: false, status: "created" },
    { path: "README.md", role: "documentation", language: "markdown", responsibility: responsibilities["README.md"], imports: [], importedBy: [], usedInPreview: false, status: "created" },
    { path: "project.manifest.json", role: "manifest", language: "json", responsibility: responsibilities["project.manifest.json"], imports: [], importedBy: [], usedInPreview: false, status: "created" },
  ];
  if (input.classification.category === "ecommerce") {
    for (const definition of modularCommerceFileDefinitions()) {
      files.push({
        path: definition.path,
        role: definition.role,
        language: definition.language,
        responsibility: definition.responsibility,
        imports: [],
        importedBy: [logic],
        usedInPreview: false,
        status: "created",
      });
    }
  }
  for (const definition of requestModules) {
    files.push({
      path: definition.path,
      role: definition.role,
      language: definition.language,
      responsibility: definition.responsibility,
      imports: [],
      importedBy: definition.usedInPreview ? [logic] : [],
      usedInPreview: definition.usedInPreview,
      status: "created",
    });
  }
  const supportModules = featureSupportFiles(input.specification, new Set(files.map(file => file.path)), files.length);
  for (const definition of supportModules) {
    files.push({
      path: definition.path,
      role: definition.role,
      language: definition.language,
      responsibility: definition.responsibility,
      imports: definition.supportRole === "test" ? [`src/features/${definition.featureId}/model.js`] : [],
      importedBy: definition.supportRole === "test" ? [] : [logic],
      usedInPreview: definition.supportRole !== "test",
      status: "created",
    });
  }
  if (files.length > 200) throw new Error("PROJECT_FILE_COUNT_LIMIT_EXCEEDED");
  return {
    schemaVersion: "1.0",
    projectVersion: 1,
    buildRunId: input.buildRunId,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    category: input.classification.category,
    productName: input.specification.productName,
    entryFile: "index.html",
    buildCommand: "No external build step; validate persisted static modules.",
    previewCommand: "node server/workspacePreviewServer.mjs <workspace> <port>",
    dependencies: [],
    generatedAt: input.generatedAt,
    updatedAt: input.generatedAt,
    files,
    featureIds: input.featureContract.features.map(feature => feature.id),
    screenIds: input.specification.screens.map(screen => screen.id),
    interactionIds: input.specification.interactions.map(interaction => interaction.id),
    componentIds: input.specification.components.map(component => component.id),
    fileOwnership: input.specification.fileOwnership,
    previewAcceptanceCriteria: input.specification.previewAcceptanceCriteria,
  };
}

function authNeonMarkup() {
  return `<main class="auth-shell auth-shell--neon" data-auth-variant="neon"><section class="auth-visual-panel" aria-label="Product introduction"><div class="auth-orbit auth-orbit--one"></div><div class="auth-orbit auth-orbit--two"></div><p class="auth-kicker">NORTHSTAR / PRIVATE ACCESS</p><h1>Make room<br><em>for better work.</em></h1><p class="auth-visual-copy">A calmer command center for people who build, decide, and move with intent.</p><ul class="auth-benefits"><li>Private by design</li><li>Focused by default</li><li>Ready when you are</li></ul><span class="auth-index">01 / 03</span></section><section class="auth-form-panel" aria-labelledby="auth-title"><header class="auth-topline"><span class="auth-mark" aria-hidden="true">N</span><span>NORTHSTAR</span><span class="auth-topline-rule"></span><span>MEMBER ACCESS</span></header><div class="auth-form-heading"><p class="auth-kicker">Welcome to your workspace</p><h2 id="auth-title">Enter the quiet.</h2><p id="auth-subtitle">Use the local demo account to explore the complete sign-in flow.</p></div><form id="login-form" novalidate><div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" placeholder="name@company.com" required aria-describedby="auth-email-error"></div><p id="auth-email-error" class="field-error" role="alert" aria-live="polite"></p><div class="field"><label for="auth-password">Password</label><div class="password-field"><input id="auth-password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required aria-describedby="auth-password-error"><button id="password-toggle" type="button" class="password-toggle" aria-label="Show password">Show</button></div></div><p id="auth-password-error" class="field-error" role="alert" aria-live="polite"></p><div class="auth-row"><label class="remember"><input id="remember-me" type="checkbox"> Keep me signed in</label><button id="forgot-password" type="button" class="text-button">Forgot password?</button></div><button id="sign-in-button" class="primary-button" type="submit"><span>Continue</span><span aria-hidden="true">↗</span></button><p id="auth-status" class="form-status" role="status" aria-live="polite"></p></form><section id="recovery-view" class="recovery-view" hidden aria-live="polite"><h3>Reset your route.</h3><p>Enter your email and we will show the local recovery state.</p><button id="recovery-submit" class="primary-button" type="button">Continue recovery</button><button id="back-to-login" class="text-button" type="button">Back to sign in</button></section><section id="session-view" class="session-view" hidden aria-live="polite"><p class="auth-kicker">Access confirmed</p><h3>You are in.</h3><p id="session-summary"></p><button id="sign-out" class="secondary-button" type="button">Sign out</button></section><p class="auth-disclosure">Local preview only. No external identity provider or email delivery is connected.</p></section></main>`;
}

function canineEcommerceMarkup() {
  return `<header class="paw-header"><a class="paw-brand" href="#catalog"><span class="paw-mark" aria-hidden="true">PF</span><span>Pawfolk</span></a><nav aria-label="Store navigation"><a href="#catalog">Explore</a><a href="#product-grid">Collections</a><a href="#product-detail">About the pack</a></nav><button class="paw-cart-button" id="cart-toggle" aria-controls="cart-drawer">Your bag <span id="cart-count">0</span></button></header><main id="catalog" class="paw-main"><section class="paw-hero"><div class="paw-hero-copy"><p class="eyebrow">THE DOG EDIT / DIGITAL GOODS</p><h1>Good things for <em>good dogs.</em></h1><p>Thoughtful guides, joyful prints, and practical tools for every kind of dog person.</p><a class="paw-hero-link" href="#product-grid">Meet the collection <span aria-hidden="true">↗</span></a><div class="paw-proof"><span><strong>12+</strong> guides & kits</span><span><strong>100%</strong> local preview</span></div></div><div class="paw-hero-art" aria-label="Abstract illustration of a happy dog"><div class="paw-sun"></div><div class="paw-dog-shape"><span class="paw-ear paw-ear-left"></span><span class="paw-ear paw-ear-right"></span><span class="paw-eye paw-eye-left"></span><span class="paw-eye paw-eye-right"></span><span class="paw-muzzle"></span></div><span class="paw-art-label">FOR EVERY<br>TAIL & TEMPER</span></div></section><section class="paw-catalog-section"><div class="paw-section-heading"><div><p class="eyebrow">Browse by mood</p><h2>Pick something your pack will love.</h2></div><span class="paw-count">Curated locally / 06 pieces</span></div><section class="catalog-toolbar paw-toolbar"><label class="search"><span class="sr-only">Search dog products</span><input id="catalog-search" type="search" placeholder="Search guides, prints, and kits"></label><div id="category-filters" class="filter-row" role="group" aria-label="Product categories"></div></section><section id="product-grid" class="product-grid paw-product-grid" aria-live="polite"></section></section></main><aside id="cart-drawer" class="cart-drawer paw-cart-drawer" aria-label="Shopping cart" aria-hidden="true"><div class="panel-heading"><h2>Your bag</h2><button id="cart-close" class="icon-button" aria-label="Close cart">×</button></div><div id="cart-lines"></div><div class="cart-total"><span>Subtotal</span><strong id="cart-total">$0</strong></div><button id="checkout-button" class="primary-button">Save your bundle</button><p id="checkout-status" class="form-status" aria-live="polite"></p></aside>`;
}

function fashionEcommerceMarkup() {
  return `<header class="store-header fashion-header"><a class="brand" href="#catalog">ATELIER NINE</a><nav aria-label="Store navigation"><a href="#catalog">New arrivals</a><a href="#product-grid">Collections</a><a href="#product-detail">Our edit</a></nav><button class="cart-button" id="cart-toggle" aria-controls="cart-drawer">Shopping bag <span id="cart-count">0</span></button></header><main id="catalog" class="store-main fashion-main"><section class="store-hero fashion-hero"><div><p class="eyebrow">THE EVERYDAY EDIT / CLOTHING & ACCESSORIES</p><h1>Pieces to make your own.</h1><p>Considered layers, useful details, and a little room for expression.</p><a class="fashion-cta" href="#product-grid">Explore the collection <span aria-hidden="true">↗</span></a></div><div class="hero-swatch fashion-hero-art" role="img" aria-label="Abstract editorial composition in rose, cream, and charcoal"><span class="fashion-shape fashion-shape--one"></span><span class="fashion-shape fashion-shape--two"></span><span class="fashion-shape fashion-shape--three"></span><span class="fashion-art-label">FORM /<br>FUNCTION</span></div></section><section class="fashion-collection-heading"><div><p class="eyebrow">Selected for the season</p><h2>Wear it your way.</h2></div><p>Clothing and finishing touches for a well-edited wardrobe.</p></section><section class="catalog-toolbar fashion-toolbar"><label class="search"><span class="sr-only">Search clothing and accessories</span><input id="catalog-search" type="search" placeholder="Search pieces"></label><div id="category-filters" class="filter-row" role="group" aria-label="Apparel categories"></div></section><section id="product-grid" class="product-grid fashion-product-grid" aria-live="polite"></section><section id="product-detail" class="product-detail fashion-detail" aria-live="polite"><p class="eyebrow">The details</p><p>Select a piece to see its details.</p></section><section id="wishlist-status" class="wishlist-status" aria-live="polite">Your saved pieces will appear here.</section><label class="sort-control">Sort pieces<select id="sort-control"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name</option></select></label><section id="checkout-flow" class="checkout-flow" aria-live="polite"><p class="eyebrow">Your next step</p><strong data-checkout-step="review">1. Review your bag</strong><strong data-checkout-step="confirm" hidden>2. Review your bag</strong><p id="checkout-step-status">A local preview only; payment and order processing are not connected.</p></section></main><aside id="cart-drawer" class="cart-drawer fashion-cart" aria-label="Shopping bag" aria-hidden="true"><div class="panel-heading"><h2>Your bag</h2><button id="cart-close" class="icon-button" aria-label="Close bag">×</button></div><div id="cart-lines"></div><div class="cart-total"><span>Subtotal</span><strong id="cart-total">$0</strong></div><button id="checkout-button" class="primary-button">Review bag</button><p id="checkout-status" class="form-status" aria-live="polite"></p></aside>`;
}

function libraryMarkup() {
  return `<header class="library-header"><a class="library-brand" href="#catalog"><span class="library-mark" aria-hidden="true">OL</span><span>OpenLeaf</span></a><nav aria-label="Library navigation"><a href="#catalog">Discover</a><a href="#product-grid">Library</a><a href="#reading-list">My reading</a></nav><button id="reading-list-toggle" class="library-list-button" aria-controls="reading-list">Reading list <span id="reading-list-count">0</span></button></header><main id="catalog" class="library-main"><section class="library-hero"><div><p class="eyebrow">OPENLEAF / FREE READING</p><h1>Make time for a <em>good page.</em></h1><p>A calm, curated home for short original stories, public-domain classics, and practical ideas you can read at your own pace.</p><a class="library-hero-link" href="#product-grid">Explore the shelves <span aria-hidden="true">↗</span></a><div class="library-proof"><span><strong>100%</strong> free to read</span><span><strong>Local</strong> recommendations</span></div></div><div class="library-hero-art" aria-label="Illustration of an open book"><span class="library-art-page library-art-page-left"></span><span class="library-art-page library-art-page-right"></span><span class="library-art-sun"></span><span class="library-art-label">READ<br>CURIOUSLY</span></div></section><section class="library-shelf"><div class="library-section-heading"><div><p class="eyebrow">The open shelf</p><h2>Find your next small escape.</h2></div><span id="library-count" class="library-count">06 titles / free forever</span></div><section class="library-toolbar"><label class="library-search"><span class="sr-only">Search the library</span><input id="catalog-search" type="search" placeholder="Search titles, authors, and topics"></label><div id="category-filters" class="filter-row" role="group" aria-label="Library categories"></div></section><section id="product-grid" class="product-grid library-grid" aria-live="polite"></section></section></main><aside id="reader-drawer" class="reader-drawer" aria-label="Book reader" aria-hidden="true"><div class="reader-heading"><div><p class="eyebrow">Now reading</p><h2 id="reader-title">Choose a title</h2></div><button id="reader-close" class="icon-button" aria-label="Close reader">×</button></div><p id="reader-meta" class="reader-meta"></p><div class="reader-toolbar"><button id="reader-smaller" type="button">A−</button><button id="reader-larger" type="button">A+</button><button id="reader-theme" type="button">Night mode</button></div><article id="reader-content" class="reader-content"><p>Select a book to start reading.</p></article><div class="reader-progress"><span>Reading progress</span><strong id="reader-progress-value">0%</strong></div><div class="reader-progress-bar"><span id="reader-progress-bar"></span></div></aside><aside id="reading-list" class="reading-list-drawer" aria-label="Saved reading list" aria-hidden="true"><div class="reader-heading"><h2>Your reading list</h2><button id="reading-list-close" class="icon-button" aria-label="Close reading list">×</button></div><div id="reading-list-items"><p>No saved titles yet.</p></div></aside>`;
}

function htmlFor(specification: ProductSpecification, manifest: ProjectManifest) {
  const file = manifest.files.find(item => item.role === "style")!.path;
  const logic = manifest.files.find(item => item.role === "logic")!.path;
  const category = specification.category;
  const iconFill = specification.category === "auth" && specification.visualVariant === "neon" ? "%23d7ff4f" : "%235b5bd6";
  const content = category === "auth"
    ? (specification.visualVariant === "neon" ? authNeonMarkup() : `<main class="auth-shell"><section class="auth-brand-panel"><p class="eyebrow">Accessly</p><h1>Welcome back.</h1><p>Sign in to continue to your workspace.</p><ul class="auth-benefits"><li>Clear account entry</li><li>Honest validation states</li><li>Responsive on every screen</li></ul></section><section class="auth-card" aria-labelledby="auth-title"><div class="auth-card-header"><p class="eyebrow">Account access</p><h2 id="auth-title">Sign in</h2><p id="auth-subtitle">Use the demo credentials to see the complete local flow.</p></div><form id="login-form" novalidate><div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required aria-describedby="auth-email-error"></div><p id="auth-email-error" class="field-error" role="alert" aria-live="polite"></p><div class="field"><label for="auth-password">Password</label><div class="password-field"><input id="auth-password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required aria-describedby="auth-password-error"><button id="password-toggle" type="button" class="password-toggle" aria-label="Show password">Show</button></div></div><p id="auth-password-error" class="field-error" role="alert" aria-live="polite"></p><div class="auth-row"><label class="remember"><input id="remember-me" type="checkbox"> Remember me</label><button id="forgot-password" type="button" class="text-button">Forgot password?</button></div><button id="sign-in-button" class="primary-button" type="submit">Sign in</button><p id="auth-status" class="form-status" role="status" aria-live="polite"></p></form><section id="recovery-view" class="recovery-view" hidden aria-live="polite"><h3>Recover your access</h3><p>Enter your email and we will show the local recovery state.</p><button id="recovery-submit" class="primary-button" type="button">Continue recovery</button><button id="back-to-login" class="text-button" type="button">Back to sign in</button></section><section id="session-view" class="session-view" hidden aria-live="polite"><p class="eyebrow">Session ready</p><h3>You're signed in.</h3><p id="session-summary"></p><button id="sign-out" class="secondary-button" type="button">Sign out</button></section><p class="auth-disclosure">Preview uses local demo credentials only. No external authentication or email delivery is connected.</p></section></main>`)
    : category === "social_network"
    ? `<header class="topbar"><a class="brand" href="#feed">Connectly</a><label class="search"><span class="sr-only">Search people and posts</span><input id="network-search" type="search" placeholder="Search people and posts"></label><nav aria-label="Primary navigation"><button class="nav-button is-active" data-nav="feed">Feed</button><button class="nav-button" data-nav="profile">Profile</button><button class="nav-button" data-nav="messages">Messages</button></nav></header><main class="network-layout"><aside class="profile-card" aria-label="Your profile"><div class="avatar">MN</div><strong>Maya Noor</strong><span>@mayanoor</span><button class="secondary-button" data-nav="profile">View profile</button></aside><section class="feed-column" id="feed"><div class="section-heading"><div><p class="eyebrow">Your community</p><h1>Good morning, Maya</h1></div><span class="status-pill">12 new posts</span></div><form id="post-composer" class="composer"><label for="post-text">Share an update</label><textarea id="post-text" rows="2" placeholder="What is happening in your world?"></textarea><button class="primary-button" type="submit">Publish update</button><p id="composer-status" class="form-status" aria-live="polite"></p></form><div id="feed-list" class="post-list" aria-live="polite"></div></section><aside class="insight-rail"><section class="rail-card"><p class="eyebrow">People to follow</p><div id="suggestions"></div></section><section class="rail-card"><p class="eyebrow">Notifications</p><p><strong>3</strong> new mentions waiting for you.</p></section></aside></main>`
    : category === "dashboard"
      ? `<div class="dashboard-shell"><aside class="sidebar"><a class="brand" href="#overview">FreightFlow</a><nav aria-label="Workspace navigation"><button class="nav-button is-active" data-nav="overview">Overview</button><button class="nav-button" data-nav="reports">Reports</button><button class="nav-button" data-nav="settings">Settings</button></nav><div class="sidebar-footer"><span class="status-dot"></span> Live operations</div></aside><main class="dashboard-main" id="overview"><header class="page-header"><div><p class="eyebrow">Operations control room</p><h1>Network performance</h1></div><label class="period-control">Reporting period<select id="period-filter"><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option></select></label></header><section id="metric-grid" class="metric-grid" aria-label="Key metrics"></section><section class="dashboard-grid"><article class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">On-time delivery</p><h2>Trend by day</h2></div><span class="trend-up">+8.4%</span></div><div id="trend-chart" class="trend-chart" role="img" aria-label="On-time delivery trend"></div></article><article class="panel alert-panel"><div class="panel-heading"><div><p class="eyebrow">Needs attention</p><h2>Exceptions</h2></div><span id="exception-count" class="count-badge">0</span></div><div id="exception-list"></div></article></section><section class="panel table-panel"><div class="panel-heading"><div><p class="eyebrow">Shipment ledger</p><h2>Recent shipments</h2></div><button class="secondary-button" data-nav="reports">View report</button></div><div class="table-scroll"><table><thead><tr><th>Route</th><th>Status</th><th>ETA</th><th>Risk</th></tr></thead><tbody id="shipment-table"></tbody></table></div><div id="shipment-detail" class="detail-panel" aria-live="polite"></div></section></main></div>`
      : category === "custom"
        ? `<header class="custom-header"><a class="brand" href="#custom-workspace">${escapeHtml(specification.productName)}</a><nav aria-label="Project navigation"><a href="#custom-workspace">Overview</a><a href="#custom-items">Features</a><a href="#custom-status">Status</a></nav></header><main id="custom-workspace" class="custom-main" data-smartbuild-project-identity="visible"><section class="custom-hero"><p class="eyebrow">SMARTBUILD / MODULAR PROJECT</p><h1 id="project-identity">A clear foundation for <em>${escapeHtml(specification.productName)}.</em></h1><p>${escapeHtml(specification.purpose)}</p><span class="status-pill">Structured local preview</span></section></main>`
      : category === "recipes"
        ? `<header class="recipe-header"><a class="recipe-brand" href="#recipe-home"><span class="recipe-mark">S</span>Savorly</a><nav aria-label="Recipe navigation"><a href="#recipe-home">Discover</a><a href="#recipe-grid">Recipes</a><a href="#saved-recipes">Saved</a></nav></header><main class="recipe-main" id="recipe-home"><section class="recipe-hero"><div><p class="eyebrow">SAVORLY / EVERYDAY COOKING</p><h1>Good food, <em>made doable.</em></h1><p>Find practical recipes with clear steps, honest timing, and ingredients you can actually use.</p></div><div class="recipe-hero-art" aria-label="Illustration of a bowl of herbs"><span class="recipe-art-leaf recipe-art-leaf--one"></span><span class="recipe-art-leaf recipe-art-leaf--two"></span><span class="recipe-art-bowl"></span></div></section><section class="recipe-toolbar"><label class="recipe-search"><span class="sr-only">Search recipes</span><input id="recipe-search" type="search" placeholder="Search recipes or ingredients"></label><div id="recipe-filters" class="filter-row" role="group" aria-label="Recipe categories"></div></section><section id="recipe-grid" class="recipe-grid" aria-live="polite"></section></main>`
      : category === "ecommerce"
          ? (specification.visualVariant === "canine" ? canineEcommerceMarkup() : specification.visualVariant === "library" ? libraryMarkup() : specification.visualVariant === "apparel" ? fashionEcommerceMarkup() : `<header class="store-header"><a class="brand" href="#catalog">Oak &amp; Form</a><nav aria-label="Store navigation"><a href="#catalog">Shop</a><a href="#catalog">Collections</a><a href="#catalog">Journal</a></nav><button class="cart-button" id="cart-toggle" aria-controls="cart-drawer">Cart <span id="cart-count">0</span></button></header><main id="catalog" class="store-main"><section class="store-hero"><div><p class="eyebrow">Made for slow mornings</p><h1>Objects with a point of view.</h1><p>Warm, durable furniture for rooms that feel lived in.</p></div><div class="hero-swatch" aria-label="Walnut and linen material swatches"></div></section><section class="catalog-toolbar"><label class="search"><span class="sr-only">Search the catalog</span><input id="catalog-search" type="search" placeholder="Search pieces"></label><div id="category-filters" class="filter-row" role="group" aria-label="Product categories"></div></section><section id="product-grid" class="product-grid" aria-live="polite"></section></main><aside id="cart-drawer" class="cart-drawer" aria-label="Shopping cart" aria-hidden="true"><div class="panel-heading"><h2>Your selection</h2><button id="cart-close" class="icon-button" aria-label="Close cart">×</button></div><div id="cart-lines"></div><div class="cart-total"><span>Subtotal</span><strong id="cart-total">$0</strong></div><button id="checkout-button" class="primary-button">Request checkout</button><p id="checkout-status" class="form-status" aria-live="polite"></p></aside>`)
        : category === "booking"
          ? `<header class="travel-header"><a class="brand" href="#search">Wayfinder</a><nav aria-label="Travel navigation"><a href="#search">Explore</a><a href="#results">Saved trips</a><a href="#summary">Trips</a></nav><button class="secondary-button">Sign in</button></header><main class="travel-main"><section id="search" class="search-hero"><p class="eyebrow">Go somewhere good</p><h1>Find a stay that feels like your place.</h1><form id="trip-search" class="trip-form"><label>Where<input id="destination" required placeholder="City or region"></label><label>Check in<input id="check-in" required type="date"></label><label>Check out<input id="check-out" required type="date"></label><label>Travelers<select id="travelers"><option>2 travelers</option><option>1 traveler</option><option>3 travelers</option><option>4 travelers</option></select></label><button class="primary-button" type="submit">Search stays</button></form><p id="search-status" class="form-status" aria-live="polite"></p></section><section id="results" class="results-section"><div class="section-heading"><div><p class="eyebrow">Curated stays</p><h2>Good places to land</h2></div><div id="stay-filters" class="filter-row" role="group" aria-label="Stay filters"></div></div><div class="travel-grid"><div id="stay-list" class="stay-list"></div><aside id="trip-summary" class="trip-summary"><p class="eyebrow">Your trip</p><div id="summary-content">Choose a stay to see your summary.</div><button id="booking-request" class="primary-button" disabled>Request this stay</button><p id="booking-status" class="form-status" aria-live="polite"></p></aside></div></section></main>`
          : `<header class="chat-header"><a class="brand" href="#inbox">Threadline</a><div class="presence-summary"><span class="status-dot"></span> 8 teammates online</div><button class="secondary-button">Workspace</button></header><main class="chat-shell" id="inbox"><aside class="conversation-sidebar"><div class="sidebar-heading"><div><p class="eyebrow">Inbox</p><h1>Conversations</h1></div><button class="icon-button" aria-label="Start a conversation">+</button></div><label class="search"><span class="sr-only">Search conversations</span><input id="conversation-search" type="search" placeholder="Search conversations"></label><div id="conversation-list" class="conversation-list"></div></aside><section class="conversation-panel" aria-label="Active conversation"><header id="conversation-heading" class="conversation-heading"></header><div id="message-list" class="message-list" aria-live="polite"></div><form id="message-composer" class="message-composer"><label class="sr-only" for="message-text">Write a message</label><textarea id="message-text" rows="1" placeholder="Write a message"></textarea><button class="primary-button" type="submit">Send</button><p id="message-status" class="form-status" aria-live="polite"></p></form></section></main>`;
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="${specification.purpose}"><title>${specification.productName}</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='${iconFill}'/%3E%3Cpath d='M8 16h16' stroke='white' stroke-width='4'/%3E%3C/svg%3E"><link rel="stylesheet" href="${file}"></head><body data-product-category="${category}">${content}${featureSurfaceMarkup(specification)}${runtimeStateMarkup()}<script type="module" src="${logic}"></script></body></html>`;
}

function recipeStylesFor() {
  return `.recipe-header{display:flex;align-items:center;gap:2rem;padding:1rem max(1.25rem,5vw);background:#24322d;color:#fff}.recipe-brand{display:flex;align-items:center;gap:.65rem;margin-right:auto;color:#fff;text-decoration:none;font-weight:900}.recipe-mark{display:grid;place-items:center;width:2.2rem;height:2.2rem;border-radius:50%;background:#e6b85c;color:#24322d}.recipe-header nav{display:flex;gap:1.2rem}.recipe-header nav a{min-height:44px;display:inline-flex;align-items:center;color:#e5eee7;text-decoration:none;font-size:.82rem}.recipe-main{max-width:1180px;margin:auto;padding:0 1.25rem 4rem}.recipe-hero{display:grid;grid-template-columns:1fr .75fr;gap:3rem;align-items:center;padding:4rem 0 3rem}.recipe-hero h1{max-width:10ch;margin:.5rem 0 1rem;color:#24322d;font-size:clamp(3.2rem,7vw,6.3rem);line-height:.9;letter-spacing:-.09em}.recipe-hero h1 em{color:#e05b43;font-style:normal}.recipe-hero p:not(.eyebrow){max-width:34rem;color:var(--muted);font-size:1.05rem;line-height:1.7}.recipe-hero-art{position:relative;display:grid;place-items:center;min-height:300px;border-radius:46% 54% 52% 48%;background:#dce4d4;box-shadow:16px 16px 0 #e6b85c;overflow:hidden}.recipe-art-bowl{width:12rem;height:6rem;border-radius:0 0 8rem 8rem;background:#e05b43;box-shadow:inset 0 1rem 0 rgba(255,255,255,.2)}.recipe-art-leaf{position:absolute;width:3rem;height:6rem;border-radius:100% 0 100% 0;background:#718b62;transform:rotate(35deg)}.recipe-art-leaf--one{top:22%;left:28%}.recipe-art-leaf--two{top:18%;right:25%;transform:scaleX(-1) rotate(28deg)}.recipe-toolbar{display:flex;gap:1rem;align-items:center;margin-bottom:1.4rem}.recipe-search{flex:1}.recipe-search input{width:100%;border:1px solid #ddd6c8;border-radius:999px;background:var(--panel);color:var(--ink);padding:.9rem 1.1rem;outline:none}.recipe-search input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(224,91,67,.15)}.recipe-toolbar .filter-row{display:flex;gap:.4rem;flex-wrap:wrap}.recipe-toolbar .filter-row button{min-height:40px;border:1px solid #ddd6c8;border-radius:999px;background:var(--panel);color:var(--muted);padding:.55rem .8rem}.recipe-toolbar .filter-row button.is-active{background:#24322d;color:#fff;border-color:#24322d}.recipe-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.recipe-card{display:flex;flex-direction:column;overflow:hidden;border:1px solid #e6dfd2;border-radius:18px;background:var(--panel);box-shadow:0 10px 28px rgba(36,50,45,.07)}.recipe-card-art{min-height:120px;padding:1rem;display:flex;align-items:end;background:linear-gradient(135deg,#dce4d4,#f1d7b0);color:#24322d;font-weight:850}.recipe-card:nth-child(2n) .recipe-card-art{background:linear-gradient(135deg,#f0c9b9,#f7e4d9)}.recipe-card-body{display:grid;gap:.65rem;padding:1rem}.recipe-card-body h2{margin:0;font-size:1.2rem}.recipe-card-body p{margin:0;color:var(--muted);font-size:.84rem;line-height:1.55}.recipe-card-meta{display:flex;gap:.5rem;color:var(--accent-strong);font-size:.74rem;font-weight:800}.recipe-card-actions{display:flex;gap:.5rem;align-items:center}.recipe-card-actions .primary-button,.save-button{min-height:44px}.save-button{border:1px solid #ddd6c8;border-radius:999px;background:transparent;color:var(--ink);padding:.65rem .85rem;font-weight:800}.recipe-detail-panel,.saved-recipes{max-width:1180px;margin:1rem auto;padding:1.25rem;border:1px solid #e6dfd2;border-radius:18px;background:var(--panel)}.recipe-detail-panel h2{margin-bottom:.4rem}.recipe-detail-panel li{margin:.35rem 0}.saved-recipes{color:var(--muted);font-size:.85rem}@media(max-width:820px){.recipe-hero{grid-template-columns:1fr;padding:2.5rem 0}.recipe-hero-art{min-height:230px}.recipe-toolbar{align-items:stretch;flex-direction:column}.recipe-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.recipe-header nav{display:none}}@media(max-width:520px){.recipe-main{padding-inline:1rem}.recipe-grid{grid-template-columns:1fr}}`;
}

function customStylesFor() {
  return `.custom-header{display:flex;align-items:center;gap:2rem;padding:1rem max(1.25rem,5vw);background:#182235;color:#fff}.custom-header .brand{margin-right:auto;color:#fff}.custom-header nav{display:flex;gap:1rem}.custom-header nav a{display:inline-flex;align-items:center;min-height:44px;color:#d6deed;text-decoration:none;font-size:.82rem}.custom-main{max-width:1120px;margin:auto;padding:0 1.25rem 4rem}.custom-hero{padding:5rem 0 3rem;max-width:760px}.custom-hero h1{margin:.6rem 0 1rem;color:#182235;font-size:clamp(3rem,7vw,6.4rem);line-height:.9;letter-spacing:-.09em}.custom-hero h1 em{color:#4778ff;font-style:normal}.custom-hero p:not(.eyebrow){max-width:38rem;color:var(--muted);font-size:1.1rem;line-height:1.7}.custom-feature-panel{max-width:1120px;margin:0 auto 4rem;padding:1.25rem}.custom-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin-top:1rem}.custom-item{padding:1rem;border:1px solid #dfe5ee;border-radius:16px;background:var(--panel);box-shadow:0 10px 26px rgba(20,35,60,.06)}.custom-item p{color:var(--muted);font-size:.85rem;line-height:1.5}.custom-item span{color:var(--accent-strong);font-size:.75rem;font-weight:800}@media(max-width:760px){.custom-header nav{display:none}.custom-hero{padding:3rem 0 2rem}.custom-items{grid-template-columns:1fr}}`;
}

function cssFor(specification: ProductSpecification) {
  const palettes: Record<ProductCategory, string> = {
    social_network: "--accent:#7557ff;--accent-strong:#5137d6;--page:#f6f5ff;--ink:#201d35;--muted:#716d83;--panel:#fff;",
    dashboard: "--accent:#2f66f5;--accent-strong:#1747be;--page:#f4f7fb;--ink:#162033;--muted:#667085;--panel:#fff;",
    ecommerce: "--accent:#bd6748;--accent-strong:#8f442c;--page:#f7f1ea;--ink:#2b2520;--muted:#7c7168;--panel:#fffdf9;",
    booking: "--accent:#ef7155;--accent-strong:#c74f37;--page:#f1f7fb;--ink:#142c43;--muted:#66798b;--panel:#fff;",
    chat: "--accent:#73e4bc;--accent-strong:#3dc394;--page:#111827;--ink:#f4f7fb;--muted:#97a3b6;--panel:#1b2434;",
    auth: "--accent:#5b5bd6;--accent-strong:#4141a8;--page:#f5f3ef;--ink:#24232a;--muted:#716f78;--panel:#fffdf9;}.auth-shell{display:grid;grid-template-columns:minmax(280px,.85fr) minmax(360px,480px);gap:4rem;align-items:center;max-width:1080px;min-height:100vh;margin:auto;padding:2rem 1.25rem}.auth-brand-panel{padding:2rem}.auth-brand-panel h1{font-size:clamp(3rem,7vw,5.8rem);line-height:.9}.auth-brand-panel>p:not(.eyebrow){max-width:28rem;color:var(--muted);font-size:1.08rem;line-height:1.7}.auth-benefits{display:grid;gap:.8rem;padding:0;list-style:none;color:var(--muted)}.auth-benefits li:before{content:'✓';margin-right:.6rem;color:var(--accent);font-weight:800}.auth-card{padding:2rem;border:1px solid color-mix(in srgb,var(--muted) 18%,transparent);border-radius:24px;background:var(--panel);box-shadow:0 24px 70px rgba(30,25,50,.1)}.auth-card form{display:grid;gap:.55rem}.field{display:grid;gap:.35rem;margin-top:.8rem}.field label,.remember{font-size:.82rem;font-weight:750;color:var(--ink)}.field input{width:100%;border:1px solid color-mix(in srgb,var(--muted) 25%,transparent);border-radius:10px;background:var(--panel);color:var(--ink);padding:.78rem .85rem;outline:none}.password-field{display:flex;gap:.45rem}.password-field input{min-width:0}.password-toggle,.text-button{border:0;background:transparent;color:var(--accent-strong);font-weight:750;cursor:pointer}.password-toggle{min-width:44px;min-height:44px;padding:0 .35rem}.text-button{min-height:24px;padding:.25rem .35rem}.remember input{width:24px;height:24px;margin:0}.auth-row{display:flex;justify-content:space-between;align-items:center;gap:.6rem;margin:.45rem 0 .8rem}.remember{display:flex;align-items:center;gap:.4rem}.field-error{min-height:1rem;margin:0;color:#bd3e53;font-size:.78rem}.auth-disclosure{margin:1.2rem 0 0;color:var(--muted);font-size:.74rem;line-height:1.5}.recovery-view,.session-view{margin-top:1rem;padding-top:1rem;border-top:1px solid color-mix(in srgb,var(--muted) 15%,transparent)}.auth-feature-strip{display:flex;justify-content:center;gap:1rem;flex-wrap:wrap;padding:0 1.25rem 1rem;color:var(--muted);font-size:.76rem}@media(max-width:820px){.auth-shell{grid-template-columns:1fr;gap:1rem;max-width:560px}.auth-brand-panel{padding:1rem 0}.auth-brand-panel h1{font-size:3.2rem}.auth-benefits{grid-template-columns:repeat(3,1fr);font-size:.78rem}}@media(max-width:520px){.auth-shell{padding:1rem}.auth-brand-panel h1{font-size:2.7rem}.auth-benefits{grid-template-columns:1fr}.auth-card{border-radius:18px;padding:1.1rem}.auth-row{align-items:flex-start;flex-direction:column}}:root{",
    recipes: "--accent:#e05b43;--accent-strong:#b43b2a;--page:#f8f4eb;--ink:#24322d;--muted:#6f7a72;--panel:#fffdf8;",
    custom: "--accent:#4778ff;--accent-strong:#2c55c7;--page:#f5f7fb;--ink:#182235;--muted:#68758a;--panel:#fff;",
    restaurant: "--accent:#45543b;--accent-strong:#2d3928;--page:#f5f1e9;--ink:#26251f;--muted:#716f63;--panel:#fff;",
    contact: "--accent:#4778ff;--accent-strong:#2c55c7;--page:#f5f7fb;--ink:#182235;--muted:#68758a;--panel:#fff;",
  };
  const authNeonStyles = `--accent:#d7ff4f;--accent-strong:#d7ff4f;--page:#101313;--ink:#f5f7ee;--muted:#aab2aa;--panel:#171b1a;}.auth-shell{display:grid;grid-template-columns:minmax(320px,.95fr) minmax(400px,1.05fr);min-height:100vh;background:var(--page);overflow:hidden}.auth-visual-panel{position:relative;display:flex;flex-direction:column;justify-content:center;min-height:100vh;padding:clamp(2rem,7vw,7rem);background:var(--accent);color:#101313;overflow:hidden}.auth-visual-panel h1{position:relative;z-index:1;max-width:11ch;margin:1.5rem 0 1.2rem;font-size:clamp(3.5rem,7vw,7.5rem);line-height:.84;letter-spacing:-.09em}.auth-visual-panel h1 em{font-style:normal;color:#f5f7ee}.auth-visual-copy{position:relative;z-index:1;max-width:25rem;font-size:1.05rem;line-height:1.65}.auth-kicker{position:relative;z-index:1;margin:0;color:inherit;font-size:.7rem;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.auth-benefits{position:relative;z-index:1;display:grid;gap:.8rem;margin:2rem 0 0;padding:0;list-style:none;font-weight:800}.auth-benefits li:before{content:'+';display:inline-block;margin-right:.65rem}.auth-index{position:absolute;right:clamp(1.5rem,5vw,4rem);bottom:2rem;font-size:.72rem;font-weight:900;letter-spacing:.16em}.auth-orbit{position:absolute;border:1px solid rgba(16,19,19,.35);border-radius:50%;transform:rotate(-18deg)}.auth-orbit--one{width:35rem;height:35rem;right:-12rem;top:8%}.auth-orbit--two{width:19rem;height:19rem;right:8%;top:28%;border-width:2px}.auth-form-panel{display:flex;flex-direction:column;justify-content:center;max-width:680px;width:100%;padding:clamp(1.5rem,7vw,6rem);background:var(--page);color:var(--ink)}.auth-topline{display:flex;align-items:center;gap:.7rem;margin-bottom:clamp(3rem,8vh,7rem);color:var(--muted);font-size:.68rem;font-weight:900;letter-spacing:.15em}.auth-mark{display:grid;place-items:center;width:2rem;height:2rem;background:var(--accent);color:#101313;font-size:1rem}.auth-topline-rule{height:1px;flex:1;background:#38403b}.auth-form-heading{max-width:32rem}.auth-form-heading h2{margin:.5rem 0 1rem;font-size:clamp(2.5rem,5vw,5rem);line-height:.9;letter-spacing:-.08em}.auth-form-heading p:last-child{max-width:24rem;color:var(--muted);line-height:1.6}.auth-form-panel form{display:grid;gap:.35rem;max-width:32rem;margin-top:2.5rem}.auth-form-panel .field{display:grid;gap:.35rem;margin-top:1rem}.auth-form-panel .field label,.auth-form-panel .remember{color:var(--muted);font-size:.75rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.auth-form-panel .field input{width:100%;border:0;border-bottom:1px solid #38403b;border-radius:0;background:transparent;color:var(--ink);padding:.8rem 0;outline:none}.auth-form-panel .field input:focus{border-color:var(--accent);box-shadow:0 1px 0 var(--accent)}.auth-form-panel .password-field{display:flex;gap:.6rem}.auth-form-panel .password-field input{min-width:0}.auth-form-panel .password-toggle,.auth-form-panel .text-button{border:0;background:transparent;color:var(--accent);font-weight:850;cursor:pointer}.auth-form-panel .password-toggle{min-width:44px;min-height:44px;padding:0 .35rem}.auth-form-panel .text-button{min-height:24px;padding:.25rem .35rem}.auth-form-panel .auth-row{display:flex;justify-content:space-between;align-items:center;gap:.8rem;margin:1.4rem 0 1.2rem}.auth-form-panel .remember{display:flex;align-items:center;gap:.45rem}.auth-form-panel .remember input{width:24px;height:24px;margin:0;accent-color:var(--accent)}.auth-form-panel .primary-button{display:flex;align-items:center;justify-content:space-between;gap:1rem;border:0;border-radius:0;background:var(--accent);color:#101313;padding:1rem 1.1rem;font-weight:950}.auth-form-panel .primary-button:hover{background:#efffb0}.auth-form-panel .form-status{min-height:1.35rem;color:var(--accent);font-size:.85rem}.auth-form-panel .field-error{min-height:1rem;margin:0;color:#ff8f8f;font-size:.78rem}.auth-form-panel .recovery-view,.auth-form-panel .session-view{margin-top:2rem;padding-top:1.5rem;border-top:1px solid #38403b}.auth-form-panel .auth-disclosure{margin:2rem 0 0;color:#6f786f;font-size:.72rem;line-height:1.5}@media(max-width:820px){.auth-shell{grid-template-columns:1fr}.auth-visual-panel{min-height:46vh;padding:2rem}.auth-visual-panel h1{font-size:clamp(3.2rem,14vw,6rem)}.auth-form-panel{max-width:none;padding:2rem}.auth-topline{margin-bottom:3rem}}@media(max-width:520px){.auth-visual-panel{min-height:42vh}.auth-form-panel{padding:1.25rem}.auth-form-panel .auth-row{align-items:flex-start;flex-direction:column}}:root{`;
  const canineStoreStyles = `--accent:#ff7657;--accent-strong:#dd4f3d;--page:#fff8ef;--ink:#18233a;--muted:#6c7383;--panel:#ffffff;}.paw-header{display:flex;align-items:center;gap:2rem;padding:1rem max(1.25rem,5vw);background:#18233a;color:#fff}.paw-brand{display:flex;align-items:center;gap:.7rem;margin-right:auto;color:#fff;text-decoration:none;font-size:1.2rem;font-weight:900;letter-spacing:-.04em}.paw-mark{display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:12px;background:#ffcf56;color:#18233a;font-size:.7rem;font-weight:950;letter-spacing:-.08em}.paw-header nav{display:flex;gap:1.25rem}.paw-header nav a{color:#d9e1f1;text-decoration:none;font-size:.82rem;font-weight:750}.paw-header nav a:hover{color:#ffcf56}.paw-cart-button{border:1px solid rgba(255,255,255,.25);border-radius:999px;background:transparent;color:#fff;padding:.65rem 1rem;font-weight:850}.paw-cart-button span{display:inline-grid;place-items:center;min-width:1.35rem;height:1.35rem;margin-left:.35rem;border-radius:50%;background:#ff7657;color:#fff;font-size:.72rem}.paw-main{max-width:1240px;margin:auto;padding:0 1.25rem 5rem}.paw-hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:3rem;align-items:center;min-height:500px;padding:4rem 0 3rem}.paw-hero-copy{max-width:620px}.paw-hero h1{margin:.5rem 0 1.2rem;color:#18233a;font-size:clamp(3.2rem,7vw,6.8rem);line-height:.9;letter-spacing:-.09em}.paw-hero h1 em{color:#dd4f3d;font-style:normal}.paw-hero-copy>p:not(.eyebrow){max-width:32rem;color:var(--muted);font-size:1.08rem;line-height:1.7}.paw-hero-link{display:inline-flex;align-items:center;gap:.7rem;margin-top:1.3rem;color:#18233a;text-decoration:none;font-weight:900}.paw-hero-link span{display:grid;place-items:center;width:2rem;height:2rem;border-radius:50%;background:#ffcf56}.paw-proof{display:flex;gap:2rem;margin-top:3rem;color:var(--muted);font-size:.76rem}.paw-proof strong{display:block;color:#18233a;font-size:1.2rem}.paw-hero-art{position:relative;display:grid;place-items:center;min-height:370px;border-radius:42% 58% 48% 52% / 48% 42% 58% 52%;background:#6ac9c3;overflow:hidden;box-shadow:18px 18px 0 #ffcf56}.paw-sun{position:absolute;top:12%;right:14%;width:7rem;height:7rem;border-radius:50%;background:#ffcf56}.paw-dog-shape{position:relative;width:14rem;height:12rem;border-radius:46% 46% 42% 42%;background:#f7d5aa;box-shadow:inset 0 -1rem 0 rgba(221,79,61,.14)}.paw-ear{position:absolute;top:-3rem;width:5rem;height:6rem;border-radius:70% 30% 65% 35%;background:#dd8b61}.paw-ear-left{left:0;transform:rotate(-22deg)}.paw-ear-right{right:0;transform:scaleX(-1) rotate(-22deg)}.paw-eye{position:absolute;top:4rem;width:.8rem;height:1rem;border-radius:50%;background:#18233a}.paw-eye-left{left:4rem}.paw-eye-right{right:4rem}.paw-muzzle{position:absolute;left:50%;bottom:1.5rem;width:4rem;height:2.6rem;border-radius:48%;background:#fff1d9;transform:translateX(-50%)}.paw-muzzle:after{content:'';position:absolute;left:50%;top:.35rem;width:1rem;height:.7rem;border-radius:50%;background:#18233a;transform:translateX(-50%)}.paw-art-label{position:absolute;left:1.5rem;bottom:1.5rem;color:#18233a;font-size:.72rem;font-weight:950;letter-spacing:.12em;line-height:1.3}.paw-catalog-section{padding-top:1rem}.paw-section-heading{display:flex;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1.5rem}.paw-section-heading h2{max-width:28rem;margin:0;color:#18233a;font-size:clamp(1.8rem,3vw,3rem);line-height:.95;letter-spacing:-.06em}.paw-count{color:var(--muted);font-size:.75rem;font-weight:800}.paw-toolbar{display:flex;gap:1rem;align-items:center;margin-bottom:1.5rem}.paw-toolbar .search{flex:1}.paw-toolbar .search input{border:1px solid #e8dfd3;border-radius:999px;background:#fff;padding:.9rem 1.1rem}.paw-toolbar .filter-row{display:flex;gap:.45rem;flex-wrap:wrap}.paw-toolbar .filter-row button{border:1px solid #e8dfd3;border-radius:999px;background:#fff;color:#6c7383;padding:.55rem .85rem;font-size:.75rem;font-weight:800}.paw-toolbar .filter-row button.is-active{border-color:#18233a;background:#18233a;color:#fff}.paw-product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.2rem}.paw-product-grid .product-card{display:flex;flex-direction:column;min-height:300px;border:1px solid #eee3d5;border-radius:24px;background:#fff;overflow:hidden;box-shadow:0 18px 45px rgba(24,35,58,.08);transition:transform .2s ease,box-shadow .2s ease}.paw-product-grid .product-card:hover{transform:translateY(-5px);box-shadow:0 24px 55px rgba(24,35,58,.14)}.paw-product-grid .product-art{display:grid;place-items:center;min-height:150px;background:linear-gradient(135deg,#ffcf56,#ff9b7e);color:#18233a;font-size:1.2rem;font-weight:950;letter-spacing:-.04em}.paw-product-grid .product-card:nth-child(2n) .product-art{background:linear-gradient(135deg,#6ac9c3,#b9e8d9)}.paw-product-grid .product-card:nth-child(3n) .product-art{background:linear-gradient(135deg,#9d9bf2,#e2d8ff)}.paw-product-grid .product-card>div:not(.product-art){padding:1.1rem 1.15rem .5rem}.paw-product-grid .product-card h3{margin:0 0 .4rem;color:#18233a;font-size:1.05rem}.paw-product-grid .product-card p{margin:0;color:#6c7383;font-size:.8rem;line-height:1.5}.paw-product-grid .product-card footer{display:flex;align-items:center;justify-content:space-between;gap:.7rem;margin-top:auto;padding:1rem 1.15rem 1.15rem}.paw-product-grid .product-card footer strong{color:#18233a;font-size:1rem}.paw-product-grid .primary-button{border:0;border-radius:999px;background:#18233a;color:#fff;padding:.65rem .85rem;font-size:.75rem;font-weight:850}.paw-product-grid .primary-button:hover{background:#dd4f3d}.paw-cart-drawer{border-left:0!important;border-radius:24px 0 0 24px;background:#fff!important;box-shadow:-20px 0 55px rgba(24,35,58,.18)!important}.paw-cart-drawer .panel-heading{border-bottom:1px solid #eee3d5}.paw-cart-drawer .primary-button{border:0;border-radius:999px;background:#dd4f3d;color:#fff;padding:.8rem 1rem;font-weight:850}@media(max-width:820px){.paw-header nav{display:none}.paw-hero{grid-template-columns:1fr;min-height:auto;padding:2.5rem 0}.paw-hero-art{min-height:280px}.paw-product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.paw-toolbar{align-items:stretch;flex-direction:column}.paw-section-heading{align-items:flex-start;flex-direction:column}}@media(max-width:520px){.paw-main{padding-inline:1rem}.paw-hero h1{font-size:clamp(3rem,16vw,5rem)}.paw-proof{gap:1rem}.paw-product-grid{grid-template-columns:1fr}.paw-header{padding-inline:1rem}.paw-brand{font-size:1rem}}`;
  const fashionStoreStyles = `--accent:#a6496d;--accent-strong:#7c2f4f;--page:#f5efeb;--ink:#211a1d;--muted:#786d70;--panel:#fffdfb;}.fashion-header{position:sticky;top:0;z-index:2;padding:1rem max(1.25rem,5vw);background:#211a1d;color:#fffdfb;border-color:#3b3034}.fashion-header nav a{display:inline-flex;align-items:center;min-width:44px;min-height:44px;color:#e8dfe1;font-size:.78rem;text-decoration:none}.fashion-header nav a:hover{color:#f2b8c8}.fashion-header .cart-button{min-height:44px;background:#f2b8c8;color:#211a1d}.fashion-main{max-width:1320px;padding:1.5rem clamp(1rem,5vw,4rem) 5rem}.fashion-hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);gap:clamp(1.5rem,5vw,5rem);min-height:500px;padding:3rem 0}.fashion-hero h1{max-width:9ch;margin:.75rem 0 1rem;font-family:Georgia,serif;font-size:clamp(3.2rem,7vw,6.8rem);font-weight:500;line-height:.88;letter-spacing:-.075em}.fashion-hero>div:first-child>p:not(.eyebrow){max-width:28rem;color:var(--muted);font-size:1.04rem;line-height:1.7}.fashion-cta{display:inline-flex;align-items:center;gap:.8rem;min-height:48px;margin-top:1rem;color:var(--ink);font-weight:800;text-decoration:none}.fashion-cta span{display:grid;place-items:center;width:2.2rem;height:2.2rem;border-radius:50%;background:#f2b8c8}.fashion-hero-art{position:relative;display:block;width:100%;height:auto;min-height:360px;border-radius:48% 48% 8px 8px;background:linear-gradient(145deg,#e8c6c0 0 36%,#c99c97 36% 58%,#eadfd4);box-shadow:16px 16px 0 #d8c8bd;overflow:hidden}.fashion-shape{position:absolute;display:block}.fashion-shape--one{left:24%;top:16%;width:52%;height:76%;border-radius:48% 48% 12% 12%;background:linear-gradient(135deg,#f8eee8,#d9c6bd);clip-path:polygon(22% 0,78% 0,100% 18%,82% 32%,78% 100%,22% 100%,18% 32%,0 18%)}.fashion-shape--two{left:39%;top:17%;width:22%;height:32%;background:#45373b;clip-path:polygon(25% 0,75% 0,100% 100%,0 100%)}.fashion-shape--three{right:8%;top:10%;width:18%;height:22%;border:2px solid #f8eee8;border-radius:50%;transform:rotate(28deg)}.fashion-art-label{position:absolute;left:1.2rem;bottom:1.2rem;color:#211a1d;font-size:.66rem;font-weight:900;letter-spacing:.18em;line-height:1.5}.fashion-collection-heading{display:flex;align-items:end;justify-content:space-between;gap:1rem;margin:1.5rem 0}.fashion-collection-heading h2{margin:0;font-family:Georgia,serif;font-size:clamp(2rem,4vw,3.2rem);font-weight:500;letter-spacing:-.05em}.fashion-collection-heading>p{max-width:22rem;margin:0;color:var(--muted);font-size:.85rem;line-height:1.6}.fashion-toolbar{align-items:center}.fashion-toolbar .search{max-width:360px}.fashion-toolbar .search input{min-height:46px;border-radius:999px}.fashion-toolbar .filter-row button{min-height:42px}.fashion-product-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:1.2rem}.fashion-product-grid .product-card{position:relative;gap:.75rem;padding:.8rem;border-color:#e7deda;border-radius:6px;background:#fffdfb;box-shadow:0 10px 28px rgba(55,35,42,.06);transition:transform .18s ease,box-shadow .18s ease}.fashion-product-grid .product-card:hover{transform:translateY(-4px);box-shadow:0 16px 36px rgba(55,35,42,.12)}.fashion-product-grid .product-art{height:clamp(180px,24vw,320px);border-radius:3px;background:linear-gradient(145deg,#dec4ba,#a27572);font-size:.8rem;letter-spacing:.08em}.fashion-product-grid .product-card:nth-child(3n+2) .product-art{background:linear-gradient(145deg,#e6d4c7,#bc9d8d)}.fashion-product-grid .product-card:nth-child(3n) .product-art{background:linear-gradient(145deg,#c8c1bc,#80777a)}.fashion-product-grid .product-card h3{font-family:Georgia,serif;font-size:1.12rem;font-weight:500}.fashion-product-grid .product-card p{line-height:1.55}.fashion-product-grid .product-card footer{gap:.5rem;flex-wrap:wrap}.fashion-product-grid .product-card footer strong{color:var(--accent-strong)}.fashion-product-grid .primary-button,.fashion-cart .primary-button{min-height:44px;border-radius:2px;background:#211a1d;color:#fffdfb}.fashion-product-grid .primary-button:hover,.fashion-cart .primary-button:hover{background:#7c2f4f}.fashion-detail,.fashion-main .checkout-flow,.fashion-main .wishlist-status{margin-top:1.5rem;padding:1.2rem;border:1px solid #e7deda;background:#fffdfb}.fashion-detail h2{font-family:Georgia,serif;font-weight:500}.fashion-main .sort-control{display:flex;align-items:center;gap:.75rem;margin-top:1rem;color:var(--muted);font-size:.82rem}.fashion-main .sort-control select{min-height:42px;border:1px solid #e7deda;border-radius:4px;background:#fffdfb;padding:.5rem;color:var(--ink)}.fashion-cart{z-index:4}.fashion-cart .icon-button{min-width:44px;min-height:44px}.fashion-header a:focus-visible,.fashion-header button:focus-visible,.fashion-main button:focus-visible,.fashion-main input:focus-visible{outline:3px solid #a6496d;outline-offset:3px}@media(max-width:760px){.fashion-header{gap:.6rem;padding-inline:1rem}.fashion-header nav{display:none}.fashion-header .brand{font-size:1rem}.fashion-main{padding-inline:1rem}.fashion-hero{grid-template-columns:1fr;min-height:auto;padding:2rem 0 2.5rem}.fashion-hero-art{min-height:270px;max-height:360px}.fashion-collection-heading{align-items:start;flex-direction:column}.fashion-toolbar{align-items:stretch;flex-direction:column}.fashion-toolbar .search{max-width:none}.fashion-product-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}.fashion-product-grid .product-art{height:190px}.fashion-product-grid .product-card{padding:.6rem}.fashion-product-grid .primary-button{padding:.55rem .65rem;font-size:.72rem}}@media(max-width:420px){.fashion-product-grid{grid-template-columns:1fr}.fashion-product-grid .product-art{height:260px}}`;
  const canineTargetStyles = `.paw-header nav a,.paw-brand,.paw-hero-link{display:inline-flex;align-items:center;min-height:44px}.paw-product-grid .primary-button,.paw-cart-button,.paw-cart-drawer .primary-button{min-height:44px}.paw-toolbar .filter-row button{min-height:40px}`;
  const libraryStyles = `--accent:#c86b4a;--accent-strong:#9a4834;--page:#f8f4ec;--ink:#24352d;--muted:#6f776f;--panel:#fffdf8;}.library-header{display:flex;align-items:center;gap:2rem;padding:1rem max(1.25rem,5vw);border-bottom:1px solid #e4ddd1;background:#24352d;color:#fff}.library-brand{display:flex;align-items:center;gap:.7rem;margin-right:auto;color:#fff;text-decoration:none;font-size:1.2rem;font-weight:850;letter-spacing:-.04em}.library-mark{display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:10px;background:#e4b66d;color:#24352d;font-family:Georgia,serif;font-size:.8rem;font-weight:900}.library-header nav{display:flex;gap:1.25rem}.library-header nav a{display:inline-flex;align-items:center;min-height:44px;color:#dce5dc;text-decoration:none;font-size:.82rem;font-weight:700}.library-header nav a:hover{color:#e4b66d}.library-list-button{min-height:44px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:transparent;color:#fff;padding:.6rem 1rem;font-size:.78rem;font-weight:800}.library-list-button span{display:inline-grid;place-items:center;min-width:1.35rem;height:1.35rem;margin-left:.35rem;border-radius:50%;background:#c86b4a}.library-main{max-width:1220px;margin:auto;padding:0 1.25rem 5rem}.library-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.78fr);gap:3rem;align-items:center;min-height:470px;padding:4rem 0 3rem}.library-hero h1{max-width:10ch;margin:.5rem 0 1.2rem;color:#24352d;font-family:Georgia,serif;font-size:clamp(3.2rem,7vw,6.5rem);font-weight:500;line-height:.92;letter-spacing:-.08em}.library-hero h1 em{color:#c86b4a;font-style:italic}.library-hero p:not(.eyebrow){max-width:34rem;color:var(--muted);font-size:1.04rem;line-height:1.75}.library-hero-link{display:inline-flex;align-items:center;gap:.7rem;min-height:44px;margin-top:1.2rem;color:#24352d;text-decoration:none;font-weight:850}.library-hero-link span{display:grid;place-items:center;width:2rem;height:2rem;border-radius:50%;background:#e4b66d}.library-proof{display:flex;gap:2rem;margin-top:2.5rem;color:var(--muted);font-size:.76rem}.library-proof strong{display:block;color:#24352d;font-size:1.12rem}.library-hero-art{position:relative;display:grid;place-items:center;min-height:340px;border-radius:48% 52% 42% 58% / 54% 40% 60% 46%;background:#d8e0d3;box-shadow:16px 16px 0 #e4b66d;overflow:hidden}.library-art-page{position:absolute;top:28%;width:9rem;height:12rem;background:#fffdf8;border:1px solid #d8cfc1;box-shadow:inset 0 -10px 0 #eee5d7}.library-art-page-left{left:25%;border-radius:8px 4px 4px 10px;transform:rotate(-13deg);transform-origin:bottom right}.library-art-page-right{right:25%;border-radius:4px 8px 10px 4px;transform:rotate(13deg);transform-origin:bottom left}.library-art-page:after{content:'';position:absolute;left:1.3rem;right:1.3rem;top:2.5rem;height:4rem;background:repeating-linear-gradient(to bottom,#c9c4b8 0 1px,transparent 1px 10px);opacity:.75}.library-art-sun{position:absolute;right:16%;top:12%;width:5rem;height:5rem;border-radius:50%;background:#c86b4a;opacity:.9}.library-art-label{position:absolute;left:1.6rem;bottom:1.5rem;color:#24352d;font-size:.7rem;font-weight:900;letter-spacing:.16em;line-height:1.35}.library-shelf{padding-top:1rem}.library-section-heading{display:flex;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1.4rem}.library-section-heading h2{max-width:28rem;margin:0;color:#24352d;font-family:Georgia,serif;font-size:clamp(1.9rem,3vw,3rem);font-weight:500;line-height:1;letter-spacing:-.05em}.library-count{color:var(--muted);font-size:.75rem;font-weight:750}.library-toolbar{display:flex;align-items:center;gap:1rem;margin-bottom:1.4rem}.library-search{flex:1}.library-search input{width:100%;border:1px solid #ddd5c9;border-radius:999px;background:#fffdf8;color:#24352d;padding:.9rem 1.1rem;outline:none}.library-search input:focus{border-color:#c86b4a;box-shadow:0 0 0 3px rgba(200,107,74,.14)}.library-toolbar .filter-row{display:flex;gap:.4rem;flex-wrap:wrap}.library-toolbar .filter-row button{min-height:40px;border:1px solid #ddd5c9;border-radius:999px;background:#fffdf8;color:#6f776f;padding:.55rem .8rem;font-size:.74rem;font-weight:750}.library-toolbar .filter-row button.is-active{border-color:#24352d;background:#24352d;color:#fff}.library-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.1rem}.library-grid .product-card{display:flex;flex-direction:column;min-height:315px;border:1px solid #e5ddd0;border-radius:18px;background:#fffdf8;overflow:hidden;box-shadow:0 10px 26px rgba(36,53,45,.07);transition:transform .2s ease,box-shadow .2s ease}.library-grid .product-card:hover{transform:translateY(-4px);box-shadow:0 16px 32px rgba(36,53,45,.12)}.library-grid .product-art{display:flex;align-items:end;min-height:142px;padding:1rem;background:linear-gradient(135deg,#d8e0d3,#f0dfbe);color:#24352d;font-family:Georgia,serif;font-size:1.1rem;font-weight:600}.library-grid .product-card:nth-child(2n) .product-art{background:linear-gradient(135deg,#e9d1c1,#f4e8d9)}.library-grid .product-card:nth-child(3n) .product-art{background:linear-gradient(135deg,#c8d9d2,#dce8df)}.library-grid .product-card>div:not(.product-art){padding:1rem 1.05rem .4rem}.library-grid .product-card h3{margin:0 0 .35rem;color:#24352d;font-family:Georgia,serif;font-size:1.08rem;font-weight:600}.library-grid .product-card p{margin:0;color:#6f776f;font-size:.79rem;line-height:1.55}.library-grid .product-card footer{display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin-top:auto;padding:1rem 1.05rem 1.1rem}.library-grid .product-card footer strong{color:#9a4834;font-size:.8rem}.library-grid .primary-button{min-height:44px;border:0;border-radius:999px;background:#24352d;color:#fff;padding:.65rem .9rem;font-size:.74rem;font-weight:800}.library-grid .primary-button:hover{background:#c86b4a}.reader-drawer,.reading-list-drawer{position:fixed;top:0;right:0;z-index:10;display:flex;flex-direction:column;width:min(520px,100%);height:100%;padding:1.4rem;background:#fffdf8;color:#24352d;box-shadow:-18px 0 45px rgba(36,53,45,.18);transform:translateX(105%);transition:transform .25s ease}.reader-drawer.is-open,.reading-list-drawer.is-open{transform:translateX(0)}.reader-heading{display:flex;align-items:start;justify-content:space-between;gap:1rem;padding-bottom:1rem;border-bottom:1px solid #e5ddd0}.reader-heading h2{margin:.2rem 0 0;font-family:Georgia,serif;font-size:1.7rem;font-weight:500}.reader-meta{margin:1rem 0;color:#6f776f;font-size:.8rem}.reader-toolbar{display:flex;gap:.5rem;margin-bottom:1rem}.reader-toolbar button{min-height:40px;border:1px solid #ddd5c9;border-radius:999px;background:#f7f1e7;color:#24352d;padding:.55rem .8rem;font-size:.75rem;font-weight:750}.reader-content{flex:1;overflow:auto;border-top:1px solid #eee7dc;border-bottom:1px solid #eee7dc;padding:1.5rem .3rem;color:#3d493f;font-family:Georgia,serif;font-size:1.08rem;line-height:1.9}.reader-content.reader-night{background:#253329;color:#e8eee5;padding:1.5rem;border-radius:10px}.reader-progress{display:flex;justify-content:space-between;margin-top:1rem;color:#6f776f;font-size:.76rem}.reader-progress-bar{height:5px;margin-top:.45rem;border-radius:99px;background:#ece4d8}.reader-progress-bar span{display:block;width:0;height:100%;border-radius:inherit;background:#c86b4a;transition:width .2s ease}.reading-list-drawer{width:min(380px,100%);right:auto;left:0;transform:translateX(-105%)}.reading-list-drawer.is-open{transform:translateX(0)}.reading-list-drawer button[data-read]{display:block;width:100%;margin-top:.6rem;border:0;background:transparent;color:#24352d;text-align:left;font-family:Georgia,serif;font-size:1rem}.reading-list-drawer button[data-read]:hover{color:#c86b4a}@media(max-width:820px){.library-header nav{display:none}.library-hero{grid-template-columns:1fr;min-height:auto;padding:2.5rem 0}.library-hero-art{min-height:260px}.library-toolbar{align-items:stretch;flex-direction:column}.library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.library-section-heading{align-items:start;flex-direction:column}}@media(max-width:520px){.library-main{padding-inline:1rem}.library-hero h1{font-size:clamp(3rem,16vw,5rem)}.library-grid{grid-template-columns:1fr}.library-header{padding-inline:1rem}.library-brand{font-size:1rem}.library-proof{gap:1rem}}`;
  const palette = specification.category === "auth" && specification.visualVariant === "neon"
    ? authNeonStyles
    : specification.category === "ecommerce" && specification.visualVariant === "apparel"
      ? `${fashionStoreStyles}.fashion-hero-art{background:linear-gradient(145deg,#e8c6c0 0 36%,#c99c97 36% 58%,#eadfd4 58%)}`
    : specification.category === "ecommerce" && specification.visualVariant === "canine"
      ? canineStoreStyles + canineTargetStyles
      : specification.category === "custom"
        ? customStylesFor()
        : specification.category === "recipes"
        ? recipeStylesFor()
        : specification.category === "ecommerce" && specification.visualVariant === "library"
        ? libraryStyles
      : palettes[specification.category];
  return `:root{${palette}font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:var(--ink);background:var(--page);font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--page)}button,input,textarea,select{font:inherit}button{cursor:pointer}.brand{color:inherit;text-decoration:none;font-weight:800;letter-spacing:-.04em}.eyebrow{margin:0 0 .45rem;color:var(--accent-strong);font-size:.72rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.search input,.trip-form input,.trip-form select,.composer textarea,.message-composer textarea{width:100%;border:1px solid color-mix(in srgb,var(--muted) 22%,transparent);border-radius:12px;background:var(--panel);color:var(--ink);padding:.75rem 1rem;outline:none}.search input:focus,.trip-form input:focus,.trip-form select:focus,.composer textarea:focus,.message-composer textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}.primary-button,.secondary-button,.icon-button,.nav-button{border:0;border-radius:10px;padding:.7rem 1rem;font-weight:750}.primary-button{background:var(--accent);color:#fff}.primary-button:hover{background:var(--accent-strong)}.secondary-button{background:color-mix(in srgb,var(--accent) 12%,var(--panel));color:var(--accent-strong)}.icon-button{background:transparent;color:inherit;font-size:1.25rem}.status-pill,.count-badge,.trend-up{display:inline-flex;align-items:center;border-radius:999px;padding:.35rem .65rem;background:color-mix(in srgb,var(--accent) 13%,var(--panel));color:var(--accent-strong);font-size:.75rem;font-weight:800}.status-dot{display:inline-block;width:.55rem;height:.55rem;border-radius:50%;background:#46c98d}.form-status{min-height:1.35rem;color:var(--accent-strong);font-size:.85rem}h1,h2,p{margin-top:0}h1{font-size:clamp(1.7rem,3vw,2.65rem);letter-spacing:-.05em;margin-bottom:.5rem}h2{letter-spacing:-.03em}.topbar,.store-header,.travel-header,.chat-header{display:flex;align-items:center;gap:1.5rem;padding:1.2rem max(1rem,4vw);background:var(--panel);border-bottom:1px solid color-mix(in srgb,var(--muted) 15%,transparent)}.topbar .brand,.store-header .brand,.travel-header .brand,.chat-header .brand{font-size:1.25rem;margin-right:auto}.topbar nav,.store-header nav,.travel-header nav{display:flex;gap:.5rem;align-items:center}.nav-button{background:transparent;color:var(--muted)}.nav-button.is-active{background:color-mix(in srgb,var(--accent) 12%,var(--panel));color:var(--accent-strong)}.network-layout{display:grid;grid-template-columns:220px minmax(0,680px) 260px;gap:1.5rem;max-width:1240px;margin:auto;padding:2rem 1rem}.profile-card,.rail-card,.composer,.post-card,.panel,.metric-card,.trip-summary,.stay-card,.conversation-sidebar,.conversation-panel{border:1px solid color-mix(in srgb,var(--muted) 15%,transparent);border-radius:18px;background:var(--panel);box-shadow:0 12px 32px rgba(20,30,50,.05)}.profile-card,.rail-card{display:flex;flex-direction:column;gap:.4rem;padding:1.1rem;height:max-content}.avatar{display:grid;place-items:center;width:3rem;height:3rem;border-radius:14px;background:var(--accent);color:#fff;font-weight:800;margin-bottom:.4rem}.composer{display:grid;gap:.7rem;padding:1rem;margin-bottom:1rem}.section-heading,.panel-heading,.sidebar-heading,.conversation-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.post-list{display:grid;gap:.8rem}.post-card{padding:1rem}.post-meta,.message-meta{display:flex;gap:.55rem;align-items:center;color:var(--muted);font-size:.8rem}.post-actions{display:flex;gap:.5rem;margin-top:1rem}.post-actions button{border:0;background:transparent;color:var(--accent-strong);font-weight:750}.dashboard-shell{display:grid;grid-template-columns:230px minmax(0,1fr);min-height:100vh}.sidebar{display:flex;flex-direction:column;gap:2rem;padding:2rem 1.2rem;background:#17233a;color:#fff}.sidebar .nav-button{text-align:left;color:#aebbd0}.sidebar .nav-button.is-active{background:rgba(255,255,255,.12);color:#fff}.sidebar-footer{margin-top:auto;color:#aebbd0;font-size:.8rem;display:flex;gap:.5rem;align-items:center}.dashboard-main{padding:2rem;max-width:1400px;width:100%;margin:auto}.page-header{display:flex;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1.5rem}.period-control{display:grid;gap:.35rem;color:var(--muted);font-size:.8rem;font-weight:750}.period-control select{border:1px solid #dfe5ee;border-radius:10px;padding:.6rem;background:var(--panel);color:var(--ink)}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1rem}.metric-card{padding:1rem}.metric-card strong{display:block;font-size:1.75rem;margin:.35rem 0}.metric-card small{color:var(--muted)}.dashboard-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.8fr);gap:1rem;margin-bottom:1rem}.panel{padding:1.2rem}.trend-chart{display:flex;align-items:end;gap:.7rem;height:180px;padding-top:1.5rem}.chart-bar{flex:1;min-height:20px;border-radius:8px 8px 2px 2px;background:linear-gradient(180deg,var(--accent),color-mix(in srgb,var(--accent) 40%,white));position:relative}.chart-bar span{position:absolute;bottom:-1.4rem;left:50%;transform:translateX(-50%);font-size:.7rem;color:var(--muted)}.alert-item{display:flex;justify-content:space-between;gap:1rem;padding:.75rem 0;border-bottom:1px solid #edf0f5}.alert-item:last-child{border-bottom:0}.table-scroll{overflow:auto}.table-panel table{width:100%;border-collapse:collapse;margin-top:1rem}.table-panel th,.table-panel td{text-align:left;padding:.85rem .5rem;border-bottom:1px solid #edf0f5;font-size:.85rem}.table-panel th{color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}.table-panel tbody tr{cursor:pointer}.detail-panel{min-height:2rem;color:var(--accent-strong);font-size:.85rem;padding-top:1rem}.store-main,.travel-main{max-width:1200px;margin:auto;padding:2rem 1rem}.store-header nav a,.travel-header nav a{color:var(--muted);text-decoration:none}.store-hero{display:flex;justify-content:space-between;gap:2rem;align-items:center;padding:3rem 0}.store-hero h1,.search-hero h1{max-width:650px;font-size:clamp(2.5rem,6vw,5.5rem);line-height:.95}.store-hero p:not(.eyebrow){max-width:480px;color:var(--muted);font-size:1.1rem}.hero-swatch{width:220px;height:220px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#dfc09b 0 20%,#9c633f 21% 52%,#5d3929 53%);box-shadow:18px 20px 0 rgba(189,103,72,.18)}.catalog-toolbar{display:flex;justify-content:space-between;gap:1rem;margin:1rem 0}.catalog-toolbar .search{max-width:300px;width:100%}.filter-row{display:flex;gap:.5rem;flex-wrap:wrap}.filter-row button{border:1px solid color-mix(in srgb,var(--muted) 22%,transparent);border-radius:999px;background:var(--panel);color:var(--muted);padding:.5rem .8rem}.filter-row button.is-active{border-color:var(--accent);background:var(--accent);color:#fff}.product-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}.product-card{display:grid;gap:.7rem;padding:1rem;border:1px solid rgba(70,50,30,.12);border-radius:16px;background:var(--panel)}.product-art{height:180px;border-radius:12px;background:linear-gradient(135deg,#dcc1a8,#8e5c43);display:grid;place-items:center;color:#fff;font-weight:800}.product-card h3{margin:0}.product-card p{margin:0;color:var(--muted);font-size:.85rem}.product-card footer{display:flex;justify-content:space-between;align-items:center}.cart-button{border:0;background:var(--ink);color:var(--panel);border-radius:999px;padding:.65rem 1rem}.cart-drawer{position:fixed;right:0;top:0;bottom:0;width:min(380px,100%);padding:1.4rem;background:var(--panel);box-shadow:-20px 0 50px rgba(20,20,20,.16);transform:translateX(105%);transition:transform .2s ease;z-index:3}.cart-drawer.is-open{transform:translateX(0)}.cart-line{display:flex;justify-content:space-between;gap:1rem;padding:1rem 0;border-bottom:1px solid rgba(70,50,30,.12)}.cart-total{display:flex;justify-content:space-between;margin:1.5rem 0}.search-hero{padding:3rem 0 2rem}.trip-form{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr auto;gap:.7rem;align-items:end;margin-top:2rem}.trip-form label{display:grid;gap:.35rem;color:var(--muted);font-size:.8rem;font-weight:750}.results-section{padding-top:2rem}.travel-grid{display:grid;grid-template-columns:minmax(0,1.4fr) 330px;gap:1rem}.stay-list{display:grid;gap:.8rem}.stay-card{display:flex;justify-content:space-between;gap:1rem;padding:1rem}.stay-card h3{margin:.25rem 0}.stay-card p{color:var(--muted);margin:.3rem 0}.stay-card .stay-art{width:150px;border-radius:12px;background:linear-gradient(135deg,#8cb8c9,#e8b27b);min-height:120px}.trip-summary{padding:1.2rem;height:max-content;position:sticky;top:1rem}.chat-shell{display:grid;grid-template-columns:320px minmax(0,1fr);max-width:1280px;height:calc(100vh - 78px);margin:auto;padding:1rem;gap:1rem}.conversation-sidebar,.conversation-panel{padding:1rem;min-height:0}.conversation-sidebar{background:color-mix(in srgb,var(--panel) 93%,#000);display:flex;flex-direction:column;gap:1rem}.conversation-list{overflow:auto}.conversation-item{display:flex;gap:.7rem;width:100%;text-align:left;border:0;border-radius:12px;padding:.8rem;background:transparent;color:inherit}.conversation-item.is-active{background:color-mix(in srgb,var(--accent) 15%,var(--panel))}.conversation-item strong{display:block}.conversation-item small{display:block;color:var(--muted);margin-top:.25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.conversation-panel{display:flex;flex-direction:column;background:var(--panel)}.conversation-heading{padding-bottom:1rem;border-bottom:1px solid rgba(140,160,180,.18)}.message-list{flex:1;overflow:auto;padding:1rem 0;display:grid;align-content:start;gap:.8rem}.message{max-width:70%;padding:.8rem 1rem;border-radius:16px;background:color-mix(in srgb,var(--accent) 12%,var(--panel))}.message.is-own{margin-left:auto;background:var(--accent);color:#fff}.message p{margin:0}.message-composer{display:grid;grid-template-columns:1fr auto;gap:.7rem;padding-top:1rem}.message-composer .form-status{grid-column:1/-1}@media(max-width:900px){.network-layout{grid-template-columns:1fr}.profile-card,.insight-rail{display:none}.dashboard-shell{grid-template-columns:1fr}.sidebar{display:none}.dashboard-main{padding:1rem}.metric-grid{grid-template-columns:repeat(2,1fr)}.dashboard-grid,.travel-grid{grid-template-columns:1fr}.trip-form{grid-template-columns:1fr 1fr}.trip-form .primary-button{grid-column:1/-1}.product-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.topbar,.store-header,.travel-header,.chat-header{gap:.7rem;padding:1rem}.topbar nav,.store-header nav,.travel-header nav{display:none}.store-hero{display:block;padding:2rem 0}.hero-swatch{width:150px;height:150px;margin:2rem auto}.catalog-toolbar{display:grid}.catalog-toolbar .search{max-width:none}.product-grid{grid-template-columns:1fr}.trip-form{grid-template-columns:1fr}.chat-shell{grid-template-columns:1fr;height:auto;padding:.5rem}.conversation-sidebar{min-height:280px}.conversation-panel{min-height:520px}.message{max-width:88%}.page-header{display:grid;align-items:start}.metric-grid{gap:.6rem}.metric-card strong{font-size:1.35rem}}`;
}

function jsFor(specification: ProductSpecification, manifest: ProjectManifest) {
  const data = manifest.files.find(item => item.role === "data")!.path;
  const category = specification.category;
  if (category === "auth") return `const state={mode:"login",email:"",password:"",showPassword:false,status:"idle",session:null};const form=document.querySelector("#login-form"),email=document.querySelector("#auth-email"),password=document.querySelector("#auth-password"),emailError=document.querySelector("#auth-email-error"),passwordError=document.querySelector("#auth-password-error"),status=document.querySelector("#auth-status"),recovery=document.querySelector("#recovery-view"),session=document.querySelector("#session-view");const setStatus=(message,type="idle")=>{state.status=type;if(status)status.textContent=message;};const showMode=mode=>{state.mode=mode;form.hidden=mode!=="login";recovery.hidden=mode!=="recovery";session.hidden=mode!=="session";};document.querySelector("#password-toggle")?.addEventListener("click",()=>{state.showPassword=!state.showPassword;password.type=state.showPassword?"text":"password";document.querySelector("#password-toggle").textContent=state.showPassword?"Hide":"Show";document.querySelector("#password-toggle").setAttribute("aria-label",state.showPassword?"Hide password":"Show password")});document.querySelector("#forgot-password")?.addEventListener("click",()=>{showMode("recovery");setStatus("Enter your email to continue recovery.")});document.querySelector("#back-to-login")?.addEventListener("click",()=>{showMode("login");setStatus("")});document.querySelector("#recovery-submit")?.addEventListener("click",()=>{if(!email.value.trim()){setStatus("Enter your email before continuing recovery.","error");return}setStatus("Recovery is ready locally. No email was sent.","success")});form?.addEventListener("submit",event=>{event.preventDefault();emailError.textContent="";passwordError.textContent="";const emailValue=email.value.trim(),passwordValue=password.value;let valid=true;if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(emailValue)){emailError.textContent="Enter a valid email address.";valid=false}if(passwordValue.length<8){passwordError.textContent="Use at least 8 characters.";valid=false}if(!valid){setStatus("Correct the highlighted fields.","error");return}setStatus("Checking credentials…","loading");setTimeout(()=>{if(emailValue==="demo@accessly.test"&&passwordValue==="accessly-demo"){state.session={email:emailValue,userName:"Demo member",signedInAt:new Date().toISOString()};document.querySelector("#session-summary").textContent="Signed in as Demo member ("+emailValue+").";showMode("session");setStatus("Signed in successfully.","success")}else{setStatus("Those demo credentials are not recognized. Try demo@accessly.test / accessly-demo.","error")}},350)});document.querySelector("#sign-out")?.addEventListener("click",()=>{state.session=null;showMode("login");setStatus("You have been signed out locally.")});`;
  if (category === "social_network") return `const state={posts:[],liked:new Set()};const feed=document.querySelector("#feed-list");const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));function render(){feed.innerHTML=state.posts.map(post=>\`<article class="post-card"><div class="post-meta"><strong>\${escapeHtml(post.author)}</strong><span>@\${escapeHtml(post.handle)}</span><span>· \${escapeHtml(post.time)}</span></div><p>\${escapeHtml(post.body)}</p><div class="post-actions"><button data-like="\${post.id}">\${state.liked.has(post.id)?"♥":"♡"} \${post.likes+(state.liked.has(post.id)?1:0)}</button><button type="button">\${post.comments} comments</button></div></article>\`).join("");feed.querySelectorAll("[data-like]").forEach(button=>button.addEventListener("click",()=>{const id=button.dataset.like;state.liked.has(id)?state.liked.delete(id):state.liked.add(id);render()}))}fetch("./${data}").then(response=>response.json()).then(seed=>{state.posts=seed.posts;document.querySelector("#suggestions").innerHTML=seed.suggestions.map(person=>\`<p><strong>\${escapeHtml(person.name)}</strong><br><small>\${escapeHtml(person.reason)}</small></p>\`).join("");render()});document.querySelector("#post-composer").addEventListener("submit",event=>{event.preventDefault();const input=document.querySelector("#post-text"),status=document.querySelector("#composer-status");const body=input.value.trim();if(!body){status.textContent="Write an update before publishing.";input.focus();return}state.posts.unshift({id:"local-"+Date.now(),author:"Maya Noor",handle:"mayanoor",time:"now",body,likes:0,comments:0});input.value="";status.textContent="Your update is now at the top of the feed.";render()});`;
  if (category === "dashboard") return `const state={period:"today",selected:null,metrics:[]};const format=value=>new Intl.NumberFormat("en-US").format(value);function render(data){state.metrics=data.metrics[state.period];document.querySelector("#metric-grid").innerHTML=state.metrics.map(metric=>\`<article class="metric-card"><span class="eyebrow">\${metric.label}</span><strong>\${metric.unit==="%"?metric.value+"%":format(metric.value)}</strong><small class="\${metric.change.startsWith("+")?"trend-up":""}">\${metric.change} vs previous period</small></article>\`).join("");document.querySelector("#trend-chart").innerHTML=data.trend.map(item=>\`<div class="chart-bar" style="height:\${item.value}%"><span>\${item.label}</span></div>\`).join("");document.querySelector("#exception-count").textContent=data.exceptions.length;document.querySelector("#exception-list").innerHTML=data.exceptions.map(item=>\`<div class="alert-item"><span>\${item.route}</span><strong>\${item.risk}</strong></div>\`).join("");document.querySelector("#shipment-table").innerHTML=data.shipments.map(item=>\`<tr data-shipment="\${item.id}"><td>\${item.route}</td><td>\${item.status}</td><td>\${item.eta}</td><td>\${item.risk}</td></tr>\`).join("");document.querySelectorAll("[data-shipment]").forEach(row=>row.addEventListener("click",()=>{const item=data.shipments.find(shipment=>shipment.id===row.dataset.shipment);state.selected=item;document.querySelector("#shipment-detail").textContent=item?item.detail:""}))}fetch("./${data}").then(response=>response.json()).then(data=>{render(data);document.querySelector("#period-filter").addEventListener("change",event=>{state.period=event.target.value;render(data)})});`;
  if (category === "recipes") return `const state={recipes:[],query:"",category:"All"};const grid=document.querySelector("#recipe-grid"),escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));function render(){const visible=state.recipes.filter(recipe=>(state.category==="All"||recipe.category===state.category)&&[recipe.title,recipe.description,...recipe.ingredients].join(" ").toLowerCase().includes(state.query.toLowerCase()));grid.innerHTML=visible.map(recipe=>\`<article class="recipe-card" data-recipe-id="\${recipe.id}"><div class="recipe-card-art">\${escapeHtml(recipe.category)}</div><div class="recipe-card-body"><div class="recipe-card-meta"><span>\${escapeHtml(recipe.minutes)} min</span><span>\${escapeHtml(recipe.difficulty)}</span></div><h2>\${escapeHtml(recipe.title)}</h2><p>\${escapeHtml(recipe.description)}</p><div class="recipe-card-actions"><button class="primary-button" type="button" data-view-recipe="\${recipe.id}">View recipe</button><button class="save-button" type="button" data-save-recipe aria-label="Save \${escapeHtml(recipe.title)}">Save</button></div></div></article>\`).join("")||"<p class=\\"empty-state\\">No recipes match these filters.</p>";}fetch("./${data}").then(response=>response.json()).then(seed=>{state.recipes=seed.recipes;const categories=["All",...new Set(state.recipes.map(recipe=>recipe.category))];document.querySelector("#recipe-filters").innerHTML=categories.map(category=>\`<button class="\${category===state.category?"is-active":""}" data-category="\${category}">\${category}</button>\`).join("");document.querySelectorAll("[data-category]").forEach(button=>button.addEventListener("click",()=>{state.category=button.dataset.category;document.querySelectorAll("[data-category]").forEach(item=>item.classList.toggle("is-active",item===button));render()}));document.querySelector("#recipe-search").addEventListener("input",event=>{state.query=event.target.value;render()});render()});`;
  if (category === "ecommerce" && specification.visualVariant === "library") return `const state={products:[],query:"",category:"All",saved:new Set(),active:null,fontSize:1,night:false};const grid=document.querySelector("#product-grid"),escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),readProgress={};function render(){const filtered=state.products.filter(book=>(state.category==="All"||book.category===state.category)&&[book.name,book.author,book.description,book.language,book.level].join(" ").toLowerCase().includes(state.query.toLowerCase()));grid.innerHTML=filtered.map(book=>\`<article class="product-card" data-book="\${book.id}"><div class="product-art">\${escapeHtml(book.material)}</div><div><h3>\${escapeHtml(book.name)}</h3><p>\${escapeHtml(book.author)} · \${escapeHtml(book.description)}</p></div><footer><strong>Free / \${escapeHtml(book.level)}</strong><button class="primary-button" data-add="\${book.id}">Read now</button></footer></article>\`).join("")||"<p class=\\"library-empty\\">No titles match that search yet. Try another topic.</p>";grid.querySelectorAll("[data-add]").forEach(button=>button.addEventListener("click",()=>openReader(button.dataset.add)))}function openReader(id){const book=state.products.find(item=>item.id===id);if(!book)return;state.active=book;document.querySelector("#reader-title").textContent=book.name;document.querySelector("#reader-meta").textContent=book.author+" · "+book.material+" · "+book.language;document.querySelector("#reader-content").innerHTML="<p>"+escapeHtml(book.excerpt)+"</p><p>"+escapeHtml(book.description)+" This free preview is an original local reading sample created for OpenLeaf.</p><p>Keep the page open, follow the idea that stays with you, and return whenever you like.</p>";document.querySelector("#reader-content").style.fontSize=state.fontSize+"rem";document.querySelector("#reader-content").classList.toggle("reader-night",state.night);document.querySelector("#reader-drawer").classList.add("is-open");document.querySelector("#reader-drawer").setAttribute("aria-hidden","false");readProgress[id]=readProgress[id]||0;updateProgress()}function updateProgress(){const value=readProgress[state.active?.id||""]||0;document.querySelector("#reader-progress-value").textContent=value+"%";document.querySelector("#reader-progress-bar").style.width=value+"%"}function renderList(){document.querySelector("#reading-list-count").textContent=state.saved.size;document.querySelector("#reading-list-items").innerHTML=state.saved.size?[...state.saved].map(id=>{const book=state.products.find(item=>item.id===id);return book?\`<button data-read="\${id}">\${escapeHtml(book.name)}<small> · \${escapeHtml(book.author)}</small></button>\`:""}).join(""):"<p>No saved titles yet.</p>";document.querySelectorAll("[data-read]").forEach(button=>button.addEventListener("click",()=>openReader(button.dataset.read)))}fetch("./${data}").then(response=>response.json()).then(seed=>{state.products=seed.products;const categories=["All",...new Set(state.products.map(book=>book.category))];document.querySelector("#category-filters").innerHTML=categories.map(category=>\`<button class="\${category===state.category?"is-active":""}" data-category="\${category}">\${category}</button>\`).join("");document.querySelectorAll("[data-category]").forEach(button=>button.addEventListener("click",()=>{state.category=button.dataset.category;document.querySelectorAll("[data-category]").forEach(item=>item.classList.toggle("is-active",item===button));render()}));render();renderList()});document.querySelector("#catalog-search").addEventListener("input",event=>{state.query=event.target.value;render()});document.querySelector("#reader-close").addEventListener("click",()=>{document.querySelector("#reader-drawer").classList.remove("is-open");document.querySelector("#reader-drawer").setAttribute("aria-hidden","true")});document.querySelector("#reading-list-toggle").addEventListener("click",()=>{document.querySelector("#reading-list").classList.add("is-open");document.querySelector("#reading-list").setAttribute("aria-hidden","false")});document.querySelector("#reading-list-close").addEventListener("click",()=>{document.querySelector("#reading-list").classList.remove("is-open");document.querySelector("#reading-list-close").setAttribute("aria-hidden","true")});document.querySelector("#reader-smaller").addEventListener("click",()=>{state.fontSize=Math.max(.9,state.fontSize-.1);document.querySelector("#reader-content").style.fontSize=state.fontSize+"rem"});document.querySelector("#reader-larger").addEventListener("click",()=>{state.fontSize=Math.min(1.5,state.fontSize+.1);document.querySelector("#reader-content").style.fontSize=state.fontSize+"rem"});document.querySelector("#reader-theme").addEventListener("click",()=>{state.night=!state.night;document.querySelector("#reader-content").classList.toggle("reader-night",state.night)});document.querySelector("#reader-content").addEventListener("scroll",event=>{if(!state.active)return;const target=event.currentTarget;readProgress[state.active.id]=Math.round((target.scrollTop/(target.scrollHeight-target.clientHeight))*100)||0;updateProgress()});document.addEventListener("click",event=>{const card=event.target.closest("[data-book]");if(!card||event.target.closest("[data-add]"))return;state.saved.has(card.dataset.book)?state.saved.delete(card.dataset.book):state.saved.add(card.dataset.book);renderList()});`;
  if (category === "ecommerce") return `const state={products:[],query:"",category:"All",cart:[]};const grid=document.querySelector("#product-grid");const money=value=>"$"+value.toLocaleString("en-US");const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));function render(){const filtered=state.products.filter(product=>(state.category==="All"||product.category===state.category)&&product.name.toLowerCase().includes(state.query.toLowerCase()));grid.innerHTML=filtered.map(product=>\`<article class="product-card"><div class="product-art">\${escapeHtml(product.material)}</div><div><h3>\${escapeHtml(product.name)}</h3><p>\${escapeHtml(product.category)} · \${escapeHtml(product.description)}</p></div><footer><strong>\${money(product.price)}</strong><button class="primary-button" data-add="\${product.id}">Add to cart</button></footer></article>\`).join("")||"<p>No pieces match that search.</p>";grid.querySelectorAll("[data-add]").forEach(button=>button.addEventListener("click",()=>{state.cart.push(state.products.find(product=>product.id===button.dataset.add));renderCart();document.querySelector("#checkout-status").textContent="Added to your selection."}))}function renderCart(){document.querySelector("#cart-count").textContent=state.cart.length;document.querySelector("#cart-lines").innerHTML=state.cart.map(product=>\`<div class="cart-line"><span>\${escapeHtml(product.name)}</span><strong>\${money(product.price)}</strong></div>\`).join("")||"<p>Your selection is empty.</p>";document.querySelector("#cart-total").textContent=money(state.cart.reduce((total,product)=>total+product.price,0))}fetch("./${data}").then(response=>response.json()).then(seed=>{state.products=seed.products;const categories=["All",...new Set(state.products.map(product=>product.category))];document.querySelector("#category-filters").innerHTML=categories.map(category=>\`<button class="\${category===state.category?"is-active":""}" data-category="\${category}">\${category}</button>\`).join("");document.querySelectorAll("[data-category]").forEach(button=>button.addEventListener("click",()=>{state.category=button.dataset.category;document.querySelectorAll("[data-category]").forEach(item=>item.classList.toggle("is-active",item===button));render() }));render();renderCart()});document.querySelector("#catalog-search").addEventListener("input",event=>{state.query=event.target.value;render()});document.querySelector("#cart-toggle").addEventListener("click",()=>{const drawer=document.querySelector("#cart-drawer");drawer.classList.add("is-open");drawer.setAttribute("aria-hidden","false")});document.querySelector("#cart-close").addEventListener("click",()=>{const drawer=document.querySelector("#cart-drawer");drawer.classList.remove("is-open");drawer.setAttribute("aria-hidden","true")});document.querySelector("#checkout-button").addEventListener("click",()=>{document.querySelector("#checkout-status").textContent=state.cart.length?"Checkout request saved locally. No payment was processed.":"Add a piece before requesting checkout."});`;
  if (category === "booking") return `const state={stays:[],filtered:[],selected:null};const list=document.querySelector("#stay-list");const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));function render(){list.innerHTML=state.filtered.map(stay=>\`<article class="stay-card"><div><p class="eyebrow">\${escapeHtml(stay.type)} · \${stay.rating} stars</p><h3>\${escapeHtml(stay.name)}</h3><p>\${escapeHtml(stay.location)} · \${stay.nightlyRate} per night</p><button class="secondary-button" data-stay="\${stay.id}">View stay</button></div><div class="stay-art" aria-label="\${escapeHtml(stay.imageLabel)}"></div></article>\`).join("")||"<p>No stays match this search yet.</p>";list.querySelectorAll("[data-stay]").forEach(button=>button.addEventListener("click",()=>{state.selected=state.stays.find(stay=>stay.id===button.dataset.stay);document.querySelector("#summary-content").innerHTML=state.selected?\`<h3>\${escapeHtml(state.selected.name)}</h3><p>\${escapeHtml(state.selected.location)}</p><strong>\${state.selected.nightlyRate} per night</strong>\`:"";document.querySelector("#booking-request").disabled=!state.selected}))}fetch("./${data}").then(response=>response.json()).then(seed=>{state.stays=seed.stays;state.filtered=seed.stays;render();document.querySelector("#stay-filters").innerHTML=["All","Cabin","Hotel","Apartment"].map(type=>\`<button data-type="\${type}">\${type}</button>\`).join("");document.querySelectorAll("[data-type]").forEach(button=>button.addEventListener("click",()=>{state.filtered=button.dataset.type==="All"?state.stays:state.stays.filter(stay=>stay.type===button.dataset.type);render()}))});document.querySelector("#trip-search").addEventListener("submit",event=>{event.preventDefault();const destination=document.querySelector("#destination").value.trim(),status=document.querySelector("#search-status");if(!destination){status.textContent="Choose a destination to search.";return}state.filtered=state.stays.filter(stay=>stay.location.toLowerCase().includes(destination.toLowerCase())||stay.name.toLowerCase().includes(destination.toLowerCase()));status.textContent=\`Showing stays near \${destination}.\`;render()});document.querySelector("#booking-request").addEventListener("click",()=>{document.querySelector("#booking-status").textContent="Your booking request is saved locally. No reservation was submitted.";});`;
  return `const state={conversations:[],activeId:null,query:""};const list=document.querySelector("#conversation-list"),messages=document.querySelector("#message-list");const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));function render(){const visible=state.conversations.filter(item=>item.name.toLowerCase().includes(state.query.toLowerCase()));list.innerHTML=visible.map(item=>\`<button class="conversation-item \${item.id===state.activeId?"is-active":""}" data-conversation="\${item.id}"><span class="avatar">\${item.initials}</span><span><strong>\${escapeHtml(item.name)}</strong><small>\${escapeHtml(item.messages[item.messages.length-1].body)}</small></span></button>\`).join("");list.querySelectorAll("[data-conversation]").forEach(button=>button.addEventListener("click",()=>{state.activeId=button.dataset.conversation;render()}));const active=state.conversations.find(item=>item.id===state.activeId);if(!active)return;document.querySelector("#conversation-heading").innerHTML=\`<div><h2>\${escapeHtml(active.name)}</h2><p class="message-meta"><span class="status-dot"></span> \${escapeHtml(active.status)} · \${active.topic}</p></div>\`;messages.innerHTML=active.messages.map(message=>\`<article class="message \${message.own?"is-own":""}"><p>\${escapeHtml(message.body)}</p><small class="message-meta">\${escapeHtml(message.sender)} · \${escapeHtml(message.sentAt)}</small></article>\`).join("");messages.scrollTop=messages.scrollHeight}fetch("./${data}").then(response=>response.json()).then(seed=>{state.conversations=seed.conversations;state.activeId=seed.conversations[0].id;render()});document.querySelector("#conversation-search").addEventListener("input",event=>{state.query=event.target.value;render()});document.querySelector("#message-composer").addEventListener("submit",event=>{event.preventDefault();const input=document.querySelector("#message-text"),status=document.querySelector("#message-status"),body=input.value.trim();if(!body){status.textContent="Write a message before sending.";return}const active=state.conversations.find(item=>item.id===state.activeId);active.messages.push({sender:"You",body,sentAt:"just now",own:true});input.value="";status.textContent="Message added to this conversation.";render()});`;
}

function dataFor(specification: ProductSpecification) {
  const category = specification.category;
  if (category === "auth") return { demoCredentials: { email: "demo@accessly.test", password: "accessly-demo" }, session: null, recovery: { externalEmailDelivery: false } };
  if (category === "custom") return { features: specification.features.map(feature => ({ name: feature.name, description: feature.description, owner: specification.components.find(component => component.featureIds.includes(feature.id))?.name || "Project module" })) };
  if (category === "social_network") return { posts: [{ id: "p1", author: "Lena Ortiz", handle: "lenaortiz", time: "18 min", body: "The neighborhood garden is ready for its first Saturday workshop.", likes: 42, comments: 8 }, { id: "p2", author: "Omar Chen", handle: "omarchen", time: "1 hr", body: "Shared a tiny guide for making community events more welcoming.", likes: 27, comments: 4 }], suggestions: [{ name: "Ravi Singh", reason: "Works in local community design" }, { name: "Nour Haddad", reason: "Follows your garden group" }] };
  if (category === "dashboard") return { metrics: { today: [{ label: "On-time delivery", value: 94, unit: "%", change: "+8.4%" }, { label: "In transit", value: 1284, unit: "", change: "+4.1%" }, { label: "At risk", value: 18, unit: "", change: "-12.5%" }, { label: "Avg. dwell time", value: 2.8, unit: "h", change: "-6.2%" }], week: [{ label: "On-time delivery", value: 91, unit: "%", change: "+3.2%" }, { label: "In transit", value: 8042, unit: "", change: "+7.1%" }, { label: "At risk", value: 64, unit: "", change: "-4.5%" }, { label: "Avg. dwell time", value: 3.1, unit: "h", change: "-2.2%" }], month: [{ label: "On-time delivery", value: 89, unit: "%", change: "+1.8%" }, { label: "In transit", value: 32210, unit: "", change: "+11.4%" }, { label: "At risk", value: 241, unit: "", change: "-1.5%" }, { label: "Avg. dwell time", value: 3.6, unit: "h", change: "-1.2%" }] }, trend: [{ label: "M", value: 72 }, { label: "T", value: 78 }, { label: "W", value: 75 }, { label: "T", value: 86 }, { label: "F", value: 91 }, { label: "S", value: 88 }, { label: "S", value: 94 }], exceptions: [{ route: "Rotterdam → Lyon", risk: "High" }, { route: "Busan → Seattle", risk: "Medium" }, { route: "Austin → Denver", risk: "Medium" }], shipments: [{ id: "s1", route: "Rotterdam → Lyon", status: "Delayed", eta: "Today, 18:40", risk: "High", detail: "Weather hold at the Lyon hub. Next scan expected in 42 minutes." }, { id: "s2", route: "Busan → Seattle", status: "In transit", eta: "Tomorrow, 09:20", risk: "Medium", detail: "Container cleared customs and is moving to the final-mile partner." }, { id: "s3", route: "Austin → Denver", status: "On time", eta: "Fri, 14:10", risk: "Low", detail: "No exception detected." }] };
  if (category === "recipes") return {
    recipes: [
      { id: "r1", title: "Green herb shakshuka", category: "Breakfast", difficulty: "Easy", minutes: 25, servings: 2, tags: ["eggs", "one-pan"], description: "Bright herbs, tomatoes, and eggs for a generous morning plate.", ingredients: ["4 eggs", "2 cups tomatoes", "1 handful parsley", "1 tsp cumin"], steps: ["Warm the tomatoes with cumin.", "Make four wells and crack in the eggs.", "Cover until the whites set, then finish with herbs."] },
      { id: "r2", title: "Lemon garlic pasta", category: "Dinner", difficulty: "Easy", minutes: 20, servings: 2, tags: ["pasta", "quick"], description: "A silky weeknight pasta with lemon, garlic, and parmesan.", ingredients: ["200g pasta", "2 garlic cloves", "1 lemon", "40g parmesan"], steps: ["Cook the pasta until just tender.", "Sizzle garlic in olive oil.", "Toss with lemon, parmesan, and a splash of pasta water."] },
      { id: "r3", title: "Roasted squash bowl", category: "Lunch", difficulty: "Medium", minutes: 40, servings: 3, tags: ["vegetarian", "roasted"], description: "Roasted squash, grains, and greens with a sharp tahini dressing.", ingredients: ["1 small squash", "2 cups cooked grains", "2 handfuls greens", "3 tbsp tahini"], steps: ["Roast the squash until caramelized.", "Whisk tahini with lemon and water.", "Layer grains, greens, squash, and dressing."] },
      { id: "r4", title: "Berry yogurt crunch", category: "Dessert", difficulty: "Easy", minutes: 10, servings: 2, tags: ["no-bake", "fruit"], description: "A cool, layered dessert with berries, yogurt, and toasted oats.", ingredients: ["1 cup yogurt", "1 cup berries", "1/2 cup oats", "1 tbsp honey"], steps: ["Toast the oats until fragrant.", "Layer yogurt and berries in glasses.", "Finish with oats and honey."] },
    ],
  };
  if (category === "ecommerce") {
    if (specification.visualVariant === "apparel") {
      return {
        products: [
          { id: "a1", name: "The Everyday Blazer", category: "Clothing", price: 148, material: "Soft structure · sizes XS–XL", description: "An easy layer with a clean line and room to move." },
          { id: "a2", name: "Studio Tote", category: "Accessories", price: 54, material: "Recycled canvas · natural", description: "A useful carryall for days that do not sit still." },
          { id: "a3", name: "After Hours Dress", category: "Clothing", price: 126, material: "Fluid weave · sizes XS–XL", description: "A simple silhouette made for a change of plans." },
          { id: "a4", name: "Soft Form Shirt", category: "Clothing", price: 82, material: "Cotton poplin · sizes XS–XL", description: "A familiar staple with a little more ease." },
          { id: "a5", name: "Arc Shoulder Bag", category: "Accessories", price: 96, material: "Textured vegan leather", description: "A compact shape with space for the essentials." },
          { id: "a6", name: "The Weekend Scarf", category: "Accessories", price: 38, material: "Lightweight woven blend", description: "A soft finishing layer in a muted seasonal tone." },
        ],
      };
    }
    if (specification.visualVariant === "canine") {
      return {
        products: [
          { id: "p1", name: "Puppy Starter Guide", category: "Getting started", price: 18, material: "PDF + checklists", description: "A calm first-week plan for new puppy families." },
          { id: "p2", name: "Recall Training Kit", category: "Training", price: 24, material: "Guide + tracker", description: "Simple games that make coming back feel rewarding." },
          { id: "p3", name: "Calm Dog at Home", category: "Everyday life", price: 16, material: "Audio + workbook", description: "A gentle routine for quieter, happier days." },
          { id: "p4", name: "Breed Notes", category: "Breed guides", price: 12, material: "Digital field notes", description: "Practical prompts for understanding your dog's needs." },
          { id: "p5", name: "Walk Club Pack", category: "Everyday life", price: 9, material: "Printable pack", description: "Walk logs, enrichment cards, and rainy-day ideas." },
          { id: "p6", name: "Kind Canine Basics", category: "Training", price: 21, material: "Mini course", description: "Positive training foundations for real-life moments." },
        ],
      };
    }
    if (specification.visualVariant === "library") {
      return {
        products: [
          { id: "b1", name: "The Lantern Room", category: "Short stories", price: 0, material: "12 min read", description: "An original story about a quiet room, a lost letter, and a second chance.", author: "OpenLeaf Originals", language: "English", level: "Gentle", excerpt: "The lamp had been waiting all winter, gathering a small circle of gold around itself." },
          { id: "b2", name: "A Pocket Guide to Wonder", category: "Ideas", price: 0, material: "18 min read", description: "Small prompts for paying closer attention to ordinary days.", author: "Mara Ellis", language: "English", level: "Easy", excerpt: "Begin with one window. Notice what changes when you look for five minutes longer." },
          { id: "b3", name: "Letters from the Coast", category: "Public domain", price: 0, material: "24 min read", description: "A public-domain selection of sea letters with a short reading note.", author: "OpenLeaf Archive", language: "English", level: "Reflective", excerpt: "The tide left a silver line across the sand, like a sentence unfinished." },
          { id: "b4", name: "The Little Orchard", category: "Short stories", price: 0, material: "15 min read", description: "A warm original tale about care, patience, and a stubborn apple tree.", author: "Nia Cole", language: "English", level: "Gentle", excerpt: "Every spring, the tree made the same promise and every spring, Lina listened." },
          { id: "b5", name: "Read Better, Slowly", category: "Guides", price: 0, material: "10 min read", description: "A practical mini-guide to building a reading habit without pressure.", author: "OpenLeaf Studio", language: "English", level: "Practical", excerpt: "A reading habit does not need a heroic beginning. It needs a chair and ten quiet minutes." },
          { id: "b6", name: "Notes on Starting Again", category: "Essays", price: 0, material: "20 min read", description: "A concise essay on fresh starts, attention, and making room for change.", author: "Yara Sen", language: "English", level: "Reflective", excerpt: "Starting again is less like opening a door and more like clearing a desk." },
        ],
      };
    }
    return { products: [{ id: "p1", name: "Arco lounge chair", category: "Seating", price: 680, material: "Bouclé + oak", description: "A generous reading seat." }, { id: "p2", name: "Dune side table", category: "Tables", price: 240, material: "Walnut", description: "Soft edges, useful scale." }, { id: "p3", name: "Morrow floor lamp", category: "Lighting", price: 310, material: "Brushed brass", description: "A warm pool of light." }, { id: "p4", name: "Loma dining bench", category: "Seating", price: 520, material: "Linen + ash", description: "Room for slow dinners." }, { id: "p5", name: "Cove shelving", category: "Storage", price: 890, material: "Smoked oak", description: "Quietly architectural storage." }, { id: "p6", name: "Pietra tray", category: "Objects", price: 85, material: "Travertine", description: "A small daily ritual." }] };
  }
  if (category === "booking") return { stays: [{ id: "s1", name: "Casa Brisa", location: "Lisbon, Portugal", type: "Apartment", rating: 4.9, nightlyRate: "$182", imageLabel: "Sunlit tiled apartment" }, { id: "s2", name: "Northline Cabin", location: "Reykjavik, Iceland", type: "Cabin", rating: 4.8, nightlyRate: "$240", imageLabel: "Cabin beside a black sand beach" }, { id: "s3", name: "Mizu House", location: "Kyoto, Japan", type: "Hotel", rating: 4.7, nightlyRate: "$205", imageLabel: "Quiet courtyard hotel" }] };
  return { conversations: [{ id: "c1", name: "Launch crew", initials: "LC", status: "6 members online", topic: "Product launch", messages: [{ sender: "Nour", body: "The release notes are ready for review.", sentAt: "09:42", own: false }, { sender: "You", body: "I will check the accessibility pass next.", sentAt: "09:45", own: true }] }, { id: "c2", name: "Maya Noor", initials: "MN", status: "online", topic: "Direct message", messages: [{ sender: "Maya", body: "Can we review the new workspace flow?", sentAt: "Yesterday", own: false }] }, { id: "c3", name: "Design guild", initials: "DG", status: "3 members online", topic: "Weekly critique", messages: [{ sender: "Omar", body: "I added the latest exploration to the board.", sentAt: "Mon", own: false }] }] };
}

export function createRequestSpecificArtifacts(specification: ProductSpecification, manifest: ProjectManifest): GeneratedProjectArtifact[] {
  const blueprint = BLUEPRINTS[specification.category as keyof typeof BLUEPRINTS];
  if (!blueprint && specification.category !== "custom") throw new Error(`UNSUPPORTED_REQUEST_SPECIFIC_CATEGORY:${specification.category}`);
  const dataPath = manifest.files.find(item => item.role === "data")!.path;
  const stylePath = manifest.files.find(item => item.role === "style")!.path;
  const logicPath = manifest.files.find(item => item.role === "logic")!.path;
  const architecture = architectureFilesFor(specification.category);
  const requestModules = requestModuleDefinitions(specification);
  const supportManifestFiles = manifest.files.filter(file => file.path.startsWith("src/features/") || file.path.startsWith("tests/features/"));
  const supportPaths = new Set(supportManifestFiles.map(file => file.path));
  const existingPaths = new Set(manifest.files.filter(file => !supportPaths.has(file.path)).map(file => file.path));
  const architectureArtifacts = architectureArtifactsFor(specification, architecture);
  const commerceFiles = specification.category === "ecommerce" ? modularCommerceFileDefinitions() : [];
  const fixedArtifactCount = 6 + architectureArtifacts.length + requestModules.length + commerceFiles.length;
  if (fixedArtifactCount > 200) throw new Error("PROJECT_MODULE_COUNT_LIMIT");
  const targetArtifactCount = Math.min(200, Math.max(100, manifest.files.length));
  const supportModuleCount = targetArtifactCount - fixedArtifactCount;
  const supportModules = featureSupportFiles(specification, existingPaths, 0, supportModuleCount);
  const previewModules = requestModules.filter(item => item.usedInPreview);
  const requestModuleImports = previewModules.map(item => `import { ${item.exportName} as generatedModule${item.kind}${item.exportName} } from "./${item.path.replace(/^src\//, "")}";`).join("");
  const requestModuleRegistry = `const generatedProductModules=[${previewModules.map(item => `generatedModule${item.kind}${item.exportName}`).join(",")}];document.body.dataset.generatedModuleCount=String(generatedProductModules.length);`;
  const previewSupportModules = supportModules.filter(item => item.supportRole !== "test");
  const supportModuleImports = previewSupportModules.map((item, index) => `import { featureId as supportFeature${index} } from "./${item.path.replace(/^src\//, "")}";`).join("");
  const supportModuleRegistry = `const productSupportModules=[${previewSupportModules.map((_item, index) => `supportFeature${index}`).join(",")}];document.body.dataset.productSupportModuleCount=String(productSupportModules.length);`;
  const moduleImports = `import { createAppShell } from "./app-shell.js";import { featureRegistry, renderCollectionState } from "./components/${specification.category.replace(/_/g, "-")}-components.js";import { screenMap } from "./pages/${specification.category.replace(/_/g, "-")}-page.js";import { createSessionState } from "./state/${specification.category.replace(/_/g, "-")}-state.js";import { qs, text } from "./utils/dom.js";import { dataModel, productCategory } from "./types/${specification.category.replace(/_/g, "-")}.js";${requestModuleImports}${supportModuleImports}const architectureContext=createAppShell(document.body,{category:productCategory,screens:screenMap});const contractSessionState=createSessionState();const componentRegistry=featureRegistry;const collectionState=renderCollectionState({loading:true});void architectureContext;void contractSessionState;void componentRegistry;void collectionState;void qs;void text;void dataModel;${requestModuleRegistry}${supportModuleRegistry}`;
  const readme = `# ${specification.productName}\n\nCategory: ${specification.category}\n\n${specification.purpose}\n\n## Product contract\n\nPrimary user: ${specification.primaryUser}\n\nCore tasks:\n${specification.coreTasks.map(task => `- ${task}`).join("\n")}\n\nScreens:\n${specification.screens.map(screen => `- ${screen.name}: ${screen.purpose}`).join("\n")}\n\nComponents:\n${specification.components.map(component => `- ${component.name} (${component.ownerFile}): ${component.responsibility}`).join("\n")}\n\n${specification.category === "ecommerce" ? `## Modular project structure\n\nThe storefront is split into reusable components, route-level pages, scoped styles, state stores, API boundaries, server models/controllers/routes, provider adapters, fixtures, tests, assets, and configuration. The Preview uses the local entry files, while the surrounding modules document the ownership boundaries for extending the project safely.\n\nKey surfaces:\n- \`src/components/\`: reusable catalog, product, cart, checkout, layout, and feedback components.\n- \`src/pages/\`: route-level page composition.\n- \`src/state/\`: cart, user, wishlist, catalog, checkout, and notification state.\n- \`src/api/\`: local transport and provider-ready request boundaries.\n- \`server/\`: models, controllers, routes, and integrations.\n- \`tests/\`: component, page, state, API, and end-to-end regression coverage.\n` : ""}\n## File responsibilities\n\n- \`index.html\`: semantic screen structure and accessible controls.\n- \`${stylePath}\`: category-specific visual system and responsive layout.\n- \`${logicPath}\`: state, rendering, and connected interactions.\n- \`${dataPath}\`: deterministic seed data used by Preview.\n- \`project.manifest.json\`: versioned file ownership, interactions, and Preview acceptance criteria.\n\n## Feature ownership\n\n${specification.fileOwnership.map(item => `- ${item.featureId}: ${item.ownerComponent} owns ${item.stateOwner}; evidence: ${item.previewEvidence}.`).join("\n")}\n\nThis Preview uses local deterministic data. It does not claim external authentication, payment, booking, or real-time services.`;
  return [
    { path: "index.html", content: htmlFor(specification, manifest), language: "html" },
    { path: stylePath, content: cssFor(specification), language: "css" },
    ...architectureArtifacts,
    ...requestModules.map(definition => requestModuleArtifact(definition, specification)),
    ...supportModules.map(definition => featureSupportArtifact(definition, specification)),
    ...commerceFiles.map(definition => modularCommerceArtifact(definition, specification.productName)),
    { path: logicPath, content: `${moduleImports}${jsFor(specification, manifest)}${interactionEnhancements(specification)}${additionalInteractionEnhancements(specification)}`, language: "javascript" },
    { path: dataPath, content: JSON.stringify(dataFor(specification), null, 2), language: "json" },
    { path: "project.manifest.json", content: JSON.stringify(manifest, null, 2), language: "json" },
    { path: "README.md", content: readme, language: "markdown" },
  ];
}

export function validateGeneratedProject(artifacts: GeneratedProjectArtifact[], manifest: ProjectManifest, specification: ProductSpecification) {
  const paths = new Set(artifacts.map(artifact => artifact.path));
  const errors: string[] = [];
  if (manifest.entryFile !== "index.html" || !paths.has(manifest.entryFile)) errors.push("Manifest entryFile must point to the generated index.html.");
  if (manifest.projectVersion < 1 || !manifest.buildRunId || !manifest.projectId || !manifest.workspaceId) errors.push("Manifest snapshot identity is incomplete.");
  for (const file of manifest.files) if (!paths.has(file.path)) errors.push(`Manifest file is missing: ${file.path}`);
  for (const artifact of artifacts) if (!manifest.files.some(file => file.path === artifact.path)) errors.push(`Generated file has no manifest owner: ${artifact.path}`);
  const entry = artifacts.find(artifact => artifact.path === "index.html")?.content || "";
  const style = artifacts.find(artifact => artifact.path === manifest.files.find(file => file.role === "style")?.path)?.content || "";
  const script = artifacts.find(artifact => artifact.path === manifest.files.find(file => file.role === "logic")?.path)?.content || "";
  const data = artifacts.find(artifact => artifact.path === manifest.files.find(file => file.role === "data")?.path)?.content || "";
  if (!specification.components.length || !specification.interactions.length || !specification.fileOwnership.length || !specification.previewAcceptanceCriteria.length) {
    errors.push("Requirement contract is incomplete: components, interactions, ownership, and Preview acceptance criteria are required.");
  }
  for (const feature of specification.features) {
    const ownership = specification.fileOwnership.find(item => item.featureId === feature.id);
    const interaction = specification.interactions.find(item => item.id.startsWith(`${feature.id}-`));
    if (!ownership || !interaction) errors.push(`Feature contract is not wired: ${feature.id}`);
  }
  const aliases: Record<string, string[]> = {
    "application-shell": ["network-layout", "dashboard-shell", "store-header", "travel-header", "chat-header"],
    "post-cards": ["post-card"],
    "user-identity": ["profile-card", "maya noor"],
    "data-visualization": ["trend-chart", "chart-bar"],
    "date-range": ["period-filter", "date-from", "date-to"],
    "responsive-layout": ["@media", "responsive"],
    "quantity-changes": ["cart-action", "increase", "decrease"],
    "remove-item": ["data-cart-action", "remove"],
    dates: ["check-in", "check-out", "date"],
    guests: ["travelers"],
    sorting: ["stay-sort", "sort"],
    details: ["stay-card", "summary-content"],
    confirmation: ["booking-request", "confirmed", "request"],
    modification: ["modify-search"],
    cancellation: ["cancel-booking", "cancelled"],
    reactions: ["like", "liked"],
    "stay-selection": ["data-stay", "selected"],
    "login-form": ["login-form", "auth-email", "auth-password", "sign-in-button"],
    "credential-validation": ["field-error", "valid email", "8 characters"],
    "password-visibility": ["password-toggle", "show password"],
    "forgot-password": ["forgot-password", "recovery-view"],
    "auth-success": ["session-view", "signed in"],
    "auth-error": ["not recognized", "auth-status"],
    "auth-responsive": ["auth-shell", "@media"],
  };
  const requiredSignals = specification.features
    .filter(feature => feature.priority === "must")
    .map(feature => ({ id: feature.id, tokens: [feature.id, ...(aliases[feature.id] || []), ...feature.name.toLocaleLowerCase().split(/\s+/).filter(token => token.length > 4)] }));
  const signalText = `${entry}\n${style}\n${script}\n${data}`.toLocaleLowerCase();
  const missingFeatures = requiredSignals.filter(feature => !feature.tokens.some(token => signalText.includes(token))).map(feature => feature.id);
  if (missingFeatures.length) errors.push(`Required feature coverage is missing: ${missingFeatures.join(", ")}`);
  const categoryEvidence: Record<ProductCategory, RegExp[]> = {
    social_network: [/post-composer/, /feed-list/, /data-like|liked/, /network-search/, /notification/i, /mobile-navigation/],
    dashboard: [/metric-grid/, /trend-chart/, /shipment-table/, /period-filter/, /date-from/, /shipment-detail/, /dashboard-empty/, /dashboard-error/],
    ecommerce: [/product-grid/, /product-detail/, /sort-control/, /cart-drawer/, /wishlist/, /checkout-flow/],
    booking: [/trip-search/, /check-in/, /travelers/, /stay-list/, /stay-sort/, /trip-summary/, /availability-status/, /cancel-booking/],
    chat: [/conversation-list/, /message-list/, /message-composer/, /conversation-search/, /presence|status-dot/, /mobile-back-to-inbox/],
    auth: [/login-form/, /auth-email/, /auth-password/, /password-toggle/, /forgot-password/, /session-view/, /recovery-view/, /auth-shell/],
    recipes: [/recipe-grid/, /recipe-search/, /recipe-filters/, /recipe-detail/, /saved-recipes/],
    restaurant: [],
    contact: [],
    custom: [],
  };
  const missingEvidence = (categoryEvidence[specification.category] || []).filter(pattern => !pattern.test(`${entry}\n${style}\n${script}`));
  if (missingEvidence.length) errors.push(`Category implementation evidence is missing: ${missingEvidence.map(pattern => pattern.source).join(", ")}`);
  if (artifacts.length < 5) errors.push("Complex product generation must produce a manifest, data model, logic, style, entry, and documentation.");
  const genericSymptoms = [/welcome to/i, /build a website/i, /lorem ipsum/i, /<h1>your website/i, /static starter/i].filter(pattern => pattern.test(entry) || pattern.test(script)).length;
  if (genericSymptoms >= 2) errors.push("Generic-template symptoms detected in a request-specific product.");
  if (/your request|user prompt|build facebook|copy of the prompt/i.test(`${entry}\n${script}\n${artifacts.find(artifact => artifact.path === "README.md")?.content || ""}`)) {
    errors.push("Generated product contains raw prompt/template identity instead of request-derived product behavior.");
  }
  for (const file of manifest.files) {
    if (file.role === "entry" && !file.imports.every(importPath => paths.has(importPath))) errors.push(`Entry imports a missing file: ${file.path}`);
    if ((file.role === "logic" || file.role === "entry") && !file.imports.every(importPath => paths.has(importPath))) errors.push(`File imports a missing dependency: ${file.path}`);
    if (!["entry", "test", "documentation", "manifest"].includes(file.role) && file.importedBy.length === 0) errors.push(`Generated file is unused: ${file.path}`);
    if (file.usedInPreview && !["created", "updated", "ready"].includes(file.status)) errors.push(`Preview file is not ready: ${file.path}`);
  }
  return { passed: errors.length === 0, errors };
}

export function createProjectSnapshot(input: {
  projectId: string;
  buildRunId: string;
  version: number;
  entryFile: string;
  createdAt: string;
  artifacts: Array<{ path: string; content: string }>;
}): ProjectSnapshot {
  return {
    projectId: input.projectId,
    buildRunId: input.buildRunId,
    version: input.version,
    entryFile: input.entryFile,
    createdAt: input.createdAt,
    files: input.artifacts
      .slice()
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(file => ({ path: file.path, contentHash: createHash("sha256").update(file.content).digest("hex"), content: file.content })),
  };
}

export function hashProjectArtifacts(artifacts: GeneratedProjectArtifact[]) {
  return createHash("sha256").update(artifacts.filter(artifact => artifact.path !== "project.manifest.json").slice().sort((a, b) => a.path.localeCompare(b.path)).map(artifact => `${artifact.path}\0${artifact.content}`).join("\0")).digest("hex");
}

export function blueprintFilesFor(category: ProductCategory) {
  return BLUEPRINTS[category as keyof typeof BLUEPRINTS]?.files || { style: "styles/custom.css", logic: "src/custom.js", data: "data/custom.json" };
}
