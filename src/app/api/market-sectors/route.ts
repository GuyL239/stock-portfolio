import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

const SECTOR_ETFS: { ticker: string; sectorName: string }[] = [
  { ticker: "XLK", sectorName: "Technology" },
  { ticker: "XLF", sectorName: "Financials" },
  { ticker: "XLV", sectorName: "Health Care" },
  { ticker: "XLE", sectorName: "Energy" },
  { ticker: "XLY", sectorName: "Consumer Discretionary" },
  { ticker: "XLP", sectorName: "Consumer Staples" },
  { ticker: "XLI", sectorName: "Industrials" },
  { ticker: "XLB", sectorName: "Materials" },
  { ticker: "XLRE", sectorName: "Real Estate" },
  { ticker: "XLU", sectorName: "Utilities" },
  { ticker: "XLC", sectorName: "Communication Services" },
];

type Timeframe = "1D" | "1W" | "1M" | "1Y";

function isTimeframe(value: string | null): value is Timeframe {
  return value === "1D" || value === "1W" || value === "1M" || value === "1Y";
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function getDailyChangePercent(ticker: string, retriesLeft = 1): Promise<number | null> {
  try {
    const quote = (await yahooFinance.quote(ticker, {}, { validateResult: false })) as {
      regularMarketChangePercent?: number;
    };
    return typeof quote?.regularMarketChangePercent === "number" ? quote.regularMarketChangePercent : null;
  } catch (err) {
    if (retriesLeft > 0) return getDailyChangePercent(ticker, retriesLeft - 1);
    console.error(`Failed to fetch quote for ${ticker}:`, err);
    return null;
  }
}

async function getRangeChangePercent(ticker: string, period1: Date, retriesLeft = 1): Promise<number | null> {
  try {
    const rows = (await yahooFinance.historical(
      ticker,
      { period1, period2: new Date(), interval: "1d" },
      { validateResult: false }
    )) as { close?: number }[];

    if (!rows || rows.length === 0) return null;
    const oldest = rows[0];
    const newest = rows[rows.length - 1];
    if (typeof oldest.close !== "number" || typeof newest.close !== "number" || oldest.close === 0) return null;

    return ((newest.close - oldest.close) / oldest.close) * 100;
  } catch (err) {
    if (retriesLeft > 0) return getRangeChangePercent(ticker, period1, retriesLeft - 1);
    console.error(`Failed to fetch historical data for ${ticker}:`, err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const timeframeParam = searchParams.get("timeframe");
  const timeframe: Timeframe = isTimeframe(timeframeParam) ? timeframeParam : "1D";

  const results = await Promise.all(
    SECTOR_ETFS.map(async ({ ticker, sectorName }) => {
      let changePercent: number | null;
      if (timeframe === "1D") {
        changePercent = await getDailyChangePercent(ticker);
      } else {
        const period1 = timeframe === "1W" ? daysAgo(7) : timeframe === "1M" ? daysAgo(30) : daysAgo(365);
        changePercent = await getRangeChangePercent(ticker, period1);
      }
      return { sectorName, ticker, changePercent: changePercent ?? 0 };
    })
  );

  return NextResponse.json(results);
}
