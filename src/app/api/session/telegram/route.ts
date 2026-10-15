import { audit, DEMO_OFFICER, officers } from "@/lib/officers";
import { requireOfficer } from "@/lib/session";
import { botUsername } from "@/lib/telegram";

/** A signed-in officer gets a one-time code to link their private Telegram chat for approvals. */
export async function POST() {
  const officer = await requireOfficer();
  if (officer instanceof Response) return officer;
  if (officer.id === DEMO_OFFICER.id) return Response.json({ error: "Demo mode: add real officers (npm run officers) before linking Telegram." }, { status: 409 });
  const bot = await botUsername().catch(() => null);
  if (!bot) return Response.json({ error: "Telegram is not set up (TELEGRAM_BOT_TOKEN)." }, { status: 409 });
  const { code, minutes } = officers.createTelegramLink(officer.id);
  audit.add({ who: officer.name, action: "created a Telegram link code" });
  return Response.json({ code, minutes, bot, link: `https://t.me/${bot}?start=officer-${code}` });
}
