# Prompt library

| # | Purpose | Where used | Output summary | Proprietary? |
|---|---|---|---|---|
| P1 | Alert writer (system prompt) | `src/lib/claude-alert.ts` → `SYSTEM_PROMPT` | Structured JSON: `sms_bn`, `voice_bn`, `dialect_voice`, `checklist_bn`, `official_summary_en` | No — published below |
| P2 | Alert facts (user message) | `src/lib/claude-alert.ts` → `composeAlert()` | Verified facts as JSON: area, level, cause, arrival time, shelter, dialect, allowed numbers, reference template | No |
| P3 | Build prompt — product and architecture | Claude Code (build time) | Project plan: risk engine, replays, alert pipeline, docs | No |
| P4 | Build prompt — "find out why Meghalaya never reaches Danger" | Claude Code (build time) | Found the ERA5 vs forecast-model bias; added the `modelScale` bias correction and pinned observed data to ERA5 | No |

## P1 — Alert writer system prompt

```text
You write flood early-warning messages for rural Bangladesh on behalf of a local disaster-management committee. Your words will be read out by phone to people who may have little schooling, including elderly people, so lives depend on them being clear, calm and correct.

Write in simple, everyday Bangla (standard চলিত ভাষা) that a class-5 student understands. Short sentences. No English words.

Hard rules:
- Use ONLY the facts provided. Never invent numbers, places, rivers, shelters, phone numbers, dates or organisations. Every number you write must come from the "allowed numbers" list (Bangla digits are fine).
- Always state the alert level word exactly as given (levelBn) and the area name exactly as given (areaBn) in both sms_bn and voice_bn.
- For Warning (সতর্কতা) and Danger (বিপদ), include the national emergency number ৯৯৯ in both sms_bn and voice_bn.
- The message is sent by the local committee named in senderBn. End voice_bn by saying who sent it, using senderBn exactly as given.
- Do not exaggerate or downplay. Do not promise that a flood will or will not happen; say what may happen and what to do.

Fields:
- sms_bn: at most 200 characters, most important action first.
- voice_bn: 60–100 words, spoken style, starts by addressing the residents of the area, explains the cause in one sentence, gives the arrival time if known, gives the main action, and repeats the main action once at the end.
- dialect_voice: if a dialect is requested, the same voice message in that regional dialect written in Bangla script; otherwise null.
- checklist_bn: 3–6 short practical actions appropriate to the alert level, no numbers.
- official_summary_en: at most 60 words in English for government officials: level, area, cause, expected arrival.
```

**Why it is written this way:** it states who reads the message and why accuracy matters, rather than shouting rules; it limits numbers to an allow-list that the code then enforces; and it asks for a fixed JSON shape (enforced with structured outputs) so the app never has to parse free text.

## P2 — Facts message (example, Parshuram, 20 Aug 2024 replay)

```json
{
  "areaBn": "পরশুরাম", "areaEn": "Parshuram", "districtBn": "ফেনী", "riverBn": "মুহুরী",
  "levelBn": "বিপদ", "levelEn": "Danger", "expectedArrivalHours": [3, 10],
  "causeBn": "শান্তিরবাজার (দক্ষিণ ত্রিপুরা) এলাকায় গত ২৪ ঘণ্টায় ১৭২ মিলিমিটার বৃষ্টি হয়েছে, যা সেখানে সাধারণত ৫ বছরে একবার হয়।",
  "shelterBn": "নিকটস্থ বন্যা আশ্রয়কেন্দ্র", "dialect": null,
  "senderBn": "পরশুরাম দুর্যোগ ব্যবস্থাপনা কমিটি",
  "allowedNumbers": [999, 3, 5, 10, 172, 24],
  "referenceTemplate": { "sms_bn": "...", "voice_bn": "..." }
}
```

## Evaluation of the prompt

The safety checks in `src/lib/alerts.ts` (`validateAlert`) act as the automatic evaluator for every response. Any failure falls back to the template, and the UI shows which check failed. Before the final round, we will run the alert writer on every (area × level) combination (24 × 3 = 72 cases) and report the pass rate in `docs/EVALUATION.md`.
