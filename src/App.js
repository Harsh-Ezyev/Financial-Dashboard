import { useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine, ComposedChart
} from "recharts";
import "./App.css";

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const C = {
  bg: "#f5f1ea", surface: "#fffdfa", card: "#f8f3ec", border: "#ddd2c4",
  accent: "#1f6f78", green: "#3f7d4e", amber: "#c48a3a", red: "#b85c44",
  purple: "#7b6ea8", pink: "#b8697d", teal: "#4d8b88",
  text: "#1f2430", muted: "#746c63", label: "#8f857a", shadow: "0 20px 50px rgba(73, 56, 34, 0.08)",
};

// ─── GROWTH PROJECTION DATA (from 5850_Projection.docx) ──────────────────────
// Ground-truth from the business plan document
const GROWTH_PLAN = [
  { month: "Mar", label: "Mar '25", batteries: 561,  addedBatt: 0,    salesTeam: 6,  serviceTeam: 1,  techTeam: 7, revenuePerBatt: 1900, opexLakhBase: 13,  cities: { mumbai: 395, pune: 166, nagpur: 0   } },
  { month: "Apr", label: "Apr '25", batteries: 850,  addedBatt: 289,  salesTeam: 6,  serviceTeam: 2,  techTeam: 7, revenuePerBatt: 1900, opexLakhBase: 13.5,cities: { mumbai: 450, pune: 300, nagpur: 100 } },
  { month: "May", label: "May '25", batteries: 1500, addedBatt: 650,  salesTeam: 8,  serviceTeam: 4,  techTeam: 7, revenuePerBatt: 1950, opexLakhBase: 14.5,cities: { mumbai: 800, pune: 450, nagpur: 250 } },
  { month: "Jun", label: "Jun '25", batteries: 2500, addedBatt: 1000, salesTeam: 10, serviceTeam: 7,  techTeam: 8, revenuePerBatt: 2000, opexLakhBase: 16,  cities: { mumbai: 1300,pune: 750, nagpur: 450 } },
  { month: "Jul", label: "Jul '25", batteries: 4000, addedBatt: 1500, salesTeam: 13, serviceTeam: 12, techTeam: 8, revenuePerBatt: 2050, opexLakhBase: 20,  cities: { mumbai: 2100,pune: 1200,nagpur: 700 } },
  { month: "Aug", label: "Aug '25", batteries: 5850, addedBatt: 1850, salesTeam: 16, serviceTeam: 18, techTeam: 9, revenuePerBatt: 2124, opexLakhBase: 24,  cities: { mumbai: 2900,pune: 1750,nagpur: 1200} },
];

// Hiring events from the doc (Regional Managers = mid-level mgmt trigger)
const HIRING_EVENTS = [
  { month: "May", label: "2 Sales Hired", team: "sales", color: C.accent },
  { month: "Jun", label: "3 Sales + RM × 3", team: "mgmt", color: C.purple },
  { month: "Jul", label: "3 Sales Hired", team: "sales", color: C.accent },
  { month: "Aug", label: "3 Sales + 6 Service", team: "service", color: C.green },
];

// Sales funnel from doc: 100 leads → 40 meetings → 20 trials → 10 conversions → 50-100 batteries
const FUNNEL = [
  { stage: "Leads", value: 100, color: C.accent },
  { stage: "Meetings", value: 40, color: C.teal },
  { stage: "Trials", value: 20, color: C.amber },
  { stage: "Conversions", value: 10, color: C.green },
];

// ─── SALARY ENGINE ───────────────────────────────────────────────────────────
const DEFAULT_SAL = {
  baseSalary: 1000000, scaleThreshold: 800, incrementPerTranche: 70000,
  trancheSize: 1000, annualHikePct: 10, hikeEveryMonths: 12,
  mgmtHires: [
    { at: 2500, addition: 100000, city: "Mumbai", role: "Regional Manager" },
    { at: 3500, addition: 100000, city: "Nagpur", role: "Regional Manager" },
    { at: 5000, addition: 100000, city: "HQ", role: "Senior Manager" },
  ],
};

function getHireLabel(hire) {
  if (hire.city && hire.role) return `${hire.city} · ${hire.role}`;
  if (hire.role) return hire.role;
  if (hire.city) return hire.city;
  return hire.label || "Management Trigger";
}

function computeSalary(batteries, cfg) {
  let sal = cfg.baseSalary;
  if (batteries > cfg.scaleThreshold) {
    const excess = batteries - cfg.scaleThreshold;
    const tranches = Math.floor(excess / cfg.trancheSize) + (excess % cfg.trancheSize > 0 ? 1 : 0);
    sal += tranches * cfg.incrementPerTranche;
  }
  for (const h of cfg.mgmtHires) if (batteries >= h.at) sal += h.addition;
  return Math.round(sal);
}

function getBreakdown(batteries, cfg) {
  const excess = Math.max(0, batteries - cfg.scaleThreshold);
  const tranches = excess > 0 ? Math.floor(excess / cfg.trancheSize) + (excess % cfg.trancheSize > 0 ? 1 : 0) : 0;
  const scaleAdd = Math.round(tranches * cfg.incrementPerTranche);
  const mgmtFired = cfg.mgmtHires.filter(h => batteries >= h.at);
  const mgmtAdd = mgmtFired.reduce((s, h) => s + h.addition, 0);
  return { tranches, scaleAdd, mgmtAdd, mgmtFired, total: computeSalary(batteries, cfg) };
}

function buildCurve(cfg) {
  const maxB = Math.max(6000, ...cfg.mgmtHires.map(h => h.at + 500));
  const pts = [];
  for (let b = 0; b <= maxB; b += Math.max(50, Math.round(maxB / 120))) {
    const bd = getBreakdown(b, cfg);
    pts.push({ b, base: cfg.baseSalary, scaleAdd: bd.scaleAdd, mgmtAdd: bd.mgmtAdd, total: bd.total });
  }
  return pts;
}

// ─── MODEL DEFAULTS ───────────────────────────────────────────────────────────
const DL = {
  batteryCount: 561, avgRevenue: 1900, chargerCost: 7250, chargerCount: 157,
  batteryCost: 33000, opexMonthly: 36500, officeRent: 26250, equipmentRentals: 15000,
  officeMaintenance: 4500, reimbursements: 25000, officeElectricity: 4500,
  acCharges: 9600, gstRate: 18,
};
const DS = {
  costOfBattery: 33000, earningPerBattery: 2250, perKwhCost: 40, swapFactor: 1.5,
  electricUnit: 10, stationCost: 400000, partnershipPerSwap: 5, noOfBatteries: 4,
  swapsPerDay: 33, gstRate: 18, officeRent: 26250, equipmentRentals: 11000,
  officeMaintenance: 4500, reimbursements: 25000, officeElectricity: 3500,
  acCharges: 1600, swapStationElectricity: 35000, swapCommission: 3000, officeAcDg: 8000,
};

