/*
 * Canvas de fundo: rede animada de "leads" (nós + conexões).
 * Compartilhado entre a tela de login e o dashboard.
 * Expõe window.initLeadsCanvas(); só age se existir um <canvas id="leads-canvas">.
 */
window.initLeadsCanvas = function initLeadsCanvas() {
  "use strict";
  var canvas = document.getElementById("leads-canvas");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var nodes = [], COUNT = 42, LINK_DIST = 130;

  var resize = function () {
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  var init = function () {
    nodes.length = 0;
    for (var i = 0; i < COUNT; i++) {
      nodes.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.6,
        hue: Math.random() < 0.5 ? "#6A52B3" : "#63C19B",
      });
    }
  };

  var step = function () {
    ctx.clearRect(0, 0, w, h);
    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;
    }
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var a = nodes[i], b = nodes[j];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK_DIST) {
          var alpha = (1 - d / LINK_DIST) * 0.3;
          ctx.strokeStyle = "rgba(106,82,179," + (alpha * 0.55).toFixed(3) + ")";
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    for (var m = 0; m < nodes.length; m++) {
      var p = nodes[m];
      ctx.fillStyle = p.hue;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(step);
  };

  var onResize = function () { resize(); init(); };
  window.addEventListener("resize", onResize);
  resize(); init(); step();
};
