/** Parseo de sesión Supabase en localStorage (storageKey: barbercloud.auth). */
(function () {
  const ADMIN_EMAIL = "adminbarbercloud@gmail.com";

  function parseSession(raw) {
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;

      const token =
        data.access_token ||
        data.currentSession?.access_token ||
        data.session?.access_token ||
        "";

      const email = String(
        data.user?.email || data.currentSession?.user?.email || data.session?.user?.email || ""
      )
        .trim()
        .toLowerCase();

      if (!token || !email) return null;
      return { email, token };
    } catch {
      return null;
    }
  }

  function readAdminSession() {
    const session = parseSession(localStorage.getItem("barbercloud.auth"));
    if (!session || session.email !== ADMIN_EMAIL) return null;
    return session;
  }

  window.AdminSession = {
    ADMIN_EMAIL,
    parseSession,
    readAdminSession,
  };
})();