function calcL(p, s) {
  const salaries = computeSalary(p.batteryCount, s);
  const rev = p.batteryCount * p.avgRevenue;
  const revGst = rev * (1 + p.gstRate / 100);
  const fixed = salaries + p.officeRent + p.equipmentRentals + p.officeMaintenance + p.reimbursements + p.officeElectricity + p.acCharges;
  const opex = fixed + p.opexMonthly;
  const net = rev - opex;
  const bCap = p.batteryCount * p.batteryCost;
  const cCap = p.chargerCount * p.chargerCost;
  const capex = bCap + cCap;
  return { salaries, rev, revGst, fixed, opex, net, bCap, cCap, capex, payback: net > 0 ? +(capex / net).toFixed(1) : null, margin: rev > 0 ? +((net / rev) * 100).toFixed(1) : 0 };
}

function calcS(p, s) {
  const salaries = computeSalary(p.noOfBatteries, s);
  const rev = p.swapsPerDay * 30 * p.earningPerBattery;
  const revGst = rev * (1 + p.gstRate / 100);
  const elec = p.swapsPerDay * 30 * p.swapFactor * p.electricUnit * p.perKwhCost;
  const partner = p.partnershipPerSwap * p.swapsPerDay * 30;
  const varC = p.swapStationElectricity + p.swapCommission + p.officeElectricity + p.acCharges + p.officeAcDg + elec + partner;
  const fixed = salaries + p.officeRent + p.equipmentRentals + p.officeMaintenance + p.reimbursements;
  const opex = varC + fixed;
  const gross = rev - varC;
  const net = rev - opex;
  const capex = p.stationCost + p.noOfBatteries * (1 + p.swapFactor) * p.costOfBattery;
  return { salaries, rev, revGst, elec, partner, varC, fixed, opex, gross, net, capex, payback: net > 0 ? +(capex / net).toFixed(1) : null, margin: rev > 0 ? +((net / rev) * 100).toFixed(1) : 0 };
}

// Build growth projection rows using real plan + salary engine
function buildGrowthRows(cfg, lp) {
  return GROWTH_PLAN.map((m, i) => {
    const rev = m.batteries * m.revenuePerBatt;
    const salaries = computeSalary(m.batteries, cfg);
    const totalTeam = m.salesTeam + m.serviceTeam + m.techTeam;
    const opex = m.opexLakhBase * 100000 + salaries;
    const net = rev - opex;
    const cumCapex = m.batteries * lp.batteryCost;
    return {
      ...m,
      totalTeam,
      rev,
      salaries,
      opex,
      net,
      cumCapex,
      margin: +((net / rev) * 100).toFixed(1),
      revenueL: +(rev / 100000).toFixed(2),
      opexL: +(opex / 100000).toFixed(2),
      netL: +(net / 100000).toFixed(2),
      salL: +(salaries / 100000).toFixed(2),
    };
  });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = n => n == null ? "—" : n < 0 ? `(₹${Math.abs(Math.round(n)).toLocaleString("en-IN")})` : `₹${Math.round(n).toLocaleString("en-IN")}`;
const fmtL = n => { const a = Math.abs(n); return a >= 10000000 ? `₹${(n/10000000).toFixed(2)}Cr` : a >= 100000 ? `₹${(n/100000).toFixed(2)}L` : `₹${Math.round(n/1000)}k`; };
const TT = { background: "rgba(255, 253, 250, 0.98)", border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 11, boxShadow: C.shadow, fontFamily: "'IBM Plex Mono', monospace" };

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color, tiny }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${color === C.red ? `${C.red}33` : C.border}`, borderRadius: 18, padding: tiny ? "13px 15px" : "16px 18px", flex: 1, minWidth: 150, boxShadow: C.shadow }}>
      <div style={{ color: C.label, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: tiny ? 17 : 22, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 9, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Hdr({ title, icon, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
      <span style={{ fontSize: 12, opacity: 0.72 }}>{icon}</span>
      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.02em", color: color || C.text }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${C.border}, transparent)`, marginLeft: 2 }} />
    </div>
  );
}

function Row({ label, value, onChange, min = 0, max, step = 1 }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
      <label style={{ color: C.label, fontSize: 11, flex: 1, paddingRight: 6 }}>{label}</label>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.accent, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, padding: "6px 9px", width: 108, textAlign: "right", outline: "none" }}
      />
    </div>
  );
}

function CostBar({ label, value, total, color }) {
  const pct = total > 0 ? (Math.abs(value) / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ color: C.label, fontSize: 10 }}>{label}</span>
        <span style={{ color: C.text, fontSize: 10, fontFamily: "'DM Mono', monospace" }}>{fmtL(Math.abs(value))}</span>
      </div>
      <div style={{ background: "#ece4da", borderRadius: 999, height: 6 }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.35s ease" }} />
      </div>
    </div>
  );
}

