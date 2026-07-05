import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

type YahooQuoteLike = {
  symbol?: string;
  regularMarketPrice?: number;
  currency?: string;
  exchange?: string;
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

type TickerQuote = {
  price: number;
  currency: string;
  exchange: string;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const tickers: string[] = Array.isArray(body?.tickers)
    ? body.tickers.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  const uniqueTickers = [...new Set(tickers)];

  const [stockQuotes, ilsQuote] = await Promise.all([
    Promise.all(uniqueTickers.map((ticker) => fetchQuote(ticker))),
    fetchQuote("ILS=X"),
  ]);

  const quotes: Record<string, TickerQuote> = {};
  stockQuotes.forEach((quote, i) => {
    const ticker = uniqueTickers[i];
    if (quote && typeof quote.regularMarketPrice === "number") {
      const isTase = ticker.trim().toUpperCase().endsWith(".TA");
      // TASE quotes come back from Yahoo in Agorot (1/100 ILS); convert to ILS.
      const price = isTase ? quote.regularMarketPrice / 100 : quote.regularMarketPrice;
      quotes[ticker] = {
        price,
        currency: quote.currency ?? (isTase ? "ILS" : "USD"),
        exchange: quote.exchange ?? "",
      };
    }
  });

  const ilsRate = typeof ilsQuote?.regularMarketPrice === "number" ? ilsQuote.regularMarketPrice : null;

  return NextResponse.json({ quotes, ilsRate });
}
