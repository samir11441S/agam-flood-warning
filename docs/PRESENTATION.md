# Agam — Congress Day presentation script (3 minutes + Q&A)

**Format at Congress Day:** 1 min to set up → **3 min pitch** → judges score. Practise with a timer until you finish in **2:50**. Speak slowly; pauses are powerful.

**Before you walk up:**
- Laptop open on Agam, **Replay: Feni, Aug 2024**, slider on **15 Aug 06:00**, Microsoft Edge, phone hotspot on.
- Signed in as officer (**Officer sign in**; demo PIN `0000`).
- The worker running (`npm run worker`, for Telegram) and your phone in your pocket.
- One teammate holds the laptop / clicks; the speaker faces the judges.

---

## 0:00 – 0:30 · The hook (look at the judges, not the screen)

> "Assalamu alaikum / Nomoskar. On the 19th of August 2024, cloudbursts hit the hills of Tripura — just across the border from Feni.
> Water from those hills reaches Feni in **five to eight hours**.
> **Fifty-eight lakh** people were affected. **Seventy-one** died.
> And afterwards, the flood forecasting centre said: *there was no forecast of a flood this severe.*
> We asked a simple question: **was it really impossible to warn them?**"

## 0:30 – 0:55 · The insight

> "We checked every major weather model. One day before, they forecast **24 to 35 millimetres** of rain. **Close to 200** fell. The forecasts missed it.
> But the rain itself was **visible** — on the other side of the border, hours before the water arrived.
> So we built a prototype: **Agam — আগাম — 'in advance'.** It watches the rain *upstream*, and is designed to get the warning to **every household** in time."

## 0:55 – 2:00 · Live demo (teammate clicks, you narrate)

1. **Press ▶ Play.**
   > "This is the working prototype, replaying August 2024 — using **only the data that existed on each day**. No hindsight."
2. **At 17 Aug:** "Heavy rain starts in Tripura — **Watch**, then **Warning** by evening."
   **At 19 Aug, 12:00:** "The day the cloudbursts began. **Danger** for Feni Sadar: three days of heavy rain upstream — and a full-moon spring tide at the river mouth. The water can't drain."
   **At 20 Aug, 12:00:** "172 millimetres in one day at Santirbazar — a once-in-five-years rain for that place. **Danger** for Parshuram and Fulgazi. The dashed lines show the water's path across the border."
3. **Click পরশুরাম.**
   > "Every alert explains itself: what rained where, compared with **30 years of that place's own history**. Arrival: 3 to 10 hours — an estimate, and we label it as one. No black box."
4. **Click 'Draft Bangla alert'.**
   > "One click writes the warning in plain Bangla — SMS and a voice call for people who can't read. The AI **never decides the danger level** and **cannot invent a number**: seven safety checks, or a verified template goes out. And it's sent in the name of their own union committee."
5. **Click 'Approve & send'** — *your phone buzzes.* Hold it up.
   > "In a real union this goes out as **voice calls and SMS to every phone** — no smartphone needed. If nobody answers, Agam calls again, then a backup number, then sends a volunteer. The mosque gets a loudspeaker script."
   > "It just arrived on my phone. A person answers with one tap: **'I'm safe'** or **'I need help'** — and help requests appear on the rescue map.
   > These 240 households are **demo data**, not real people yet — but they show how Agam ranks the most vulnerable first: elderly, disabled, pregnant, homes with no phone. In this simulation, everyone is reached in about **24 minutes**."

## 2:00 – 2:35 · Proof + honesty

> "Does it work? We back-tested **30 years**. Agam raised Danger on or before the onset of **20 of 35** documented floods, with a median of **0.6 alarms per area per year** — no alarm fatigue.
> And we're honest about limits: in **Chattogram this July** — a slow flood made worse by tides and blocked sluice gates — Agam was **late**. So we added tides, and residents can now report rising water by SMS — three reports raise the alarm. We'd rather show you that than hide it."

## 2:35 – 2:55 · Business + scale