function SalaryBadge({ batteries, cfg }) {
  const bd = getBreakdown(batteries, cfg);
  const rows = [
    { label: "Base salary", val: cfg.baseSalary, color: C.label },
    bd.scaleAdd > 0 && { label: `+${bd.tranches} tranche${bd.tranches !== 1 ? "s" : ""} × ${fmtL(cfg.incrementPerTranche)}`, val: bd.scaleAdd, color: C.amber },
    ...bd.mgmtFired.map(h => ({ label: getHireLabel(h), val: h.addition, color: C.purple })),
    { label: "Total / month", val: bd.total, color: C.green, bold: true },
  ].filter(Boolean);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.purple}44`, borderRadius: 16, padding: "12px 14px", marginTop: 10 }}>
      <div style={{ color: C.purple, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 7 }}>Salary · {Number(batteries).toLocaleString("en-IN")} batteries</div>
      {rows.map(({ label, val, color, bold }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ color: bold ? C.text : C.muted, fontSize: 11, fontWeight: bold ? 700 : 400 }}>{label}</span>
          <span style={{ color, fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: bold ? 700 : 400 }}>{fmtL(val)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── GROWTH PROJECTION TAB ────────────────────────────────────────────────────
function GrowthTab({ cfg, lp }) {
  const rows = useMemo(() => buildGrowthRows(cfg, lp), [cfg, lp]);
  const breakEvenRow = rows.find(r => r.net >= 0);
  const aug = rows[rows.length - 1];

  // City chart data
  const cityData = rows.map(r => ({
    month: r.month,
    Mumbai: r.cities.mumbai,
    Pune: r.cities.pune,
    Nagpur: r.cities.nagpur,
  }));

  // Team headcount data
  const teamData = rows.map(r => ({
    month: r.month,
    Sales: r.salesTeam,
    Service: r.serviceTeam,
    Tech: r.techTeam,
  }));

  return (
    <div style={{ padding: "18px 24px", display: "grid", gap: 16 }}>

      {/* ── Top KPIs from the plan ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KPI label="Current Batteries" value="561" sub="Mar 2025 baseline" color={C.label} />
        <KPI label="Target (Aug '25)" value="5,850" sub="10× in 5 months" color={C.accent} />
        <KPI label="Aug Revenue" value={fmtL(aug.rev)} sub={`@ ₹${aug.revenuePerBatt}/batt`} color={C.green} />
        <KPI label="Aug Net Income" value={fmtL(aug.net)} sub="After scaled salaries" color={aug.net >= 0 ? C.green : C.red} />
        <KPI label="Aug Salaries" value={fmtL(aug.salaries)} sub="Auto-scaled by engine" color={C.purple} />
        <KPI label="Break-even Month" value={breakEvenRow ? breakEvenRow.label : "Beyond Aug"} sub="First profitable month" color={breakEvenRow ? C.green : C.amber} />
        <KPI label="Aug Team Size" value={`${aug.totalTeam} people`} sub={`${aug.salesTeam}S · ${aug.serviceTeam}Svc · ${aug.techTeam}T`} color={C.teal} />
      </div>

      {/* ── Revenue vs Opex Area Chart ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 20px" }}>
        <Hdr title="Revenue vs Opex vs Net Income — Mar to Aug 2025" icon="📈" color={C.accent} />
        <div style={{ color: C.muted, fontSize: 10, marginBottom: 10 }}>
          Based on 5850_Projection doc: 561 → 5,850 batteries · Revenue per battery stepping from ₹1,900 to ₹2,124
        </div>
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={rows} margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} />
            <YAxis tick={{ fill: C.muted, fontSize: 9 }} tickFormatter={v => `₹${(v/100000).toFixed(0)}L`} />
            <Tooltip contentStyle={TT} formatter={(v, n) => [`₹${(v/100000).toFixed(2)}L`, n]} />
            <Legend wrapperStyle={{ color: C.muted, fontSize: 11 }} />
            <ReferenceLine y={0} stroke={C.red} strokeDasharray="3 2" strokeOpacity={0.6} />
            <Area type="monotone" dataKey="rev" name="Revenue" fill={C.accent+"22"} stroke={C.accent} strokeWidth={2} dot={{ fill: C.accent, r: 3 }} />
            <Area type="monotone" dataKey="opex" name="Total Opex" fill={C.red+"18"} stroke={C.red} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            <Bar dataKey="net" name="Net Income" fill={C.green} opacity={0.75} radius={[4, 4, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* ── Battery Deployment by City ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 18px" }}>
          <Hdr title="Battery Deployment by City" icon="🏙️" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cityData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 9 }} />
              <YAxis tick={{ fill: C.muted, fontSize: 9 }} />
              <Tooltip contentStyle={TT} />
              <Legend wrapperStyle={{ color: C.muted, fontSize: 10 }} />
              <Bar dataKey="Mumbai" stackId="a" fill={C.accent} />
              <Bar dataKey="Pune" stackId="a" fill={C.teal} />
              <Bar dataKey="Nagpur" stackId="a" fill={C.purple} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Team Headcount Scaling ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 18px" }}>
          <Hdr title="Team Headcount — Month by Month" icon="👥" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={teamData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 9 }} />
              <YAxis tick={{ fill: C.muted, fontSize: 9 }} />
              <Tooltip contentStyle={TT} />
              <Legend wrapperStyle={{ color: C.muted, fontSize: 10 }} />
              <Bar dataKey="Sales" stackId="a" fill={C.accent} />
              <Bar dataKey="Service" stackId="a" fill={C.green} />
              <Bar dataKey="Tech" stackId="a" fill={C.purple} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* ── Salary Scaling across growth ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 18px" }}>
          <Hdr title="Salary Opex as Batteries Scale" icon="📐" color={C.purple} />
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={rows} margin={{ top: 4, right: 8, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 9 }} />
              <YAxis tick={{ fill: C.muted, fontSize: 9 }} tickFormatter={v => `₹${(v/100000).toFixed(1)}L`} />
              <Tooltip contentStyle={TT} formatter={v => [`₹${(v/100000).toFixed(2)}L`]} />
              {cfg.mgmtHires.map(h => {
                const hitMonth = GROWTH_PLAN.find(m => m.batteries >= h.at);
                return hitMonth ? (
                  <ReferenceLine key={h.at} x={hitMonth.month} stroke={C.purple} strokeDasharray="4 2"
                    label={{ value: getHireLabel(h), fill: C.purple, fontSize: 8, position: "insideTopRight" }} />
                ) : null;
              })}
              <Line type="monotone" dataKey="rev" name="Revenue" stroke={C.accent} strokeWidth={1.5} dot={false} strokeDasharray="5 2" />
              <Line type="stepAfter" dataKey="salaries" name="Salaries" stroke={C.purple} strokeWidth={2.5} dot={{ fill: C.purple, r: 3 }} />
              <Line type="monotone" dataKey="opex" name="Total Opex" stroke={C.red} strokeWidth={1.5} dot={false} strokeDasharray="3 2" />
              <Legend wrapperStyle={{ color: C.muted, fontSize: 10 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ── Sales Funnel (from doc) ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 18px" }}>
          <Hdr title="Sales Funnel (Per Sales Person / Month)" icon="🔽" />
          <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
            {FUNNEL.map((f, i) => (
              <div key={f.stage}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ color: C.label, fontSize: 11 }}>{f.stage}</span>
                  <span style={{ color: f.color, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700 }}>{f.value}</span>
                </div>
                <div style={{ background: C.border, borderRadius: 4, height: 8 }}>
                  <div style={{ width: `${f.value}%`, height: "100%", background: f.color, borderRadius: 4, opacity: 0.85 }} />
                </div>
                {i < FUNNEL.length - 1 && (
                  <div style={{ color: C.muted, fontSize: 10, textAlign: "center", marginTop: 2 }}>↓ {Math.round((FUNNEL[i+1].value/f.value)*100)}% convert</div>
                )}
              </div>
            ))}
            <div style={{ marginTop: 8, padding: "8px 10px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.muted, fontSize: 10 }}>10 conversions → <span style={{ color: C.green, fontFamily: "'DM Mono', monospace" }}>50–100 batteries/salesperson</span></div>
              <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>Target: <span style={{ color: C.accent, fontFamily: "'DM Mono', monospace" }}>150–200 batteries/month per person</span></div>
              <div style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>Onboard time: <span style={{ color: C.amber, fontFamily: "'DM Mono', monospace" }}>2–4 days</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Detailed Monthly Table ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 20px" }}>
        <Hdr title="Month-by-Month Projection Table" icon="📋" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {["Month", "Batteries", "+Added", "Rev/Batt", "Revenue", "Salaries", "Total Opex", "Net Income", "Margin", "Team", "Mumbai", "Pune", "Nagpur"].map(h => (
                  <th key={h} style={{ color: C.muted, fontWeight: 600, padding: "7px 10px", textAlign: "right", fontSize: 9, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isBreakeven = r === breakEvenRow;
                const hasHire = HIRING_EVENTS.find(h => h.month === r.month);
                return (
                  <tr key={r.month} style={{ borderBottom: `1px solid ${C.border}`, background: isBreakeven ? `${C.green}0d` : i % 2 === 0 ? `${C.card}80` : "transparent" }}>
                    <td style={{ padding: "6px 10px", color: C.text, fontWeight: 700, fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>
                      {r.label}
                      {isBreakeven && <span style={{ color: C.green, fontSize: 8, marginLeft: 4 }}>✓ BE</span>}
                      {hasHire && <span style={{ color: hasHire.color, fontSize: 8, marginLeft: 4 }}>↑ hire</span>}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: C.accent, fontWeight: 700 }}>{r.batteries.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: C.teal }}>{r.addedBatt > 0 ? `+${r.addedBatt.toLocaleString("en-IN")}` : "—"}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: C.label }}>₹{r.revenuePerBatt.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: C.accent }}>₹{(r.rev/100000).toFixed(2)}L</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: C.purple }}>₹{(r.salaries/100000).toFixed(2)}L</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: r.opex > r.rev ? C.red : C.amber }}>₹{(r.opex/100000).toFixed(2)}L</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: r.net >= 0 ? C.green : C.red, fontWeight: 700 }}>
                      {r.net >= 0 ? "+" : ""}₹{(r.net/100000).toFixed(2)}L
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: r.margin >= 0 ? C.green : C.red }}>{r.margin.toFixed(1)}%</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: C.teal }}>{r.totalTeam}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: C.accent }}>{r.cities.mumbai.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: C.teal }}>{r.cities.pune.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: C.purple }}>{r.cities.nagpur.toLocaleString("en-IN")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Hiring events legend */}
        <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
          {HIRING_EVENTS.map(h => (
            <div key={h.month} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: h.color }} />
              <span style={{ color: C.muted, fontSize: 10 }}>{h.month}: {h.label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: C.green, fontSize: 10 }}>✓ BE = break-even month</span>
          </div>
        </div>
      </div>

      {/* ── City strategy cards (from doc) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { city: "Mumbai", icon: "🚀", role: "Primary Growth Engine", target: "2,900", pct: "50%", color: C.accent, notes: "High density · Strong fleet demand · Faster deployment", salesTeam: "8–9", serviceTeam: "9–10" },
          { city: "Pune", icon: "⚖️", role: "Stable Growth Market", target: "1,750", pct: "30%", color: C.teal, notes: "Existing base · Moderate expansion · Current 166 batteries", salesTeam: "4–5", serviceTeam: "5–6" },
          { city: "Nagpur", icon: "🌱", role: "New Expansion Market", target: "1,200", pct: "20%", color: C.purple, notes: "Early stage · High upside · Starting from near zero", salesTeam: "3–4", serviceTeam: "3–4" },
        ].map(({ city, icon, role, target, pct, color, notes, salesTeam, serviceTeam }) => (
          <div key={city} style={{ background: C.surface, border: `1px solid ${color}33`, borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span>{icon}</span>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color }}>{city}</span>
              <span style={{ marginLeft: "auto", color, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700 }}>{pct}</span>
            </div>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 8 }}>{role}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 700, color, marginBottom: 8 }}>{target}</div>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 8, lineHeight: 1.6 }}>{notes}</div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              <div style={{ color: C.muted, fontSize: 9 }}>Sales: <span style={{ color: C.accent }}>{salesTeam}</span></div>
              <div style={{ color: C.muted, fontSize: 9 }}>Service: <span style={{ color: C.green }}>{serviceTeam}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SALARY ENGINE TAB ────────────────────────────────────────────────────────
function SalaryTab({ cfg, setCfg }) {
  const set = k => v => setCfg(c => ({ ...c, [k]: v }));
  const updateHire = (i, field, val) => setCfg(c => ({ ...c, mgmtHires: c.mgmtHires.map((h, idx) => idx === i ? { ...h, [field]: val } : h) }));
  const addHire = () => setCfg(c => ({ ...c, mgmtHires: [...c.mgmtHires, { at: 3500, addition: 100000, city: "New City", role: "Manager" }] }));
  const removeHire = i => setCfg(c => ({ ...c, mgmtHires: c.mgmtHires.filter((_, idx) => idx !== i) }));
  const curve = buildCurve(cfg);

  const milestones = [
    cfg.scaleThreshold - 100, cfg.scaleThreshold, cfg.scaleThreshold + 1,
    ...cfg.mgmtHires.flatMap(h => [h.at - 1, h.at, h.at + 1]),
    5500, 6000
  ].filter((v, i, a) => v > 0 && a.indexOf(v) === i).sort((a, b) => a - b);

  return (
    <div style={{ padding: "18px 24px", display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14 }}>

        {/* Controls */}
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 17px" }}>
            <Hdr title="Core Parameters" icon="⚙️" />
            <Row label="Base salary (₹/month)" value={cfg.baseSalary} onChange={set("baseSalary")} step={10000} />
            <Row label="Flat threshold (batteries)" value={cfg.scaleThreshold} onChange={set("scaleThreshold")} min={1} />
            <Row label="Increase per 1,000 batteries (₹)" value={cfg.incrementPerTranche} onChange={set("incrementPerTranche")} min={0} step={10000} />
            <Row label="Tranche size (batteries)" value={cfg.trancheSize} onChange={set("trancheSize")} min={100} step={100} />
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 17px" }}>
            <Hdr title="Annual Hike" icon="📈" />
            <Row label="Hike rate (% p.a.)" value={cfg.annualHikePct} onChange={set("annualHikePct")} min={0} max={50} step={0.5} />
            <Row label="Apply every N months" value={cfg.hikeEveryMonths} onChange={set("hikeEveryMonths")} min={1} max={24} />
            <div style={{ marginTop: 10, padding: "8px 10px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
              {[0, 1, 2, 3].map(yr => {
                const cycles = Math.floor((yr * 12) / cfg.hikeEveryMonths);
                const hiked = Math.round(cfg.baseSalary * Math.pow(1 + cfg.annualHikePct / 100, cycles));
                return (
                  <div key={yr} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                    <span style={{ color: C.muted, fontSize: 10 }}>Year {yr}</span>
                    <span style={{ color: yr > 0 ? C.pink : C.label, fontSize: 10, fontFamily: "'DM Mono', monospace" }}>{fmtL(hiked)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 17px" }}>
            <Hdr title="City and Role Hiring Triggers" icon="🏢" color={C.purple} />
            <div style={{ display: "grid", gap: 9 }}>
              {cfg.mgmtHires.map((h, i) => (
                <div key={i} style={{ background: C.card, border: `1px solid ${C.purple}44`, borderRadius: 10, padding: "9px 11px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <div style={{ color: C.purple, fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>
                      {getHireLabel(h)}
                    </div>
                    <button onClick={() => removeHire(i)} style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", fontSize: 14 }}>×</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ color: C.muted, fontSize: 9, marginBottom: 2 }}>City</div>
                      <input value={h.city || ""} onChange={e => updateHire(i, "city", e.target.value)}
                        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontFamily: "'Manrope', sans-serif", fontSize: 11, padding: "6px 8px", width: "100%", outline: "none" }} />
                    </div>
                    <div>
                      <div style={{ color: C.muted, fontSize: 9, marginBottom: 2 }}>Role</div>
                      <input value={h.role || ""} onChange={e => updateHire(i, "role", e.target.value)}
                        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontFamily: "'Manrope', sans-serif", fontSize: 11, padding: "6px 8px", width: "100%", outline: "none" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.muted, fontSize: 9, marginBottom: 2 }}>At batteries</div>
                      <input type="number" value={h.at} step={100} onChange={e => updateHire(i, "at", parseFloat(e.target.value) || 0)}
                        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.accent, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: "6px 8px", width: "100%", outline: "none" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.muted, fontSize: 9, marginBottom: 2 }}>Addition (₹/mo)</div>
                      <input type="number" value={h.addition} step={10000} onChange={e => updateHire(i, "addition", parseFloat(e.target.value) || 0)}
                        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.purple, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: "6px 8px", width: "100%", outline: "none" }} />
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={addHire} style={{ background: `${C.purple}15`, border: `1px dashed ${C.purple}55`, borderRadius: 8, color: C.purple, cursor: "pointer", padding: "7px", fontSize: 11, fontWeight: 600 }}>
                + Add trigger
              </button>
            </div>
          </div>
        </div>

        {/* Curve + table */}
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 18px" }}>
            <Hdr title="Salary Curve — Full Range" icon="📈" />
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={curve} margin={{ top: 4, right: 14, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="b" tick={{ fill: C.muted, fontSize: 9 }} />
                <YAxis tick={{ fill: C.muted, fontSize: 9 }} tickFormatter={v => fmtL(v)} />
                <Tooltip contentStyle={TT} formatter={(v, n) => [fmtL(v), n]} labelFormatter={v => `${v} batteries`} />
                <ReferenceLine x={cfg.scaleThreshold} stroke={C.amber} strokeDasharray="4 2" label={{ value: "Scale starts", fill: C.amber, fontSize: 8, position: "insideTopRight" }} />
                {cfg.mgmtHires.map(h => (
                  <ReferenceLine key={h.at} x={h.at} stroke={C.purple} strokeDasharray="4 2"
                    label={{ value: getHireLabel(h), fill: C.purple, fontSize: 8, position: "insideTopRight" }} />
                ))}
                <Line type="stepAfter" dataKey="base" stroke={C.border} strokeWidth={1} dot={false} name="Base" />
                <Line type="stepAfter" dataKey="scaleAdd" stroke={C.amber} strokeWidth={1.5} dot={false} name="Flat scale add" />
                <Line type="stepAfter" dataKey="mgmtAdd" stroke={C.purple} strokeWidth={1.5} dot={false} name="Mgmt add" />
                <Line type="stepAfter" dataKey="total" stroke={C.green} strokeWidth={2.5} dot={false} name="Total" />
                <Legend wrapperStyle={{ color: C.muted, fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 18px" }}>
            <Hdr title="Key Salary Milestones" icon="🎯" />
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Batteries", "Tranches", "Scale Add", "Mgmt Add", "Total / Month", "vs Base"].map(h => (
                    <th key={h} style={{ color: C.muted, fontWeight: 600, padding: "5px 8px", textAlign: "right", fontSize: 9 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {milestones.map(b => {
                  const bd = getBreakdown(b, cfg);
                  const isMgmt = cfg.mgmtHires.some(h => h.at === b);
                  const isThresh = b === cfg.scaleThreshold;
                  const hi = isMgmt || isThresh;
                  return (
                    <tr key={b} style={{ borderBottom: `1px solid ${C.border}`, background: hi ? `${C.purple}0d` : "transparent" }}>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: hi ? C.purple : C.text, fontWeight: hi ? 700 : 400 }}>
                        {b.toLocaleString("en-IN")} {isMgmt && "🏢"}
                      </td>
                      <td style={{ padding: "5px 8px", textAlign: "right", color: C.label }}>{bd.tranches}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: C.amber }}>{bd.scaleAdd > 0 ? `+${bd.scaleAdd.toLocaleString("en-IN")}` : "—"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: C.purple }}>{bd.mgmtAdd > 0 ? `+${bd.mgmtAdd.toLocaleString("en-IN")}` : "—"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: C.green, fontWeight: 700 }}>{bd.total.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", color: C.amber }}>+{(((bd.total - cfg.baseSalary) / cfg.baseSalary) * 100).toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("growth");
  const [lp, setLp] = useState(DL);
  const [sp, setSp] = useState(DS);
  const [sal, setSal] = useState(DEFAULT_SAL);

  const lr = calcL(lp, sal);
  const sr = calcS(sp, sal);
  const setL = k => v => setLp(p => ({ ...p, [k]: v }));
  const setS = k => v => setSp(p => ({ ...p, [k]: v }));

  const netCurve = useMemo(() => {
    const pts = [];
    for (let b = 50; b <= 6000; b += 50) {
      const r = calcL({ ...lp, batteryCount: b }, sal);
      pts.push({ b, net: r.net, sal: r.salaries, rev: r.rev });
    }
    return pts;
  }, [lp, sal]);

  const swapSens = useMemo(() => Array.from({ length: 10 }, (_, i) => {
    const s = 10 + i * 9;
    const r = calcS({ ...sp, swapsPerDay: s }, sal);
    return { s, payback: r.payback, net: r.net };
  }), [sp, sal]);

  const tabs = [
    ["growth", "📈 Growth Plan"],
    ["leasing", "🔋 Battery Leasing"],
    ["swap", "⚡ Swap Station"],
    ["salary", "📐 Salary Engine"],
    ["compare", "⚖️ Compare"],
  ];

  return (
    <div className="app-shell" style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Manrope', sans-serif", color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ── HEADER ── */}
      <div className="app-frame">
      <div style={{ padding: "28px 32px 8px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,253,250,0.5))` }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12, gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ display: "flex", gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent }} />
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, opacity: 0.7 }} />
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.purple, opacity: 0.55 }} />
              </div>
              <span style={{ color: C.label, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" }}>Ezy EV · Finance & Growth Model v4</span>
            </div>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 44, fontWeight: 700, margin: 0, letterSpacing: "-0.02em", lineHeight: 0.92 }}>
              Station Economics Dashboard
            </h1>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 8, maxWidth: 640, lineHeight: 1.6 }}>
              5,850 battery projection · Mar–Aug 2025 · Mumbai · Pune · Nagpur · Dynamic salary scaling
            </div>
          </div>
          <div className="tab-row" style={{ display: "flex", gap: 8, paddingBottom: 10, flexWrap: "wrap" }}>
            {tabs.map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} className="tab-button" style={{
                background: tab === t ? (t === "growth" ? C.green : t === "salary" ? C.purple : C.accent) : "rgba(255,255,255,0.6)",
                color: tab === t ? "#fffdfa" : C.muted,
                border: `1px solid ${tab === t ? (t === "growth" ? C.green : t === "salary" ? C.purple : C.accent) : C.border}`,
                borderRadius: 999, padding: "10px 16px", cursor: "pointer",
                fontFamily: "'Manrope', sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.04em", transition: "all 0.15s", boxShadow: tab === t ? "none" : "inset 0 1px 0 rgba(255,255,255,0.7)",
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── GROWTH PLAN ── */}
      {tab === "growth" && <GrowthTab cfg={sal} lp={lp} />}

      {/* ── BATTERY LEASING ── */}
      {tab === "leasing" && (
        <div style={{ padding: "18px 24px", display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <KPI label="Monthly Revenue" value={fmtL(lr.rev)} sub={`With GST: ${fmtL(lr.revGst)}`} color={C.accent} />
            <KPI label="Salaries (scaled)" value={fmtL(lr.salaries)} sub={`Base: ${fmtL(sal.baseSalary)}`} color={C.purple} />
            <KPI label="Total Opex" value={fmtL(lr.opex)} color={lr.opex > lr.rev ? C.red : C.amber} />
            <KPI label="Net Income" value={fmtL(lr.net)} color={lr.net >= 0 ? C.green : C.red} />
            <KPI label="Net Margin" value={`${lr.margin}%`} color={lr.margin >= 0 ? C.green : C.red} />
            <KPI label="Total Capex" value={fmtL(lr.capex)} color={C.accent} />
            <KPI label="Payback" value={lr.payback ? `${lr.payback}m` : "∞"} color={lr.payback && lr.payback <= 36 ? C.green : C.amber} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px" }}>
              <Hdr title="Inputs" icon="⚙️" />
              <div style={{ color: C.accent, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Fleet</div>
              <Row label="Batteries" value={lp.batteryCount} onChange={setL("batteryCount")} min={1} max={10000} />
              <Row label="Avg revenue / battery (₹)" value={lp.avgRevenue} onChange={setL("avgRevenue")} />
              <Row label="Battery cost (₹)" value={lp.batteryCost} onChange={setL("batteryCost")} />
              <Row label="No. of chargers" value={lp.chargerCount} onChange={setL("chargerCount")} />
              <Row label="Charger cost (₹)" value={lp.chargerCost} onChange={setL("chargerCost")} />
              <div style={{ color: C.green, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "9px 0 5px" }}>Fixed Costs / Month</div>
              <Row label="Office rent (₹)" value={lp.officeRent} onChange={setL("officeRent")} />
              <Row label="Equipment rentals (₹)" value={lp.equipmentRentals} onChange={setL("equipmentRentals")} />
              <Row label="Office maintenance (₹)" value={lp.officeMaintenance} onChange={setL("officeMaintenance")} />
              <Row label="Reimbursements (₹)" value={lp.reimbursements} onChange={setL("reimbursements")} />
              <Row label="Office electricity (₹)" value={lp.officeElectricity} onChange={setL("officeElectricity")} />
              <Row label="AC charges (₹)" value={lp.acCharges} onChange={setL("acCharges")} />
              <div style={{ color: C.amber, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "9px 0 5px" }}>Variable Opex</div>
              <Row label="Monthly opex (₹)" value={lp.opexMonthly} onChange={setL("opexMonthly")} />
              <Row label="GST Rate (%)" value={lp.gstRate} onChange={setL("gstRate")} max={30} />
              <SalaryBadge batteries={lp.batteryCount} cfg={sal} />
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 18px" }}>
                <Hdr title="Monthly P&L" icon="📊" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ color: C.muted, fontSize: 10, marginBottom: 8 }}>Cost Breakdown</div>
                    <CostBar label="Salaries (scaled)" value={lr.salaries} total={lr.opex} color={C.purple} />
                    <CostBar label="Equipment Rentals" value={lp.equipmentRentals} total={lr.opex} color="#4a7fa5" />
                    <CostBar label="Office Rent" value={lp.officeRent} total={lr.opex} color="#3d5a80" />
                    <CostBar label="Reimbursements" value={lp.reimbursements} total={lr.opex} color={C.amber} />
                    <CostBar label="Variable Opex" value={lp.opexMonthly} total={lr.opex} color={C.red} />
                    <CostBar label="Electricity + AC" value={lp.officeElectricity + lp.acCharges} total={lr.opex} color="#d4a017" />
                    <CostBar label="Maintenance" value={lp.officeMaintenance} total={lr.opex} color={C.muted} />
                  </div>
                  <div>
                    <div style={{ color: C.muted, fontSize: 10, marginBottom: 8 }}>Income Statement</div>
                    {[
                      { label: "Revenue (ex-GST)", val: lr.rev, color: C.accent },
                      { label: "Variable Opex", val: -lp.opexMonthly, color: C.red },
                      { label: "Salaries (scaled)", val: -lr.salaries, color: C.purple },
                      { label: "Other Fixed", val: -(lr.fixed - lr.salaries), color: "#4a7fa5" },
                      { label: "Net Income", val: lr.net, color: lr.net >= 0 ? C.green : C.red },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ color: C.label, fontSize: 11 }}>{label}</span>
                        <span style={{ color, fontSize: 12, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmt(val)}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 9, padding: "9px 11px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ color: C.muted, fontSize: 10 }}>Battery Capex: <span style={{ color: C.text, fontFamily: "'DM Mono', monospace" }}>{fmt(lr.bCap)}</span></div>
                      <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>Charger Capex: <span style={{ color: C.text, fontFamily: "'DM Mono', monospace" }}>{fmt(lr.cCap)}</span></div>
                      <div style={{ color: C.muted, fontSize: 10, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>Total Capex: <span style={{ color: C.text, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{fmt(lr.capex)}</span></div>
                      <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>Payback: <span style={{ color: lr.payback && lr.payback <= 36 ? C.green : C.amber, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{lr.payback ? `${lr.payback} months` : "Not profitable"}</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 18px" }}>
                <Hdr title="Net Income vs Fleet Size — Salary Steps" icon="📈" />
                <ResponsiveContainer width="100%" height={185}>
                  <LineChart data={netCurve} margin={{ top: 4, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="b" tick={{ fill: C.muted, fontSize: 9 }} />
                    <YAxis tick={{ fill: C.muted, fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={TT} formatter={(v, n) => [fmt(v), n]} labelFormatter={v => `${v} batteries`} />
                    <ReferenceLine x={sal.scaleThreshold} stroke={C.amber} strokeDasharray="3 2" strokeOpacity={0.5} />
                    {sal.mgmtHires.map(h => <ReferenceLine key={`${h.at}-${getHireLabel(h)}`} x={h.at} stroke={C.purple} strokeDasharray="3 2" label={{ value: getHireLabel(h), fill: C.purple, fontSize: 8, position: "top" }} />)}
                    <ReferenceLine y={0} stroke={C.red} strokeDasharray="2 2" strokeOpacity={0.7} />
                    <Line type="monotone" dataKey="rev" stroke={C.accent} strokeWidth={1.5} dot={false} name="Revenue" />
                    <Line type="monotone" dataKey="net" stroke={C.green} strokeWidth={2} dot={false} name="Net Income" />
                    <Line type="stepAfter" dataKey="sal" stroke={C.purple} strokeWidth={1.5} dot={false} name="Salaries" strokeDasharray="5 3" />
                    <Legend wrapperStyle={{ color: C.muted, fontSize: 10 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SWAP STATION ── */}
      {tab === "swap" && (
        <div style={{ padding: "18px 24px", display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <KPI label="Monthly Revenue" value={fmtL(sr.rev)} sub={`With GST: ${fmtL(sr.revGst)}`} color={C.accent} />
            <KPI label="Salaries (scaled)" value={fmtL(sr.salaries)} color={C.purple} />
            <KPI label="Gross Income" value={fmtL(sr.gross)} color={sr.gross >= 0 ? C.green : C.red} />
            <KPI label="Net Income" value={fmtL(sr.net)} color={sr.net >= 0 ? C.green : C.red} />
            <KPI label="Net Margin" value={`${sr.margin}%`} color={sr.margin >= 0 ? C.green : C.red} />
            <KPI label="Capex" value={fmtL(sr.capex)} color={C.accent} />
            <KPI label="Payback" value={sr.payback ? `${sr.payback}m` : "∞"} color={sr.payback && sr.payback <= 36 ? C.green : C.amber} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px" }}>
              <Hdr title="Inputs" icon="⚙️" />
              <div style={{ color: C.accent, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Operations</div>
              <Row label="Swaps per day" value={sp.swapsPerDay} onChange={setS("swapsPerDay")} min={1} max={300} />
              <Row label="Earning / battery (₹)" value={sp.earningPerBattery} onChange={setS("earningPerBattery")} />
              <Row label="No. of batteries" value={sp.noOfBatteries} onChange={setS("noOfBatteries")} min={1} />
              <Row label="Swap factor" value={sp.swapFactor} onChange={setS("swapFactor")} min={1} max={5} step={0.1} />
              <Row label="Partnership / swap (₹)" value={sp.partnershipPerSwap} onChange={setS("partnershipPerSwap")} />
              <div style={{ color: C.amber, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "9px 0 5px" }}>Energy</div>
              <Row label="Per kWh cost (₹)" value={sp.perKwhCost} onChange={setS("perKwhCost")} />
              <Row label="kWh per swap" value={sp.electricUnit} onChange={setS("electricUnit")} step={0.5} />
              <Row label="Station electricity (₹)" value={sp.swapStationElectricity} onChange={setS("swapStationElectricity")} />
              <div style={{ color: C.green, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "9px 0 5px" }}>Fixed Costs</div>
              <Row label="Office rent (₹)" value={sp.officeRent} onChange={setS("officeRent")} />
              <Row label="Equipment rentals (₹)" value={sp.equipmentRentals} onChange={setS("equipmentRentals")} />
              <Row label="Reimbursements (₹)" value={sp.reimbursements} onChange={setS("reimbursements")} />
              <div style={{ color: C.red, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "9px 0 5px" }}>Variable Costs</div>
              <Row label="Swap commission (₹)" value={sp.swapCommission} onChange={setS("swapCommission")} />
              <Row label="Office AC/DG (₹)" value={sp.officeAcDg} onChange={setS("officeAcDg")} />
              <Row label="Station cost (₹)" value={sp.stationCost} onChange={setS("stationCost")} />
              <Row label="Battery cost (₹)" value={sp.costOfBattery} onChange={setS("costOfBattery")} />
              <Row label="GST Rate (%)" value={sp.gstRate} onChange={setS("gstRate")} max={30} />
              <SalaryBadge batteries={sp.noOfBatteries} cfg={sal} />
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 18px" }}>
                <Hdr title="Monthly P&L" icon="📊" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ color: C.muted, fontSize: 10, marginBottom: 8 }}>Cost Breakdown</div>
                    <CostBar label="Salaries (scaled)" value={sr.salaries} total={sr.opex} color={C.purple} />
                    <CostBar label="Station Electricity" value={sp.swapStationElectricity} total={sr.opex} color={C.red} />
                    <CostBar label="Electric (usage)" value={sr.elec} total={sr.opex} color="#ff7f50" />
                    <CostBar label="Partner Cost" value={sr.partner} total={sr.opex} color={C.amber} />
                    <CostBar label="Swap Commission" value={sp.swapCommission} total={sr.opex} color="#d4a017" />
                    <CostBar label="Office Rent" value={sp.officeRent} total={sr.opex} color="#4a7fa5" />
                    <CostBar label="Other Fixed" value={sp.reimbursements + sp.officeMaintenance + sp.equipmentRentals} total={sr.opex} color={C.muted} />
                  </div>
                  <div>
                    <div style={{ color: C.muted, fontSize: 10, marginBottom: 8 }}>Income Statement</div>
                    {[
                      { label: "Revenue (ex-GST)", val: sr.rev, color: C.accent },
                      { label: "Variable Costs", val: -sr.varC, color: C.red },
                      { label: "Gross Income", val: sr.gross, color: sr.gross >= 0 ? C.green : C.red },
                      { label: "Salaries (scaled)", val: -sr.salaries, color: C.purple },
                      { label: "Other Fixed", val: -(sr.fixed - sr.salaries), color: "#4a7fa5" },
                      { label: "Net Income", val: sr.net, color: sr.net >= 0 ? C.green : C.red },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ color: C.label, fontSize: 11 }}>{label}</span>
                        <span style={{ color, fontSize: 12, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmt(val)}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 9, padding: "9px 11px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ color: C.muted, fontSize: 10 }}>Total Capex: <span style={{ color: C.text, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{fmt(sr.capex)}</span></div>
                      <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>Payback: <span style={{ color: sr.payback && sr.payback <= 36 ? C.green : C.amber, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{sr.payback ? `${sr.payback} months` : "Not profitable"}</span></div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 18px" }}>
                <Hdr title="Payback Sensitivity — Swaps / Day" icon="📈" />
                <ResponsiveContainer width="100%" height={165}>
                  <LineChart data={swapSens} margin={{ top: 4, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="s" tick={{ fill: C.muted, fontSize: 9 }} label={{ value: "Swaps/day", position: "insideBottomRight", offset: -4, fill: C.muted, fontSize: 9 }} />
                    <YAxis yAxisId="l" tick={{ fill: C.muted, fontSize: 9 }} unit="m" />
                    <YAxis yAxisId="r" orientation="right" tick={{ fill: C.muted, fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={TT} formatter={(v, n) => [n === "payback" ? `${v}m` : fmt(v), n === "payback" ? "Payback" : "Net Income"]} />
                    <ReferenceLine yAxisId="r" y={0} stroke={C.red} strokeDasharray="2 2" />
                    <Line yAxisId="l" type="monotone" dataKey="payback" stroke={C.accent} strokeWidth={2} dot={{ fill: C.accent, r: 2 }} name="payback" />
                    <Line yAxisId="r" type="monotone" dataKey="net" stroke={C.green} strokeWidth={1.5} dot={false} name="netIncome" strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SALARY ENGINE ── */}
      {tab === "salary" && <SalaryTab cfg={sal} setCfg={setSal} />}

      {/* ── COMPARE ── */}
      {tab === "compare" && (
        <div style={{ padding: "18px 24px", display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Monthly Revenue", sv: sr.rev, lv: lr.rev, f: fmtL },
              { label: "Salaries (scaled)", sv: sr.salaries, lv: lr.salaries, f: fmtL, col: C.purple },
              { label: "Total Opex", sv: sr.opex, lv: lr.opex, f: fmtL },
              { label: "Net Income", sv: sr.net, lv: lr.net, f: fmtL },
              { label: "Net Margin", sv: `${sr.margin}%`, lv: `${lr.margin}%`, f: x => x },
              { label: "Payback", sv: sr.payback, lv: lr.payback, f: x => x ? `${x}m` : "∞" },
            ].map(({ label, sv, lv, f, col }) => (
              <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 17px" }}>
                <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>{label}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[["Swap Station", sv, C.accent], ["Battery Leasing", lv, C.green]].map(([name, val, color]) => (
                    <div key={name}>
                      <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>{name}</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 18, color: col || (typeof val === "number" && val < 0 ? C.red : color) }}>{f(val)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px 18px" }}>
            <Hdr title="Revenue vs Salaries vs Net Income" icon="⚖️" />
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[
                { name: "Revenue", swap: sr.rev, lease: lr.rev },
                { name: "Salaries", swap: sr.salaries, lease: lr.salaries },
                { name: "Total Opex", swap: sr.opex, lease: lr.opex },
                { name: "Net Income", swap: sr.net, lease: lr.net },
              ]} margin={{ top: 6, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} />
                <YAxis tick={{ fill: C.muted, fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TT} formatter={v => [fmt(v)]} />
                <Legend wrapperStyle={{ color: C.muted, fontSize: 11 }} />
                <ReferenceLine y={0} stroke={C.red} strokeDasharray="2 2" />
                <Bar dataKey="swap" name="Swap Station" fill={C.accent} radius={[4, 4, 0, 0]} opacity={0.85} />
                <Bar dataKey="lease" name="Battery Leasing" fill={C.green} radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div style={{ padding: "14px 24px 18px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: C.muted, fontSize: 10 }}>
          Growth plan: 561→5,850 batteries · Mumbai 50% · Pune 30% · Nagpur 20% · Salary: {fmtL(sal.baseSalary)} base · +{fmtL(sal.incrementPerTranche)} per {sal.trancheSize.toLocaleString("en-IN")} batteries beyond {sal.scaleThreshold}
        </span>
        <span style={{ color: C.muted, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}>Ezy EV · v4.0</span>
      </div>
      </div>
    </div>
  );
}
