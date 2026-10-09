import { buildFacts, templateAlert } from "./alerts";
import { areaById, rainThresholds, replayInputs, riverThresholds, stations, tideThresholds, type Replay } from "./data";
import feni from "@/data/replays/feni-2024.json";
import { assessArea } from "./risk";
import { toBn } from "./bn";

/** The test alert: Parshuram at noon on 20 Aug 2024 (Danger), exactly as Agam would have sent it. */
export function fieldTestAlert() {
  const area = areaById.parshuram;
  const a = assessArea(area, replayInputs(feni as Replay, "2024-08-20T12"), stations, rainThresholds, riverThresholds, tideThresholds);
  const facts = buildFacts(area, a);
  return { facts, alert: templateAlert(facts) };
}

/** Questions; `correct` marks the answers that show the message was understood. */
export function fieldTestQuestions(eta: [number, number] | null) {
  const etaText = eta ? `${toBn(Math.max(1, eta[0]))}–${toBn(eta[1])} ঘণ্টার মধ্যে` : "শিগগিরই";
  return [
    { id: "what", q: "বার্তায় কিসের কথা বলা হলো?", options: ["বন্যা", "ঘূর্ণিঝড়", "ভূমিকম্প", "বুঝিনি"], correct: "বন্যা" },
    { id: "when", q: "পানি কখন আসতে পারে?", options: [etaText, "কয়েক দিন পরে", "এখন আসবে না", "বুঝিনি"], correct: etaText },
    { id: "action", q: "এই বার্তা শুনে আপনি এখন কী করবেন?", options: ["আশ্রয়কেন্দ্রে বা উঁচু জায়গায় যাব", "বাড়িতে অপেক্ষা করব", "কিছু করব না", "বুঝিনি"], correct: "আশ্রয়কেন্দ্রে বা উঁচু জায়গায় যাব" },
    { id: "who", q: "বার্তাটি কে পাঠিয়েছে?", options: ["স্থানীয় দুর্যোগ ব্যবস্থাপনা কমিটি", "মোবাইল কোম্পানি", "জানি না"], correct: "স্থানীয় দুর্যোগ ব্যবস্থাপনা কমিটি" },
    { id: "clear", q: "বার্তাটি কতটা পরিষ্কার ছিল?", options: ["খুব পরিষ্কার", "মোটামুটি", "অস্পষ্ট"], correct: null },
    { id: "trust", q: "এমন বার্তা পেলে কি বিশ্বাস করবেন?", options: ["হ্যাঁ", "নিশ্চিত নই", "না"], correct: null },
  ];
}
