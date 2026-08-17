/**
 * Capa de datos + Storage Supabase.
 * Si no hay credenciales, no hace nada (la app sigue en localStorage).
 */
(function () {
  function db() {
    return window.SupabaseClient?.getClient?.() || null;
  }

  function enabled() {
    return !!window.SupabaseClient?.isConfigured?.() && !!db();
  }

  function bookingToRow(b) {
    return {
      id: b.id,
      name: b.name || "Cliente",
      phone: b.phone || "",
      date: b.date,
      time: b.time,
      duration: Number(b.duration) || 60,
      service_name: b.serviceName || "Cita",
      service_id: b.serviceId || "",
      price: b.price ?? 0,
      notes: b.notes || "",
      status: b.status || "pending_confirmation",
      source: b.source || "public",
      business: b.business || "BarberHome",
      calendar_id: b.calendarId || "",
      slug: b.slug || "",
      client_fingerprint: b.clientFingerprint || "",
      google_event_id: b.googleEventId || "",
      meta: {
        countryCode: b.countryCode || "",
        createdAt: b.createdAt || null,
      },
      updated_at: new Date().toISOString(),
    };
  }

  function rowToBooking(r) {
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      date: r.date,
      time: r.time,
      duration: r.duration,
      serviceName: r.service_name,
      serviceId: r.service_id,
      price: Number(r.price) || 0,
      notes: r.notes || "",
      status: r.status,
      source: r.source,
      business: r.business,
      calendarId: r.calendar_id,
      slug: r.slug,
      clientFingerprint: r.client_fingerprint,
      googleEventId: r.google_event_id,
      countryCode: r.meta?.countryCode || "",
      createdAt: r.meta?.createdAt || r.created_at,
    };
  }

  function productToRow(p, kind) {
    return {
      id: p.id,
      name: p.name,
      description: p.description || "",
      kind: kind || p.kind || "sale",
      price: p.price ?? 0,
      points_cost: p.pointsCost ?? 0,
      stock: Number(p.stock) || 0,
      images: Array.isArray(p.images) ? p.images : [],
      active: true,
      updated_at: new Date().toISOString(),
    };
  }

  function rowToProduct(r) {
    return {
      id: r.id,
      name: r.name,
      description: r.description || "",
      kind: r.kind,
      price: Number(r.price) || 0,
      pointsCost: Number(r.points_cost) || 0,
      stock: Number(r.stock) || 0,
      images: Array.isArray(r.images) ? r.images : [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  function clientToRow(u) {
    return {
      id: u.id,
      name: u.name || "",
      doc_type: u.docType || "CC",
      doc_number: u.docNumber || "",
      email: u.email || "",
      phone: u.phone || "",
      email_verified: !!u.emailVerified,
      points: Number(u.points) || 0,
      meta: {
        ledger: Array.isArray(u.ledger) ? u.ledger : [],
        passwordHash: u.passwordHash || null,
        googleSub: u.googleSub || null,
      },
      updated_at: new Date().toISOString(),
    };
  }

  function rowToClient(r) {
    return {
      id: r.id,
      name: r.name,
      docType: r.doc_type || "CC",
      docNumber: r.doc_number || "",
      email: r.email || "",
      phone: r.phone || "",
      emailVerified: !!r.email_verified,
      points: Number(r.points) || 0,
      ledger: Array.isArray(r.meta?.ledger) ? r.meta.ledger : [],
      passwordHash: r.meta?.passwordHash || undefined,
      googleSub: r.meta?.googleSub || undefined,
      createdAt: r.created_at,
    };
  }

  async function upsertCita(booking) {
    const client = db();
    if (!client || !booking?.id) return { ok: false, skipped: true };
    const { error } = await client.from("citas").upsert(bookingToRow(booking), { onConflict: "id" });
    if (error) {
      console.warn("[Supabase] upsert cita", error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  async function fetchCitas() {
    const client = db();
    if (!client) return [];
    const { data, error } = await client
      .from("citas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) {
      console.warn("[Supabase] fetch citas", error.message);
      return [];
    }
    return (data || []).map(rowToBooking);
  }

  async function upsertProducto(product, kind) {
    const client = db();
    if (!client || !product?.id) return { ok: false, skipped: true };
    const { error } = await client
      .from("productos")
      .upsert(productToRow(product, kind), { onConflict: "id" });
    if (error) {
      console.warn("[Supabase] upsert producto", error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  async function fetchProductos(kind) {
    const client = db();
    if (!client) return [];
    let q = client.from("productos").select("*").eq("active", true).order("created_at", { ascending: false });
    if (kind) q = q.eq("kind", kind);
    const { data, error } = await q;
    if (error) {
      console.warn("[Supabase] fetch productos", error.message);
      return [];
    }
    return (data || []).map(rowToProduct);
  }

  async function upsertCliente(user) {
    const client = db();
    if (!client || !user?.id) return { ok: false, skipped: true };
    const { error } = await client.from("clientes").upsert(clientToRow(user), { onConflict: "id" });
    if (error) {
      console.warn("[Supabase] upsert cliente", error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  async function fetchClientes() {
    const client = db();
    if (!client) return [];
    const { data, error } = await client.from("clientes").select("*").order("created_at", { ascending: false });
    if (error) {
      console.warn("[Supabase] fetch clientes", error.message);
      return [];
    }
    return (data || []).map(rowToClient);
  }

  async function insertPunto(entry) {
    const client = db();
    if (!client) return { ok: false, skipped: true };
    const { error } = await client.from("puntos").insert({
      id: entry.id || crypto.randomUUID(),
      cliente_id: entry.userId || null,
      name: entry.name || "",
      doc_type: entry.docType || "",
      doc_number: entry.docNumber || "",
      amount: Number(entry.amount) || 0,
      note: entry.note || "",
      balance: entry.balance ?? null,
      created_at: entry.at || new Date().toISOString(),
    });
    if (error) {
      console.warn("[Supabase] insert punto", error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  async function insertCanje(redeem) {
    const client = db();
    if (!client) return { ok: false, skipped: true };
    const customer = redeem.customer || {};
    const { error } = await client.from("canjes").insert({
      id: redeem.id || crypto.randomUUID(),
      cliente_id: customer.id || null,
      producto_id: redeem.productId || null,
      product_name: redeem.productName || "",
      points_cost: redeem.pointsCost ?? 0,
      value_cop: redeem.valueCop ?? 0,
      customer,
      created_at: redeem.createdAt || new Date().toISOString(),
    });
    if (error) {
      console.warn("[Supabase] insert canje", error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  /** dataURL o Blob → Storage; devuelve URL pública */
  async function uploadImage(bucket, path, dataUrlOrBlob, contentType) {
    const client = db();
    if (!client) return { ok: false, skipped: true };

    let body = dataUrlOrBlob;
    let type = contentType || "image/jpeg";

    if (typeof dataUrlOrBlob === "string" && dataUrlOrBlob.startsWith("data:")) {
      const res = await fetch(dataUrlOrBlob);
      body = await res.blob();
      type = body.type || type;
    }

    const { error } = await client.storage.from(bucket).upload(path, body, {
      contentType: type,
      upsert: true,
      cacheControl: "3600",
    });
    if (error) {
      console.warn("[Supabase] upload", error.message);
      return { ok: false, message: error.message };
    }
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return { ok: true, url: data?.publicUrl || "", path };
  }

  async function uploadProductImages(images, productId) {
    if (!enabled() || !Array.isArray(images) || !images.length) {
      return images || [];
    }
    const out = [];
    for (let i = 0; i < images.length; i += 1) {
      const src = images[i];
      if (!src) continue;
      if (typeof src === "string" && /^https?:\/\//i.test(src) && !src.startsWith("data:")) {
        out.push(src);
        continue;
      }
      const path = `${productId || "tmp"}/${Date.now()}-${i}.jpg`;
      const up = await uploadImage("productos", path, src, "image/jpeg");
      out.push(up.ok && up.url ? up.url : src);
    }
    return out;
  }

  /** Migra datos locales → Supabase (idempotente por id) */
  async function migrateFromLocalStorage() {
    if (!enabled()) return { ok: false, message: "Supabase no configurado" };
    const report = { citas: 0, clientes: 0, productos: 0, errores: [] };

    try {
      const bookings = JSON.parse(localStorage.getItem("barbercloud.bookings") || "[]");
      for (const b of bookings) {
        const r = await upsertCita(b);
        if (r.ok) report.citas += 1;
        else if (r.message) report.errores.push(r.message);
      }
    } catch (e) {
      report.errores.push(String(e?.message || e));
    }

    try {
      const users = JSON.parse(localStorage.getItem("barbercloud.loyalty_users") || "[]");
      for (const u of users) {
        const r = await upsertCliente(u);
        if (r.ok) report.clientes += 1;
      }
    } catch (e) {
      report.errores.push(String(e?.message || e));
    }

    try {
      const sale = JSON.parse(localStorage.getItem("barbercloud.marketplace_products") || "[]");
      for (const p of sale) {
        const images = await uploadProductImages(p.images || [], p.id);
        const r = await upsertProducto({ ...p, images }, "sale");
        if (r.ok) report.productos += 1;
      }
      const redeem = JSON.parse(localStorage.getItem("barbercloud.loyalty_redeem_products") || "[]");
      for (const p of redeem) {
        const images = await uploadProductImages(p.images || [], p.id);
        const r = await upsertProducto({ ...p, images }, "redeem");
        if (r.ok) report.productos += 1;
      }
    } catch (e) {
      report.errores.push(String(e?.message || e));
    }

    return { ok: true, report };
  }

  /** Baja datos remotos y refresca localStorage (caché offline) */
  async function pullToLocalCache() {
    if (!enabled()) return { ok: false, skipped: true };
    const citas = await fetchCitas();
    if (citas.length) {
      localStorage.setItem("barbercloud.bookings", JSON.stringify(citas));
      window.dispatchEvent(new CustomEvent("barbercloud:bookings-changed"));
    }
    const clientes = await fetchClientes();
    if (clientes.length) {
      localStorage.setItem("barbercloud.loyalty_users", JSON.stringify(clientes));
    }
    const sale = await fetchProductos("sale");
    if (sale.length) {
      localStorage.setItem("barbercloud.marketplace_products", JSON.stringify(sale));
    }
    const redeem = await fetchProductos("redeem");
    if (redeem.length) {
      localStorage.setItem(
        "barbercloud.loyalty_redeem_products",
        JSON.stringify(
          redeem.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            pointsCost: p.pointsCost,
            stock: p.stock,
            images: p.images,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          }))
        )
      );
    }
    return { ok: true, citas: citas.length, clientes: clientes.length, productos: sale.length + redeem.length };
  }

  window.SupabaseData = {
    enabled,
    upsertCita,
    fetchCitas,
    upsertProducto,
    fetchProductos,
    upsertCliente,
    fetchClientes,
    insertPunto,
    insertCanje,
    uploadImage,
    uploadProductImages,
    migrateFromLocalStorage,
    pullToLocalCache,
  };
})();
