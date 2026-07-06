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

async function sendTelegramAlert(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to send Telegram alert:", err);
    return false;
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

  const { data: positions, error } = await supabase
    .from("positions")
    .select("id, ticker, stop_loss")
    .not("stop_loss", "is", null)
    .eq("stop_loss_alert_sent", false);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = positions ?? [];
  let triggered = 0;

  for (const pos of rows) {
    const ticker = pos.ticker as string;
    const stopLoss = Number(pos.stop_loss);

    const quote = await fetchQuote(ticker);
    if (!quote || typeof quote.regularMarketPrice !== "number") continue;

    // TASE quotes come back from Yahoo in Agorot (1/100 ILS); stop_loss for .TA
    // positions is stored in ILS, so convert before comparing.
    const livePrice = isIlsTicker(ticker) ? quote.regularMarketPrice / 100 : quote.regularMarketPrice;

    if (livePrice <= stopLoss) {
      const text = `🚨 התראת סטופ לוס!\nמניית ${ticker} ירדה מתחת ליעד.\nמחיר נוכחי: ${livePrice.toFixed(2)}\nסטופ לוס: ${stopLoss.toFixed(2)}`;
      const sent = await sendTelegramAlert(text);

      if (sent) {
        const { error: updateError } = await supabase
          .from("positions")
          .update({ stop_loss_alert_sent: true })
          .eq("id", pos.id);

        if (!updateError) triggered++;
        else console.error(`Failed to mark alert as sent for ${ticker}:`, updateError.message);
      }
    }
  }

  return NextResponse.json({ success: true, checked: rows.length, triggered });
}
