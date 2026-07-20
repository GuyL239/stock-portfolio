import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { supabase } from "@/lib/supabase";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

type CalendarEventsLike = {
  calendarEvents?: {
    earnings?: {
      earningsDate?: Date[];
    };
  };
};

async function fetchEarningsDate(ticker: string, retriesLeft = 1): Promise<Date | null> {
  try {
    const summary = (await yahooFinance.quoteSummary(
      ticker,
      { modules: ["calendarEvents"] },
      { validateResult: false }
    )) as CalendarEventsLike;

    const dates = summary?.calendarEvents?.earnings?.earningsDate;
    if (!dates || dates.length === 0) return null;

    const raw = dates[0];
    const date = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch (err) {
    if (retriesLeft > 0) return fetchEarningsDate(ticker, retriesLeft - 1);
    console.error(`Failed to fetch earnings date for ${ticker}:`, err);
    return null;
  }
}

// Rough BMO/AMC heuristic: US pre-market reports usually land before 13:30 UTC
// (9:30 ET), after-close reports usually land at/after 20:00 UTC (4:00 ET).
function getMarketTiming(date: Date): string {
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  if (hour < 13.5) return "לפני פתיחת המסחר";
  if (hour >= 20) return "לאחר סגירת המסחר";
  return "בשעות המסחר";
}

function formatEarningsDate(date: Date): string {
  return date.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
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

  const { data: positions, error } = await supabase.from("positions").select("ticker");
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const uniqueTickers = [...new Set((positions ?? []).map((p) => p.ticker as string))];

  const now = Date.now();
  const windowEnd = now + 48 * 60 * 60 * 1000;

  let checked = 0;
  let triggered = 0;

  for (const ticker of uniqueTickers) {
    checked++;

    const earningsDate = await fetchEarningsDate(ticker);
    if (!earningsDate) continue;

    const time = earningsDate.getTime();
    if (time < now || time > windowEnd) continue;

    const earningsDateKey = earningsDate.toISOString().slice(0, 10);

    // Skip if we've already alerted for this exact ticker + earnings date.
    const { data: existing, error: existingError } = await supabase
      .from("earnings_alerts_sent")
      .select("id")
      .eq("ticker", ticker)
      .eq("earnings_date", earningsDateKey)
      .maybeSingle();

    if (existingError) {
      console.error(`Failed to check earnings_alerts_sent for ${ticker}:`, existingError.message);
      continue;
    }
    if (existing) continue;

    const timing = getMarketTiming(earningsDate);
    const text = `📅 התראת דוחות! מניית ${ticker} צפויה לפרסם דוח כספי ב-${formatEarningsDate(earningsDate)}. זמן פרסום משוער: ${timing}.`;

    const sent = await sendTelegramAlert(text);
    if (sent) {
      const { error: insertError } = await supabase
        .from("earnings_alerts_sent")
        .insert({ ticker, earnings_date: earningsDateKey });

      if (!insertError) triggered++;
      else console.error(`Failed to record earnings alert for ${ticker}:`, insertError.message);
    }
  }

  return NextResponse.json({ success: true, checked, triggered });
}
