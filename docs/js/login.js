(() => {
  "use strict";

  // Senha de acesso. Verificação client-side — segurança básica.
  const ACCESS_PASSWORD = "Marketing1961";

  // Se já autenticado e válido, pula direto pro dashboard
  if (window.VestiAuth && window.VestiAuth.isValid()) {
    window.location.replace("index.html");
    return;
  }

  const form    = document.getElementById("login-form");
  const field   = document.getElementById("field-password");
  const input   = document.getElementById("password");
  const toggle  = document.getElementById("toggle-pw");
  const msg     = document.getElementById("pin-msg");
  const btn     = document.getElementById("btn-enter");

  const setMsg = (text, kind = "") => {
    msg.textContent = text;
    msg.classList.remove("is-error", "is-ok");
    if (kind) msg.classList.add(`is-${kind}`);
  };
  const updateBtn = () => { btn.disabled = input.value.length === 0; };

  input.addEventListener("input", () => {
    field.classList.remove("error");
    setMsg("");
    updateBtn();
  });

  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.setAttribute("aria-pressed", show ? "true" : "false");
    toggle.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
    input.focus();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const pw = input.value;
    if (!pw) return;

    if (pw === ACCESS_PASSWORD) {
      field.classList.remove("error");
      field.classList.add("success");
      setMsg("Acesso liberado. Carregando dashboard…", "ok");
      window.VestiAuth.save();
      setTimeout(() => window.location.replace("index.html"), 520);
    } else {
      field.classList.add("error", "shake");
      setMsg("Senha incorreta. Tente novamente.", "error");
      setTimeout(() => {
        field.classList.remove("shake");
        input.select();
      }, 480);
    }
  });

  // Foco inicial
  window.addEventListener("load", () => input?.focus());

  /* ---------- Canvas de fundo (compartilhado com o dashboard) ---------- */
  if (window.initLeadsCanvas) window.initLeadsCanvas();
})();
