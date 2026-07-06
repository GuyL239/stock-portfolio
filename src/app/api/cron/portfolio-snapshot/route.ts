import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { supabase } from "@/lib/supabase";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

type YahooQuoteLike = {
  regularMarketPrice?: number;
};

function isIlsTicker(ticker: string): boolean {
  return ticker.trim().toUpperCase().endsWith(".TA");
}

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

export async function GET(request: NextRequest) {
  // Vercel Cron sends this header automatically when CRON_SECRET is configured.
  // If the env var isn't set, skip the check so this still works in local/dev setups.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const { data: positions, error: positionsError } = await supabase
    .from("positions")
    .select("ticker, shares");

  if (positionsError) {
    return NextResponse.json({ success: false, error: positionsError.message }, { status: 500 });
  }

  const rows = positions ?? [];
  const uniqueTickers = [...new Set(rows.map((p) => p.ticker as string))];

  const [quotes, ilsQuote] = await Promise.all([
    Promise.all(uniqueTickers.map((ticker) => fetchQuote(ticker))),
    fetchQuote("ILS=X"),
  ]);

  const priceByTicker: Record<string, number> = {};
  quotes.forEach((quote, i) => {
    const ticker = uniqueTickers[i];
    if (quote && typeof quote.regularMarketPrice === "number") {
      // TASE quotes come back from Yahoo in Agorot (1/100 ILS); convert to ILS.
      priceByTicker[ticker] = isIlsTicker(ticker) ? quote.regularMarketPrice / 100 : quote.regularMarketPrice;
    }
  });

  const ilsRate = typeof ilsQuote?.regularMarketPrice === "number" ? ilsQuote.regularMarketPrice : null;

  let totalUsd = 0;
  let totalIls = 0;
  rows.forEach((p) => {
    const ticker = p.ticker as string;
    const price = priceByTicker[ticker];
    if (typeof price !== "number") return;

    const shares = Number(p.shares);
    const rawValue = shares * price;

    if (isIlsTicker(ticker)) {
      totalIls += rawValue;
      totalUsd += ilsRate ? rawValue / ilsRate : 0;
    } else {
      totalUsd += rawValue;
      totalIls += ilsRate ? rawValue * ilsRate : 0;
    }
  });

  const snapshotDate = new Date().toISOString().slice(0, 10);

  const { error: insertError } = await supabase.from("portfolio_snapshots").insert({
    total_usd: totalUsd,
    total_ils: totalIls,
    snapshot_date: snapshotDate,
  });

  if (insertError) {
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    total_usd: totalUsd,
    total_ils: totalIls,
    snapshot_date: snapshotDate,
  });
}