> "Citizens **never pay**. Agam is paid for by those who need trusted early triggers: **anticipatory-cash programmes**, **disaster committees**, **microfinance lenders and insurers**.
> And it scales: every data source is **global and free**. Nepal to Bihar, Myanmar, East Africa — a new region is a config file and a 15-minute calibration."

## 2:55 – 3:00 · Close (slow, look up)

> "To be clear: Agam is a working prototype. Nobody uses it yet — proving that people will is our next step.
> Google can predict a flood.
> **Agam makes sure the grandmother on the char hears it — in her language, in time.**
> We're looking for **a pilot union in Feni** for the next monsoon. Thank you."

---

## If the demo fails
Say calmly: *"Live internet at events — here's the recorded run,"* and play the demo video from 1:50 (the replay section). Never apologise twice; keep going.

## Q&A — short, confident answers (max 20 seconds each)

| Question | Answer |
|---|---|
| **"Does anyone use this today?"** | "Not yet — it's a prototype built for this competition. The data and the flood replays are real; the households in the demo are simulated. Our next step is testing the Bangla voice alert with residents in Feni and talking to a Union Parishad about a pilot." |
| **"Why would villagers trust it?"** | "We don't assume they will — that's what the pilot tests. The design helps: the message comes from their own union committee, in Bangla, by voice, and volunteers knock on doors where there's no phone." |
| **"How is this different from FFWC or Google Flood Hub?"** | "They forecast big rivers with days of lead time — excellent for the Jamuna. Flash floods from Tripura and Meghalaya hit in hours on small rivers those models don't resolve. We watch rain across the border and solve the last mile — voice calls, most vulnerable first. We support official warnings, not replace them." |
| **"How accurate is it?"** | "30-year backtest: 20 of 35 floods warned on or before onset, a median of 0.6 Danger alarms per area per year. Thresholds come from each place's own history, not guesses. And we publish our misses — Chattogram 2026." |
| **"What if the AI writes something wrong?"** | "The AI never decides the level — transparent rules do. It only words the message from verified facts, seven automatic checks, template fallback, and a signed-in officer approves every alert — two officers for Danger if the committee wants." |
| **"Is it real-time?"** | "Yes — hourly rain, checked every 15 minutes by a background worker that drafts the alert by itself. Next we add satellite rain, NASA IMERG, to catch very local cloudbursts." |
| **"What if the officer is asleep?"** | "Agam texts officer 1 — 'reply 1 and the code to send'. After 15 minutes it asks officer 2, then 3. For Danger, if nobody answers in 45 minutes, the verified template goes out automatically." |
| **"Not everyone has a smartphone."** | "That's why the main channel is a plain voice call and SMS — any phone works. Homes without a phone get a volunteer, and mosques get a loudspeaker script." |
| **"Where do travel times come from?"** | "Geography and reported events — for example 5 to 8 hours Tripura to Feni, from FFWC staff. Validating them with BWDB gauge records is task one of the pilot." |
| **"How do you make money?"** | "Citizens never pay. Anticipatory-action NGOs need auditable triggers; union and upazila committees subscribe; lenders and insurers buy early signals; telcos partner on call capacity." |
| **"What about people without phones?"** | "They go to volunteer door-knock routes automatically — and they're ranked first, because no phone is a vulnerability." |
| **"What did you actually build?"** | "The risk engine with rain, river, tide and residents' reports; calibration for 39 points; data-bias correction; hourly replays of four floods; the alert pipeline with guardrails; officer sign-in, escalation and SMS approval; voice and SMS delivery with retries; a field-test page; an MCP server; and the backtest. Open data, and Claude for language." |
| **"What's next?"** | "One pilot union in Feni next monsoon: test comprehension with residents using our field-test page, validate travel times with BWDB gauges, and add satellite rain." |

## Delivery tips
- **Numbers to memorise:** 5–8 hours · 58 lakh · 71 · 24–35 vs ~200 mm · 19 Aug noon (Feni Sadar) · 172 mm · 20 of 35 · 0.6 per year · 7 checks · 24 minutes.
- Say **"আগাম"** with pride — it's your brand.
- Point at the screen only during the demo; otherwise face the judges.
- End exactly on *"Thank you"* — don't add anything after the close.
