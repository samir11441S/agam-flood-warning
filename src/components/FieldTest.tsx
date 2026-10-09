"use client";

import { useState, useSyncExternalStore } from "react";

type Question = { id: string; q: string; options: string[]; correct: string | null };

const hasSpeech = () => typeof window !== "undefined" && "speechSynthesis" in window;
const subscribe = (cb: () => void) => {
  if (!hasSpeech()) return () => {};
  speechSynthesis.addEventListener("voiceschanged", cb);
  return () => speechSynthesis.removeEventListener("voiceschanged", cb);
};
const banglaVoiceName = () => (hasSpeech() ? speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("bn"))?.name ?? null : null);

/**
 * Comprehension test for one resident: play the alert, ask what they understood, save anonymously.
 * The interviewer reads the questions aloud and taps the resident's answer.
 */
export default function FieldTest({ voice, sms, questions }: { voice: string; sms: string; questions: Question[] }) {
  const voiceName = useSyncExternalStore(subscribe, banglaVoiceName, () => null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [about, setAbout] = useState({ ageGroup: "", gender: "", canRead: "", area: "" });
  const [saved, setSaved] = useState(0);
  const [showText, setShowText] = useState(false);

  function play() {
    if (!hasSpeech()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(voice);
    u.lang = "bn-BD";
    const v = speechSynthesis.getVoices().find((x) => x.name === voiceName);
    if (v) u.voice = v;
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }

  async function save() {
    await fetch("/api/field-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers, ...about }) });
    setAnswers({});
    setAbout((a) => ({ ...a, ageGroup: "", gender: "", canRead: "" }));
    setSaved((n) => n + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const complete = questions.every((q) => answers[q.id]);
  const choice = (group: keyof typeof about, opts: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => (
        <button key={o} onClick={() => setAbout((a) => ({ ...a, [group]: o }))}
          className={`rounded-full border px-3 py-1 text-sm ${about[group] === o ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>{o}</button>
      ))}
    </div>
  );

  return (
    <main className="mx-auto max-w-md space-y-5 bg-stone-50 p-4 text-stone-900" lang="bn">
      <header>
        <h1 className="text-2xl font-bold">আগাম — মাঠ পরীক্ষা</h1>
        <p className="text-sm text-stone-600">একজন বাসিন্দাকে বার্তাটি শোনান, তারপর প্রশ্নগুলো জিজ্ঞেস করে তাঁর উত্তরে চাপ দিন। কোনো নাম বা ফোন নম্বর নেওয়া হয় না।</p>
        {saved > 0 && <p className="mt-2 rounded bg-emerald-100 p-2 text-sm text-emerald-900">✓ {saved} জনের উত্তর সংরক্ষিত হয়েছে। পরের জনের জন্য প্রস্তুত।</p>}
      </header>

      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
        <button onClick={play} className="w-full rounded-lg bg-blue-600 py-3 text-lg font-semibold text-white">▶ বার্তাটি শোনান</button>
        {!voiceName && <p className="text-xs text-stone-500">এই ব্রাউজারে বাংলা ভয়েস নেই — Chrome (Android) বা Microsoft Edge ব্যবহার করুন, অথবা নিচের লেখাটি পড়ে শোনান।</p>}
        <button onClick={() => setShowText((s) => !s)} className="text-sm text-sky-700 underline">{showText ? "লেখা লুকান" : "বার্তার লেখা দেখুন"}</button>
        {showText && <p className="rounded bg-stone-100 p-2 text-sm leading-relaxed">{voice}<br /><br /><b>SMS:</b> {sms}</p>}
      </section>

      {questions.map((q, i) => (
        <section key={q.id} className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{i + 1}. {q.q}</h2>
          <div className="grid gap-1.5">
            {q.options.map((o) => (
              <button key={o} onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                className={`rounded-lg border px-3 py-2 text-left ${answers[q.id] === o ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>{o}</button>
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm text-sm">
        <h2 className="font-semibold">বাসিন্দা সম্পর্কে (ঐচ্ছিক)</h2>
        <p>বয়স</p>{choice("ageGroup", ["১৮–৩৫", "৩৬–৫৯", "৬০+"])}
        <p>লিঙ্গ</p>{choice("gender", ["নারী", "পুরুষ", "বলতে চান না"])}
        <p>পড়তে পারেন?</p>{choice("canRead", ["হ্যাঁ", "কিছুটা", "না"])}
        <input value={about.area} onChange={(e) => setAbout((a) => ({ ...a, area: e.target.value }))} placeholder="গ্রাম / ইউনিয়ন" className="w-full rounded border border-stone-300 px-2 py-1" />
      </section>

      <button onClick={save} disabled={!complete} className="w-full rounded-lg bg-emerald-700 py-3 text-lg font-semibold text-white disabled:opacity-40">উত্তর সংরক্ষণ করুন</button>
      <p className="pb-8 text-center text-xs text-stone-500">ফলাফল: কর্মকর্তা হিসেবে লগইন করে <a className="underline" href="/api/field-test?format=csv">CSV ডাউনলোড</a></p>
    </main>
  );
}
