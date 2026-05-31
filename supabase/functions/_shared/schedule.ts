import { TIME_ZONE } from "./constants.ts";
import { jsonResponse } from "./database.ts";

function bangkokHour(date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).format(date);

  return Number(hour);
}

export function shouldRunAtBangkokHour(req: Request, expectedHour: number): Response | null {
  const url = new URL(req.url);
  const forced = req.headers.get("x-kmo-force") === "true" || url.searchParams.get("force") === "true";
  if (forced) return null;

  const currentHour = bangkokHour();
  if (currentHour === expectedHour) return null;

  return jsonResponse({
    skipped: true,
    reason: `outside_schedule_window_${expectedHour}`,
    current_bangkok_hour: currentHour,
    expected_bangkok_hour: expectedHour,
  });
}
