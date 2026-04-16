window.KPIs = (function () {
  let perfisRef = [];
  let sqlPerfisRef = [];

  function init(data) {
    perfisRef = data.perfis.slice();
    sqlPerfisRef = data.sql_perfis.slice();
  }

  function render(filteredLeads) {
    const counts = {};
    perfisRef.forEach(p => counts[p] = 0);
    let totalSql = 0;
    for (const l of filteredLeads) {
      if (!l.perfil) continue;
      counts[l.perfil] = (counts[l.perfil] || 0) + 1;
      if (sqlPerfisRef.includes(l.perfil)) totalSql++;
    }
    const total = filteredLeads.length;
    const pct = total > 0 ? (100 * totalSql / total) : 0;

    document.getElementById('sql-total').textContent = totalSql.toLocaleString('pt-BR');
    document.getElementById('sql-pct').textContent = `${pct.toFixed(1)}% da base`;
    document.getElementById('sql-breakdown').textContent =
      `Starter + Pro + Qualificado (sem faixa) · base atual: ${total.toLocaleString('pt-BR')} leads`;

    const container = document.getElementById('kpis');
    const ordered = perfisRef.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    container.innerHTML = ordered.map(p => {
      const isSql = sqlPerfisRef.includes(p);
      return `
        <div class="kpi ${isSql ? 'is-sql' : ''}">
          <span class="kpi-label">${escapeHtml(p)}</span>
          <span class="kpi-value">${(counts[p] || 0).toLocaleString('pt-BR')}</span>
        </div>`;
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  return { init, render };
})();
