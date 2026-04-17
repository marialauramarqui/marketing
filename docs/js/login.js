(() => {
  "use strict";

  // Senha de acesso. Verificação client-side — segurança básica.
  const ACCESS_PASSWORD = "Marketing1961";
  const AUTH_KEY = "vesti.auth.ok";
  const AUTH_TTL_MS = 1000 * 60 * 60 * 8; // 8 horas

  // Se já autenticado e válido, pula direto pro dashboard
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (raw) {
      const { ts } = JSON.parse(raw);
      if (ts && Date.now() - ts < AUTH_TTL_MS) {
        window.location.replace("index.html");
        return;
      }
    }
  } catch (_) { /* ignore */ }

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
      try {
        sessionStorage.setItem(AUTH_KEY, JSON.stringify({ ts: Date.now() }));
      } catch (_) { /* ignore */ }
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

  /* ---------- Canvas: rede de leads (conexões) ---------- */
  const canvas = document.getElementById("leads-canvas");
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nodes = [];
    const COUNT = 42;
    const LINK_DIST = 130;

    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const init = () => {
      nodes.length = 0;
      for (let i = 0; i < COUNT; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: Math.random() * 1.6 + 0.6,
          hue: Math.random() < 0.5 ? "#6A52B3" : "#63C19B",
        });
      }
    };

    const step = () => {
      ctx.clearRect(0, 0, w, h);

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d  = Math.hypot(dx, dy);
          if (d < LINK_DIST) {
            const alpha = (1 - d / LINK_DIST) * 0.35;
            ctx.strokeStyle = `rgba(106,82,179,${(alpha * 0.55).toFixed(3)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        ctx.fillStyle = n.hue;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(step);
    };

    const onResize = () => { resize(); init(); };
    window.addEventListener("resize", onResize);
    resize(); init(); step();
  }
})();
