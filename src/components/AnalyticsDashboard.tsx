"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type LineDotProps = {
  cx?: number;
  cy?: number;
  payload?: { ticker: string; changePercent: number };
};

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

type SectorPerf = {
  sectorName: string;
  ticker: string;
  changePercent: number;
};

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
  const [sectorPerf, setSectorPerf] = useState<SectorPerf[]>([]);
  const [isLoadingSectors, setIsLoadingSectors] = useState(true);
  const [sectorError, setSectorError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSectors() {
      setIsLoadingSectors(true);
      setSectorError("");
      try {
        const res = await fetch(`/api/market-sectors?timeframe=${timeframe}`);
        if (!res.ok) throw new Error("שגיאה בקבלת נתוני מגזרים");
        const data: SectorPerf[] = await res.json();
        if (!cancelled) setSectorPerf(data);
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

        {/* Market sector performance bar chart */}
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
          {sectorError && <div className="mb-3 text-[13px] text-red-400">{sectorError}</div>}
          {isLoadingSectors ? (
            <div className="flex h-72 items-center justify-center text-sm text-slate-500">טוען נתונים...</div>
          ) : (
            <ResponsiveContainer width="100%" height={288}>
              <LineChart data={sectorPerf} margin={{ top: 8, right: 8, left: 8, bottom: 45 }}>
                <XAxis
                  dataKey="ticker"
                  tickFormatter={formatSectorLabel}
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  axisLine={{ stroke: "#334155" }}
                  tickLine={false}
                  interval={0}
                  angle={-40}
                  textAnchor="end"
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#334155" }} tickLine={false} unit="%" />
                <Tooltip
                  labelFormatter={(label) => formatSectorLabel(String(label))}
                  formatter={(value) => {
                    const num = Number(value);
                    return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
                  }}
                  contentStyle={tooltipContentStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Line
                  type="monotone"
                  dataKey="changePercent"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  isAnimationActive={false}
                  activeDot={{ r: 6 }}
                  dot={(props: LineDotProps) => {
                    const { cx = 0, cy = 0, payload } = props;
                    const fill = (payload?.changePercent ?? 0) >= 0 ? "#34d399" : "#f87171";
                    return (
                      <circle
                        key={payload?.ticker}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={fill}
                        stroke="#0f172a"
                        strokeWidth={1}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
