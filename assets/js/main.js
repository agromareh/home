(() => {
  const CONTACT_EMAIL = "agromareh@gmail.com";

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
})();
