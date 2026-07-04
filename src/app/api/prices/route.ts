import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

type YahooQuoteLike = {
  symbol?: string;
  regularMarketPrice?: number;
};

async function fetchQuote(ticker: string, retriesLeft = 1): Promise<YahooQuoteLike | null> {
  try {
    const quote = (await yahooFinance.quote(ticker, {}, { validateResult: false })) as
      | YahooQuoteLike
      | YahooQuoteLike[];
    return Array.isArray(quote) ? quote[0] : quote;
  } catch (err) {
    if (retriesLeft > 0) return fetchQuote(ticker, retriesLeft - 1);
    console.error(`Failed to fetch quote for ${ticker}:`, err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tickers: string[] = Array.isArray(body?.tickers)
    ? body.tickers.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  if (tickers.length === 0) {
    return NextResponse.json({ error: "No tickers provided" }, { status: 400 });
  }

  const uniqueTickers = [...new Set(tickers)];

  const quotes = await Promise.all(uniqueTickers.map((ticker) => fetchQuote(ticker)));

  const prices: Record<string, number> = {};
  quotes.forEach((quote, i) => {
    const ticker = uniqueTickers[i];
    if (quote && typeof quote.regularMarketPrice === "number") {
      prices[ticker] = quote.regularMarketPrice;
    }
  });

  return NextResponse.json(prices);
}
