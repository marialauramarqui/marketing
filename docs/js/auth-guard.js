/*
 * Autenticação compartilhada do dashboard (client-side, segurança básica).
 *
 * - Páginas protegidas carregam este script com data-guard="on" no <head>,
 *   ANTES de qualquer conteúdo, para redirecionar à tela de login se a sessão
 *   não for válida (sem flash de conteúdo).
 * - A própria login.html carrega sem data-guard, apenas para reaproveitar os
 *   helpers (VestiAuth.isValid / save) sem disparar o redirect (evita loop).
 */
(function () {
  "use strict";

  var KEY = "vesti.auth.ok";
  var TTL = 1000 * 60 * 60 * 8; // 8 horas

  function isValid() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      return !!(data && data.ts && Date.now() - data.ts < TTL);
    } catch (e) {
      return false;
    }
  }

  function save() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ ts: Date.now() }));
    } catch (e) { /* ignore */ }
  }

  function logout() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    window.location.replace("login.html");
  }

  window.VestiAuth = { KEY: KEY, TTL: TTL, isValid: isValid, save: save, logout: logout };

  // Guard: só nas páginas protegidas (data-guard="on").
  var self = document.currentScript;
  if (self && self.dataset.guard === "on" && !isValid()) {
    window.location.replace("login.html");
  }
})();
