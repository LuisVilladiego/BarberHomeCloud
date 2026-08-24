(function () {
  const STORAGE_KEY = "barbercloud_feedback";
  const form = document.getElementById("feedback-form");
  const input = document.getElementById("feedback-message");
  const nameEl = document.getElementById("feedback-name");

  const userName =
    (() => {
      try {
        const s = JSON.parse(localStorage.getItem("barbercloud_settings") || "{}");
        if (s.name && String(s.name).trim().toLowerCase() !== "luis villadiego") {
          return s.name.trim().split(/\s+/)[0];
        }
      } catch {
        /* ignore */
      }
      return document.querySelector(".user__name")?.textContent?.trim().split(/\s+/)[0] || "tú";
    })();
  if (nameEl) {
    nameEl.textContent = userName.charAt(0).toUpperCase() + userName.slice(1).toLowerCase();
  }

  try {
    const s = JSON.parse(localStorage.getItem("barbercloud_settings") || "{}");
    if (s.name && String(s.name).trim().toLowerCase() !== "luis villadiego") {
      document.querySelectorAll(".user__name").forEach((el) => {
        el.textContent = s.name;
      });
      document.querySelectorAll(".user__avatar").forEach((el) => {
        el.textContent = (s.name.trim()[0] || "I").toUpperCase();
      });
    }
  } catch {
    /* ignore */
  }

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = input?.value.trim() || "";
    if (!message) {
      window.AppShell?.toast("Escribe tu feedback antes de enviar.");
      return;
    }

    const entry = {
      id: crypto.randomUUID?.() || String(Date.now()),
      message,
      createdAt: new Date().toISOString(),
    };

    try {
      const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      prev.unshift(entry);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prev.slice(0, 50)));
    } catch {
      /* ignore quota */
    }

    input.value = "";
    window.AppShell?.toast("¡Gracias! Tu feedback se guardó.");
  });
})();
