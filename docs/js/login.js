(() => {
  "use strict";

  // Senha de acesso (6 dígitos). Verificação client-side — segurança básica.
  const ACCESS_PIN = "196148";
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

  const form   = document.getElementById("pin-form");
  const inputs = Array.from(document.querySelectorAll("#pin-inputs input"));
  const wrap   = document.getElementById("pin-inputs");
  const msg    = document.getElementById("pin-msg");
  const btn    = document.getElementById("btn-enter");

  const getPin = () => inputs.map(i => i.value).join("");
  const setMsg = (text, kind = "") => {
    msg.textContent = text;
    msg.classList.remove("is-error", "is-ok");
    if (kind) msg.classList.add(`is-${kind}`);
  };
  const updateBtn = () => { btn.disabled = getPin().length !== inputs.length; };
  const clearAll = () => {
    inputs.forEach(i => { i.value = ""; i.classList.remove("filled"); });
    updateBtn();
  };

  inputs.forEach((input, idx) => {
    input.addEventListener("input", (e) => {
      const v = input.value.replace(/\D/g, "").slice(-1);
      input.value = v;
      input.classList.toggle("filled", !!v);
      wrap.classList.remove("error");
      setMsg("");
      if (v && idx < inputs.length - 1) inputs[idx + 1].focus();
      updateBtn();
      if (getPin().length === inputs.length) form.requestSubmit();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && idx > 0) {
        inputs[idx - 1].focus();
        inputs[idx - 1].value = "";
        inputs[idx - 1].classList.remove("filled");
        updateBtn();
        e.preventDefault();
      }
      if (e.key === "ArrowLeft"  && idx > 0)                inputs[idx - 1].focus();
      if (e.key === "ArrowRight" && idx < inputs.length - 1) inputs[idx + 1].focus();
    });

    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const digits = (e.clipboardData || window.clipboardData).getData("text")
        .replace(/\D/g, "").slice(0, inputs.length);
      if (!digits) return;
      digits.split("").forEach((d, i) => {
        inputs[i].value = d;
        inputs[i].classList.add("filled");
      });
      const next = Math.min(digits.length, inputs.length - 1);
      inputs[next].focus();
      updateBtn();
      if (getPin().length === inputs.length) form.requestSubmit();
    });

    input.addEventListener("focus", () => input.select());
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const pin = getPin();
    if (pin.length !== inputs.length) return;

    if (pin === ACCESS_PIN) {
      wrap.classList.remove("error");
      wrap.classList.add("success");
      setMsg("Acesso liberado. Carregando dashboard…", "ok");
      try {
        sessionStorage.setItem(AUTH_KEY, JSON.stringify({ ts: Date.now() }));
      } catch (_) { /* ignore */ }
      setTimeout(() => window.location.replace("index.html"), 520);
    } else {
      wrap.classList.add("error", "shake");
      setMsg("Código incorreto. Tente novamente.", "error");
      setTimeout(() => {
        wrap.classList.remove("shake");
        clearAll();
        inputs[0].focus();
      }, 480);
    }
  });

  // Foco inicial
  window.addEventListener("load", () => inputs[0]?.focus());

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
          hue: Math.random() < 0.5 ? "#ff5a8a" : "#7c5cff",
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
            ctx.strokeStyle = `rgba(180,150,255,${alpha.toFixed(3)})`;
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
