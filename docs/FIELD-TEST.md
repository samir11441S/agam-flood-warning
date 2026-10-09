# Field test: do residents understand the alert?

The single most valuable evidence before the final: **real people hearing the Bangla alert and showing they understood it.**

## What you need
- A phone with **Chrome (Android)** or a laptop with **Microsoft Edge** (both have a Bangla voice), opened at `https://<your-agam-site>/field-test` (or `http://localhost:3000/field-test`).
- 20–30 residents of a flood-prone area (relatives in Feni, Cumilla, Sylhet, Sunamganj or Kurigram are fine), as mixed as possible: women and men, older people, people who cannot read.
- 5 minutes per person.

## Consent (read this aloud first)
> "আমরা একটি বন্যা সতর্কবার্তা পরীক্ষা করছি। আপনাকে একটি ছোট বার্তা শোনাবো, তারপর কয়েকটি প্রশ্ন করবো। আপনার নাম বা ফোন নম্বর নেওয়া হবে না। আপনি যেকোনো সময় থামতে পারেন। আপনি কি রাজি?"
>
> ("We are testing a flood warning message. I will play a short message and ask a few questions. We will not take your name or phone number. You can stop at any time. Do you agree?")

Only continue if they say yes.

## Steps
1. Tap **▶ বার্তাটি শোনান** (play the message) once. Do not explain it.
2. Read each question aloud; tap the answer the person gives. If they say "I don't know", tap **বুঝিনি / জানি না**.
3. Fill the optional age / gender / can-read buttons and the village.
4. Tap **উত্তর সংরক্ষণ করুন** (save). The page is ready for the next person.

## Results
Sign in as an officer, then open `/api/field-test` (summary) or `/api/field-test?format=csv` (all answers, opens in Excel).

Report in your submission:
- **Understood**: % who answered *what* (flood), *when* (hours), *what to do* (go to shelter / high ground) and *who sent it* correctly. Target ≥ 80%.
- The same split by **can read / cannot read** and by **age 60+** — this is where messages usually fail.
- Clarity and trust answers.
- One or two direct quotes (with permission, no names).

If understanding is below 80% for any group, change the wording in `src/lib/alerts.ts` (templates) and test again — and say so in the pitch. Iterating on evidence impresses judges.
