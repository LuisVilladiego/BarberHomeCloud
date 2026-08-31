/**
 * BarberService — barberos por tenant (negocio_id).
 * Sincroniza con tabla barberos en Supabase cuando está disponible.
 */
(function () {
  const AUTO_KEY = "barbercloud.autoagenda";

  function readAuto() {
    try {
      return JSON.parse(localStorage.getItem(AUTO_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeAuto(auto) {
    localStorage.setItem(AUTO_KEY, JSON.stringify(auto));
  }

  function negocioId() {
    return window.Tenant?.currentId?.() || "";
  }

  function normalizeBarber(raw, index) {
    return {
      id: raw.id || `barber-${index + 1}`,
      negocioId: raw.negocioId || negocioId() || "",
      name: String(raw.name || "").trim(),
      photo: raw.photo || "",
      phone: raw.phone || "",
      bio: raw.bio || "",
      active: raw.active !== false,
      scheduleId: raw.scheduleId || raw.schedule_id || "sch-default",
    };
  }

  function list() {
    const auto = readAuto();
    const barbers = Array.isArray(auto.barbers) ? auto.barbers : [];
    return barbers.map(normalizeBarber);
  }

  function activeBarbers() {
    return list().filter((b) => b.active);
  }

  function saveBarbers(barbers) {
    const auto = readAuto();
    auto.barbers = barbers.map((b, i) => normalizeBarber(b, i));
    writeAuto(auto);
    window.dispatchEvent(new CustomEvent("barbercloud:barbers-changed"));
    syncToCloud(auto.barbers).catch((err) => console.warn("[BarberService] sync", err));
    return auto.barbers;
  }

  async function syncToCloud(barbers) {
    if (!window.SupabaseData?.enabled?.() || !window.SupabaseData.upsertBarbero) return;
    const nid = negocioId();
    if (!nid) return;
    for (const b of barbers) {
      await window.SupabaseData.upsertBarbero({ ...b, negocioId: nid });
    }
  }

  async function pullFromCloud() {
    if (!window.SupabaseData?.fetchBarberos) return list();
    const remote = await window.SupabaseData.fetchBarberos();
    if (!remote.length) return list();
    const auto = readAuto();
    auto.barbers = remote.map((b, i) => normalizeBarber(b, i));
    writeAuto(auto);
    window.dispatchEvent(new CustomEvent("barbercloud:barbers-changed"));
    return auto.barbers;
  }

  function upsert(barber) {
    const current = list();
    const normalized = normalizeBarber(barber, current.length);
    const isNew = !current.some((b) => b.id === normalized.id);
    if (isNew && !canAddMore()) {
      window.AppShell?.toast?.(
        "Alcanzaste el límite de barberos de tu plan. Mejora el plan para agregar más."
      );
      return current;
    }
    const idx = current.findIndex((b) => b.id === normalized.id);
    if (idx >= 0) current[idx] = { ...current[idx], ...normalized };
    else current.push(normalized);
    return saveBarbers(current);
  }

  function createFirstFromOnboarding({ name, phone, scheduleId = "sch-default" }) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const existing = list();
    if (existing.length) return existing[0];
    const barber = {
      id: "barber-1",
      name: trimmed,
      phone: phone || "",
      active: true,
      scheduleId,
    };
    saveBarbers([barber]);
    return barber;
  }

  function countActive() {
    return activeBarbers().length;
  }

  function canAddMore() {
    const plan = window.BusinessModel?.currentPlan?.();
    if (window.BusinessModel?.isWithinLimit) {
      return window.BusinessModel.isWithinLimit("barbers", countActive(), plan);
    }
    const max = plan?.maxBarbers;
    if (max == null) return true;
    return countActive() < max;
  }

  window.BarberService = {
    activeBarbers,
    canAddMore,
    countActive,
    createFirstFromOnboarding,
    list,
    pullFromCloud,
    saveBarbers,
    upsert,
  };

  if (window.SupabaseData?.enabled?.()) {
    window.addEventListener("barbercloud:panel-ready", () => {
      pullFromCloud().catch(() => {});
    }, { once: true });
  }
})();
