/* global React, ReactDOM, Recharts */
(() => {
  "use strict";

  const { useState, useEffect, useMemo, useRef, useCallback } = React;
  const {
    ResponsiveContainer,
    AreaChart, Area,
    BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    Legend,
  } = Recharts;

  // --------------------------- constants ---------------------------
  const AUTH_KEY = "vesti.auth.ok";
  const SQL_PERFIS = ["Pro", "Starter", "Qualificado (Sem Faixa)"];
  const MONTH_LABELS_FULL = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
  ];
  const MONTH_LABELS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  // --------------------------- utils ---------------------------
  function parseLeadDate(s) {
    if (!s) return null;
    const parts = String(s).trim().split(/\s+/);
    const [dd, mm, yyyy] = (parts[0] || "").split("/");
    if (!dd || !mm || !yyyy) return null;
    const time = parts[1] || "00:00:00";
    const iso = `${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}T${time}`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  function weekOfMonth(d) {
    return Math.floor((d.getDate() - 1) / 7) + 1;
  }

  function fmtNumber(n) {
    return (n || 0).toLocaleString("pt-BR");
  }

  function isSqlLead(lead) {
    return SQL_PERFIS.includes(lead.perfil);
  }

  // --------------------------- UI primitives ---------------------------
  function Chevron({ open }) {
    return (
      <svg viewBox="0 0 20 20" width="14" height="14"
           className={`transition-transform ${open ? "rotate-180" : ""} text-slate-400`}>
        <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }

  function useClickOutside(ref, onOutside) {
    useEffect(() => {
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, [ref, onOutside]);
  }

  function MultiSelect({ label, options, selected, onChange, placeholder = "Todas" }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useClickOutside(ref, () => setOpen(false));

    const allSelected = options.length > 0 && selected.length === options.length;
    const noneSelected = selected.length === 0;
    const summary =
      noneSelected || allSelected ? placeholder
      : selected.length === 1 ? selected[0]
      : `${selected.length} selecionadas`;

    const toggle = (opt) => {
      onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
    };
    const toggleAll = () => onChange(allSelected ? [] : [...options]);

    return (
      <div className="relative" ref={ref}>
        <label className="block text-[11px] uppercase tracking-[1.2px] text-slate-400 mb-1.5">
          {label}
        </label>
        <button type="button" onClick={() => setOpen(o => !o)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-pink/50 focus:outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20 transition">
          <span className={noneSelected || allSelected ? "text-slate-400" : "text-white"}>
            {summary}
          </span>
          <Chevron open={open} />
        </button>
        {open && (
          <div className="absolute left-0 right-0 z-50 mt-1.5 bg-[#1a1d26]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden">
            <label className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-white/5 cursor-pointer border-b border-white/5">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span className="text-sm font-medium text-white">Selecionar todas</span>
            </label>
            <div className="max-h-60 overflow-y-auto py-1">
              {options.map(opt => (
                <label key={opt}
                  className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/5 cursor-pointer">
                  <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
                  <span className="text-sm text-slate-200">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function SingleSelect({ label, options, value, onChange, placeholder = "Todos" }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useClickOutside(ref, () => setOpen(false));

    const current = options.find(o => o.value === value);
    const display = current ? current.label : placeholder;
    const isDefault = value === null || value === undefined || value === "";

    return (
      <div className="relative" ref={ref}>
        <label className="block text-[11px] uppercase tracking-[1.2px] text-slate-400 mb-1.5">
          {label}
        </label>
        <button type="button" onClick={() => setOpen(o => !o)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-pink/50 focus:outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20 transition">
          <span className={isDefault ? "text-slate-400" : "text-white"}>{display}</span>
          <Chevron open={open} />
        </button>
        {open && (
          <div className="absolute left-0 right-0 z-50 mt-1.5 bg-[#1a1d26]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto py-1">
            <button type="button" onClick={() => { onChange(null); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2 text-sm hover:bg-white/5 ${isDefault ? "text-brand-pink" : "text-slate-200"}`}>
              {placeholder}
            </button>
            {options.map(o => (
              <button key={String(o.value)} type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2 text-sm hover:bg-white/5 ${o.value === value ? "text-brand-pink" : "text-slate-200"}`}>
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --------------------------- Header ---------------------------
  function Header({ total, updatedAt }) {
    const logout = () => {
      try { sessionStorage.removeItem(AUTH_KEY); } catch (_) {}
      window.location.replace("login.html");
    };
    return (
      <header className="flex items-center justify-between px-6 lg:px-10 py-5 border-b border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="relative inline-grid place-items-center w-9 h-9">
            <span className="w-4 h-4 rounded-full shadow-[0_0_22px_rgba(255,90,138,.55),0_0_40px_rgba(124,92,255,.45)]"
                  style={{ background: "linear-gradient(135deg,#ff5a8a,#7c5cff)" }} />
            <span className="absolute inset-0 rounded-full border border-white/10 animate-[pulse_2.6s_ease-out_infinite]" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[17px] font-bold tracking-wide"
                  style={{ background:"linear-gradient(120deg,#fff 0%,#ffd4e1 60%,#cfc0ff 100%)",
                           WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>
              Vesti
            </span>
            <span className="text-[10.5px] uppercase tracking-[1.6px] text-slate-400">Marketing · Leads</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end text-right">
            <span className="text-xs text-slate-400">
              {total != null
                ? <>Base atual · <span className="text-white font-medium">{fmtNumber(total)}</span> leads</>
                : "Carregando…"}
            </span>
            {updatedAt && (
              <span className="text-[11px] text-slate-500">
                Atualizado em {new Date(updatedAt).toLocaleString("pt-BR")}
              </span>
            )}
          </div>
          <button onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs text-slate-300 border border-white/10 rounded-lg px-3 py-2 hover:text-white hover:border-brand-pink hover:bg-brand-pink/10 transition"
            title="Encerrar sessão">
            <svg viewBox="0 0 20 20" width="14" height="14">
              <path d="M12 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7M9 10h8m0 0-3-3m3 3-3 3"
                    fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sair
          </button>
        </div>
      </header>
    );
  }

  // --------------------------- Filters ---------------------------
  function Filters({
    origens, perfis, years,
    origemSel, setOrigemSel,
    perfilSel, setPerfilSel,
    year, setYear,
    month, setMonth,
    onClear,
  }) {
    const yearOptions  = years.map(y => ({ value: y, label: String(y) }));
    const monthOptions = MONTH_LABELS_FULL.map((l, i) => ({ value: i + 1, label: l }));

    return (
      <section className="card card-gradient-border p-5 lg:p-6 relative z-40">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <MultiSelect label="Origem" options={origens} selected={origemSel} onChange={setOrigemSel} />
          <MultiSelect label="Perfil" options={perfis}  selected={perfilSel} onChange={setPerfilSel} />
          <SingleSelect label="Ano"   options={yearOptions}  value={year}  onChange={setYear}  placeholder="Todos" />
          <SingleSelect label="Mês"   options={monthOptions} value={month} onChange={setMonth} placeholder="Todos" />
          <button type="button" onClick={onClear}
            className="h-[42px] w-full text-sm text-slate-300 border border-white/10 rounded-xl px-4 hover:text-white hover:border-brand-pink hover:bg-brand-pink/10 transition">
            Limpar filtros
          </button>
        </div>
      </section>
    );
  }

  // --------------------------- KPI Section ---------------------------
  function CentralKpi({ total, sql, sqlPct }) {
    return (
      <div className="card card-gradient-border p-6 lg:p-7 flex flex-col justify-between min-h-[220px]"
           style={{ background: "linear-gradient(145deg, rgba(255,90,138,.10), rgba(124,92,255,.10) 60%, rgba(24,27,34,.72))" }}>
        <div>
          <span className="text-[11px] uppercase tracking-[1.6px] text-slate-300/90">Total de Leads</span>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-5xl lg:text-6xl font-extrabold text-white leading-none tracking-tight">
              {fmtNumber(total)}
            </span>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] uppercase tracking-[1.4px] text-slate-300/80">SQL</span>
            <span className="text-2xl font-bold text-white">{fmtNumber(sql)}</span>
          </div>
          <span className="text-xs font-semibold text-brand-pink bg-brand-pink/10 border border-brand-pink/40 rounded-full px-2.5 py-0.5">
            {sqlPct.toFixed(1).replace(".", ",")}% da base
          </span>
        </div>
        <span className="mt-1 block text-[11px] text-slate-400">
          Starter + Pro + Qualificado (sem faixa)
        </span>
      </div>
    );
  }

  function OriginCard({ name, value, pct, accent }) {
    return (
      <div className="card p-4 flex flex-col justify-between min-h-[92px]">
        <span className="text-[10.5px] uppercase tracking-[1.3px] text-slate-400 line-clamp-1" title={name}>
          {name}
        </span>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold text-white leading-none">{fmtNumber(value)}</span>
          <span className="text-[11px] text-slate-400">{pct.toFixed(1).replace(".", ",")}%</span>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full"
               style={{ width: `${Math.min(100, pct)}%`, background: accent }} />
        </div>
      </div>
    );
  }

  function KpiSection({ total, sql, sqlPct, originCounts, origens }) {
    const palette = ["#ff5a8a","#7c5cff","#ff9b6a","#47c8d4","#b877ff","#ff6fbb"];
    const sortedOrigens = [...origens].sort((a, b) => (originCounts[b] || 0) - (originCounts[a] || 0));
    return (
      <section className="relative z-0 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <CentralKpi total={total} sql={sql} sqlPct={sqlPct} />
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3.5">
          {sortedOrigens.map((o, i) => (
            <OriginCard
              key={o}
              name={o}
              value={originCounts[o] || 0}
              pct={total > 0 ? ((originCounts[o] || 0) / total) * 100 : 0}
              accent={palette[i % palette.length]}
            />
          ))}
        </div>
      </section>
    );
  }

  // --------------------------- Charts ---------------------------
  const AXIS_STYLE = { fill: "#8b93a7", fontSize: 11 };
  const GRID_STROKE = "rgba(255,255,255,0.06)";

  function SqlByOriginChart({ data }) {
    if (data.length === 0) {
      return <div className="h-[320px] grid place-items-center text-slate-500 text-sm">Sem dados para o filtro atual.</div>;
    }
    return (
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 6 }}>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="#ff5a8a" stopOpacity={1}/>
                <stop offset="100%" stopColor="#7c5cff" stopOpacity={0.9}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="origem" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}
                   interval={0} angle={-15} dy={8} height={50}/>
            <YAxis allowDecimals={false} tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}/>
            <Tooltip
              cursor={{ fill: "rgba(255,90,138,0.08)" }}
              contentStyle={{ background: "rgba(18,21,29,0.96)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}
              labelStyle={{ color: "#e9ecf3" }}
              itemStyle={{ color: "#ff5a8a" }}
              formatter={(v) => [fmtNumber(v), "SQLs"]}
            />
            <Bar dataKey="sqls" fill="url(#barGrad)" radius={[8,8,0,0]} maxBarSize={52}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  function TrendChart({ data, granularity }) {
    if (data.length === 0) {
      return <div className="h-[320px] grid place-items-center text-slate-500 text-sm">Sem dados para o filtro atual.</div>;
    }
    return (
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 6 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="#ff5a8a" stopOpacity={0.55}/>
                <stop offset="100%" stopColor="#7c5cff" stopOpacity={0.02}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID_STROKE} vertical={false}/>
            <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}/>
            <YAxis allowDecimals={false} tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}/>
            <Tooltip
              cursor={{ stroke: "rgba(255,90,138,0.3)", strokeWidth: 1 }}
              contentStyle={{ background: "rgba(18,21,29,0.96)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}
              labelStyle={{ color: "#e9ecf3" }}
              itemStyle={{ color: "#ff5a8a" }}
              formatter={(v) => [fmtNumber(v), "Leads"]}
              labelFormatter={(l) => `${granularity === "week" ? "Semana " : ""}${l}`}
            />
            <Area type="monotone" dataKey="leads" stroke="#ff5a8a" strokeWidth={2.2}
                  fill="url(#areaGrad)" activeDot={{ r: 5, stroke: "#fff", strokeWidth: 1.5 }}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  function ChartCard({ title, subtitle, children }) {
    return (
      <div className="card p-5 lg:p-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[13px] uppercase tracking-[1.2px] text-slate-300">{title}</h2>
          {subtitle && <span className="text-[11px] text-slate-500">{subtitle}</span>}
        </div>
        {children}
      </div>
    );
  }

  // --------------------------- Background canvas ---------------------------
  function initLeadsCanvas() {
    const canvas = document.getElementById("leads-canvas");
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nodes = []; const COUNT = 42; const LINK_DIST = 130;
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const init = () => {
      nodes.length = 0;
      for (let i = 0; i < COUNT; i++) {
        nodes.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
          r: Math.random() * 1.6 + 0.6,
          hue: Math.random() < 0.5 ? "#ff5a8a" : "#7c5cff",
        });
      }
    };
    const step = () => {
      ctx.clearRect(0,0,w,h);
      for (const n of nodes) { n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1; }
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK_DIST) {
            const alpha = (1 - d / LINK_DIST) * 0.3;
            ctx.strokeStyle = `rgba(180,150,255,${alpha.toFixed(3)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      for (const n of nodes) {
        ctx.fillStyle = n.hue;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(step);
    };
    const onResize = () => { resize(); init(); };
    window.addEventListener("resize", onResize);
    resize(); init(); step();
  }

  // --------------------------- App ---------------------------
  function App() {
    const [raw, setRaw]         = useState(null);
    const [error, setError]     = useState(null);

    const [origemSel, setOrigemSel] = useState([]);
    const [perfilSel, setPerfilSel] = useState([]);
    const [year, setYear]           = useState(null);
    const [month, setMonth]         = useState(null);

    // Load + parse data
    useEffect(() => {
      fetch("data/data.json", { cache: "no-store" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(json => {
          const leads = (json.leads || []).map(l => ({
            ...l, _d: parseLeadDate(l.data),
          }));
          setRaw({ ...json, leads });
        })
        .catch(e => setError(e.message || String(e)));
    }, []);

    // Init background canvas once
    useEffect(() => { initLeadsCanvas(); }, []);

    // Available years, default to most recent
    const years = useMemo(() => {
      if (!raw) return [];
      const s = new Set();
      for (const l of raw.leads) if (l._d) s.add(l._d.getFullYear());
      return [...s].sort((a,b) => b - a);
    }, [raw]);

    useEffect(() => {
      if (year == null && years.length > 0) setYear(years[0]);
    }, [years, year]);

    // Filtered leads
    const filtered = useMemo(() => {
      if (!raw) return [];
      return raw.leads.filter(l => {
        if (origemSel.length > 0 && !origemSel.includes(l.origem)) return false;
        if (perfilSel.length > 0 && !perfilSel.includes(l.perfil)) return false;
        if (l._d) {
          if (year  != null && l._d.getFullYear() !== year)  return false;
          if (month != null && l._d.getMonth() + 1 !== month) return false;
        } else if (year != null || month != null) {
          return false;
        }
        return true;
      });
    }, [raw, origemSel, perfilSel, year, month]);

    // KPIs
    const totalLeads = filtered.length;
    const sqlLeads   = useMemo(() => filtered.filter(isSqlLead).length, [filtered]);
    const sqlPct     = totalLeads > 0 ? (sqlLeads / totalLeads) * 100 : 0;

    const origensAll = raw?.origens || [];
    const perfisAll  = raw?.perfis  || [];

    // Origin counts for cards (use selected origens if any, else all)
    const visibleOrigens = origemSel.length > 0 ? origemSel : origensAll;
    const originCounts = useMemo(() => {
      const m = {};
      for (const o of visibleOrigens) m[o] = 0;
      for (const l of filtered) {
        if (m[l.origem] !== undefined) m[l.origem]++;
      }
      return m;
    }, [filtered, visibleOrigens]);

    // Chart 1: SQLs by origin
    const sqlsByOriginData = useMemo(() => {
      const m = {};
      for (const o of visibleOrigens) m[o] = 0;
      for (const l of filtered) {
        if (isSqlLead(l) && m[l.origem] !== undefined) m[l.origem]++;
      }
      return Object.entries(m)
        .map(([origem, sqls]) => ({ origem, sqls }))
        .sort((a,b) => b.sqls - a.sqls);
    }, [filtered, visibleOrigens]);

    // Chart 2: trend over time — granularity depends on filters
    const { trendData, trendGranularity, trendSubtitle } = useMemo(() => {
      if (!raw) return { trendData: [], trendGranularity: "month", trendSubtitle: "" };

      if (month != null) {
        // Week granularity — 5 buckets
        const buckets = [0,0,0,0,0];
        for (const l of filtered) {
          if (!l._d) continue;
          const w = weekOfMonth(l._d);
          if (w >= 1 && w <= 5) buckets[w-1]++;
        }
        return {
          trendData: buckets.map((v,i) => ({ label: `S${i+1}`, leads: v })),
          trendGranularity: "week",
          trendSubtitle: `${MONTH_LABELS_FULL[month-1]}${year != null ? " de " + year : ""} · por semana`,
        };
      }

      if (year != null) {
        const buckets = Array(12).fill(0);
        for (const l of filtered) {
          if (!l._d) continue;
          buckets[l._d.getMonth()]++;
        }
        return {
          trendData: buckets.map((v,i) => ({ label: MONTH_LABELS_SHORT[i], leads: v })),
          trendGranularity: "month",
          trendSubtitle: `${year} · por mês`,
        };
      }

      // All years → group by year-month
      const m = new Map();
      for (const l of filtered) {
        if (!l._d) continue;
        const key = `${l._d.getFullYear()}-${String(l._d.getMonth()+1).padStart(2,"0")}`;
        m.set(key, (m.get(key) || 0) + 1);
      }
      const sorted = [...m.entries()].sort(([a],[b]) => a.localeCompare(b));
      return {
        trendData: sorted.map(([k,v]) => {
          const [y,mo] = k.split("-");
          return { label: `${MONTH_LABELS_SHORT[+mo-1]}/${y.slice(2)}`, leads: v };
        }),
        trendGranularity: "month",
        trendSubtitle: "Todos os períodos · por mês",
      };
    }, [filtered, year, month, raw]);

    const clear = useCallback(() => {
      setOrigemSel([]); setPerfilSel([]);
      setYear(years[0] ?? null); setMonth(null);
    }, [years]);

    // --------------------------- render ---------------------------
    if (error) {
      return (
        <>
          <Header total={null} updatedAt={null} />
          <main className="max-w-[1300px] mx-auto px-6 lg:px-10 py-8">
            <div className="card p-8 text-center text-slate-300">
              <p className="text-brand-pink font-medium mb-2">Falha ao carregar os dados</p>
              <p className="text-sm text-slate-400">{error}</p>
            </div>
          </main>
        </>
      );
    }

    if (!raw) {
      return (
        <>
          <Header total={null} updatedAt={null} />
          <main className="max-w-[1300px] mx-auto px-6 lg:px-10 py-8">
            <div className="card p-12 text-center text-slate-400 text-sm">Carregando dados…</div>
          </main>
        </>
      );
    }

    return (
      <>
        <Header total={raw.total_leads} updatedAt={raw.generated_at} />
        <main className="max-w-[1300px] mx-auto px-6 lg:px-10 py-8 space-y-6">
          <Filters
            origens={origensAll}
            perfis={perfisAll}
            years={years}
            origemSel={origemSel} setOrigemSel={setOrigemSel}
            perfilSel={perfilSel} setPerfilSel={setPerfilSel}
            year={year}   setYear={setYear}
            month={month} setMonth={setMonth}
            onClear={clear}
          />

          <KpiSection
            total={totalLeads}
            sql={sqlLeads}
            sqlPct={sqlPct}
            originCounts={originCounts}
            origens={visibleOrigens}
          />

          <section className="relative z-0 grid grid-cols-1 gap-5">
            <ChartCard title="Origem × SQLs" subtitle="Leads qualificados por canal">
              <SqlByOriginChart data={sqlsByOriginData} />
            </ChartCard>
            <ChartCard title="Evolução de Leads" subtitle={trendSubtitle}>
              <TrendChart data={trendData} granularity={trendGranularity} />
            </ChartCard>
          </section>

          <footer className="text-center text-[11px] text-slate-500 pt-4 pb-6">
            Atualizado automaticamente todo dia às 04:30 BRT.
          </footer>
        </main>
      </>
    );
  }

  const rootEl = document.getElementById("root");
  ReactDOM.createRoot(rootEl).render(<App />);
})();
