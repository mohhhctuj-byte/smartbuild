import { describe, expect, it } from "vitest";
import {
  buildFeatureContract,
  buildProductSpecification,
  blueprintFilesFor,
  classifyProductRequest,
  createProjectManifest,
  createProjectSnapshot,
  createRequestSpecificArtifacts,
  hashProjectArtifacts,
  validateGeneratedProject,
} from "./projectGeneration";

describe("request-specific project generation", () => {
  const requests = [
    ["social_network", "Build a social network feed for a local community"],
    ["dashboard", "Create a logistics analytics dashboard with KPIs and shipment exceptions"],
    ["ecommerce", "Make a furniture ecommerce store with a product catalog and cart"],
    ["booking", "Design a travel booking experience for stays and destinations"],
    ["chat", "Build a real-time team chat with conversations and messages"],
    ["auth", "أريد بناء تسجيل دخول خطوة بخطوة"],
    ["recipes", "ابني موقع وصفات طبخ مع بحث وتصنيفات وحفظ الوصفات"],
  ] as const;

  it.each(requests)("classifies %s and creates a product contract", (category, request) => {
    const classification = classifyProductRequest(request);
    const specification = buildProductSpecification(classification);
    const files = {
      style: `styles/${category}.css`,
      logic: `src/${category}.js`,
      data: `data/${category}.json`,
    };
    const featureContract = buildFeatureContract(specification, files);
    expect(classification.category).toBe(category);
    expect(classification.confidence).toBeGreaterThan(0.7);
    expect(specification.screens.length).toBeGreaterThanOrEqual(3);
    expect(specification.features.length).toBeGreaterThanOrEqual(3);
    expect(specification.components.length).toBeGreaterThanOrEqual(5);
    expect(specification.interactions.length).toBe(specification.features.length);
    expect(specification.fileOwnership.length).toBe(specification.features.length);
    expect(specification.previewAcceptanceCriteria.length).toBe(specification.features.length);
    expect(featureContract.features.every(feature => feature.requiredFiles.includes(files.logic))).toBe(true);
  });

  it.each([
    "Build a small online reading club for exactly 24 members.",
    "ابني موقع نادي قراءة أونلاين بسيط لعدد 24 عضو",
  ])("classifies reading clubs as communities rather than bookstores: %s", request => {
    const classification = classifyProductRequest(request);
    expect(classification.category).toBe("social_network");
    expect(classification.productName).toBe("Reading Club");
    expect(classification.matchedSignals).toContain(request.startsWith("Build") ? "reading club" : "نادي قراءة");
  });

  it.each([
    "Build a blog website about neighborhood walking trails.",
    "ابني دليل لمسارات المشي في الحي",
  ])("recognizes a neighborhood trail guide as a specific product domain: %s", request => {
    const classification = classifyProductRequest(request);
    const specification = buildProductSpecification(classification);

    expect(classification).toMatchObject({ category: "custom", confidence: expect.any(Number), productName: "Trail Atlas" });
    expect(classification.matchedSignals.length).toBeGreaterThan(0);
    expect(specification.purpose).toContain("trail guide");
    expect(specification.features.map(feature => feature.id)).toEqual([
      "trail-discovery", "trail-search", "difficulty-filter", "trail-details", "saved-trails", "responsive-trail-guide",
    ]);
    expect(specification.dataModels.find(model => model.name === "Trail")?.fields).toContain("distanceMiles");
    expect(specification.stateModel.persistence).toContain("localStorage");
  });

  it("builds a reading-club feature contract from the club's actual modular artifacts", () => {
    const classification = classifyProductRequest("Build an online reading club for exactly 24 members.");
    const specification = buildProductSpecification(classification);
    const files = { style: "styles.css", logic: "app.js", data: "src/data/club-data.mjs" };
    const contract = buildFeatureContract(specification, files);

    expect(specification.features.map(feature => feature.id)).toEqual([
      "book-shelf", "book-search", "reading-progress", "meetup-rsvp", "member-roster",
    ]);
    expect(specification.screens.map(screen => screen.id)).toEqual(["bookshelf", "meetup", "members"]);
    expect(contract.features.every(feature => feature.requiredFiles.every(file => ["index.html", ...Object.values(files)].includes(file)))).toBe(true);
  });

  it("recognizes Arabic reading clubs when a preposition is attached to the club name", () => {
    const classification = classifyProductRequest("ابني موقعًا بسيطًا لنادي قراءة أونلاين لـ24 عضوًا، يساعدهم على تنظيم الاجتماعات والكتب التي يقرؤونها.");
    expect(classification).toMatchObject({ category: "social_network", productName: "Reading Club" });
  });

  it("generates different file trees and content for each product category", () => {
    const trees = requests.map(([category, request]) => {
      const classification = classifyProductRequest(request);
      const specification = buildProductSpecification(classification);
      const files = {
        style: `styles/${category}.css`,
        logic: `src/${category}.js`,
        data: `data/${category}.json`,
      };
      const featureContract = buildFeatureContract(specification, files);
      const manifest = createProjectManifest({
        buildRunId: `build-${category}`,
        projectId: "42",
        workspaceId: "project-42",
        classification,
        specification,
        featureContract,
        generatedAt: "2025-01-01T00:00:00.000Z",
      });
      const artifacts = createRequestSpecificArtifacts(specification, manifest);
      expect(validateGeneratedProject(artifacts, manifest, specification)).toEqual({ passed: true, errors: [] });
      return {
        count: artifacts.length,
        paths: artifacts.map(artifact => artifact.path).join("|"),
        html: artifacts.find(artifact => artifact.path === "index.html")!.content,
        hash: hashProjectArtifacts(artifacts),
      };
    });
    expect(trees.every(tree => tree.count > 14)).toBe(true);
    expect(new Set(trees.map(tree => tree.count)).size).toBeGreaterThan(1);
    expect(new Set(trees.map(tree => tree.paths)).size).toBe(requests.length);
    expect(new Set(trees.map(tree => tree.hash)).size).toBe(requests.length);
    expect(trees[0].html).toContain("data-product-category=\"social_network\"");
    expect(trees[1].html).toContain("metric-grid");
    expect(trees[2].html).toContain("product-grid");
    expect(trees[3].html).toContain("trip-search");
    expect(trees[4].html).toContain("message-composer");
    expect(trees[5].html).toContain("login-form");
    expect(trees[6].html).toContain("recipe-grid");
  });

  it("does not mistake authors for authentication and generates an author bookstore, not a login screen", () => {
    const classification = classifyProductRequest("Build an online book store for independent authors with a reading list and cart");
    expect(classification.category).toBe("ecommerce");
    expect(classification.visualVariant).toBe("library");
    const specification = buildProductSpecification(classification);
    const manifest = createProjectManifest({
      buildRunId: "build-author-bookstore",
      projectId: "42",
      workspaceId: "project-42",
      classification,
      specification,
      featureContract: buildFeatureContract(specification, blueprintFilesFor("ecommerce")),
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const artifacts = createRequestSpecificArtifacts(specification, manifest);
    const html = artifacts.find(artifact => artifact.path === "index.html")!.content;

    expect(html).toContain("library-header");
    expect(html).toContain("reading-list");
    expect(html).not.toContain("login-form");
    expect(artifacts.some(artifact => artifact.path === "src/components/product/product-card.js")).toBe(true);
    expect(artifacts.some(artifact => artifact.path === "src/pages/product/catalog.js")).toBe(true);
    expect(artifacts.length).toBeGreaterThan(14);
    expect(validateGeneratedProject(artifacts, manifest, specification)).toEqual({ passed: true, errors: [] });
  });

  it("keeps a portfolio as the primary product when its supporting features include a contact form", () => {
    const classification = classifyProductRequest("Build a portfolio website for photographer Nour with a gallery, about section, and contact form validation.");
    const specification = buildProductSpecification(classification);

    expect(classification.category).toBe("custom");
    expect(specification.features.map(feature => feature.id)).toEqual(expect.arrayContaining([
      "portfolio-home",
      "portfolio-gallery",
      "gallery-filtering",
      "photographer-about",
      "contact-form",
      "contact-form-validation",
    ]));
  });

  it("starts every product category with 100-200 useful files and substantive feature modules", () => {
    const cases = [
      ["social_network", "Build a social network feed for a local community"],
      ["dashboard", "Create a logistics analytics dashboard with KPIs and shipment exceptions"],
      ["ecommerce", "Make a furniture ecommerce store with a product catalog and cart"],
      ["booking", "Design a travel booking experience for stays and destinations"],
      ["chat", "Build a real-time team chat with conversations and messages"],
      ["auth", "أريد بناء تسجيل دخول خطوة بخطوة"],
      ["recipes", "ابني موقع وصفات طبخ مع بحث وتصنيفات وحفظ الوصفات"],
      ["restaurant", "Create a restaurant website with a menu and reservations"],
      ["contact", "Build a contact page with an inquiry form"],
      ["custom", "Build a personal productivity tool for tracking daily tasks"],
    ] as const;

    for (const [expectedCategory, request] of cases) {
      const classification = classifyProductRequest(request);
      const category = classification.category;
      expect(category).toBe(expectedCategory);
      const specification = buildProductSpecification(classification);
      const files = blueprintFilesFor(category);
      const manifest = createProjectManifest({
        buildRunId: `build-modular-${category}`,
        projectId: "42",
        workspaceId: "project-42",
        classification,
        specification,
        featureContract: buildFeatureContract(specification, files),
        generatedAt: "2025-01-01T00:00:00.000Z",
      });
      const artifacts = createRequestSpecificArtifacts(specification, manifest);
      const featureModules = artifacts.filter(artifact => artifact.path.startsWith("src/features/") || artifact.path.startsWith("tests/features/"));

      expect(manifest.files.length, category).toBeGreaterThanOrEqual(100);
      expect(manifest.files.length, category).toBeLessThanOrEqual(200);
      expect(artifacts, category).toHaveLength(manifest.files.length);
      expect(featureModules.length, `${category}: ${manifest.files.length} files`).toBeGreaterThan(0);
      expect(featureModules.every(artifact => artifact.content.trim().split(/\r?\n/).length >= 50), category).toBe(true);
      expect(featureModules.every(artifact => artifact.content.includes("featureId") && artifact.content.includes("featureName")), category).toBe(true);
      expect(validateGeneratedProject(artifacts, manifest, specification), category).toEqual({ passed: true, errors: [] });
    }
  });

  it("generates an apparel-specific storefront instead of defaulting every shop to furniture", () => {
    const classification = classifyProductRequest("ابني متجر إلكتروني للملابس والإكسسوارات، يكون مناسب للموبايل وفيه تصفح للمنتجات وإضافة للسلة");
    expect(classification).toMatchObject({
      category: "ecommerce",
      productName: "Atelier Nine",
      visualVariant: "apparel",
    });
    const specification = buildProductSpecification(classification);
    const files = blueprintFilesFor("ecommerce");
    const manifest = createProjectManifest({
      buildRunId: "build-arabic-apparel",
      projectId: "42",
      workspaceId: "project-42",
      classification,
      specification,
      featureContract: buildFeatureContract(specification, files),
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const artifacts = createRequestSpecificArtifacts(specification, manifest);
    const html = artifacts.find(artifact => artifact.path === "index.html")!.content;
    const stylesheet = artifacts.find(artifact => artifact.path === files.style)!.content;
    const logic = artifacts.find(artifact => artifact.path === files.logic)!.content;
    const productModel = artifacts.find(artifact => artifact.path === "src/models/apparelproduct.js")!.content;
    const catalog = JSON.parse(artifacts.find(artifact => artifact.path === files.data)!.content) as { products: Array<{ name: string; category: string }> };

    expect(specification.purpose).toContain("clothing and accessories");
    expect(html).toContain("fashion-hero");
    expect(html).toContain("Shopping bag");
    expect(html).not.toContain("Oak &amp; Form");
    expect(html).not.toContain("furniture for rooms");
    expect(html).not.toContain("Select a guide or kit");
    expect(html.match(/id="product-detail"/g)).toHaveLength(1);
    expect(stylesheet).toContain(".fashion-product-grid");
    expect(stylesheet).toContain("min-width:44px");
    expect(logic).toContain("generatedModulemodelApparelproduct");
    expect(productModel).toContain("export const Apparelproduct =");
    expect(catalog.products.map(product => product.category)).toEqual(expect.arrayContaining(["Clothing", "Accessories"]));
    expect(validateGeneratedProject(artifacts, manifest, specification)).toEqual({ passed: true, errors: [] });
  });

  it("does not classify an expense ledger as authentication just because it records entries", () => {
    expect(classifyProductRequest("ابني تطبيق لتسجيل المصاريف ومتابعة الميزانية").category).not.toBe("auth");
  });

  it("does not mistake the Arabic verb for writing as the word for books", () => {
    expect(classifyProductRequest("اكتب موقع").matchedSignals).toEqual([]);
  });

  it("recognizes hyphenated sign-in requests as authentication products", () => {
    expect(classifyProductRequest("Build a sign-in page with email and password").category).toBe("auth");
  });

  it("keeps wellness booking requests in the wellness visual direction", () => {
    const classification = classifyProductRequest("Build a modern appointment booking website for a small wellness studio with yoga, massage, and weekly availability.");
    expect(classification).toMatchObject({
      category: "booking",
      productName: "Auralis Wellness",
      primaryUser: "Wellness studio client",
      visualVariant: "wellness",
    });
    expect(classification.matchedSignals).toEqual(expect.arrayContaining(["wellness", "yoga", "massage"]));
    expect(buildProductSpecification(classification).visualDirection.palette).toContain("Mineral sage");
  });

  it("keeps a portfolio with a contact form classified as a portfolio project", () => {
    const classification = classifyProductRequest("Build a responsive portfolio website for photographer Nour: Home, Gallery, About, and Contact; warm cream and deep green colors; working gallery filters and contact form validation.");

    expect(classification).toMatchObject({
      category: "custom",
      productName: "Nour Photography Portfolio",
      primaryUser: "Potential clients and collaborators",
      visualPalette: "warm cream and deep green",
    });
    expect(classification.category).not.toBe("contact");
    const specification = buildProductSpecification(classification);
    expect(specification.screens.map(screen => screen.name)).toEqual(["Home", "Gallery", "About", "Contact"]);
    expect(specification.features.map(feature => feature.id)).toEqual(expect.arrayContaining([
      "portfolio-gallery",
      "gallery-filtering",
      "photographer-about",
      "contact-form-validation",
    ]));
    expect(specification.visualDirection.palette).toBe("warm cream and deep green");
    expect(specification.dataModels.map(model => model.name)).toEqual(["Photo", "ContactSubmission"]);
    expect(specification.coreTasks).toContain("Filter photographs by category");
  });

  it("classifies Arabic recipe requests as a request-specific recipe product", () => {
    const classification = classifyProductRequest("ابني موقعًا صغيرًا لعرض وصفات الطبخ، بواجهة كاملة وتفاعلات شغالة");
    expect(classification.category).toBe("recipes");
    expect(classification.confidence).toBeGreaterThan(0.7);
    const specification = buildProductSpecification(classification);
    const manifest = createProjectManifest({
      buildRunId: "build-recipes",
      projectId: "42",
      workspaceId: "project-42",
      classification,
      specification,
      featureContract: buildFeatureContract(specification, blueprintFilesFor("recipes")),
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const artifacts = createRequestSpecificArtifacts(specification, manifest);
    expect(artifacts.length).toBeGreaterThanOrEqual(13);
    expect(artifacts.some(artifact => artifact.path === "src/components/recipes-components.js")).toBe(true);
    expect(artifacts.some(artifact => artifact.path === "src/recipe-journal.js")).toBe(true);
    expect(artifacts.some(artifact => artifact.path === "data/recipes.json")).toBe(true);
    expect(artifacts.find(artifact => artifact.path === "index.html")?.content).toContain("recipe-grid");
    expect(artifacts.find(artifact => artifact.path === "src/recipe-journal.js")?.content).toContain("View recipe");
    expect(validateGeneratedProject(artifacts, manifest, specification)).toEqual({ passed: true, errors: [] });
  });

  it("classifies Arabic digital product stores as ecommerce", () => {
    const classification = classifyProductRequest("ابني متجرًا للمنتجات الرقمية عن الكلاب مع بطاقات وسلة شراء");
    expect(classification.category).toBe("ecommerce");
    const specification = buildProductSpecification(classification);
    const manifest = createProjectManifest({
      buildRunId: "build-digital-store",
      projectId: "42",
      workspaceId: "project-42",
      classification,
      specification,
      featureContract: buildFeatureContract(specification, blueprintFilesFor("ecommerce")),
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const artifacts = createRequestSpecificArtifacts(specification, manifest);
    const html = artifacts.find(artifact => artifact.path === "index.html")!.content;
    expect(html).toContain("product-grid");
    expect(html).toContain("cart-drawer");
    expect(validateGeneratedProject(artifacts, manifest, specification)).toEqual({ passed: true, errors: [] });
  });

  it("generates a colorful canine storefront with dog-specific digital products", () => {
    const classification = classifyProductRequest("ابني متجر Pawfolk لمنتجات رقمية عن كل أنواع وسلالات الكلاب");
    expect(classification.category).toBe("ecommerce");
    expect(classification.visualVariant).toBe("canine");
    const specification = buildProductSpecification(classification);
    const manifest = createProjectManifest({
      buildRunId: "build-pawfolk",
      projectId: "42",
      workspaceId: "project-42",
      classification,
      specification,
      featureContract: buildFeatureContract(specification, blueprintFilesFor("ecommerce")),
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const artifacts = createRequestSpecificArtifacts(specification, manifest);
    const html = artifacts.find(artifact => artifact.path === "index.html")!.content;
    const style = artifacts.find(artifact => artifact.path === "styles/store.css")!.content;
    const data = artifacts.find(artifact => artifact.path === "data/catalog.json")!.content;
    expect(html).toContain("Pawfolk");
    expect(html).toContain("paw-hero");
    expect(html).toContain("Your bag");
    expect(style).toContain("--accent:#ff7657");
    expect(style).toContain(".paw-product-grid");
    expect(data).toContain("Puppy Starter Guide");
    expect(data).not.toContain("Oak & Form");
    expect(data).not.toContain("lounge chair");
    expect(artifacts.length).toBeGreaterThan(140);
    expect(artifacts.some(artifact => artifact.path === "src/components/catalog/ProductCard.js")).toBe(true);
    expect(artifacts.some(artifact => artifact.path === "src/pages/Checkout.js")).toBe(true);
    expect(artifacts.some(artifact => artifact.path === "server/models/Order.model.js")).toBe(true);
    expect(artifacts.some(artifact => artifact.path === "server/integrations/paymentAdapter.js")).toBe(true);
    expect(validateGeneratedProject(artifacts, manifest, specification)).toEqual({ passed: true, errors: [] });
  });

  it("generates a free reading library instead of an ecommerce template", () => {
    const classification = classifyProductRequest("Build a free online book library for reading with search, genres, a reader, and saved books");
    expect(classification.category).toBe("ecommerce");
    expect(classification.visualVariant).toBe("library");
    expect(classification.productName).toBe("OpenLeaf AI Library");
    const specification = buildProductSpecification(classification);
    const manifest = createProjectManifest({
      buildRunId: "build-openleaf",
      projectId: "42",
      workspaceId: "project-42",
      classification,
      specification,
      featureContract: buildFeatureContract(specification, blueprintFilesFor("ecommerce")),
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const artifacts = createRequestSpecificArtifacts(specification, manifest);
    const html = artifacts.find(artifact => artifact.path === "index.html")!.content;
    const style = artifacts.find(artifact => artifact.path === "styles/store.css")!.content;
    const script = artifacts.find(artifact => artifact.path === "src/app.js")!.content;
    const data = artifacts.find(artifact => artifact.path === "data/catalog.json")!.content;
    expect(html).toContain("OpenLeaf");
    expect(html).toContain("reader-drawer");
    expect(html).toContain("reading-list");
    expect(style).toContain(".library-grid");
    expect(script).toContain("reader-smaller");
    expect(data).toContain("The Lantern Room");
    expect(data).not.toContain("Oak & Form");
    expect(artifacts.length).toBeGreaterThan(140);
    expect(artifacts.some(artifact => artifact.path === "src/components/catalog/ProductCard.js")).toBe(true);
    expect(artifacts.some(artifact => artifact.path === "src/state/CartContext.js")).toBe(true);
    expect(artifacts.some(artifact => artifact.path === "tests/e2e/storefront.spec.js")).toBe(true);
    expect(data).not.toContain("lounge chair");
    expect(validateGeneratedProject(artifacts, manifest, specification)).toEqual({ passed: true, errors: [] });
  });

  it("generates a real local login surface instead of copying the request into README content", () => {
    const classification = classifyProductRequest("عايز نبدأ خطوة بخطوة، أول حاجة ابني تسجيل دخول");
    expect(classification.category).toBe("auth");
    const specification = buildProductSpecification(classification);
    const manifest = createProjectManifest({
      buildRunId: "build-auth",
      projectId: "42",
      workspaceId: "project-42",
      classification,
      specification,
      featureContract: buildFeatureContract(specification, blueprintFilesFor("auth")),
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const artifacts = createRequestSpecificArtifacts(specification, manifest);
    expect(artifacts.map(artifact => artifact.path)).toEqual(expect.arrayContaining(["index.html", "styles/auth.css", "src/auth.js", "data/auth.json"]));
    const html = artifacts.find(artifact => artifact.path === "index.html")!.content;
    const script = artifacts.find(artifact => artifact.path === "src/auth.js")!.content;
    const readme = artifacts.find(artifact => artifact.path === "README.md")!.content;
    expect(artifacts.length).toBeGreaterThan(10);
    expect(artifacts.map(artifact => artifact.path)).toEqual(expect.arrayContaining([
      "src/app-shell.js",
      "src/components/auth-components.js",
      "src/pages/auth-page.js",
      "src/state/auth-state.js",
      "src/utils/dom.js",
      "src/types/auth.js",
      "tests/auth.test.js",
      "project.manifest.json",
    ]));
    expect(html).toEqual(expect.stringContaining('id="auth-email"'));
    expect(html).toEqual(expect.stringContaining('id="auth-password"'));
    expect(html).toEqual(expect.stringContaining('id="session-view"'));
    expect(html).toContain('rel="icon"');
    expect(script).toEqual(expect.stringContaining("demo@accessly.test"));
    expect(script).toContain('from "./app-shell.js"');
    expect(script).toContain('from "./components/auth-components.js"');
    expect(script).toContain('from "./state/auth-state.js"');
    expect(artifacts.find(artifact => artifact.path === "styles/auth.css")?.content).toContain("min-width:44px");
    expect(artifacts.find(artifact => artifact.path === "styles/auth.css")?.content).toContain(".remember input{width:24px;height:24px");
    expect(artifacts.find(artifact => artifact.path === "styles/auth.css")?.content).toContain(".text-button{min-height:24px");
    expect(readme).not.toContain("عايز نبدأ خطوة بخطوة");
    expect(validateGeneratedProject(artifacts, manifest, specification)).toEqual({ passed: true, errors: [] });
  });

  it("uses a distinct neon auth blueprint for redesign requests", () => {
    const classification = classifyProductRequest("غيّر التصميم والألوان واعمل واجهة تسجيل دخول مختلفة");
    expect(classification.category).toBe("auth");
    expect(classification.visualVariant).toBe("neon");
    const specification = buildProductSpecification(classification);
    const manifest = createProjectManifest({
      buildRunId: "build-auth-neon",
      projectId: "42",
      workspaceId: "project-42",
      classification,
      specification,
      featureContract: buildFeatureContract(specification, blueprintFilesFor("auth")),
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const artifacts = createRequestSpecificArtifacts(specification, manifest);
    const html = artifacts.find(artifact => artifact.path === "index.html")!.content;
    const css = artifacts.find(artifact => artifact.path === "styles/auth.css")!.content;
    expect(html).toContain('data-auth-variant="neon"');
    expect(html).toContain("auth-visual-panel");
    expect(html).not.toContain("Welcome back");
    expect(html).not.toContain('class="auth-card"');
    expect(html).not.toContain("%235b5bd6");
    expect(css).toContain("#101313");
    expect(css).toContain("#d7ff4f");
    expect(css).toContain(".auth-form-panel");
    expect(css).toContain(".auth-visual-panel");
    expect(css).not.toContain("#f5f3ef");
    expect(css).not.toContain("#5b5bd6");
    expect(css).not.toContain(".auth-card");
    expect(validateGeneratedProject(artifacts, manifest, specification)).toEqual({ passed: true, errors: [] });
  });

  it("records low-confidence assumptions for unsupported domains instead of copying the prompt into the UI", () => {
    const classification = classifyProductRequest("Build an unusual internal workspace for my team");
    const specification = buildProductSpecification(classification);
    expect(classification.category).toBe("custom");
    expect(classification.confidence).toBeLessThan(0.7);
    expect(classification.assumptions.length).toBeGreaterThan(0);
    expect(specification.purpose).not.toContain("unusual internal workspace");
  });

  it("does not fall back to a three-file starter for an unsupported product domain", () => {
    const classification = classifyProductRequest("Build an unusual internal workspace for my team");
    const specification = buildProductSpecification(classification);
    const manifest = createProjectManifest({
      buildRunId: "build-custom-modular",
      projectId: "42",
      workspaceId: "project-42",
      classification,
      specification,
      featureContract: buildFeatureContract(specification, blueprintFilesFor("custom")),
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const artifacts = createRequestSpecificArtifacts(specification, manifest);
    expect(artifacts.length).toBeGreaterThan(10);
    expect(artifacts.map(artifact => artifact.path)).toEqual(expect.arrayContaining([
      "src/components/custom-components.js",
      "src/pages/custom-page.js",
      "src/state/custom-state.js",
      "src/custom.js",
      "data/custom.json",
      "tests/custom.test.js",
      "project.manifest.json",
    ]));
    const index = artifacts.find(artifact => artifact.path === "index.html")?.content || "";
    expect(index).toContain("MODULAR PROJECT");
    expect(index).toContain('data-smartbuild-project-identity="visible"');
    expect(index).toContain('<h1 id="project-identity">');
    expect(validateGeneratedProject(artifacts, manifest, specification)).toEqual({ passed: true, errors: [] });
  });

  it("blocks a project when a required owned artifact is missing or a category surface is removed", () => {
    const classification = classifyProductRequest("Build a furniture ecommerce store with catalog, cart, and checkout");
    const specification = buildProductSpecification(classification);
    const files = { style: "styles/store.css", logic: "src/app.js", data: "data/catalog.json" };
    const featureContract = buildFeatureContract(specification, files);
    const manifest = createProjectManifest({
      buildRunId: "build-invalid",
      projectId: "42",
      workspaceId: "project-42",
      classification,
      specification,
      featureContract,
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const artifacts = createRequestSpecificArtifacts(specification, manifest);
    const broken = artifacts.filter(artifact => artifact.path !== files.logic);
    const result = validateGeneratedProject(broken, manifest, specification);
    expect(result.passed).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      `Manifest file is missing: ${files.logic}`,
      expect.stringContaining("Required feature coverage"),
    ]));
  });

  it("creates a versioned snapshot whose files are the exact Code/Preview source", () => {
    const classification = classifyProductRequest("Build a team chat with conversations and messages");
    const specification = buildProductSpecification(classification);
    const files = { style: "styles/chat.css", logic: "src/chat.js", data: "data/chat.json" };
    const featureContract = buildFeatureContract(specification, files);
    const manifest = createProjectManifest({
      buildRunId: "build-snapshot",
      projectId: "42",
      workspaceId: "project-42",
      classification,
      specification,
      featureContract,
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const artifacts = createRequestSpecificArtifacts(specification, manifest);
    const snapshot = createProjectSnapshot({
      projectId: "42",
      buildRunId: "build-snapshot",
      version: manifest.projectVersion,
      entryFile: manifest.entryFile,
      createdAt: manifest.updatedAt,
      artifacts,
    });
    expect(manifest.entryFile).toBe("index.html");
    expect(manifest.files.every(file => file.responsibility && file.status === "created" && file.usedInPreview === (file.role !== "test" && file.role !== "documentation" && file.role !== "manifest"))).toBe(true);
    expect(snapshot.buildRunId).toBe(manifest.buildRunId);
    expect(snapshot.version).toBe(manifest.projectVersion);
    expect(snapshot.files.map(file => file.path)).toEqual(artifacts.map(file => file.path).sort((a, b) => a.localeCompare(b)));
    expect(snapshot.files.find(file => file.path === manifest.entryFile)?.content).toBe(artifacts.find(file => file.path === manifest.entryFile)?.content);
  });
});
