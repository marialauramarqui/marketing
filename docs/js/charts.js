window.Charts = (function () {
  let origemSqlChart = null;
  let perfilDistChart = null;
  let sqlPerfisRef = [];

  const PALETTE = [
    '#ff5a8a', '#7c5cff', '#2ecc71', '#f1c40f', '#3498db',
    '#e67e22', '#1abc9c', '#9b59b6', '#e74c3c', '#34495e',
  ];

  Chart.defaults.color = '#8b93a7';
  Chart.defaults.borderColor = '#2a2f3a';
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto';

  function init(data) {
    sqlPerfisRef = data.sql_perfis.slice();
  }

  function render(filteredLeads) {
    renderOrigemSql(filteredLeads);
    renderPerfilDist(filteredLeads);
  }

  function renderOrigemSql(leads) {
    const counts = {};
    for (const l of leads) {
      if (!sqlPerfisRef.includes(l.perfil)) continue;
      const o = l.origem || '(sem origem)';
      counts[o] = (counts[o] || 0) + 1;
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);

    const ctx = document.getElementById('chart-origem-sql').getContext('2d');
    if (origemSqlChart) origemSqlChart.destroy();
    origemSqlChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'SQLs',
          data: values,
          backgroundColor: '#ff5a8a',
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  function renderPerfilDist(leads) {
    const counts = {};
    for (const l of leads) {
      if (!l.perfil) continue;
      counts[l.perfil] = (counts[l.perfil] || 0) + 1;
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

    const ctx = document.getElementById('chart-perfil-dist').getContext('2d');
    if (perfilDistChart) perfilDistChart.destroy();
    perfilDistChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } },
        },
      },
    });
  }

  return { init, render };
})();
