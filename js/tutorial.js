(function () {
  const STORAGE_KEY = "barbercloud.tutorial";
  const phone = document.getElementById("phone");
  const cc = document.getElementById("cc");
  const btnNext = document.getElementById("btn-next");
  const btnBack = document.getElementById("btn-back");
  const progress = document.getElementById("tutorial-progress");
  const steps = [...document.querySelectorAll("[data-step]")];
  let step = 1;

  function validPhone(value) {
    return String(value || "").replace(/\D/g, "").length >= 7;
  }

  function syncNextEnabled() {
    if (step === 1) btnNext.disabled = !validPhone(phone.value);
    else btnNext.disabled = false;
    btnNext.textContent = step === 3 ? "Ir al panel" : "Siguiente";
  }

  function showStep(n) {
    step = n;
    steps.forEach((el) => {
      el.hidden = Number(el.dataset.step) !== n;
    });
    progress.style.width = `${(n / 3) * 100}%`;
    btnBack.hidden = n === 1;
    if (n === 3) {
      const calendar =
        document.querySelector('input[name="calendar"]:checked')?.value || "native";
      const summary = document.getElementById("tutorial-summary");
      summary.innerHTML = `
        <li><strong>WhatsApp:</strong> ${cc.value} ${phone.value.trim()}</li>
        <li><strong>Calendario:</strong> ${
          calendar === "google" ? "Google Calendar" : "Calendario en BarberCloud"
        }</li>`;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          whatsapp: `${cc.value} ${phone.value.trim()}`,
          calendar,
          completedAt: new Date().toISOString(),
        })
      );
    }
    syncNextEnabled();
  }

  phone?.addEventListener("input", syncNextEnabled);
  btnNext?.addEventListener("click", () => {
    if (step < 3) showStep(step + 1);
    else window.location.href = "index.html";
  });
  btnBack?.addEventListener("click", () => showStep(Math.max(1, step - 1)));

  // Mini-demo dentro del manual
  const manualPhone = document.getElementById("tutorial-phone");
  const manualNext = document.getElementById("tutorial-next");
  if (manualPhone && manualNext) {
    manualPhone.addEventListener("input", () => {
      manualNext.disabled = !validPhone(manualPhone.value);
    });
    manualNext.addEventListener("click", () => {
      window.location.href = "tutorial.html";
    });
  }

  if (phone) showStep(1);
})();
