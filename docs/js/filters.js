window.Filters = (function () {
  const state = { origem: '', perfil: '' };
  const listeners = [];

  function populate(selectEl, values, placeholder) {
    selectEl.innerHTML = `<option value="">${placeholder}</option>` +
      values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function init(data) {
    const origemSel = document.getElementById('filter-origem');
    const perfilSel = document.getElementById('filter-perfil');
    const clearBtn = document.getElementById('filter-clear');

    populate(origemSel, data.origens, 'Todas');
    populate(perfilSel, data.perfis, 'Todos');

    origemSel.addEventListener('change', e => { state.origem = e.target.value; emit(); });
    perfilSel.addEventListener('change', e => { state.perfil = e.target.value; emit(); });
    clearBtn.addEventListener('click', () => {
      state.origem = ''; state.perfil = '';
      origemSel.value = ''; perfilSel.value = '';
      emit();
    });
  }

  function apply(leads) {
    return leads.filter(l => {
      if (state.origem && l.origem !== state.origem) return false;
      if (state.perfil && l.perfil !== state.perfil) return false;
      return true;
    });
  }

  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(fn => fn(state)); }
  function get() { return { ...state }; }

  return { init, apply, onChange, get };
})();
