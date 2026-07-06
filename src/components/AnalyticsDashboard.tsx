"use client";

import { useEffect, useMemo, useState } from "react";
import { Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const SECTOR_NAME_HE: Record<string, string> = {
  XLK: "טכנולוגיה",
  XLF: "פיננסים",
  XLV: "בריאות",
  XLE: "אנרגיה",
  XLY: "צריכה מחזורית",
  XLP: "צריכה בסיסית",
  XLI: "תעשייה",
  XLB: "חומרי גלם",
  XLRE: "נדל״ן",
  XLU: "תשתיות",
  XLC: "תקשורת",
};

const SECTOR_COLORS: Record<string, string> = {
  XLK: "#60a5fa",
  XLF: "#34d399",
  XLV: "#f472b6",
  XLE: "#fbbf24",
  XLY: "#a78bfa",
  XLP: "#fb923c",
  XLI: "#22d3ee",
  XLB: "#a3e635",
  XLRE: "#f87171",
  XLU: "#818cf8",
  XLC: "#facc15",
};

const ALL_SECTOR_TICKERS = Object.keys(SECTOR_NAME_HE);

function formatSectorLabel(ticker: string): string {
  const name = SECTOR_NAME_HE[ticker];
  return name ? `${name} (${ticker})` : ticker;
}

type AnalyticsPosition = {
  ticker: string;
  shares: number;
  current_price: number;
};

type Timeframe = "1D" | "1W" | "1M" | "1Y";

type SectorSeriesPoint = {
  date: string;
  [ticker: string]: number | string;
};

type HistoryCurrency = "usd" | "ils";

type PortfolioSnapshot = {
  id: string;
  total_usd: number;
  total_ils: number;
  snapshot_date: string;
};

type PortfolioSnapshotRow = {
  id: string;
  total_usd: number | string;
  total_ils: number | string;
  snapshot_date: string;
};

function mapSnapshotRow(row: PortfolioSnapshotRow): PortfolioSnapshot {
  return {
    id: row.id,
    total_usd: Number(row.total_usd),
    total_ils: Number(row.total_ils),
    snapshot_date: row.snapshot_date,
  };
}

const TIMEFRAME_OPTIONS: { key: Timeframe; label: string }[] = [
  { key: "1D", label: "יומי" },
  { key: "1W", label: "שבועי" },
  { key: "1M", label: "חודשי" },
  { key: "1Y", label: "שנתי" },
];

const PIE_COLORS = [
  "#34d399",
  "#60a5fa",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#fb923c",
  "#22d3ee",
  "#a3e635",
  "#f87171",
  "#818cf8",
  "#facc15",
];

function isIlsTicker(ticker: string): boolean {
  return ticker.trim().toUpperCase().endsWith(".TA");
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTick(dateStr: string, timeframe: Timeframe): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  if (timeframe === "1D") {
    return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function formatSnapshotDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const tooltipContentStyle = { backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 };
const tooltipItemStyle = { color: "#f1f5f9" };
const tooltipLabelStyle = { color: "#94a3b8" };

export default function AnalyticsDashboard({
  positions,
  sectorByTicker,
  ilsRate,
}: {
  positions: AnalyticsPosition[];
  sectorByTicker: Record<string, string>;
  ilsRate: number | null;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [sectorSeries, setSectorSeries] = useState<SectorSeriesPoint[]>([]);
  const [isLoadingSectors, setIsLoadingSectors] = useState(true);
  const [sectorError, setSectorError] = useState("");
  const [selectedSectors, setSelectedSectors] = useState<string[]>(ALL_SECTOR_TICKERS);

  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyCurrency, setHistoryCurrency] = useState<HistoryCurrency>("usd");

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setIsLoadingHistory(true);
      setHistoryError("");
      try {
        const res = await fetch("/api/portfolio-history");
        if (!res.ok) throw new Error("שגיאה בקבלת היסטוריית תיק");
        const data: PortfolioSnapshotRow[] = await res.json();
        if (!cancelled) setHistory(data.map(mapSnapshotRow));
      } catch (err) {
        if (!cancelled) setHistoryError(err instanceof Error ? err.message : "שגיאה בטעינת היסטוריית תיק");
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSectors() {
      setIsLoadingSectors(true);
      setSectorError("");
      try {
        const res = await fetch(`/api/market-sectors?timeframe=${timeframe}`);
        if (!res.ok) throw new Error("שגיאה בקבלת נתוני מגזרים");
        const data: SectorSeriesPoint[] = await res.json();
        if (!cancelled) setSectorSeries(data);
      } catch (err) {
        if (!cancelled) setSectorError(err instanceof Error ? err.message : "שגיאה בטעינת נתוני מגזרים");
      } finally {
        if (!cancelled) setIsLoadingSectors(false);
      }
    }

    loadSectors();
    return () => {
      cancelled = true;
    };
  }, [timeframe]);

  const toggleSector = (ticker: string) => {
    setSelectedSectors((prev) => (prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker]));
  };

  const pieData = useMemo(() => {
    const bySector: Record<string, number> = {};
    positions.forEach((p) => {
      const sector = sectorByTicker[p.ticker] || "Unknown";
      const rawValue = p.shares * p.current_price;
      const valueUsd = isIlsTicker(p.ticker) ? (ilsRate ? rawValue / ilsRate : 0) : rawValue;
      bySector[sector] = (bySector[sector] || 0) + valueUsd;
    });
    return Object.entries(bySector).map(([name, value], index) => ({
      name,
      value,
      fill: PIE_COLORS[index % PIE_COLORS.length],
    }));
  }, [positions, sectorByTicker, ilsRate]);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-white">אנליטיקה ומגמות שוק</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Portfolio allocation pie chart */}
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-xl shadow-black/25">
          <div className="mb-4 text-[15px] font-semibold text-white">חלוקת תיק לפי סקטור</div>
          {pieData.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-slate-500">אין נתונים להצגה</div>
          ) : (
            <ResponsiveContainer width="100%" height={288}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  isAnimationActive={false}
                  label={false}
                />
                <Tooltip
                  formatter={(value) => `$${money(Number(value))}`}
                  contentStyle={tooltipContentStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Market sector performance time-series chart */}
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-xl shadow-black/25">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[15px] font-semibold text-white">ביצועי מגזרי שוק</div>
            <div className="flex gap-1.5 rounded-xl border border-slate-700 bg-slate-900/50 p-1">
              {TIMEFRAME_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setTimeframe(opt.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    timeframe === opt.key ? "bg-emerald-400 text-slate-900" : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {ALL_SECTOR_TICKERS.map((ticker) => {
              const isActive = selectedSectors.includes(ticker);
              const color = SECTOR_COLORS[ticker];
              return (
                <button
                  key={ticker}
                  onClick={() => toggleSector(ticker)}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  style={{
                    borderColor: isActive ? color : "#334155",
                    backgroundColor: isActive ? `${color}26` : "transparent",
                    color: isActive ? color : "#64748b",
                  }}
                >
                  {formatSectorLabel(ticker)}
                </button>
              );
            })}
          </div>

          {sectorError && <div className="mb-3 text-[13px] text-red-400">{sectorError}</div>}
          {isLoadingSectors ? (
            <div className="flex h-72 items-center justify-center text-sm text-slate-500">טוען נתונים...</div>
          ) : selectedSectors.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-slate-500">
              בחר לפחות סקטור אחד להצגה
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={288}>
              <LineChart data={sectorSeries} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatDateTick(String(value), timeframe)}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={{ stroke: "#334155" }}
                  tickLine={false}
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={{ stroke: "#334155" }}
                  tickLine={false}
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip
                  labelFormatter={(label) => formatDateTick(String(label), timeframe)}
                  formatter={(value) => {
                    const num = Number(value);
                    return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
                  }}
                  contentStyle={tooltipContentStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                {selectedSectors.map((ticker) => (
                  <Line
                    key={ticker}
                    type="monotone"
                    dataKey={ticker}
                    name={formatSectorLabel(ticker)}
                    stroke={SECTOR_COLORS[ticker]}
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Portfolio value history */}
      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-xl shadow-black/25">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[15px] font-semibold text-white">ביצועי תיק היסטוריים</div>
          <div className="flex gap-1.5 rounded-xl border border-slate-700 bg-slate-900/50 p-1">
            <button
              onClick={() => setHistoryCurrency("usd")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                historyCurrency === "usd" ? "bg-emerald-400 text-slate-900" : "text-slate-400 hover:text-slate-100"
              }`}
            >
              $
            </button>
            <button
              onClick={() => setHistoryCurrency("ils")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                historyCurrency === "ils" ? "bg-emerald-400 text-slate-900" : "text-slate-400 hover:text-slate-100"
              }`}
            >
              ₪
            </button>
          </div>
        </div>

        {historyError && <div className="mb-3 text-[13px] text-red-400">{historyError}</div>}
        {isLoadingHistory ? (
          <div className="flex h-72 items-center justify-center text-sm text-slate-500">טוען נתונים...</div>
        ) : history.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-slate-500">
            אין עדיין נתוני היסטוריה
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <LineChart data={history} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <XAxis
                dataKey="snapshot_date"
                tickFormatter={(value) => formatSnapshotDate(String(value))}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
                minTickGap={30}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
                tickFormatter={(val) => (historyCurrency === "usd" ? `$${val}` : `₪${val}`)}
              />
              <Tooltip
                labelFormatter={(label) => formatSnapshotDate(String(label))}
                formatter={(value) => {
                  const num = Number(value);
                  return historyCurrency === "usd" ? `$${money(num)}` : `₪${money(num)}`;
                }}
                contentStyle={tooltipContentStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
              />
              <Line
                type="monotone"
                dataKey={historyCurrency === "usd" ? "total_usd" : "total_ils"}
                name={historyCurrency === "usd" ? "שווי תיק ($)" : "שווי תיק (₪)"}
                stroke={historyCurrency === "usd" ? "#34d399" : "#60a5fa"}
                strokeWidth={2}
                isAnimationActive={false}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
