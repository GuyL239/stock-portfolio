"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  TrendingUp,
  TrendingDown,
  Pencil,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Position = {
  id: string;
  ticker: string;
  shares: number;
  avg_price: number;
  current_price: number;
  stop_loss: number;
};

type PositionRow = {
  id: string;
  ticker: string;
  shares: number | string;
  avg_price: number | string;
  current_price: number | string;
  stop_loss: number | string;
};

type SortKey = "ticker" | "shares" | "avg_price" | "current_price" | "pnl" | "stop_loss";
type SortDir = "asc" | "desc";

type DeleteTarget = { id: string; ticker: string };

type StopLossStatus = {
  key: "breached" | "close" | "safe";
  color: string;
  text: string;
};

type PositionFormValues = {
  ticker: string;
  shares: string;
  avgPrice: string;
  currentPrice: string;
  stopLoss: string;
};

const EMPTY_FORM: PositionFormValues = {
  ticker: "",
  shares: "",
  avgPrice: "",
  currentPrice: "",
  stopLoss: "",
};

function mapRow(row: PositionRow): Position {
  return {
    id: row.id,
    ticker: row.ticker,
    shares: Number(row.shares),
    avg_price: Number(row.avg_price),
    current_price: Number(row.current_price),
    stop_loss: Number(row.stop_loss),
  };
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStopLossStatus(current: number, stop: number): StopLossStatus {
  const diff = ((current - stop) / stop) * 100;
  if (diff <= 0) return { key: "breached", color: "#ef4444", text: "נחצה סטופ!" };
  if (diff <= 3) return { key: "close", color: "#fb923c", text: "קרוב לסטופ" };
  return { key: "safe", color: "#34d399", text: "בטוח" };
}

function validateForm(form: PositionFormValues): string {
  const ticker = form.ticker.trim();
  const shares = parseFloat(form.shares);
  const avgPrice = parseFloat(form.avgPrice);
  const currentPrice = parseFloat(form.currentPrice);
  const stopLoss = parseFloat(form.stopLoss);

  if (!ticker) return "יש להזין סימול";
  if (!(shares > 0)) return "כמות חייבת להיות מספר חיובי";
  if (!(avgPrice > 0)) return "שער כניסה חייב להיות מספר חיובי";
  if (!(currentPrice > 0)) return "מחיר נוכחי חייב להיות מספר חיובי";
  if (!(stopLoss > 0)) return "סטופ לוס חייב להיות מספר חיובי";
  return "";
}

const SORT_COLUMNS: { key: SortKey; label: string; widthClass: string }[] = [
  { key: "ticker", label: "סימול", widthClass: "w-[10%]" },
  { key: "shares", label: "כמות", widthClass: "w-[6%]" },
  { key: "avg_price", label: "שער כניסה", widthClass: "w-[11%]" },
  { key: "current_price", label: "מחיר נוכחי", widthClass: "w-[11%]" },
  { key: "pnl", label: "רווח/הפסד", widthClass: "w-[32%]" },
  { key: "stop_loss", label: "מחיר סטופ לוס", widthClass: "w-[17%]" },
];

function PositionFields({
  values,
  onChange,
  disabled,
}: {
  values: PositionFormValues;
  onChange: (patch: Partial<PositionFormValues>) => void;
  disabled: boolean;
}) {
  const inputClass =
    "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-slate-500 disabled:opacity-50";
  return (
    <div className="mb-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div>
        <div className="mb-1.5 text-xs text-slate-400">סימול</div>
        <input
          type="text"
          value={values.ticker}
          onChange={(e) => onChange({ ticker: e.target.value })}
          placeholder="NVDA"
          disabled={disabled}
          className={inputClass}
        />
      </div>
      <div>
        <div className="mb-1.5 text-xs text-slate-400">כמות</div>
        <input
          type="number"
          value={values.shares}
          onChange={(e) => onChange({ shares: e.target.value })}
          placeholder="10"
          dir="ltr"
          disabled={disabled}
          className={inputClass}
        />
      </div>
      <div>
        <div className="mb-1.5 text-xs text-slate-400">שער כניסה</div>
        <input
          type="number"
          value={values.avgPrice}
          onChange={(e) => onChange({ avgPrice: e.target.value })}
          placeholder="100.00"
          dir="ltr"
          disabled={disabled}
          className={inputClass}
        />
      </div>
      <div>
        <div className="mb-1.5 text-xs text-slate-400">מחיר נוכחי</div>
        <input
          type="number"
          value={values.currentPrice}
          onChange={(e) => onChange({ currentPrice: e.target.value })}
          placeholder="110.00"
          dir="ltr"
          disabled={disabled}
          className={inputClass}
        />
      </div>
      <div>
        <div className="mb-1.5 text-xs text-slate-400">סטופ לוס</div>
        <input
          type="number"
          value={values.stopLoss}
          onChange={(e) => onChange({ stopLoss: e.target.value })}
          placeholder="90.00"
          dir="ltr"
          disabled={disabled}
          className={inputClass}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [showForm, setShowForm] = useState(false);
  const [addForm, setAddForm] = useState<PositionFormValues>(EMPTY_FORM);
  const [addError, setAddError] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const [editTarget, setEditTarget] = useState<Position | null>(null);
  const [editForm, setEditForm] = useState<PositionFormValues>(EMPTY_FORM);
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPositions() {
      setIsLoading(true);
      setLoadError("");
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .order("ticker", { ascending: true });

      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
      } else {
        setPositions((data ?? []).map(mapRow));
      }
      setIsLoading(false);
    }

    loadPositions();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleForm = () => {
    setShowForm((v) => !v);
    setAddError("");
    setAddForm(EMPTY_FORM);
  };

  const addPosition = async () => {
    const message = validateForm(addForm);
    if (message) return setAddError(message);

    setIsAdding(true);
    setAddError("");
    const { data, error } = await supabase
      .from("positions")
      .insert({
        ticker: addForm.ticker.trim().toUpperCase(),
        shares: parseFloat(addForm.shares),
        avg_price: parseFloat(addForm.avgPrice),
        current_price: parseFloat(addForm.currentPrice),
        stop_loss: parseFloat(addForm.stopLoss),
      })
      .select()
      .single();
    setIsAdding(false);

    if (error || !data) {
      setAddError(error?.message ?? "שמירת הפוזיציה נכשלה");
      return;
    }

    setPositions((prev) => [...prev, mapRow(data)]);
    setShowForm(false);
    setAddForm(EMPTY_FORM);
  };

  const openEdit = (pos: Position) => {
    setEditTarget(pos);
    setEditForm({
      ticker: pos.ticker,
      shares: String(pos.shares),
      avgPrice: String(pos.avg_price),
      currentPrice: String(pos.current_price),
      stopLoss: String(pos.stop_loss),
    });
    setEditError("");
  };

  const cancelEdit = () => {
    setEditTarget(null);
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const message = validateForm(editForm);
    if (message) return setEditError(message);

    setIsSavingEdit(true);
    setEditError("");
    const { data, error } = await supabase
      .from("positions")
      .update({
        ticker: editForm.ticker.trim().toUpperCase(),
        shares: parseFloat(editForm.shares),
        avg_price: parseFloat(editForm.avgPrice),
        current_price: parseFloat(editForm.currentPrice),
        stop_loss: parseFloat(editForm.stopLoss),
      })
      .eq("id", editTarget.id)
      .select()
      .single();
    setIsSavingEdit(false);

    if (error || !data) {
      setEditError(error?.message ?? "עדכון הפוזיציה נכשל");
      return;
    }

    const updated = mapRow(data);
    setPositions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditTarget(null);
  };

  const toggleSort = (key: SortKey) => {
    setSortDir((prevDir) => (sortKey === key && prevDir === "asc" ? "desc" : "asc"));
    setSortKey(key);
  };

  const requestDelete = (id: string, ticker: string) => {
    setDeleteError("");
    setDeleteTarget({ id, ticker });
  };
  const cancelDelete = () => {
    setDeleteTarget(null);
    setDeleteError("");
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError("");
    const { error } = await supabase.from("positions").delete().eq("id", deleteTarget.id);
    setIsDeleting(false);

    if (error) {
      setDeleteError(error.message);
      return;
    }
    setPositions((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const totals = useMemo(() => {
    const totalValue = positions.reduce((acc, p) => acc + p.current_price * p.shares, 0);
    const totalCost = positions.reduce((acc, p) => acc + p.avg_price * p.shares, 0);
    const totalPnL = totalValue - totalCost;
    const totalPnLPercent = totalCost > 0 ? ((totalPnL / totalCost) * 100).toFixed(2) : "0.00";
    const pnlPositive = totalPnL >= 0;
    return { totalValue, totalPnL, totalPnLPercent, pnlPositive };
  }, [positions]);

  const filteredPositions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const raw = query ? positions.filter((p) => p.ticker.toLowerCase().includes(query)) : positions;

    const sorted = [...raw];
    if (sortKey) {
      sorted.sort((a, b) => {
        const val = (p: Position) =>
          sortKey === "pnl" ? (p.current_price - p.avg_price) * p.shares : p[sortKey];
        const av = val(a);
        const bv = val(b);
        if (typeof av === "string" && typeof bv === "string") {
          return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
      });
    }
    return sorted;
  }, [positions, searchQuery, sortKey, sortDir]);

  const noResults = searchQuery.trim().length > 0 && filteredPositions.length === 0;
  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "");

  const refreshPrices = async () => {
    const targets = filteredPositions;
    const tickers = [...new Set(targets.map((p) => p.ticker))];
    if (tickers.length === 0) return;

    setIsRefreshingPrices(true);
    setRefreshError("");
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      if (!res.ok) throw new Error("שגיאה בקבלת מחירים מהשרת");
      const prices: Record<string, number> = await res.json();

      setPositions((prev) =>
        prev.map((p) => (prices[p.ticker] !== undefined ? { ...p, current_price: prices[p.ticker] } : p))
      );

      const updates = targets
        .filter((p) => prices[p.ticker] !== undefined)
        .map((p) => supabase.from("positions").update({ current_price: prices[p.ticker] }).eq("id", p.id));

      Promise.all(updates).then((results) => {
        if (results.some((r) => r.error)) {
          setRefreshError("המחירים עודכנו במסך אך חלק מהשמירות במסד הנתונים נכשלו");
        }
      });
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "רענון המחירים נכשל");
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-900 text-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {/* Header */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="mb-1 text-2xl font-bold text-white">מעקב תיק מניות</h1>
            <p className="text-sm text-slate-400">מעודכן לזמן אמת</p>
          </div>

          <div className="min-w-[260px] rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-xl shadow-black/25">
            <div className="mb-1 text-[13px] text-slate-400">שווי תיק כולל</div>
            <div className="mb-2 text-3xl font-bold text-white">${money(totals.totalValue)}</div>
            <div className="flex items-center gap-2">
              {totals.pnlPositive ? (
                <TrendingUp size={20} strokeWidth={2.5} className="text-emerald-400" />
              ) : (
                <TrendingDown size={20} strokeWidth={2.5} className="text-red-400" />
              )}
              <span
                dir="ltr"
                className="font-semibold"
                style={{ color: totals.pnlPositive ? "#34d399" : "#f87171" }}
              >
                ${money(Math.abs(totals.totalPnL))}
              </span>
              <span
                dir="ltr"
                className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[13px]"
                style={{ color: totals.pnlPositive ? "#34d399" : "#f87171" }}
              >
                {totals.pnlPositive ? "+" : ""}
                {totals.totalPnLPercent}%
              </span>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            שגיאה בטעינת הנתונים: {loadError}
          </div>
        )}

        {refreshError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {refreshError}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={toggleForm}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-900 transition-colors hover:bg-emerald-300"
            >
              <Plus size={16} strokeWidth={2.5} />
              הוספת פוזיציה
            </button>
            <button
              onClick={refreshPrices}
              disabled={isRefreshingPrices || filteredPositions.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={16} strokeWidth={2.5} className={isRefreshingPrices ? "animate-spin" : ""} />
              {isRefreshingPrices ? "מרענן..." : "רענון מחירים"}
            </button>
          </div>
          <div className="relative min-w-[220px] max-w-xs flex-1">
            <Search
              size={16}
              strokeWidth={2}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש לפי סימול..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 pl-3.5 pr-10 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-slate-500"
            />
          </div>
        </div>

        {/* Add position form */}
        {showForm && (
          <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-xl shadow-black/25">
            <div className="mb-3.5 text-[15px] font-semibold text-white">פוזיציה חדשה</div>
            <PositionFields values={addForm} onChange={(patch) => setAddForm((prev) => ({ ...prev, ...patch }))} disabled={isAdding} />
            {addError && <div className="mb-3 text-[13px] text-red-400">{addError}</div>}
            <div className="flex gap-2.5">
              <button
                onClick={addPosition}
                disabled={isAdding}
                className="rounded-lg bg-emerald-400 px-4.5 py-2 text-sm font-bold text-slate-900 hover:bg-emerald-300 disabled:opacity-50"
              >
                {isAdding ? "מוסיף..." : "הוסף"}
              </button>
              <button
                onClick={toggleForm}
                disabled={isAdding}
                className="rounded-lg border border-slate-700 px-4.5 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 disabled:opacity-50"
              >
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-800 shadow-xl shadow-black/25">
          <table className="w-full min-w-[680px] table-fixed border-collapse">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/50">
                {SORT_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`select-none px-4 py-3.5 text-right text-[13px] font-medium text-slate-400 cursor-pointer ${col.widthClass}`}
                  >
                    {col.label} <span className="text-[11px] text-slate-500">{sortArrow(col.key)}</span>
                  </th>
                ))}
                <th className="w-24 px-4 py-3.5 text-center text-[13px] font-medium text-slate-400">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    טוען נתונים...
                  </td>
                </tr>
              )}
              {!isLoading && positions.length === 0 && !loadError && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    אין פוזיציות בתיק
                  </td>
                </tr>
              )}
              {!isLoading &&
                filteredPositions.map((pos) => {
                  const pnl = (pos.current_price - pos.avg_price) * pos.shares;
                  const pnlPercent = (((pos.current_price - pos.avg_price) / pos.avg_price) * 100).toFixed(2);
                  const pnlPositive = pnl >= 0;
                  const status = getStopLossStatus(pos.current_price, pos.stop_loss);

                  return (
                    <tr key={pos.id} className="border-b border-slate-700/50 hover:bg-white/[0.03]">
                      <td className="overflow-hidden text-ellipsis whitespace-nowrap px-4 py-4 text-right font-bold text-white">
                        {pos.ticker}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-300" dir="ltr">
                        {pos.shares}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-slate-300" dir="ltr">
                        ${money(pos.avg_price)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-white" dir="ltr">
                        ${money(pos.current_price)}
                      </td>
                      <td
                        className="overflow-hidden text-ellipsis whitespace-nowrap px-4 py-4 text-right font-semibold"
                        style={{ color: pnlPositive ? "#34d399" : "#f87171" }}
                        dir="ltr"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {pnlPositive ? (
                            <TrendingUp size={16} strokeWidth={2.5} className="shrink-0" />
                          ) : (
                            <TrendingDown size={16} strokeWidth={2.5} className="shrink-0" />
                          )}
                          <span style={{ unicodeBidi: "isolate" }}>
                            ${money(Math.abs(pnl))} ({pnlPositive ? "+" : ""}
                            {pnlPercent}%)
                          </span>
                        </span>
                      </td>
                      <td
                        className="overflow-hidden text-ellipsis whitespace-nowrap px-4 py-4 text-right"
                        dir="ltr"
                        title={status.text}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {status.key === "safe" ? (
                            <ShieldCheck size={14} strokeWidth={2.5} className="shrink-0" style={{ color: status.color }} />
                          ) : (
                            <AlertTriangle size={14} strokeWidth={2.5} className="shrink-0" style={{ color: status.color }} />
                          )}
                          <span className="font-semibold" style={{ color: status.color, unicodeBidi: "isolate" }}>
                            ${money(pos.stop_loss)}
                          </span>
                        </span>
                      </td>
                      <td className="w-24 px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(pos)}
                            title="עריכה"
                            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-white/10 hover:text-slate-100"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => requestDelete(pos.id, pos.ticker)}
                            title="מחיקה"
                            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-400"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {!isLoading && noResults && (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              לא נמצאו תוצאות עבור &quot;{searchQuery}&quot;
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <div className="mb-3.5 text-[15px] font-semibold text-white">
              עריכת פוזיציה &mdash; {editTarget.ticker}
            </div>
            <PositionFields
              values={editForm}
              onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
              disabled={isSavingEdit}
            />
            {editError && <div className="mb-3 text-[13px] text-red-400">{editError}</div>}
            <div className="flex gap-2.5">
              <button
                onClick={saveEdit}
                disabled={isSavingEdit}
                className="rounded-lg bg-emerald-400 px-4.5 py-2 text-sm font-bold text-slate-900 hover:bg-emerald-300 disabled:opacity-50"
              >
                {isSavingEdit ? "שומר..." : "שמור"}
              </button>
              <button
                onClick={cancelEdit}
                disabled={isSavingEdit}
                className="rounded-lg border border-slate-700 px-4.5 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 disabled:opacity-50"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <div className="mb-3 flex items-center gap-2.5">
              <AlertTriangle size={22} strokeWidth={2.5} className="text-red-400" />
              <div className="text-[17px] font-bold text-white">מחיקת פוזיציה</div>
            </div>
            <div className="mb-3 text-sm leading-relaxed text-slate-300">
              האם אתה בטוח שברצונך למחוק את הפוזיציה{" "}
              <span className="font-bold text-white">{deleteTarget.ticker}</span>? לא ניתן לבטל פעולה זו.
            </div>
            {deleteError && <div className="mb-3 text-[13px] text-red-400">{deleteError}</div>}
            <div className="flex gap-2.5">
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="rounded-lg bg-red-500 px-4.5 py-2 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-50"
              >
                {isDeleting ? "מוחק..." : "מחק"}
              </button>
              <button
                onClick={cancelDelete}
                disabled={isDeleting}
                className="rounded-lg border border-slate-700 px-4.5 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 disabled:opacity-50"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
