(() => {
  const CONTACT_EMAIL = "agromareh@gmail.com";
  const THEME_STORAGE_KEY = "agromareh-theme";
  const THEME_COLORS = {
    light: "#eef4ea",
    dark: "#07140f",
  };

  /* -----------------------------------------------------------------------
     Theme Toggle (Light Liquid Glass / Dark Obsidian Glass)
     ----------------------------------------------------------------------- */
  const root = document.documentElement;
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function applyTheme(theme, persist = false) {
    const resolved = theme === "dark" ? "dark" : "light";
    root.dataset.theme = resolved;

    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", THEME_COLORS[resolved]);
    }

    if (themeToggle) {
      const isDark = resolved === "dark";
      themeToggle.setAttribute("aria-pressed", String(isDark));
      themeToggle.setAttribute(
        "aria-label",
        isDark ? "Switch to light mode" : "Switch to dark mode"
      );
      themeToggle.setAttribute(
        "title",
        isDark ? "Switch to light mode" : "Switch to dark mode"
      );
    }

    if (persist) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, resolved);
      } catch {
        // Ignore storage restrictions in private browsing
      }
    }
  }

  function getStoredTheme() {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  const initialTheme =
    root.dataset.theme ||
    getStoredTheme() ||
    (mediaQuery.matches ? "dark" : "light");
  applyTheme(initialTheme, false);

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme, true);
    });
  }

  mediaQuery.addEventListener("change", (event) => {
    if (!getStoredTheme()) {
      applyTheme(event.matches ? "dark" : "light", false);
    }
  });

  /* -----------------------------------------------------------------------
     Contact Modal & Enquiry Form
     ----------------------------------------------------------------------- */
  const modal = document.getElementById("modal");
  const contactForm = document.getElementById("contact-form");

  if (!modal) return;

  let lastTrigger = null;

  function openModal(trigger) {
    lastTrigger = trigger || document.activeElement;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    const firstField = modal.querySelector("input, textarea, button");
    if (firstField) firstField.focus();
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");

    if (lastTrigger && typeof lastTrigger.focus === "function") {
      lastTrigger.focus();
    }
  }

  document.querySelectorAll("[data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => openModal(button));
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) {
      closeModal();
    }
  });

  if (contactForm) {
    contactForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const name = String(form.get("name") || "").trim();
      const organization = String(form.get("organization") || "").trim();
      const email = String(form.get("email") || "").trim();
      const message = String(form.get("message") || "").trim();

      const subject = encodeURIComponent(`AgroMareh website enquiry - ${name}`);
      const body = encodeURIComponent(
        `Name: ${name}\nOrganization: ${organization}\nEmail: ${email}\n\n${message}`
      );

      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    });
  }

  /* -----------------------------------------------------------------------
     QR Barcode Generator (Contact Section)
     ----------------------------------------------------------------------- */
  const qrInput = document.getElementById("qr-input");
  const qrOutput = document.getElementById("qr-output");
  const qrCaptionUrl = document.getElementById("qr-caption-url");
  const qrStatus = document.getElementById("qr-status");
  const qrDownloadPng = document.getElementById("qr-download-png");
  const qrDownloadSvg = document.getElementById("qr-download-svg");
  const qrCopyUrl = document.getElementById("qr-copy-url");
  const qrPresets = document.querySelectorAll("[data-qr-preset]");

  if (qrInput && qrOutput && window.AgroMarehQR) {
    const DEFAULT_URL = "https://home.agromareh.org";
    let currentQr = null;
    let currentValue = DEFAULT_URL;

    function syncPresetState(value) {
      qrPresets.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.qrPreset === value);
      });
    }

    function renderQr(rawValue) {
      const value = (rawValue || "").trim() || DEFAULT_URL;
      try {
        currentQr = window.AgroMarehQR.encode(value);
        currentValue = value;
        qrOutput.innerHTML = window.AgroMarehQR.toSvg(currentQr, {
          quietZone: 4,
          darkColor: "#102d22",
          lightColor: "#ffffff",
          label: `QR code linking to ${value}`,
        });
        if (qrCaptionUrl) qrCaptionUrl.textContent = value;
        if (qrStatus) qrStatus.textContent = "";
        syncPresetState(value);
      } catch (err) {
        if (qrStatus) qrStatus.textContent = err.message || "Unable to encode this URL.";
      }
    }

    qrInput.addEventListener("input", () => renderQr(qrInput.value));

    qrPresets.forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.qrPreset || DEFAULT_URL;
        qrInput.value = target;
        renderQr(target);
      });
    });

    if (qrDownloadSvg) {
      qrDownloadSvg.addEventListener("click", () => {
        if (!currentQr) return;
        const svg = window.AgroMarehQR.toSvg(currentQr, {
          quietZone: 4,
          darkColor: "#102d22",
          lightColor: "#ffffff",
          label: `QR code linking to ${currentValue}`,
        });
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "agromareh-qr.svg";
        link.click();
        URL.revokeObjectURL(url);
      });
    }

    if (qrDownloadPng) {
      qrDownloadPng.addEventListener("click", () => {
        if (!currentQr) return;
        const canvas = document.createElement("canvas");
        window.AgroMarehQR.drawToCanvas(currentQr, canvas, {
          quietZone: 4,
          darkColor: "#102d22",
          lightColor: "#ffffff",
          pixelSize: 1024,
        });
        const link = document.createElement("a");
        link.href = canvas.toDataURL("image/png");
        link.download = "agromareh-qr.png";
        link.click();
      });
    }

    if (qrCopyUrl) {
      qrCopyUrl.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(currentValue);
          if (qrStatus) qrStatus.textContent = "Link copied to clipboard.";
        } catch {
          if (qrStatus) qrStatus.textContent = currentValue;
        }
      });
    }

    renderQr(qrInput.value || DEFAULT_URL);
  }
})();
