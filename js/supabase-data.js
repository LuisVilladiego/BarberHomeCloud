/**
 * Capa de datos + Storage Supabase.
 * Si no hay credenciales, no hace nada (la app sigue en localStorage).
 */
(function () {
  function db() {
    return window.SupabaseClient?.getClient?.() || null;
  }

  function safeParse(raw, fallback) {
    try {
      return JSON.parse(raw || "") ?? fallback;
    } catch {
      return fallback;
    }
  }

  function enabled() {
    return !!window.SupabaseClient?.isConfigured?.() && !!db();
  }

  function currentNegocioId() {
    try {
      return (
        window.Tenant?.currentId?.() ||
        localStorage.getItem("barbercloud.negocio_id") ||
        ""
      );
    } catch {
      return window.Tenant?.currentId?.() || "";
    }
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
      negocio_id: b.negocioId || currentNegocioId() || null,
      meta: {
        countryCode: b.countryCode || "",
        createdAt: b.createdAt || null,
        lifecycleStatus: b.lifecycleStatus || "",
        confirmationStatus: b.confirmationStatus || "",
        googleSync: b.googleSync || "",
        googleSyncError: b.googleSyncError || "",
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
      negocioId: r.negocio_id,
      clientFingerprint: r.client_fingerprint,
      googleEventId: r.google_event_id,
      countryCode: r.meta?.countryCode || "",
      createdAt: r.meta?.createdAt || r.created_at,
      lifecycleStatus: r.meta?.lifecycleStatus || "",
      confirmationStatus: r.meta?.confirmationStatus || "",
      googleSync: r.meta?.googleSync || (r.google_event_id ? "synced" : ""),
      googleSyncError: r.meta?.googleSyncError || "",
    };
  }

  function isUuid(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(id || "")
    );
  }

  /** Postgres uuid no acepta ids tipo prod-xxxx */
  function ensureUuid(id) {
    const raw = String(id || "").trim();
    if (isUuid(raw)) return raw;
    if (typeof crypto !== "undefined" && crypto.randomUUID && !raw) {
      return crypto.randomUUID();
    }
    let hex = "";
    const src = raw || "anon";
    for (let i = 0; hex.length < 32; i += 1) {
      hex += ((src.charCodeAt(i % src.length) + i * 17) % 256).toString(16).padStart(2, "0");
    }
    hex = hex.slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  function compactImages(images) {
    return (Array.isArray(images) ? images : [])
      .filter((src) => typeof src === "string" && src && !src.startsWith("data:"))
      .slice(0, 8);
  }

  function productToRow(p, kind) {
    return {
      id: ensureUuid(p.id),
      name: p.name,
      description: p.description || "",
      kind: kind || p.kind || "sale",
      price: p.price ?? 0,
      points_cost: p.pointsCost ?? 0,
      stock: Number(p.stock) || 0,
      images: compactImages(p.images),
      active: true,
      negocio_id: p.negocioId || currentNegocioId() || null,
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
      negocioId: r.negocio_id,
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
      negocio_id: u.negocioId || currentNegocioId() || null,
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
      negocioId: r.negocio_id,
    };
  }

  async function upsertCita(booking) {
    const client = db();
    if (!client || !booking?.id) return { ok: false, skipped: true };
    const row = bookingToRow(booking);
    const { data: authData } = await client.auth.getSession();
    const table = client.from("citas");
    const query = authData?.session
      ? table.upsert(row, { onConflict: "id" })
      : table.insert(row);
    const { error } = await query;
    if (error) {
      console.warn("[Supabase] upsert cita", error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  /**
   * Con strict, un fallo lanza en vez de devolver []. Lo necesitan los llamadores
   * que reemplazan la caché local: si no distinguen "vacío" de "falló", un error
   * de red les borraría los datos del barbero.
   */
  async function fetchCitas(options = {}) {
    const client = db();
    if (!client) return [];
    let q = client.from("citas").select("*").order("created_at", { ascending: false }).limit(2000);
    const nid = currentNegocioId();
    if (nid) q = q.eq("negocio_id", nid);
    const { data, error } = await q;
    if (error) {
      console.warn("[Supabase] fetch citas", error.message);
      if (options.strict) throw new Error(error.message);
      return [];
    }
    return (data || []).map(rowToBooking);
  }

  async function upsertProducto(product, kind) {
    const client = db();
    if (!client || !product?.id) return { ok: false, skipped: true };
    let images = Array.isArray(product.images) ? product.images : [];
    try {
      images = await uploadProductImages(images, ensureUuid(product.id));
    } catch (err) {
      console.warn("[Supabase] imágenes producto", err);
    }
    const row = productToRow({ ...product, images }, kind);
    const { error } = await client.from("productos").upsert(row, { onConflict: "id" });
    if (error) {
      console.warn("[Supabase] upsert producto", error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true, id: row.id };
  }

  async function fetchProductos(kind, options = {}) {
    const client = db();
    if (!client) return [];
    let q = client.from("productos").select("*").eq("active", true).order("created_at", { ascending: false });
    if (kind) q = q.eq("kind", kind);
    const nid = currentNegocioId();
    if (nid) q = q.eq("negocio_id", nid);
    const { data, error } = await q;
    if (error) {
      console.warn("[Supabase] fetch productos", error.message);
      if (options.strict) throw new Error(error.message);
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

  async function fetchClientes(options = {}) {
    const client = db();
    if (!client) return [];
    let q = client.from("clientes").select("*").order("created_at", { ascending: false });
    const nid = currentNegocioId();
    if (nid) q = q.eq("negocio_id", nid);
    const { data, error } = await q;
    if (error) {
      console.warn("[Supabase] fetch clientes", error.message);
      if (options.strict) throw new Error(error.message);
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
      negocio_id: entry.negocioId || currentNegocioId() || null,
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
      negocio_id: redeem.negocioId || currentNegocioId() || null,
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
    const report = {
      citas: 0,
      clientes: 0,
      productos: 0,
      locales: { citas: 0, clientes: 0, productos: 0 },
      errores: [],
    };

    try {
      const bookings = JSON.parse(localStorage.getItem("barbercloud.bookings") || "[]");
      report.locales.citas = Array.isArray(bookings) ? bookings.length : 0;
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
      report.locales.clientes = Array.isArray(users) ? users.length : 0;
      for (const u of users) {
        const r = await upsertCliente(u);
        if (r.ok) report.clientes += 1;
        else if (r.message) report.errores.push(r.message);
      }
    } catch (e) {
      report.errores.push(String(e?.message || e));
    }

    try {
      const sale = JSON.parse(localStorage.getItem("barbercloud.marketplace_products") || "[]");
      const redeem = JSON.parse(localStorage.getItem("barbercloud.loyalty_redeem_products") || "[]");
      report.locales.productos =
        (Array.isArray(sale) ? sale.length : 0) + (Array.isArray(redeem) ? redeem.length : 0);
      for (const p of sale) {
        const r = await upsertProducto(p, "sale");
        if (r.ok) report.productos += 1;
        else if (r.message) report.errores.push(r.message);
      }
      for (const p of redeem) {
        const r = await upsertProducto(p, "redeem");
        if (r.ok) report.productos += 1;
        else if (r.message) report.errores.push(r.message);
      }
    } catch (e) {
      report.errores.push(String(e?.message || e));
    }

    return { ok: true, report };
  }

  /** Baja citas de Supabase; con replace=true sustituye la caché local (no fusiona). */
  async function syncCitasFromCloud(options = {}) {
    if (!enabled()) return { ok: false, skipped: true, changed: false };
    const replace = !!options.replace;
    const remote = await fetchCitas({ strict: replace });

    let merged;
    if (replace) {
      merged = (Array.isArray(remote) ? remote : []).filter((b) => b?.id && !b?.occupancyOnly);
    } else {
      const localRaw = safeParse(localStorage.getItem("barbercloud.bookings"), []);
      const local = Array.isArray(localRaw) ? localRaw.filter((b) => !b?.occupancyOnly) : [];
      const byId = new Map(local.map((b) => [b.id, b]));
      remote.forEach((b) => {
        if (!b?.id) return;
        byId.set(b.id, b);
      });
      merged = Array.from(byId.values());
    }

    merged.sort((a, b) => {
      const ta = new Date(b.createdAt || b.date || 0).getTime();
      const tb = new Date(a.createdAt || a.date || 0).getTime();
      return ta - tb;
    });

    const nextJson = JSON.stringify(merged);
    const prevJson = localStorage.getItem("barbercloud.bookings") || "";
    const changed = nextJson !== prevJson || !!options.force;

    if (changed) {
      localStorage.setItem("barbercloud.bookings", nextJson);
      window.BookingStore?.notifyExternalUpdate?.();
    }

    return { ok: true, changed, count: merged.length };
  }

  let citasLiveStop = null;

  /** Polling + Realtime de Supabase para refrescar citas en el panel admin. */
  function startCitasLiveSync(options = {}) {
    if (citasLiveStop) citasLiveStop();
    const intervalMs = Number(options.intervalMs) || 4000;
    const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    let pollId = null;
    let channel = null;
    let stopped = false;

    const runSync = async (force = false) => {
      if (stopped) return;
      try {
        const res = await syncCitasFromCloud({ force });
        if (res.changed) onChange(res);
      } catch (err) {
        console.warn("[Supabase] sync citas", err);
      }
    };

    runSync(true);

    pollId = setInterval(() => runSync(false), intervalMs);

    const client = db();
    const nid = currentNegocioId();
    if (client && nid) {
      try {
        channel = client
          .channel(`citas-live-${nid}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "citas",
              filter: `negocio_id=eq.${nid}`,
            },
            () => runSync(true)
          )
          .subscribe();
      } catch (err) {
        console.warn("[Supabase] realtime citas", err);
      }
    }

    citasLiveStop = () => {
      stopped = true;
      if (pollId) clearInterval(pollId);
      if (channel && client) client.removeChannel(channel).catch(() => {});
      citasLiveStop = null;
    };

    return citasLiveStop;
  }

  function stopCitasLiveSync() {
    if (citasLiveStop) citasLiveStop();
  }

  /** Baja datos remotos y refresca localStorage (caché offline) */
  async function pullToLocalCache(options = {}) {
    if (!enabled()) return { ok: false, skipped: true };
    const replace = !!options.replace;

    // Cada bloque falla por separado: un error de red no debe vaciar la caché.
    let citas = 0;
    try {
      const citasRes = await syncCitasFromCloud({ replace, force: replace });
      citas = citasRes.count || 0;
    } catch (err) {
      console.warn("[Supabase] pull citas", err.message);
    }

    let clientes = 0;
    try {
      const rows = await fetchClientes({ strict: replace });
      localStorage.setItem("barbercloud.loyalty_users", JSON.stringify(rows));
      clientes = rows.length;
    } catch (err) {
      console.warn("[Supabase] pull clientes", err.message);
    }

    let productos = 0;
    try {
      const sale = await fetchProductos("sale", { strict: replace });
      localStorage.setItem("barbercloud.marketplace_products", JSON.stringify(sale));
      const redeem = await fetchProductos("redeem", { strict: replace });
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
            negocioId: p.negocioId,
          }))
        )
      );
      productos = sale.length + redeem.length;
    } catch (err) {
      console.warn("[Supabase] pull productos", err.message);
    }

    return { ok: true, citas, clientes, productos };
  }

  async function fetchOwnNegocio() {
    const client = db();
    if (!client) return null;
    const { data: sessionData } = await client.auth.getUser();
    const uid = sessionData?.user?.id;
    if (!uid) return null;
    const { data, error } = await client
      .from("negocios")
      .select("*")
      .eq("owner_id", uid)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) {
      console.warn("[Supabase] fetch own negocio", error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) window.Tenant?.setCurrent?.(row);
    return row || null;
  }

  async function fetchNegocioBySlug(slug) {
    const client = db();
    if (!client || !slug) return null;
    const { data, error } = await client.from("negocios").select("*").eq("slug", slug).maybeSingle();
    if (error) {
      console.warn("[Supabase] fetch negocio", error.message);
      return undefined;
    }
    return data || null;
  }

  async function slugAvailability(slug, excludeId) {
    const client = db();
    if (!client) return { ok: true, available: true, skipped: true };
    const { data, error } = await client.from("negocios").select("id").eq("slug", slug).maybeSingle();
    if (error) {
      return { ok: false, available: false, message: error.message };
    }
    if (!data?.id) return { ok: true, available: true };
    if (excludeId && data.id === excludeId) return { ok: true, available: true, own: true };
    return { ok: true, available: false };
  }

  async function upsertNegocio(payload) {
    const client = db();
    if (!client) return { ok: false, skipped: true };
    const row = {
      id: payload.id,
      slug: payload.slug,
      name: payload.name || "",
      autoagenda: payload.autoagenda || {},
      updated_at: new Date().toISOString(),
    };
    if (payload.subscription_status) row.subscription_status = payload.subscription_status;
    if (payload.plan_id) row.plan_id = payload.plan_id;
    if (payload.owner_id) row.owner_id = payload.owner_id;
    if (payload.whatsapp != null) row.whatsapp = payload.whatsapp;
    if (payload.onboarding_completed != null) row.onboarding_completed = payload.onboarding_completed;
    if (!row.id) delete row.id;
    let query;
    if (row.id) {
      query = client.from("negocios").upsert(row, { onConflict: "id" }).select().maybeSingle();
    } else {
      query = client.from("negocios").insert(row).select().maybeSingle();
    }
    const { data, error } = await query;
    if (error) {
      console.warn("[Supabase] upsert negocio", error.message);
      return { ok: false, message: error.message };
    }
    if (data) window.Tenant?.setCurrent?.(data);
    return { ok: true, negocio: data };
  }

  async function fetchOcupacion(slug) {
    const client = db();
    if (!client || !slug) return [];
    const { data, error } = await client.rpc("ocupacion_por_slug", { p_slug: slug });
    if (error) {
      console.warn("[Supabase] ocupacion", error.message);
      return [];
    }
    return Array.isArray(data) ? data : [];
  }

  async function fetchProductosPorSlug(slug, kind) {
    const client = db();
    if (!client || !slug) return [];
    const { data, error } = await client.rpc("productos_por_slug", {
      p_slug: slug,
      p_kind: kind || null,
    });
    if (error) {
      console.warn("[Supabase] productos slug", error.message);
      return [];
    }
    return (data || []).map(rowToProduct);
  }

  async function countCitasMes(negocioId) {
    const client = db();
    const nid = negocioId || currentNegocioId();
    if (!client || !nid) return null;
    const { data, error } = await client.rpc("negocio_citas_mes", { p_negocio: nid });
    if (error) {
      console.warn("[Supabase] count citas mes", error.message);
      return null;
    }
    return typeof data === "number" ? data : Number(data) || 0;
  }

  async function countClientes(negocioId) {
    const client = db();
    const nid = negocioId || currentNegocioId();
    if (!client || !nid) return null;
    const { data, error } = await client.rpc("negocio_clientes_total", { p_negocio: nid });
    if (error) {
      const { count, error: countErr } = await client
        .from("clientes")
        .select("id", { count: "exact", head: true })
        .eq("negocio_id", nid);
      if (countErr) {
        console.warn("[Supabase] count clientes", countErr.message);
        return null;
      }
      return count ?? 0;
    }
    return typeof data === "number" ? data : Number(data) || 0;
  }

  function barberToRow(b) {
    return {
      id: ensureUuid(b.id),
      negocio_id: b.negocioId || currentNegocioId() || null,
      name: b.name || "",
      photo: b.photo || "",
      phone: b.phone || "",
      bio: b.bio || "",
      active: b.active !== false,
      schedule: b.schedule || {},
      meta: { scheduleId: b.scheduleId || "sch-default" },
      updated_at: new Date().toISOString(),
    };
  }

  function rowToBarber(r) {
    return {
      id: r.id,
      negocioId: r.negocio_id,
      name: r.name,
      photo: r.photo || "",
      phone: r.phone || "",
      bio: r.bio || "",
      active: r.active !== false,
      schedule: r.schedule || {},
      scheduleId: r.meta?.scheduleId || "sch-default",
    };
  }

  async function fetchBarberos(options = {}) {
    const client = db();
    if (!client) return [];
    const nid = options.negocioId || currentNegocioId();
    if (!nid) return [];
    let q = client.from("barberos").select("*").eq("negocio_id", nid).order("created_at");
    if (options.activeOnly) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) {
      console.warn("[Supabase] fetch barberos", error.message);
      if (options.strict) throw new Error(error.message);
      return [];
    }
    return (data || []).map(rowToBarber);
  }

  async function upsertBarbero(barber) {
    const client = db();
    if (!client || !barber?.name) return { ok: false, skipped: true };
    const row = barberToRow(barber);
    const { error } = await client.from("barberos").upsert(row, { onConflict: "id" });
    if (error) {
      console.warn("[Supabase] upsert barbero", error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true, id: row.id };
  }

  async function fetchMembershipRole(negocioId) {
    const client = db();
    if (!client) return null;
    const { data: sessionData } = await client.auth.getUser();
    const uid = sessionData?.user?.id;
    if (!uid) return null;
    const nid = negocioId || currentNegocioId();
    if (!nid) return null;
    const { data, error } = await client
      .from("negocio_miembros")
      .select("role")
      .eq("negocio_id", nid)
      .eq("user_id", uid)
      .maybeSingle();
    if (!error && data?.role) {
      return window.BusinessModel?.normalizeRole?.(data.role) || data.role;
    }
    const negocio = await fetchOwnNegocio();
    if (negocio?.owner_id === uid) return "owner";
    return null;
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
    syncCitasFromCloud,
    startCitasLiveSync,
    stopCitasLiveSync,
    fetchOwnNegocio,
    fetchNegocioBySlug,
    slugAvailability,
    upsertNegocio,
    fetchOcupacion,
    fetchProductosPorSlug,
    countCitasMes,
    countClientes,
    fetchBarberos,
    upsertBarbero,
    fetchMembershipRole,
  };
})();
