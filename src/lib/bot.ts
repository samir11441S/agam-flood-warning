// Telegram bot logic (long polling, run by the worker):
//  • residents: subscribe by QR code, answer "safe / need help", share location, report rising water
//  • officers: link their private chat with a one-time code from the dashboard, then approve or reject with one tap
import { approve, reject } from "./alert-flow";
import { areaById, areas } from "./data";
import { audit, officers } from "./officers";
import { forwardHelp } from "./resident-replies";
import { alerts, attempts, replies, reports, subscribers } from "./store";
import { tg } from "./telegram";

export type Update = {
  update_id: number;
  message?: { chat: { id: number; type?: string; first_name?: string }; text?: string; location?: { latitude: number; longitude: number } };
  callback_query?: { id: string; from: { id: number; first_name?: string }; message?: { chat: { id: number }; message_id: number }; data?: string };
};

const areaKeyboard = {
  inline_keyboard: areas.map((a) => [{ text: `${a.nameBn} (${a.districtBn})`, callback_data: `sub:${a.id}` }]),
};

const residentKeyboard = {
  keyboard: [[{ text: "🌊 পানি বাড়ছে — রিপোর্ট করুন" }]],
  resize_keyboard: true,
};

/** Wrong link codes allowed per chat per hour. With 8-digit one-time codes that expire in 10 minutes, guessing is hopeless. */
const LINK_TRIES = { limit: 5, windowMin: 60 };

async function linkOfficer(chatId: number, chatType: string | undefined, code: string) {
  if (chatType && chatType !== "private") return tg("sendMessage", { chat_id: chatId, text: "নিরাপত্তার জন্য কর্মকর্তার অ্যাকাউন্ট শুধু ব্যক্তিগত চ্যাটে যুক্ত করা যায়।" });
  const key = `tg-link:${chatId}`;
  if (attempts.blocked(key, LINK_TRIES.limit, LINK_TRIES.windowMin)) return tg("sendMessage", { chat_id: chatId, text: "অনেকবার ভুল কোড। এক ঘণ্টা পরে আবার চেষ্টা করুন।" });
  const officer = /^\d{8}$/.test(code) ? officers.linkTelegram(code, chatId) : null;
  if (!officer) {
    attempts.hit(key, LINK_TRIES.windowMin);
    return tg("sendMessage", { chat_id: chatId, text: "কোডটি সঠিক নয় বা মেয়াদ শেষ। ড্যাশবোর্ডে সাইন ইন করে \"Link Telegram\" থেকে নতুন কোড নিন।" });
  }
  attempts.clear(key);
  audit.add({ who: officer.name, action: "linked Telegram for approvals" });
  return tg("sendMessage", { chat_id: chatId, text: `✅ ${officer.name}, এখন থেকে অনুমোদনের অনুরোধ এই চ্যাটে আসবে।` });
}

/** Chats waiting to send the location of a "water rising" report. */
const awaitingReportLocation = new Map<number, string>();

async function subscribe(chatId: number, name: string, areaId: string) {
  const area = areaById[areaId];
  if (!area) return tg("sendMessage", { chat_id: chatId, text: "এলাকা বেছে নিন:", reply_markup: areaKeyboard });
  subscribers.upsert({ chatId, areaId, name, since: new Date().toISOString() });
  await tg("sendMessage", {
    chat_id: chatId,
    text: `✅ আপনি ${area.nameBn} (${area.districtBn}) এলাকার বন্যা সতর্কবার্তা পাবেন।\n\nসতর্কবার্তা এলে "আমি নিরাপদ" বা "সাহায্য দরকার" বোতাম চাপুন।\nআপনার এলাকায় পানি বাড়তে দেখলে নিচের "পানি বাড়ছে" বোতাম চাপুন।\nবন্ধ করতে /stop লিখুন।`,
    reply_markup: residentKeyboard,
  });
}

