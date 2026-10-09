// Manage officer accounts and settings.
//   npm run officers -- list
//   npm run officers -- add "Rahim Uddin" 4821 01711000000      (name, PIN, optional mobile for SMS approvals)
//   npm run officers -- remove "Rahim Uddin"
//   npm run officers -- settings                                 (show)
//   npm run officers -- set twoPersonDanger true | escalateAfterMin 15 | autoSendDangerAfterMin 45 (or off) | autoDetect true
// The first officer added becomes admin, and DEMO MODE switches off: real sending becomes possible.
import { officers, settings, type Settings } from "../src/lib/officers";

const [cmd, ...args] = process.argv.slice(2);

function show() {
  const list = officers.all();
  if (!list.length) return console.log("No officers yet: Agam is in DEMO MODE (PIN 0000, nothing is sent for real).");
  console.log("Escalation order:");
  list.forEach((o, i) => console.log(`  ${i + 1}. ${o.name} (${o.role})  phone: ${o.phone ?? "—"}  telegram: ${o.telegramChatId ? "linked" : "not linked"}  id: ${o.id}`));
}

try {
  if (cmd === "add") {
    const [name, pin, phone] = args;
    if (!name || !pin) throw new Error('Usage: add "Name" PIN [mobile]');
    const o = officers.add({ name, pin, phone });
    console.log(`Added ${o.name} as ${o.role}.${o.phone ? "" : " Add a mobile number to receive escalations by SMS."}`);
    show();
  } else if (cmd === "remove") {
    officers.remove(args[0]);
    show();
  } else if (cmd === "settings") {
    console.log(settings.get());
  } else if (cmd === "set") {
    const [key, raw] = args as [keyof Settings, string];
    const current = settings.get();
    if (!(key in current)) throw new Error(`Unknown setting. Options: ${Object.keys(current).join(", ")}`);
    const value = raw === "off" || raw === "null" ? null : raw === "true" ? true : raw === "false" ? false : Number(raw);
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Value must be a number, true/false or off");
    settings.set({ [key]: value } as Partial<Settings>);
    console.log(settings.get());
  } else {
    show();
    console.log('\nCommands: list | add "Name" PIN [mobile] | remove "Name" | settings | set <key> <value>');
  }
} catch (e) {
  console.error("Error:", (e as Error).message);
  process.exit(1);
}
