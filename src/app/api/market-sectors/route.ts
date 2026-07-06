import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

const SECTOR_TICKERS = ["XLK", "XLF", "XLV", "XLE", "XLY", "XLP", "XLI", "XLB", "XLRE", "XLU", "XLC"];

type Timeframe = "1D" | "1W" | "1M" | "1Y";

function isTimeframe(value: string | null): value is Timeframe {
  return value === "1D" || value === "1W" || value === "1M" || value === "1Y";
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

type SeriesPoint = { date: string; close: number };

async function fetchIntradaySeries(ticker: string, retriesLeft = 1): Promise<SeriesPoint[]> {
  try {
    const period2 = new Date();
    const period1 = new Date(period2.getTime() - 24 * 60 * 60 * 1000);
    const result = (await yahooFinance.chart(
      ticker,
      { period1, period2, interval: "15m" },
      { validateResult: false }
    )) as { quotes?: { date: Date; close: number | null }[] };

    return (result?.quotes ?? [])
      .filter((q): q is { date: Date; close: number } => typeof q.close === "number")
      .map((q) => ({ date: q.date.toISOString(), close: q.close }));
  } catch (err) {
    if (retriesLeft > 0) return fetchIntradaySeries(ticker, retriesLeft - 1);
    console.error(`Failed to fetch intraday chart for ${ticker}:`, err);
    return [];
  }
}

async function fetchDailySeries(ticker: string, period1: Date, retriesLeft = 1): Promise<SeriesPoint[]> {
  try {
    const rows = (await yahooFinance.historical(
      ticker,
      { period1, period2: new Date(), interval: "1d" },
      { validateResult: false }
    )) as { date: Date; close: number | null }[];

    return (rows ?? [])
      .filter((r): r is { date: Date; close: number } => typeof r.close === "number")
      .map((r) => ({ date: r.date.toISOString(), close: r.close }));
  } catch (err) {
    if (retriesLeft > 0) return fetchDailySeries(ticker, period1, retriesLeft - 1);
    console.error(`Failed to fetch historical data for ${ticker}:`, err);
    return [];
  }
}

// Cumulative % change of each point relative to the first data point in the series.
function normalizeToPercentChange(series: SeriesPoint[]): SeriesPoint[] {
  if (series.length === 0) return [];
  const base = series[0].close;
  if (!base) return series.map((p) => ({ ...p, close: 0 }));
  return series.map((p) => ({ date: p.date, close: ((p.close - base) / base) * 100 }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const timeframeParam = searchParams.get("timeframe");
  const timeframe: Timeframe = isTimeframe(timeframeParam) ? timeframeParam : "1D";

  const seriesByTicker = await Promise.all(
    SECTOR_TICKERS.map(async (ticker) => {
      let raw: SeriesPoint[];
      if (timeframe === "1D") {
        raw = await fetchIntradaySeries(ticker);
      } else {
        const period1 = timeframe === "1W" ? daysAgo(7) : timeframe === "1M" ? daysAgo(30) : daysAgo(365);
        raw = await fetchDailySeries(ticker, period1);
      }
      return { ticker, series: normalizeToPercentChange(raw) };
    })
  );

  const merged = new Map<string, Record<string, number | string>>();
  seriesByTicker.forEach(({ ticker, series }) => {
    series.forEach(({ date, close }) => {
      const row = merged.get(date) ?? { date };
      row[ticker] = close;
      merged.set(date, row);
    });
  });

  const result = [...merged.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return NextResponse.json(result);
}
