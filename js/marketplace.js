(function () {
  const PRODUCTS_KEY = "barbercloud.marketplace_products";
  const REDEEM_PRODUCTS_KEY = "barbercloud.loyalty_redeem_products";
  const SALES_KEY = "barbercloud.marketplace_sales";
  const PESOS_PER_POINT = 800;
  const MAX_IMAGES = 8;
  const LOW_STOCK = 5;
  const PLACEHOLDER =
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect fill="#f3f4f6" width="640" height="480"/><path fill="#d1d5db" d="M280 180h80v120h-80z"/><circle fill="#d1d5db" cx="320" cy="150" r="28"/><text x="320" y="340" text-anchor="middle" fill="#9ca3af" font-family="DM Sans,sans-serif" font-size="20">Sin imagen</text></svg>`
    );

  const grid = document.getElementById("product-grid");
  const redeemGrid = document.getElementById("redeem-product-grid");
  const catalogCount = document.getElementById("catalog-count");
  const redeemCatalogCount = document.getElementById("redeem-catalog-count");
  const saleCatalogPanel = document.getElementById("sale-catalog-panel");
  const redeemCatalogPanel = document.getElementById("redeem-catalog-panel");
  const productModal = document.getElementById("product-modal");
  const form = document.getElementById("product-form");
  const errorEl = document.getElementById("product-error");
  const thumbsEl = document.getElementById("image-thumbs");
  const imagesInput = document.getElementById("product-images");
  const imagesHint = document.getElementById("images-hint");
  const fieldPrice = document.getElementById("field-product-price");
  const fieldPoints = document.getElementById("field-product-points");
  const stockHint = document.getElementById("product-stock-hint");
  const priceInput = document.getElementById("product-price");
  const pointsInput = document.getElementById("product-points");

  let draftImages = [];
  let editingId = null;
  let editingKind = "sale";
  let activeTab = "sale";

  function safeParse(raw, fallback) {
    try {
      return JSON.parse(raw || "") ?? fallback;
    } catch {
      return fallback;
    }
  }

  function loadProducts() {
    const list = safeParse(localStorage.getItem(PRODUCTS_KEY), []);
    if (!Array.isArray(list)) return [];
    return list.map((p) => ({
      ...p,
      stock: Number.isFinite(Number(p.stock)) ? Math.max(0, Number(p.stock)) : 10,
    }));
  }

  function saveProducts(list) {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(list));
    if (window.SupabaseData?.enabled?.()) {
      Promise.resolve()
        .then(async () => {
          for (const p of list.slice(0, 50)) {
            await window.SupabaseData.upsertProducto(p, "sale");
          }
        })
        .catch((err) => console.warn("[marketplace] sync sale", err));
    }
  }

  function pointsCostFromPrice(price) {
    return Math.max(1, Math.floor((Number(price) || 0) / PESOS_PER_POINT));
  }

  function loadRedeemProducts() {
    const raw = localStorage.getItem(REDEEM_PRODUCTS_KEY);
    if (raw === null) {
      const migrated = loadProducts().map((p) => ({
        id: `redeem-${p.id}`,
        name: p.name,
        description: p.description,
        pointsCost: pointsCostFromPrice(p.price),
        stock: Number.isFinite(Number(p.stock)) ? Math.max(0, Number(p.stock)) : 0,
        images: Array.isArray(p.images) ? [...p.images] : [],
        createdAt: p.createdAt || new Date().toISOString(),
        migratedFromSale: true,
      }));
      localStorage.setItem(REDEEM_PRODUCTS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    const list = safeParse(raw, []);
    if (!Array.isArray(list)) return [];
    return list.map((p) => ({
      ...p,
      stock: Number.isFinite(Number(p.stock)) ? Math.max(0, Number(p.stock)) : 0,
      pointsCost: Math.max(1, Number(p.pointsCost) || 1),
    }));
  }

  function saveRedeemProducts(list) {
    localStorage.setItem(REDEEM_PRODUCTS_KEY, JSON.stringify(list));
    if (window.SupabaseData?.enabled?.()) {
      Promise.resolve()
        .then(async () => {
          for (const p of list.slice(0, 50)) {
            await window.SupabaseData.upsertProducto(p, "redeem");
          }
        })
        .catch((err) => console.warn("[marketplace] sync redeem", err));
    }
  }

  function loadSales() {
    const list = safeParse(localStorage.getItem(SALES_KEY), []);
    return Array.isArray(list) ? list : [];
  }

  function formatMoney(amount) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  }

  function parsePrice(raw) {
    let s = String(raw || "").trim().replace(/[^\d.,]/g, "");
    if (!s) return NaN;
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",")) {
      s = s.replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, "");
    }
    return Number(s);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function monthLabel(date = new Date()) {
    return date.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  }

  function isSameMonth(iso, ref = new Date()) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function compressImage(dataUrl, maxW = 900, quality = 0.78) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxW / (img.width || maxW));
          const w = Math.max(1, Math.round((img.width || maxW) * scale));
          const h = Math.max(1, Math.round((img.height || maxW) * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve("");
      img.src = dataUrl;
    });
  }

  function isImageFile(file) {
    const type = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    if (type.startsWith("image/")) return true;
    return /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif|jfif|jxl)$/i.test(name);
  }

  function isHeicFile(file) {
    const type = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    return type.includes("heic") || type.includes("heif") || /\.heic$|\.heif$/i.test(name);
  }

  function isJxlFile(file) {
    const type = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    return type.includes("jxl") || type === "image/jxl" || /\.jxl$/i.test(name);
  }

  function canvasFromImageBitmap(bitmap) {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width || bitmap.displayWidth || 1;
    canvas.height = bitmap.height || bitmap.displayHeight || 1;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    if (typeof bitmap.close === "function") bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function decodeJxlWithImageDecoder(buffer) {
    if (typeof ImageDecoder === "undefined") return "";
    const decoder = new ImageDecoder({ data: buffer, type: "image/jxl" });
    const { image } = await decoder.decode();
    return canvasFromImageBitmap(image);
  }

  async function decodeJxlWithJsquash(buffer) {
    const urls = [
      "https://esm.sh/@jsquash/jxl@1.4.0/decode",
      "https://cdn.jsdelivr.net/npm/@jsquash/jxl@1.4.0/decode.js/+esm",
    ];
    let lastError;
    for (const url of urls) {
      try {
        const mod = await import(url);
        if (typeof mod.init === "function") {
          await mod.init();
        }
        const decode = mod.default;
        const imageData = await decode(buffer);
        const canvas = document.createElement("canvas");
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        canvas.getContext("2d").putImageData(imageData, 0, 0);
        return canvas.toDataURL("image/jpeg", 0.85);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("No se pudo decodificar JXL");
  }

  async function blobToJpegDataUrl(blob) {
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || 1;
            canvas.height = img.naturalHeight || 1;
            canvas.getContext("2d").drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error("No se pudo leer la imagen"));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function jxlFileToDataUrl(file) {
    const buffer = await file.arrayBuffer();
    try {
      const viaDecoder = await decodeJxlWithImageDecoder(buffer);
      if (viaDecoder) return viaDecoder;
    } catch {
      /* continuar */
    }
    try {
      const viaJsquash = await decodeJxlWithJsquash(buffer);
      if (viaJsquash) return viaJsquash;
    } catch {
      /* continuar */
    }
    try {
      return await blobToJpegDataUrl(new Blob([buffer], { type: "image/jxl" }));
    } catch {
      return "";
    }
  }

  async function loadHeic2Any() {
    if (typeof window.heic2any === "function") return window.heic2any;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-heic2any]");
      if (existing) {
        existing.addEventListener("load", resolve);
        existing.addEventListener("error", reject);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
      script.async = true;
      script.dataset.heic2any = "1";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    if (typeof window.heic2any !== "function") {
      throw new Error("heic2any no disponible");
    }
    return window.heic2any;
  }

  async function fileToProcessableBlob(file) {
    if (!isHeicFile(file)) return file;
    try {
      const heic2any = await loadHeic2Any();
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.82,
      });
      const out = Array.isArray(converted) ? converted[0] : converted;
      return new File([out], file.name.replace(/\.heic$/i, ".jpg"), {
        type: "image/jpeg",
      });
    } catch {
      return file;
    }
  }

  async function prepareImageDataUrl(file) {
    if (isJxlFile(file)) {
      const jxl = await jxlFileToDataUrl(file);
      if (jxl) return jxl;
      throw new Error("No se pudo convertir la imagen JXL");
    }
    const processable = await fileToProcessableBlob(file);
    const raw = await readFileAsDataUrl(processable);
    if (!raw) return "";
    const compressed = await compressImage(raw);
    return compressed || raw;
  }

  function showError(msg) {
    if (!errorEl) return;
    errorEl.hidden = !msg;
    errorEl.textContent = msg || "";
  }

  function openProductModal(kind = "sale", product = null) {
    editingKind = kind;
    editingId = product?.id || null;
    draftImages = Array.isArray(product?.images) ? [...product.images] : [];
    document.getElementById("product-kind").value = kind;
    document.getElementById("product-modal-title").textContent = product
      ? kind === "redeem"
        ? "Editar producto Rewards"
        : "Editar producto en venta"
      : kind === "redeem"
        ? "Agregar producto Rewards"
        : "Agregar producto en venta";
    document.getElementById("product-id").value = product?.id || "";
    document.getElementById("product-name").value = product?.name || "";
    document.getElementById("product-desc").value = product?.description || "";
    document.getElementById("product-stock").value = product?.stock != null ? product.stock : 10;

    const isRedeem = kind === "redeem";
    if (fieldPrice) fieldPrice.hidden = isRedeem;
    if (fieldPoints) fieldPoints.hidden = !isRedeem;
    if (priceInput) {
      priceInput.required = !isRedeem;
      priceInput.value = isRedeem ? "" : product?.price ?? "";
    }
    if (pointsInput) {
      pointsInput.required = isRedeem;
      pointsInput.value = isRedeem
        ? product?.pointsCost ?? (product?.price ? pointsCostFromPrice(product.price) : "")
        : "";
    }
    if (stockHint) {
      stockHint.textContent = isRedeem
        ? "Cantidad disponible para canjear con Rewards."
        : "Cantidad disponible para la venta en la agenda pública.";
    }

    showError("");
    renderThumbs();
    productModal.hidden = false;
  }

  function closeProductModal() {
    productModal.hidden = true;
    form?.reset();
    draftImages = [];
    editingId = null;
    editingKind = "sale";
    if (fieldPrice) fieldPrice.hidden = false;
    if (fieldPoints) fieldPoints.hidden = true;
    renderThumbs();
  }

  function setActiveTab(tab) {
    activeTab = tab === "redeem" ? "redeem" : "sale";
    document.querySelectorAll("[data-mkt-tab]").forEach((btn) => {
      const active = btn.getAttribute("data-mkt-tab") === activeTab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (saleCatalogPanel) saleCatalogPanel.hidden = activeTab !== "sale";
    if (redeemCatalogPanel) redeemCatalogPanel.hidden = activeTab !== "redeem";
  }

  function renderThumbs() {
    if (!thumbsEl) return;
    if (!draftImages.length) {
      thumbsEl.innerHTML = "";
      if (imagesHint) {
        imagesHint.textContent =
          "Acepta JPG, PNG, WebP, GIF, HEIC, JXL y más. Puedes guardar sin fotos.";
      }
      return;
    }
    if (imagesHint) {
      imagesHint.textContent = `${draftImages.length}/${MAX_IMAGES} imágenes listas para el carrusel`;
    }
    thumbsEl.innerHTML = draftImages
      .map(
        (src, i) => `
      <div class="mkt-thumb">
        <img src="${src}" alt="Foto ${i + 1}" />
        <button type="button" class="mkt-thumb__remove" data-remove-img="${i}" aria-label="Quitar imagen">×</button>
      </div>`
      )
      .join("");
  }

  function renderStats() {
    const products = loadProducts();
    const redeemProducts = loadRedeemProducts();
    const sales = loadSales().filter((s) => isSameMonth(s.createdAt));
    const stockUnits = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
    const redeemStockUnits = redeemProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
    const low = products.filter((p) => (Number(p.stock) || 0) <= LOW_STOCK).length;
    const redeemLow = redeemProducts.filter((p) => (Number(p.stock) || 0) <= LOW_STOCK).length;
    const revenue = sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const unitsSold = sales.reduce((sum, s) => sum + (Number(s.units) || 0), 0);

    const skuEl = document.getElementById("kpi-sku");
    const stockEl = document.getElementById("kpi-stock");
    const stockHint = document.getElementById("kpi-stock-hint");
    const redeemSkuEl = document.getElementById("kpi-redeem-sku");
    const redeemStockEl = document.getElementById("kpi-redeem-stock");
    const redeemStockHint = document.getElementById("kpi-redeem-stock-hint");
    const salesEl = document.getElementById("kpi-sales");
    const salesHint = document.getElementById("kpi-sales-hint");
    const lowEl = document.getElementById("kpi-low");
    const redeemLowEl = document.getElementById("kpi-redeem-low");

    if (skuEl) skuEl.textContent = String(products.length);
    if (stockEl) stockEl.textContent = String(stockUnits);
    if (stockHint) {
      stockHint.textContent =
        products.length === 1 ? "1 referencia en venta" : `${products.length} referencias en venta`;
    }
    if (redeemSkuEl) redeemSkuEl.textContent = String(redeemProducts.length);
    if (redeemStockEl) redeemStockEl.textContent = String(redeemStockUnits);
    if (redeemStockHint) {
      redeemStockHint.textContent =
        redeemProducts.length === 1
          ? "1 referencia para canje"
          : `${redeemProducts.length} referencias para canje`;
    }
    if (salesEl) salesEl.textContent = formatMoney(revenue);
    if (salesHint) {
      salesHint.textContent = `${sales.length} pedido${sales.length === 1 ? "" : "s"} · ${unitsSold} unidad${
        unitsSold === 1 ? "" : "es"
      } · ${monthLabel()}`;
    }
    if (lowEl) lowEl.textContent = String(low);
    if (redeemLowEl) redeemLowEl.textContent = String(redeemLow);
  }

  function carouselHtml(product) {
    const images = product.images?.length ? product.images : [PLACEHOLDER];
    const slides = images
      .map(
        (src, i) =>
          `<img class="mkt-carousel__slide ${i === 0 ? "is-active" : ""}" src="${src}" alt="${escapeHtml(
            product.name
          )} · foto ${i + 1}" data-index="${i}" />`
      )
      .join("");
    const dots =
      images.length > 1
        ? `<div class="mkt-carousel__dots">${images
            .map(
              (_, i) =>
                `<button type="button" class="mkt-carousel__dot ${i === 0 ? "is-active" : ""}" data-dot="${i}" aria-label="Imagen ${i + 1}"></button>`
            )
            .join("")}</div>`
        : "";
    const nav =
      images.length > 1
        ? `<button type="button" class="mkt-carousel__nav mkt-carousel__nav--prev" data-dir="-1" aria-label="Anterior">‹</button>
           <button type="button" class="mkt-carousel__nav mkt-carousel__nav--next" data-dir="1" aria-label="Siguiente">›</button>`
        : "";
    return `<div class="mkt-carousel" data-product-id="${escapeHtml(product.id)}">${slides}${nav}${dots}</div>`;
  }

  function setCarouselIndex(root, index) {
    const slides = [...root.querySelectorAll(".mkt-carousel__slide")];
    const dots = [...root.querySelectorAll(".mkt-carousel__dot")];
    if (!slides.length) return;
    const next = ((index % slides.length) + slides.length) % slides.length;
    slides.forEach((el, i) => el.classList.toggle("is-active", i === next));
    dots.forEach((el, i) => el.classList.toggle("is-active", i === next));
    root.dataset.index = String(next);
  }

  function stockBadge(stock) {
    const n = Number(stock) || 0;
    if (n <= 0) return `<span class="mkt-stock mkt-stock--out">Sin stock</span>`;
    if (n <= LOW_STOCK) return `<span class="mkt-stock mkt-stock--low">${n} en inventario</span>`;
    return `<span class="mkt-stock">${n} en inventario</span>`;
  }

  function productCardHtml(p, kind) {
    const priceLine =
      kind === "redeem"
        ? `<strong class="mkt-product__price">${Number(p.pointsCost) || 0} pts</strong>`
        : `<strong class="mkt-product__price">${formatMoney(p.price)}</strong>`;
    return `
      <article class="mkt-product" data-id="${escapeHtml(p.id)}" data-kind="${kind}">
        ${carouselHtml(p)}
        <div class="mkt-product__body">
          <div class="mkt-product__top">
            <h3>${escapeHtml(p.name)}</h3>
            ${priceLine}
          </div>
          ${stockBadge(p.stock)}
          <p class="mkt-product__desc">${escapeHtml(p.description)}</p>
          <div class="mkt-product__actions">
            <button class="btn btn--primary btn--sm" type="button" data-edit>Editar</button>
            <button class="btn btn--secondary btn--sm" type="button" data-delete>Eliminar</button>
          </div>
        </div>
      </article>`;
  }

  function renderCatalog() {
    const products = loadProducts();
    renderStats();
    if (catalogCount) {
      catalogCount.textContent =
        products.length === 1 ? "1 producto" : `${products.length} productos`;
    }

    if (!grid) return;
    if (!products.length) {
      grid.innerHTML = `
        <div class="mkt-empty">
          <strong>Aún no hay productos en venta</strong>
          <p>Agrega artículos con precio e inventario para la tienda pública.</p>
          <button class="btn btn--primary" type="button" id="btn-empty-add">+ Agregar producto en venta</button>
        </div>`;
      document.getElementById("btn-empty-add")?.addEventListener("click", () => openProductModal("sale"));
      return;
    }

    grid.innerHTML = products.map((p) => productCardHtml(p, "sale")).join("");
  }

  function renderRedeemCatalog() {
    const products = loadRedeemProducts();
    renderStats();
    if (redeemCatalogCount) {
      redeemCatalogCount.textContent =
        products.length === 1 ? "1 producto" : `${products.length} productos`;
    }

    if (!redeemGrid) return;
    if (!products.length) {
      redeemGrid.innerHTML = `
        <div class="mkt-empty">
          <strong>Aún no hay productos para canje</strong>
          <p>Publica artículos con costo en puntos e inventario separado del catálogo de venta.</p>
          <button class="btn btn--primary" type="button" id="btn-empty-add-redeem">+ Agregar producto Rewards</button>
        </div>`;
      document.getElementById("btn-empty-add-redeem")?.addEventListener("click", () =>
        openProductModal("redeem")
      );
      return;
    }

    redeemGrid.innerHTML = products.map((p) => productCardHtml(p, "redeem")).join("");
  }

  function renderAllCatalogs() {
    renderCatalog();
    renderRedeemCatalog();
  }

  document.getElementById("btn-new-product")?.addEventListener("click", () => openProductModal("sale"));
  document.getElementById("btn-new-redeem-product")?.addEventListener("click", () =>
    openProductModal("redeem")
  );
  document.querySelectorAll("[data-mkt-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.getAttribute("data-mkt-tab")));
  });
  document.querySelectorAll("[data-close-product]").forEach((el) => {
    el.addEventListener("click", closeProductModal);
  });

  document.getElementById("btn-pick-images")?.addEventListener("click", (e) => {
    e.preventDefault();
    imagesInput?.click();
  });

  imagesInput?.addEventListener("change", async () => {
    const files = [...(imagesInput.files || [])];
    imagesInput.value = "";
    if (!files.length) return;
    const room = MAX_IMAGES - draftImages.length;
    if (room <= 0) {
      window.AppShell?.toast(`Máximo ${MAX_IMAGES} imágenes`);
      return;
    }

    const pickBtn = document.getElementById("btn-pick-images");
    if (pickBtn) {
      pickBtn.disabled = true;
      pickBtn.textContent = "Subiendo…";
    }

    const selected = files.slice(0, room);
    let added = 0;
    let rejected = 0;

    for (const file of selected) {
      if (!isImageFile(file)) {
        rejected += 1;
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        rejected += 1;
        continue;
      }
      try {
        const dataUrl = await prepareImageDataUrl(file);
        if (!dataUrl) {
          rejected += 1;
          continue;
        }
        draftImages.push(dataUrl);
        added += 1;
      } catch {
        rejected += 1;
      }
    }

    renderThumbs();
    if (pickBtn) {
      pickBtn.disabled = false;
      pickBtn.textContent = "Subir imágenes";
    }

    if (added) {
      window.AppShell?.toast(
        added === 1 ? "1 imagen agregada" : `${added} imágenes agregadas`
      );
    }
    if (rejected) {
      showError(
        "Algunas imágenes no se pudieron procesar (incluye .jxl). Si falla, exporta la foto a JPG/PNG e inténtalo de nuevo."
      );
      window.AppShell?.toast("Algunas fotos no se subieron");
    } else {
      showError("");
    }
  });

  thumbsEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-img]");
    if (!btn) return;
    const idx = Number(btn.getAttribute("data-remove-img"));
    draftImages.splice(idx, 1);
    renderThumbs();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const kind = document.getElementById("product-kind")?.value === "redeem" ? "redeem" : "sale";
    const name = document.getElementById("product-name").value.trim();
    const description = document.getElementById("product-desc").value.trim();
    const price = parsePrice(document.getElementById("product-price").value);
    const pointsCost = Number(document.getElementById("product-points").value);
    const stock = Number(document.getElementById("product-stock").value);
    if (!name || !description) {
      showError("Completa nombre y descripción.");
      return;
    }
    if (kind === "sale") {
      if (!Number.isFinite(price) || price < 0) {
        showError("Ingresa un precio válido (ej. 35000).");
        document.getElementById("product-price")?.focus();
        return;
      }
    } else if (!Number.isFinite(pointsCost) || pointsCost < 1 || !Number.isInteger(pointsCost)) {
      showError("El costo en puntos debe ser un entero ≥ 1.");
      document.getElementById("product-points")?.focus();
      return;
    }
    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
      showError("El inventario debe ser un número entero ≥ 0.");
      return;
    }

    const productId = editingId || uid();
    let images = [...draftImages];
    try {
      if (window.SupabaseData?.enabled?.()) {
        images = await window.SupabaseData.uploadProductImages(images, productId);
      }
    } catch (err) {
      console.warn("[marketplace] upload imágenes", err);
    }

    if (kind === "sale") {
      const list = loadProducts();
      if (editingId) {
        const idx = list.findIndex((p) => p.id === editingId);
        if (idx >= 0) {
          list[idx] = {
            ...list[idx],
            name,
            description,
            price,
            stock,
            images,
            updatedAt: new Date().toISOString(),
          };
        }
      } else {
        list.unshift({
          id: productId,
          name,
          description,
          price,
          stock,
          images,
          createdAt: new Date().toISOString(),
        });
      }
      try {
        saveProducts(list);
      } catch {
        showError("No se pudo guardar. Prueba con menos imágenes o fotos más livianas.");
        return;
      }
    } else {
      const list = loadRedeemProducts();
      if (editingId) {
        const idx = list.findIndex((p) => p.id === editingId);
        if (idx >= 0) {
          list[idx] = {
            ...list[idx],
            name,
            description,
            pointsCost,
            stock,
            images,
            updatedAt: new Date().toISOString(),
          };
        }
      } else {
        list.unshift({
          id: productId,
          name,
          description,
          pointsCost,
          stock,
          images,
          createdAt: new Date().toISOString(),
        });
      }
      try {
        saveRedeemProducts(list);
      } catch {
        showError("No se pudo guardar. Prueba con menos imágenes o fotos más livianas.");
        return;
      }
    }

    closeProductModal();
    renderAllCatalogs();
    window.AppShell?.toast(
      editingId
        ? kind === "redeem"
          ? "Producto canje actualizado"
          : "Producto actualizado"
        : kind === "redeem"
          ? "Producto canje publicado"
          : "Producto publicado"
    );
  });

  function handleCatalogClick(e, kind) {
    const card = e.target.closest(".mkt-product");
    if (!card) return;
    const id = card.getAttribute("data-id");
    const products = kind === "redeem" ? loadRedeemProducts() : loadProducts();
    const product = products.find((p) => p.id === id);

    if (e.target.closest("[data-edit]") && product) {
      openProductModal(kind, product);
      return;
    }
    if (e.target.closest("[data-delete]")) {
      const label = kind === "redeem" ? "producto de canje" : "producto en venta";
      if (!confirm(`¿Eliminar este ${label}?`)) return;
      if (kind === "redeem") saveRedeemProducts(products.filter((p) => p.id !== id));
      else saveProducts(products.filter((p) => p.id !== id));
      renderAllCatalogs();
      window.AppShell?.toast("Producto eliminado");
      return;
    }

    const carousel = e.target.closest(".mkt-carousel");
    if (!carousel) return;
    const current = Number(carousel.dataset.index || 0);
    const dirBtn = e.target.closest("[data-dir]");
    if (dirBtn) {
      setCarouselIndex(carousel, current + Number(dirBtn.getAttribute("data-dir")));
      return;
    }
    const dot = e.target.closest("[data-dot]");
    if (dot) setCarouselIndex(carousel, Number(dot.getAttribute("data-dot")));
  }

  grid?.addEventListener("click", (e) => handleCatalogClick(e, "sale"));
  redeemGrid?.addEventListener("click", (e) => handleCatalogClick(e, "redeem"));

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderAllCatalogs();
  });

  setActiveTab("sale");
  renderAllCatalogs();
})();
