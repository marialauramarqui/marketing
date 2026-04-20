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
  const DOW_LABELS = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const DOW_SHORT  = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

  const ORIGEM_ALIASES = {
    "[SALES] Chanel": "Mídia paga",
    "[SALES]Chanel": "Mídia paga",
  };
  function canonicalOrigem(o) {
    return ORIGEM_ALIASES[o] ?? o;
  }

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

  // Regra calendário: semana vai de domingo a sábado.
  // Semana 1 do mês = do dia 1º até o primeiro sábado (inclusive), mesmo que parcial.
  function weekOfMonth(d) {
    const day = d.getDate();
    const firstDow = new Date(d.getFullYear(), d.getMonth(), 1).getDay(); // 0=Dom..6=Sáb
    const firstSatDay = 1 + ((6 - firstDow + 7) % 7); // dia 1..7
    if (day <= firstSatDay) return 1;
    return 1 + Math.ceil((day - firstSatDay) / 7);
  }

  function weeksInMonth(year, monthIdx) {
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    return weekOfMonth(new Date(year, monthIdx, lastDay));
  }

  function weekRange(year, monthIdx, weekNum) {
    const firstDow = new Date(year, monthIdx, 1).getDay();
    const firstSatDay = 1 + ((6 - firstDow + 7) % 7);
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    let start, end;
    if (weekNum === 1) {
      start = 1;
      end = Math.min(firstSatDay, lastDay);
    } else {
      start = firstSatDay + 1 + (weekNum - 2) * 7;
      end = Math.min(start + 6, lastDay);
    }
    if (start > lastDay) return null;
    return `${String(start).padStart(2,"0")}–${String(end).padStart(2,"0")}`;
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
    dowSel, setDowSel,
    onClear,
  }) {
    const yearOptions  = years.map(y => ({ value: y, label: String(y) }));
    const monthOptions = MONTH_LABELS_FULL.map((l, i) => ({ value: i + 1, label: l }));
    const dowOptions   = DOW_LABELS.map((l, i) => ({ value: i, label: l }));

    return (
      <section className="card card-gradient-border p-5 lg:p-6 relative z-40">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <MultiSelect label="Origem"         options={origens}       selected={origemSel} onChange={setOrigemSel} placeholder="Todas" />
          <MultiSelect label="Perfil"         options={perfis}        selected={perfilSel} onChange={setPerfilSel} placeholder="Todos" />
          <MultiSelect label="Ano"            options={yearOptions}   selected={year}      onChange={setYear}      placeholder="Todos" />
          <MultiSelect label="Mês"            options={monthOptions}  selected={month}     onChange={setMonth}     placeholder="Todos" />
          <MultiSelect label="Dia da semana"  options={dowOptions}    selected={dowSel}    onChange={setDowSel}    placeholder="Todos" />
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

  function PerfilSqlCard({ name, value, pct, accent, active, onClick }) {
    const clickable = typeof onClick === "function";
    return (
      <div
        className="card p-4 flex flex-col justify-between min-h-[104px] transition-all"
        style={{
          cursor: clickable ? "pointer" : "default",
          boxShadow: active ? `0 0 0 2px ${accent}` : undefined,
          opacity: active === false ? 0.55 : 1,
        }}
        onClick={clickable ? () => onClick(name) : undefined}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(name); } } : undefined}
      >
        <span className="text-[10.5px] uppercase tracking-[1.3px] text-slate-500" title={name}>
          {name}
        </span>
        <div className="mt-1.5">
          <span className="text-3xl font-bold text-slate-900 leading-none">{fmtNumber(value)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="h-1 flex-1 rounded-full bg-[#2B0C55]/10 overflow-hidden">
            <div className="h-full rounded-full"
                 style={{ width: `${Math.min(100, pct)}%`, background: accent }} />
          </div>
          <span className="text-[11px] font-medium text-slate-600 whitespace-nowrap">
            {pct.toFixed(1).replace(".", ",")}% dos SQLs
          </span>
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

  function TrendChart({ data, granularity, onPointClick, selectedWeek }) {
    if (data.length === 0) {
      return <div className="h-[320px] grid place-items-center text-slate-500 text-sm">Sem dados para o filtro atual.</div>;
    }
    const makeDot = (baseColor) => (props) => {
      const { cx, cy, payload, index } = props;
      if (cx == null || cy == null) return null;
      const isSel = granularity === "week" && selectedWeek != null && payload && payload.week === selectedWeek;
      return (
        <circle
          key={`d-${index}`}
          cx={cx} cy={cy}
          r={isSel ? 7 : 3}
          fill={isSel ? "#E91E63" : baseColor}
          stroke={isSel ? "#fff" : baseColor}
          strokeWidth={isSel ? 2 : 1}
        />
      );
    };
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
            style={{ cursor: onPointClick ? "pointer" : "default" }}
          >
            <CartesianGrid stroke={GRID_STROKE} vertical={false}/>
            <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}/>
            <YAxis allowDecimals={false} tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}/>
            <Tooltip
              cursor={{ stroke: "rgba(106,82,179,0.35)", strokeWidth: 1 }}
              contentStyle={{ background: "rgba(255,255,255,0.96)", border: "1px solid rgba(43,12,85,0.1)", borderRadius: 10 }}
              labelStyle={{ color: "#1a1635" }}
              formatter={(v, name) => [fmtNumber(v), name]}
              labelFormatter={(l, payload) => {
                if (granularity === "week") {
                  const wNum = String(l).replace(/^S/, "");
                  const range = payload && payload[0] && payload[0].payload && payload[0].payload.range;
                  return range ? `Semana ${wNum} (${range})` : `Semana ${wNum}`;
                }
                return l;
              }}
            />
            <Legend
              verticalAlign="top"
              height={28}
              iconType="circle"
              wrapperStyle={{ fontSize: 12, color: "#4A467A" }}
            />
            <Line type="monotone" dataKey="leads" name="Leads totais"
                  stroke="#6A52B3" strokeWidth={2.4}
                  dot={makeDot("#6A52B3")}
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
                  dot={makeDot("#549E86")}
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

  function DailyChart({ data, onPointClick, selectedDay }) {
    if (!data || data.length === 0) {
      return <div className="h-[320px] grid place-items-center text-slate-500 text-sm">Sem dados para o filtro atual.</div>;
    }
    const makeDot = (baseColor) => (props) => {
      const { cx, cy, payload, index } = props;
      if (cx == null || cy == null) return null;
      const isSel = selectedDay != null && payload && payload.day === selectedDay;
      return (
        <circle
          key={`d-${index}`}
          cx={cx} cy={cy}
          r={isSel ? 6 : 2.5}
          fill={isSel ? "#E91E63" : baseColor}
          stroke={isSel ? "#fff" : baseColor}
          strokeWidth={isSel ? 2 : 1}
        />
      );
    };
    return (
      <div className="h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 28, right: 18, left: 0, bottom: 6 }}
            onClick={(e) => {
              if (!onPointClick || !e || !e.activePayload || !e.activePayload[0]) return;
              onPointClick(e.activePayload[0].payload);
            }}
            style={{ cursor: onPointClick ? "pointer" : "default" }}
          >
            <CartesianGrid stroke={GRID_STROKE} vertical={false}/>
            <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval={0}/>
            <YAxis allowDecimals={false} tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}/>
            <Tooltip
              cursor={{ stroke: "rgba(106,82,179,0.35)", strokeWidth: 1 }}
              contentStyle={{ background: "rgba(255,255,255,0.96)", border: "1px solid rgba(43,12,85,0.1)", borderRadius: 10 }}
              labelStyle={{ color: "#1a1635" }}
              formatter={(v, name) => [fmtNumber(v), name]}
              labelFormatter={(l, payload) => {
                const dow = payload && payload[0] && payload[0].payload && payload[0].payload.dow;
                return dow ? `Dia ${l} (${dow})` : `Dia ${l}`;
              }}
            />
            <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: 12, color: "#4A467A" }}/>
            <Line type="monotone" dataKey="leads" name="Leads totais"
                  stroke="#6A52B3" strokeWidth={2.2}
                  dot={makeDot("#6A52B3")}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 1.5 }}>
              <LabelList dataKey="leads" position="top" fill="#2B0C55" fontSize={10} fontWeight={600}
                         formatter={(v) => v > 0 ? fmtNumber(v) : ""}/>
            </Line>
            <Line type="monotone" dataKey="sqls" name="SQLs"
                  stroke="#549E86" strokeWidth={2.2}
                  dot={makeDot("#549E86")}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 1.5 }}>
              <LabelList dataKey="sqls" position="bottom" fill="#549E86" fontSize={10} fontWeight={600}
                         formatter={(v) => v > 0 ? fmtNumber(v) : ""}/>
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
    const [dowSel, setDowSel]       = useState([]);   // 0..6 (dom..sáb)
    const [weekSel, setWeekSel]     = useState(null); // 1..6 ou null
    const [daySel, setDaySel]       = useState(null); // 1..31 ou null

    // Load + parse data
    useEffect(() => {
      fetch("data/data.json", { cache: "no-store" })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(json => {
          const leads = (json.leads || []).map(l => ({
            ...l,
            origem: canonicalOrigem(l.origem),
            _d: parseLeadDate(l.data),
          }));
          const origens = [...new Set((json.origens || []).map(canonicalOrigem))]
            .sort((a, b) => a.localeCompare(b, "pt-BR"));
          const origem_counts = {};
          for (const [k, v] of Object.entries(json.origem_counts || {})) {
            const ck = canonicalOrigem(k);
            origem_counts[ck] = (origem_counts[ck] || 0) + v;
          }
          const sql_by_origem = {};
          for (const [k, v] of Object.entries(json.sql_by_origem || {})) {
            const ck = canonicalOrigem(k);
            sql_by_origem[ck] = (sql_by_origem[ck] || 0) + v;
          }
          setRaw({ ...json, leads, origens, origem_counts, sql_by_origem });
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

    // Filtered leads (sem filtro de semana — usado pelo gráfico de evolução)
    const baseFiltered = useMemo(() => {
      if (!raw) return [];
      const ySel = Array.isArray(year) ? year : [];
      return raw.leads.filter(l => {
        if (origemSel.length > 0 && !origemSel.includes(l.origem)) return false;
        if (perfilSel.length > 0 && !perfilSel.includes(l.perfil)) return false;
        if (l._d) {
          if (ySel.length  > 0 && !ySel.includes(l._d.getFullYear()))      return false;
          if (month.length > 0 && !month.includes(l._d.getMonth() + 1))    return false;
          if (dowSel.length > 0 && !dowSel.includes(l._d.getDay()))        return false;
        } else if (ySel.length > 0 || month.length > 0 || dowSel.length > 0) {
          return false;
        }
        return true;
      });
    }, [raw, origemSel, perfilSel, year, month, dowSel]);

    // Reset de seleções quando perdem contexto
    useEffect(() => {
      if (month.length !== 1) {
        if (weekSel != null) setWeekSel(null);
        if (daySel != null) setDaySel(null);
      }
    }, [month, weekSel, daySel]);
    useEffect(() => {
      // Se a semana muda e o dia selecionado não pertence à nova semana, reseta
      if (daySel != null && weekSel != null && month.length === 1) {
        const ySel = Array.isArray(year) ? year : [];
        const calYear = ySel.length === 1 ? ySel[0] : new Date().getFullYear();
        const w = weekOfMonth(new Date(calYear, month[0]-1, daySel));
        if (w !== weekSel) setDaySel(null);
      }
    }, [weekSel, daySel, month, year]);

    // Camada com semana aplicada (usado pelo gráfico diário)
    const withWeek = useMemo(() => {
      if (weekSel == null || month.length !== 1) return baseFiltered;
      return baseFiltered.filter(l => l._d && weekOfMonth(l._d) === weekSel);
    }, [baseFiltered, weekSel, month]);

    // Camada com dia aplicado (usado pelo gráfico semanal)
    const withDay = useMemo(() => {
      if (daySel == null || month.length !== 1) return baseFiltered;
      return baseFiltered.filter(l => l._d && l._d.getDate() === daySel);
    }, [baseFiltered, daySel, month]);

    // Filtered final (semana + dia) — usado por cards/KPIs
    const filtered = useMemo(() => {
      if (daySel == null || month.length !== 1) return withWeek;
      return withWeek.filter(l => l._d && l._d.getDate() === daySel);
    }, [withWeek, daySel, month]);

    // KPIs
    const totalLeads = filtered.length;
    const sqlLeads   = useMemo(() => filtered.filter(isSqlLead).length, [filtered]);
    const sqlPct     = totalLeads > 0 ? (sqlLeads / totalLeads) * 100 : 0;

    const sqlBreakdown = useMemo(() => {
      const counts = { "Pro": 0, "Starter": 0, "Qualificado (Sem Faixa)": 0 };
      for (const l of filtered) {
        if (counts[l.perfil] !== undefined) counts[l.perfil]++;
      }
      return counts;
    }, [filtered]);

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

    // Chart 1: SQLs by origin — mostra todas as origens sempre (para permitir
    // alternar o filtro entre elas) e ignora o filtro de origem na contagem.
    const filteredIgnoringOrigem = useMemo(() => {
      if (!raw) return [];
      const ySel = Array.isArray(year) ? year : [];
      return raw.leads.filter(l => {
        if (perfilSel.length > 0 && !perfilSel.includes(l.perfil)) return false;
        if (l._d) {
          if (ySel.length  > 0 && !ySel.includes(l._d.getFullYear()))      return false;
          if (month.length > 0 && !month.includes(l._d.getMonth() + 1))    return false;
          if (dowSel.length > 0 && !dowSel.includes(l._d.getDay()))        return false;
          if (weekSel != null && month.length === 1 && weekOfMonth(l._d) !== weekSel) return false;
          if (daySel != null && month.length === 1 && l._d.getDate() !== daySel) return false;
        } else if (ySel.length > 0 || month.length > 0 || dowSel.length > 0) {
          return false;
        }
        return true;
      });
    }, [raw, perfilSel, year, month, dowSel, weekSel, daySel]);

    const sqlsByOriginData = useMemo(() => {
      const m = {};
      for (const o of origensAll) m[o] = 0;
      for (const l of filteredIgnoringOrigem) {
        if (isSqlLead(l) && m[l.origem] !== undefined) m[l.origem]++;
      }
      return Object.entries(m)
        .map(([origem, sqls]) => ({ origem, sqls }))
        .sort((a,b) => b.sqls - a.sqls);
    }, [filteredIgnoringOrigem, origensAll]);

    // Chart 2: trend over time — granularity depends on filters
    const { trendData, trendGranularity, trendSubtitle } = useMemo(() => {
      if (!raw) return { trendData: [], trendGranularity: "month-of-year", trendSubtitle: "" };
      const ySel = Array.isArray(year) ? year : [];

      // Weekly view — exatamente 1 mês selecionado
      if (month.length === 1) {
        const monthIdx = month[0] - 1;
        // Número de semanas do período exibido. Se houver ano fixo, usa ele;
        // senão, pega o máximo entre os anos presentes nos dados filtrados.
        let numWeeks = 0;
        let calYear = null;
        if (ySel.length === 1) {
          calYear = ySel[0];
          numWeeks = weeksInMonth(calYear, monthIdx);
        } else {
          const yearsPresent = new Set();
          for (const l of baseFiltered) if (l._d && l._d.getMonth() === monthIdx) yearsPresent.add(l._d.getFullYear());
          for (const y of yearsPresent) {
            const n = weeksInMonth(y, monthIdx);
            if (n > numWeeks) { numWeeks = n; calYear = y; }
          }
          if (numWeeks === 0) { calYear = new Date().getFullYear(); numWeeks = weeksInMonth(calYear, monthIdx); }
        }
        const buckets = Array(numWeeks).fill(null).map(() => ({ leads: 0, sqls: 0 }));
        for (const l of withDay) {
          if (!l._d) continue;
          const w = weekOfMonth(l._d);
          if (w >= 1 && w <= numWeeks) {
            buckets[w-1].leads++;
            if (isSqlLead(l)) buckets[w-1].sqls++;
          }
        }
        const yearLabel = ySel.length === 1 ? ` · ${ySel[0]}` : "";
        const selLabel = weekSel != null ? ` · Semana ${weekSel} selecionada` : "";
        return {
          trendData: buckets.map((b,i) => ({
            label: `S${i+1}`,
            week: i+1,
            range: weekRange(calYear, monthIdx, i+1),
            leads: b.leads,
            sqls: b.sqls,
          })),
          trendGranularity: "week",
          trendSubtitle: `${MONTH_LABELS_FULL[month[0]-1]}${yearLabel} · por semana${selLabel}`,
        };
      }

      // Monthly view — exatamente 1 ano selecionado e nenhum mês específico
      if (ySel.length === 1 && month.length === 0) {
        const buckets = Array(12).fill(null).map(() => ({ leads: 0, sqls: 0 }));
        for (const l of baseFiltered) {
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
      for (const l of baseFiltered) {
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
    }, [baseFiltered, withDay, year, month, weekSel, raw]);

    // Daily chart — visível quando exatamente 1 mês selecionado
    const dailyInfo = useMemo(() => {
      if (!raw || month.length !== 1) return null;
      const ySel = Array.isArray(year) ? year : [];
      const monthIdx = month[0] - 1;
      let calYear = null;
      if (ySel.length === 1) {
        calYear = ySel[0];
      } else {
        for (const l of baseFiltered) {
          if (l._d && l._d.getMonth() === monthIdx) {
            const y = l._d.getFullYear();
            if (calYear == null || y > calYear) calYear = y;
          }
        }
        if (calYear == null) calYear = new Date().getFullYear();
      }
      const lastDay = new Date(calYear, monthIdx + 1, 0).getDate();
      const buckets = Array(lastDay).fill(null).map(() => ({ leads: 0, sqls: 0 }));
      for (const l of withWeek) {
        if (!l._d) continue;
        if (l._d.getFullYear() !== calYear || l._d.getMonth() !== monthIdx) continue;
        const day = l._d.getDate();
        if (day >= 1 && day <= lastDay) {
          buckets[day-1].leads++;
          if (isSqlLead(l)) buckets[day-1].sqls++;
        }
      }
      const daySelLabel = daySel != null ? ` · Dia ${String(daySel).padStart(2,"0")} selecionado` : "";
      return {
        data: buckets.map((b, i) => ({
          label: String(i + 1).padStart(2, "0"),
          day: i + 1,
          dow: DOW_SHORT[new Date(calYear, monthIdx, i + 1).getDay()],
          leads: b.leads,
          sqls: b.sqls,
        })),
        subtitle: `${MONTH_LABELS_FULL[monthIdx]} · ${calYear} · por dia${daySelLabel}`,
      };
    }, [raw, withWeek, baseFiltered, year, month, daySel]);

    // --- cross-filter handlers ---
    const toggleOrigem = useCallback((o) => {
      if (!o) return;
      setOrigemSel(sel => sel.includes(o) ? sel.filter(x => x !== o) : [...sel, o]);
    }, []);

    const togglePerfil = useCallback((p) => {
      if (!p) return;
      setPerfilSel(sel => sel.includes(p) ? sel.filter(x => x !== p) : [...sel, p]);
    }, []);

    const handleDailyClick = useCallback((payload) => {
      if (!payload || payload.day == null) return;
      setDaySel(curr => curr === payload.day ? null : payload.day);
    }, []);

    const handleTrendClick = useCallback((payload) => {
      if (!payload) return;
      if (trendGranularity === "week" && payload.week != null) {
        setWeekSel(curr => curr === payload.week ? null : payload.week);
        return;
      }
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
      setDowSel([]);
      setWeekSel(null);
      setDaySel(null);
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
            dowSel={dowSel}    setDowSel={setDowSel}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <PerfilSqlCard
                name="Pro"
                value={sqlBreakdown["Pro"]}
                pct={sqlLeads > 0 ? (sqlBreakdown["Pro"] / sqlLeads) * 100 : 0}
                accent="#549E86"
                active={perfilSel.length === 0 ? undefined : perfilSel.includes("Pro")}
                onClick={togglePerfil}
              />
              <PerfilSqlCard
                name="Starter"
                value={sqlBreakdown["Starter"]}
                pct={sqlLeads > 0 ? (sqlBreakdown["Starter"] / sqlLeads) * 100 : 0}
                accent="#63C19B"
                active={perfilSel.length === 0 ? undefined : perfilSel.includes("Starter")}
                onClick={togglePerfil}
              />
              <PerfilSqlCard
                name="Qualificado (Sem Faixa)"
                value={sqlBreakdown["Qualificado (Sem Faixa)"]}
                pct={sqlLeads > 0 ? (sqlBreakdown["Qualificado (Sem Faixa)"] / sqlLeads) * 100 : 0}
                accent="#6A52B3"
                active={perfilSel.length === 0 ? undefined : perfilSel.includes("Qualificado (Sem Faixa)")}
                onClick={togglePerfil}
              />
            </div>

            <ChartCard title="Evolução de Leads" subtitle={trendSubtitle}>
              <TrendChart
                data={trendData}
                granularity={trendGranularity}
                onPointClick={handleTrendClick}
                selectedWeek={weekSel}
              />
            </ChartCard>

            {dailyInfo && (
              <ChartCard title="Evolução diária" subtitle={dailyInfo.subtitle}>
                <DailyChart
                  data={dailyInfo.data}
                  onPointClick={handleDailyClick}
                  selectedDay={daySel}
                />
              </ChartCard>
            )}
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