export async function handleUpdate(u: Update) {
  const msg = u.message;
  if (msg?.location) {
    const chatId = msg.chat.id;
    const loc = { lat: msg.location.latitude, lon: msg.location.longitude };
    const reportArea = awaitingReportLocation.get(chatId);
    if (reportArea) {
      awaitingReportLocation.delete(chatId);
      reports.attachLocation(chatId, loc);
      return tg("sendMessage", { chat_id: chatId, text: "📍 ধন্যবাদ। আপনার রিপোর্ট দুর্যোগ ব্যবস্থাপনা কমিটির কাছে পৌঁছেছে।", reply_markup: residentKeyboard });
    }
    const r = replies.attachLocation(chatId, loc);
    return tg("sendMessage", {
      chat_id: chatId,
      text: r ? "📍 আপনার অবস্থান উদ্ধারকারী দলের কাছে পৌঁছেছে। নিরাপদ উঁচু স্থানে থাকুন। জরুরি: ৯৯৯" : "ধন্যবাদ।",
      reply_markup: residentKeyboard,
    });
  }

  const text = msg?.text?.trim();
  if (msg && text) {
    const chatId = msg.chat.id;
    const name = msg.chat.first_name ?? "";
    if (text.startsWith("/start")) {
      const payload = text.split(/\s+/)[1];
      if (payload?.startsWith("officer-")) return linkOfficer(chatId, msg.chat.type, payload.slice("officer-".length));
      if (payload) return subscribe(chatId, name, payload);
      return tg("sendMessage", { chat_id: chatId, text: "আগাম — বন্যার আগাম সতর্কবার্তা।\nআপনার এলাকা বেছে নিন:", reply_markup: areaKeyboard });
    }
    if (text.startsWith("/officer")) return linkOfficer(chatId, msg.chat.type, text.split(/\s+/)[1] ?? "");
    if (text === "/stop") {
      subscribers.removeChat(chatId);
      return tg("sendMessage", { chat_id: chatId, text: "আপনি আর সতর্কবার্তা পাবেন না। আবার চালু করতে /start লিখুন।", reply_markup: { remove_keyboard: true } });
    }
    if (text.startsWith("🌊") || text === "/report") {
      const sub = subscribers.all().find((s) => s.chatId === chatId);
      if (!sub) return tg("sendMessage", { chat_id: chatId, text: "আগে আপনার এলাকা বেছে নিন:", reply_markup: areaKeyboard });
      reports.add({ chatId, areaId: sub.areaId, name, at: new Date().toISOString(), source: "telegram" });
      awaitingReportLocation.set(chatId, sub.areaId);
      return tg("sendMessage", {
        chat_id: chatId,
        text: "🌊 রিপোর্ট পাওয়া গেছে। কোথায় পানি বাড়ছে তা জানাতে আপনার অবস্থান পাঠান।",
        reply_markup: { keyboard: [[{ text: "📍 অবস্থান পাঠান", request_location: true }]], one_time_keyboard: true, resize_keyboard: true },
      });
    }
    return tg("sendMessage", { chat_id: chatId, text: "এলাকা বদলাতে /start, পানি বাড়লে /report, বন্ধ করতে /stop লিখুন।", reply_markup: residentKeyboard });
  }

  const cb = u.callback_query;
  if (cb?.data && cb.message) {
    const [kind, id] = cb.data.split(":");
    const chatId = cb.message.chat.id;
    const name = cb.from.first_name ?? "";
    if (kind === "sub") {
      await tg("answerCallbackQuery", { callback_query_id: cb.id });
      return subscribe(chatId, name, id);
    }
    if (kind === "ok" || kind === "no") {
      // The person who tapped must be the linked officer, in their own private chat (never a group).
      const officer = cb.from.id === chatId ? officers.byTelegram(cb.from.id) : undefined;
      if (!officer) return tg("answerCallbackQuery", { callback_query_id: cb.id, text: "শুধু নিবন্ধিত কর্মকর্তা অনুমোদন দিতে পারেন।" });
      const who = { id: officer.id, name: officer.name, role: officer.role };
      await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
      if (kind === "no") {
        reject(id, who, "telegram");
        return tg("answerCallbackQuery", { callback_query_id: cb.id, text: "বাতিল করা হয়েছে।" });
      }
      const outcome = await approve(id, who, "telegram");
      const reply = outcome.status === "sent" ? "✅ পাঠানো হয়েছে।" : outcome.status === "waiting" ? "আরও একজন কর্মকর্তার অনুমোদন দরকার।" : outcome.error;
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: reply });
      return tg("sendMessage", { chat_id: chatId, text: reply });
    }
    if (kind === "safe" || kind === "help") {
      const alert = alerts.get(id);
      if (!alert || alert.status !== "sent") return tg("answerCallbackQuery", { callback_query_id: cb.id, text: "এই বার্তাটি আর সক্রিয় নেই।" });
      const previous = replies.record({ channel: "telegram", chatId, alertId: id, areaId: alert.areaId, name, status: kind, at: new Date().toISOString() });
      if (kind === "help") {
        // Same as an SMS or keypad "2": the area's volunteers hear about it at once.
        await forwardHelp(alert, { who: name || "একজন টেলিগ্রাম ব্যবহারকারী", contact: "টেলিগ্রামে সাহায্য চেয়েছেন (ড্যাশবোর্ডে অবস্থান দেখুন)", by: `telegram ${name || chatId}`, channel: "telegram", repeat: previous?.status === "help" });
      }
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: kind === "safe" ? "ধন্যবাদ!" : "অনুরোধ পাঠানো হয়েছে" });
      await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
      if (kind === "safe") return tg("sendMessage", { chat_id: chatId, text: "✅ ধন্যবাদ। নিরাপদে থাকুন, প্রতিবেশীদের খোঁজ নিন।", reply_markup: residentKeyboard });
      return tg("sendMessage", {
        chat_id: chatId,
        text: "🆘 আপনার অনুরোধ স্বেচ্ছাসেবকদের কাছে পাঠানো হয়েছে। দ্রুত খুঁজে পেতে নিচের বোতাম চেপে আপনার অবস্থান পাঠান।",
        reply_markup: { keyboard: [[{ text: "📍 আমার অবস্থান পাঠান", request_location: true }]], one_time_keyboard: true, resize_keyboard: true },
      });
    }
  }
}
