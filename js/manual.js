(function () {
  const ORDER = [
    { id: "intro", label: "Introducción a Gestiónweb.app" },
    { id: "pasos", label: "Pasos para usar Gestiónweb.app" },
    { id: "guardar", label: "Donde guardar las citas" },
    { id: "google", label: "Integración con Google Calendar" },
    { id: "mensajes", label: "Cómo personalizar los mensajes" },
    { id: "respuesta", label: "Cómo maximizar la tasa de respuesta de tus clientes" },
  ];

  const navItems = [...document.querySelectorAll(".manual-nav__item")];
  const articles = [...document.querySelectorAll(".manual-article")];
  const search = document.getElementById("manual-search");
  const layout = document.querySelector(".manual-layout");
  const toggle = document.querySelector(".manual-menu-toggle");
  const prevBtn = document.getElementById("manual-prev");
  const nextBtn = document.getElementById("manual-next");
  let currentId = "intro";

  function showSection(id) {
    currentId = id;
    navItems.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.section === id);
    });
    articles.forEach((article) => {
      article.hidden = article.dataset.article !== id;
    });
    updatePager();
    document.querySelector(".manual-content")?.scrollTo({ top: 0, behavior: "smooth" });
    layout?.classList.remove("nav-open");
    history.replaceState(null, "", `#${id}`);
  }

  function updatePager() {
    const idx = ORDER.findIndex((item) => item.id === currentId);
    const prev = ORDER[idx - 1];
    const next = ORDER[idx + 1];

    if (prev) {
      prevBtn.hidden = false;
      prevBtn.textContent = `< ${prev.label}`;
      prevBtn.onclick = () => showSection(prev.id);
    } else {
      prevBtn.hidden = true;
    }

    if (next) {
      nextBtn.hidden = false;
      nextBtn.textContent = `${next.label} >`;
      nextBtn.onclick = () => showSection(next.id);
    } else {
      nextBtn.hidden = true;
    }
  }

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  function runSearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      articles.forEach((a) => a.classList.remove("is-dimmed"));
      return;
    }

    let firstMatch = null;
    articles.forEach((article) => {
      const text = article.textContent.toLowerCase();
      const match = text.includes(q);
      article.classList.toggle("is-dimmed", !match);
      if (match && !firstMatch) firstMatch = article.dataset.article;
    });
    if (firstMatch) showSection(firstMatch);
  }

  search?.addEventListener("input", () => runSearch(search.value));

  window.addEventListener("keydown", (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "k") {
      e.preventDefault();
      search?.focus();
      search?.select();
    }
  });

  toggle?.addEventListener("click", () => {
    layout?.classList.toggle("nav-open");
  });

  const hash = location.hash.replace("#", "");
  if (hash && ORDER.some((item) => item.id === hash)) {
    showSection(hash);
  } else {
    showSection(currentId);
  }
})();
