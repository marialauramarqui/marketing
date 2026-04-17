/* global React, ReactDOM, Recharts */
(() => {
  "use strict";

  const { useState, useEffect, useMemo, useRef, useCallback } = React;
  const {
    ResponsiveContainer,
    LineChart, Line,
    BarChart, Bar, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, LabelList,
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
           className={`transition-transform ${open ? "rotate-180" : ""} text-slate-500`}>
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

    // Aceita string[] ou {value,label}[]
    const opts = useMemo(
      () => (options || []).map(o =>
        (o !== null && typeof o === "object")
          ? { value: o.value, label: o.label }
          : { value: o, label: String(o) }
      ),
      [options]
    );
    const values = opts.map(o => o.value);
    const allSelected  = values.length > 0 && selected.length === values.length;
    const noneSelected = selected.length === 0;

    const getLabel = (v) => {
      const hit = opts.find(o => o.value === v);
      return hit ? hit.label : String(v);
    };

    const summary =
      noneSelected || allSelected ? placeholder
      : selected.length === 1 ? getLabel(selected[0])
      : `${selected.length} selecionadas`;

    const toggle = (v) => {
      onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
    };
    const toggleAll = () => onChange(allSelected ? [] : [...values]);

    return (
      <div className="relative" ref={ref}>
        <label className="block text-[11px] uppercase tracking-[1.2px] text-slate-500 mb-1.5">
          {label}
        </label>
        <button type="button" onClick={() => setOpen(o => !o)}
          className="w-full bg-white/70 border border-[#2B0C55]/10 rounded-xl px-3.5 py-2.5 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-pink/50 focus:outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20 transition">
          <span className={noneSelected || allSelected ? "text-slate-500" : "text-slate-900"}>
            {summary}
          </span>
          <Chevron open={open} />
        </button>
        {open && (
          <div className="absolute left-0 right-0 z-50 mt-1.5 bg-white backdrop-blur-xl border border-[#2B0C55]/10 rounded-xl shadow-2xl overflow-hidden">
            <label className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-[#6A52B3]/5 cursor-pointer border-b border-[#2B0C55]/5">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span className="text-sm font-medium text-slate-900">Selecionar todas</span>
            </label>
            <div className="max-h-60 overflow-y-auto py-1">
              {opts.map(o => (
                <label key={String(o.value)}
                  className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-[#6A52B3]/5 cursor-pointer">
                  <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                  <span className="text-sm text-slate-800">{o.label}</span>
                </label>
              ))}
            </div>
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
      <header className="flex items-center justify-between px-6 lg:px-10 py-5 border-b border-[#2B0C55]/10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="relative inline-grid place-items-center w-9 h-9">
            <span className="w-4 h-4 rounded-full shadow-[0_0_22px_rgba(106,82,179,.55),0_0_40px_rgba(99,193,155,.4)]"
                  style={{ background: "linear-gradient(135deg,#6A52B3,#63C19B)" }} />
            <span className="absolute inset-0 rounded-full border border-[#2B0C55]/10 animate-[pulse_2.6s_ease-out_infinite]" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[17px] font-bold tracking-wide"
                  style={{ background:"linear-gradient(120deg,#2B0C55 0%,#6A52B3 60%,#549E86 100%)",
                           WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>
              Vesti
            </span>
            <span className="text-[10.5px] uppercase tracking-[1.6px] text-slate-500">Marketing · Leads</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end text-right">
            <span className="text-xs text-slate-500">
              {total != null
                ? <>Base atual · <span className="text-slate-900 font-medium">{fmtNumber(total)}</span> leads</>
                : "Carregando…"}
            </span>
            {updatedAt && (
              <span className="text-[11px] text-slate-400">
                Atualizado em {new Date(updatedAt).toLocaleString("pt-BR")}
              </span>
            )}
          </div>
          <button onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs text-slate-700 border border-[#2B0C55]/10 rounded-lg px-3 py-2 hover:text-slate-900 hover:border-brand-pink hover:bg-brand-pink/10 transition"
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
          <MultiSelect label="Origem" options={origens}       selected={origemSel} onChange={setOrigemSel} placeholder="Todas" />
          <MultiSelect label="Perfil" options={perfis}        selected={perfilSel} onChange={setPerfilSel} placeholder="Todos" />
          <MultiSelect label="Ano"    options={yearOptions}   selected={year}      onChange={setYear}      placeholder="Todos" />
          <MultiSelect label="Mês"    options={monthOptions}  selected={month}     onChange={setMonth}     placeholder="Todos" />
          <button type="button" onClick={onClear}
            className="h-[42px] w-full text-sm text-slate-700 border border-[#2B0C55]/10 rounded-xl px-4 hover:text-slate-900 hover:border-brand-pink hover:bg-brand-pink/10 transition">
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
           style={{ background: "linear-gradient(145deg, rgba(106,82,179,.12), rgba(99,193,155,.10) 60%, rgba(255,255,255,.88))" }}>
        <div>
          <span className="text-[11px] uppercase tracking-[1.6px] text-slate-600">Total de Leads</span>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-5xl lg:text-6xl font-extrabold text-slate-900 leading-none tracking-tight">
              {fmtNumber(total)}
            </span>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] uppercase tracking-[1.4px] text-slate-600">SQL</span>
            <span className="text-2xl font-bold text-slate-900">{fmtNumber(sql)}</span>
          </div>
          <span className="text-xs font-semibold text-brand-pink bg-brand-pink/10 border border-brand-pink/40 rounded-full px-2.5 py-0.5">
            {sqlPct.toFixed(1).replace(".", ",")}% da base
          </span>
        </div>
        <span className="mt-1 block text-[11px] text-slate-500">
          Starter + Pro + Qualificado (sem faixa)
        </span>
      </div>
    );
  }

  function OriginCard({ name, value, pct, accent }) {
    return (
      <div className="card p-4 flex flex-col justify-between min-h-[92px]">
        <span className="text-[10.5px] uppercase tracking-[1.3px] text-slate-500 line-clamp-1" title={name}>
          {name}
        </span>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold text-slate-900 leading-none">{fmtNumber(value)}</span>
          <span className="text-[11px] text-slate-500">{pct.toFixed(1).replace(".", ",")}%</span>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-[#2B0C55]/10 overflow-hidden">
          <div className="h-full rounded-full"
               style={{ width: `${Math.min(100, pct)}%`, background: accent }} />
        </div>
      </div>
    );
  }

  function KpiSection({ total, sql, sqlPct, originCounts, origens }) {
    const palette = ["#6A52B3","#63C19B","#549E86","#6473A0","#655AA2","#4A467A"];
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
  const AXIS_STYLE = { fill: "#6473A0", fontSize: 11 };
  const GRID_STROKE = "rgba(43,12,85,0.08)";

  function SqlByOriginChart({ data, onBarClick, activeOrigins }) {
    if (data.length === 0) {
      return <div className="h-[320px] grid place-items-center text-slate-500 text-sm">Sem dados para o filtro atual.</div>;
    }
    const anyActive = activeOrigins && activeOrigins.length > 0;
    return (
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 12, left: 0, bottom: 6 }}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="origem" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}
                   interval={0} angle={-15} dy={8} height={50}/>
            <YAxis allowDecimals={false} tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}/>
            <Tooltip
              cursor={{ fill: "rgba(99,193,155,0.10)" }}
              contentStyle={{ background: "rgba(255,255,255,0.96)", border: "1px solid rgba(43,12,85,0.1)", borderRadius: 10 }}
              labelStyle={{ color: "#1a1635" }}
              itemStyle={{ color: "#549E86" }}
              formatter={(v) => [fmtNumber(v), "SQLs"]}
            />
            <Bar
              dataKey="sqls"
              radius={[8,8,0,0]}
              maxBarSize={52}
              onClick={(entry) => onBarClick && entry && onBarClick(entry.origem)}
              style={{ cursor: onBarClick ? "pointer" : "default" }}
            >
              {data.map((entry) => {
                const active = !anyActive || activeOrigins.includes(entry.origem);
                return (
                  <Cell
                    key={entry.origem}
                    fill={active ? "#63C19B" : "rgba(99,193,155,0.3)"}
                  />
                );
              })}
              <LabelList
                dataKey="sqls"
                position="top"
                fill="#2B0C55"
                fontSize={11}
                fontWeight={600}
                formatter={(v) => fmtNumber(v)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  function TrendChart({ data, granularity, onPointClick }) {
    if (data.length === 0) {
      return <div className="h-[320px] grid place-items-center text-slate-500 text-sm">Sem dados para o filtro atual.</div>;
    }
    return (
      <div className="h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 28, right: 18, left: 0, bottom: 6 }}
            onClick={(e) => {
              if (!onPointClick || !e || !e.activePayload || !e.activePayload[0]) return;
              onPointClick(e.activePayload[0].payload);
            }}
            style={{ cursor: onPointClick && granularity !== "week" ? "pointer" : "default" }}
          >
            <CartesianGrid stroke={GRID_STROKE} vertical={false}/>
            <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}/>
            <YAxis allowDecimals={false} tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}/>
            <Tooltip
              cursor={{ stroke: "rgba(106,82,179,0.35)", strokeWidth: 1 }}
              contentStyle={{ background: "rgba(255,255,255,0.96)", border: "1px solid rgba(43,12,85,0.1)", borderRadius: 10 }}
              labelStyle={{ color: "#1a1635" }}
              formatter={(v, name) => [fmtNumber(v), name]}
              labelFormatter={(l) => `${granularity === "week" ? "Semana " : ""}${l}`}
            />
            <Legend
              verticalAlign="top"
              height={28}
              iconType="circle"
              wrapperStyle={{ fontSize: 12, color: "#4A467A" }}
            />
            <Line type="monotone" dataKey="leads" name="Leads totais"
                  stroke="#6A52B3" strokeWidth={2.4}
                  dot={{ r: 3, fill: "#6A52B3", stroke: "#6A52B3" }}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 1.5 }}>
              <LabelList
                dataKey="leads"
                position="top"
                fill="#2B0C55"
                fontSize={11}
                fontWeight={600}
                formatter={(v) => fmtNumber(v)}
              />
            </Line>
            <Line type="monotone" dataKey="sqls" name="SQLs"
                  stroke="#549E86" strokeWidth={2.4}
                  dot={{ r: 3, fill: "#549E86", stroke: "#549E86" }}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 1.5 }}>
              <LabelList
                dataKey="sqls"
                position="bottom"
                fill="#549E86"
                fontSize={11}
                fontWeight={600}
                formatter={(v) => fmtNumber(v)}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  function ChartCard({ title, subtitle, children }) {
    return (
      <div className="card p-5 lg:p-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[13px] uppercase tracking-[1.2px] text-slate-700">{title}</h2>
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
          hue: Math.random() < 0.5 ? "#6A52B3" : "#63C19B",
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
            ctx.strokeStyle = `rgba(106,82,179,${(alpha * 0.55).toFixed(3)})`;
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
    const [year, setYear]           = useState(null); // null = não inicializado; [] = "Todos"
    const [month, setMonth]         = useState([]);

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
      if (year === null && years.length > 0) setYear([years[0]]);
    }, [years, year]);

    // Filtered leads
    const filtered = useMemo(() => {
      if (!raw) return [];
      const ySel = Array.isArray(year) ? year : [];
      return raw.leads.filter(l => {
        if (origemSel.length > 0 && !origemSel.includes(l.origem)) return false;
        if (perfilSel.length > 0 && !perfilSel.includes(l.perfil)) return false;
        if (l._d) {
          if (ySel.length  > 0 && !ySel.includes(l._d.getFullYear()))      return false;
          if (month.length > 0 && !month.includes(l._d.getMonth() + 1))    return false;
        } else if (ySel.length > 0 || month.length > 0) {
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
      if (!raw) return { trendData: [], trendGranularity: "month-of-year", trendSubtitle: "" };
      const ySel = Array.isArray(year) ? year : [];

      // Weekly view — exatamente 1 mês selecionado
      if (month.length === 1) {
        const buckets = Array(5).fill(null).map(() => ({ leads: 0, sqls: 0 }));
        for (const l of filtered) {
          if (!l._d) continue;
          const w = weekOfMonth(l._d);
          if (w >= 1 && w <= 5) {
            buckets[w-1].leads++;
            if (isSqlLead(l)) buckets[w-1].sqls++;
          }
        }
        const yearLabel = ySel.length === 1 ? ` · ${ySel[0]}` : "";
        return {
          trendData: buckets.map((b,i) => ({ label: `S${i+1}`, leads: b.leads, sqls: b.sqls })),
          trendGranularity: "week",
          trendSubtitle: `${MONTH_LABELS_FULL[month[0]-1]}${yearLabel} · por semana`,
        };
      }

      // Monthly view — exatamente 1 ano selecionado e nenhum mês específico
      if (ySel.length === 1 && month.length === 0) {
        const buckets = Array(12).fill(null).map(() => ({ leads: 0, sqls: 0 }));
        for (const l of filtered) {
          if (!l._d) continue;
          const mo = l._d.getMonth();
          buckets[mo].leads++;
          if (isSqlLead(l)) buckets[mo].sqls++;
        }
        return {
          trendData: buckets.map((b,i) => ({
            label: MONTH_LABELS_SHORT[i], leads: b.leads, sqls: b.sqls, year: ySel[0], month: i+1,
          })),
          trendGranularity: "month-of-year",
          trendSubtitle: `${ySel[0]} · por mês`,
        };
      }

      // Year-month view — qualquer outro caso
      const m = new Map();
      for (const l of filtered) {
        if (!l._d) continue;
        const key = `${l._d.getFullYear()}-${String(l._d.getMonth()+1).padStart(2,"0")}`;
        const b = m.get(key) || { leads: 0, sqls: 0 };
        b.leads++;
        if (isSqlLead(l)) b.sqls++;
        m.set(key, b);
      }
      const sorted = [...m.entries()].sort(([a],[b]) => a.localeCompare(b));
      return {
        trendData: sorted.map(([k,b]) => {
          const [y,mo] = k.split("-");
          return { label: `${MONTH_LABELS_SHORT[+mo-1]}/${y.slice(2)}`, leads: b.leads, sqls: b.sqls, year: +y, month: +mo };
        }),
        trendGranularity: "year-month",
        trendSubtitle: ySel.length === 0 ? "Todos os períodos · por mês" : `${ySel.join(", ")} · por mês`,
      };
    }, [filtered, year, month, raw]);

    // --- cross-filter handlers ---
    const toggleOrigem = useCallback((o) => {
      if (!o) return;
      setOrigemSel(sel => sel.includes(o) ? sel.filter(x => x !== o) : [...sel, o]);
    }, []);

    const handleTrendClick = useCallback((payload) => {
      if (!payload) return;
      if (trendGranularity === "week") return; // já na menor granularidade
      if (trendGranularity === "month-of-year" && payload.month != null) {
        setMonth(m => m.includes(payload.month) ? m.filter(x => x !== payload.month) : [...m, payload.month]);
        return;
      }
      if (trendGranularity === "year-month" && payload.year != null && payload.month != null) {
        // drill-in: foca naquele período específico
        setYear([payload.year]);
        setMonth([payload.month]);
      }
    }, [trendGranularity]);

    const clear = useCallback(() => {
      setOrigemSel([]); setPerfilSel([]);
      setYear([]);      setMonth([]);
    }, []);

    // --------------------------- render ---------------------------
    if (error) {
      return (
        <>
          <Header total={null} updatedAt={null} />
          <main className="max-w-[1300px] mx-auto px-6 lg:px-10 py-8">
            <div className="card p-8 text-center text-slate-700">
              <p className="text-brand-pink font-medium mb-2">Falha ao carregar os dados</p>
              <p className="text-sm text-slate-500">{error}</p>
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
            <div className="card p-12 text-center text-slate-500 text-sm">Carregando dados…</div>
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
            year={year ?? []}  setYear={setYear}
            month={month}      setMonth={setMonth}
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
            <ChartCard title="Origem × SQLs" subtitle="Clique em uma barra para filtrar">
              <SqlByOriginChart
                data={sqlsByOriginData}
                onBarClick={toggleOrigem}
                activeOrigins={origemSel}
              />
            </ChartCard>
            <ChartCard title="Evolução de Leads" subtitle={trendSubtitle}>
              <TrendChart
                data={trendData}
                granularity={trendGranularity}
                onPointClick={handleTrendClick}
              />
            </ChartCard>
          </section>

          <footer className="text-center text-[11px] text-slate-400 pt-4 pb-6">
            Atualizado automaticamente todo dia às 04:30 BRT.
          </footer>
        </main>
      </>
    );
  }

  const rootEl = document.getElementById("root");
  ReactDOM.createRoot(rootEl).render(<App />);
})();
