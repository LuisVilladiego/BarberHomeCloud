/**
 * BarberService — barberos por tenant (negocio_id).
 * Persistencia local en autoagenda.barbers; Supabase vía tabla barberos cuando exista.
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
    return auto.barbers;
  }

  function upsert(barber) {
    const current = list();
    const normalized = normalizeBarber(barber, current.length);
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
    saveBarbers,
    upsert,
  };
})();
