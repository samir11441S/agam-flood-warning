# 3-minute pitch — Agam (আগাম)

Format at Congress Day: about 3 minutes of pitch, then judges score. Practise with a timer until you finish in **2:45**. Keep the app open on the **Feni, Aug 2024** replay at **15 Aug**, and have a phone hotspot ready in case the venue Wi-Fi fails (replays work offline, but map tiles need internet).

---

### 0:00–0:25 — The hook (no slides, just the map)

> "On the 19th of August 2024, the sky opened over Tripura. Water from those hills reaches Feni in five to eight hours. The flood forecasting centre later said there was no forecast of such a severe flood. Every weather model we checked missed that rain one day ahead.
> Five point eight million people were affected. Seventy-one died.
> But the rain *was* visible — on the other side of the border, hours before the water came. We built Agam to watch it."

### 0:25–1:30 — Live demo: the replay (press ▶ Play)

1. **15 → 17 Aug:** "Agam only uses data that existed at each hour. Heavy rain starts in Tripura. Watch, then Warning by the evening of the 17th."
2. **19 Aug, 12:00:** "The day the cloudbursts began. **Danger** for Feni Sadar: 192 mm in three days at Belonia — and a full-moon spring tide at the river mouth. The rain cannot drain."
3. **20 Aug, 12:00:** "172 mm in one day at Santirbazar — a once-in-five-years rain. **Danger** for Parshuram and Fulgazi. The dashed lines show the water's path across the border. Arrival: 3 to 10 hours."
4. Click **পরশুরাম** → "Every decision is explained: what rained where, compared with 30 years of local history. No black box."

### 1:30–2:15 — From risk to every household

4. Click **Draft Bangla alert** → "Claude writes a plain-Bangla SMS and a voice call. In Sylhet it also writes in Sylheti. But AI never decides the level, and it can't invent a number — seven automatic checks, or it falls back to a verified template. And it's always sent in the name of their own union committee."
5. Press **▶ Play voice call** (in Edge) for 5 seconds.
6. **Before the pitch starts**, ask one judge to scan the QR code on the screen (Telegram opens → Start). This takes 10 seconds.
7. Click **Approve & send** → *the judge's phone buzzes.* "Sir, you just got the warning — in Bangla, in time. Please press 'Need help'." → a red pin appears on the map with their location.
8. "And here are the 240 demo households: the elderly, disabled and pregnant first. Voice calls, SMS, door-knocks where there's no phone. Most answer 'safe'; the few who need rescue are sorted most vulnerable first for the volunteers, and anyone who doesn't answer gets a door-knock."

> Backup if Telegram or the internet fails: the simulated households still show the full safe / need-help board and the rescue pins.

### 2:15–2:45 — Proof, business, scale

> "We back-tested 30 years: Agam raised Danger on or before the onset of 20 of 35 documented area-floods, with a median of 0.6 Danger alerts a year per area — no alarm fatigue. And we publish our misses, like Chattogram this July.
> Citizens never pay. Union disaster committees, NGOs running anticipatory-cash programmes, microfinance lenders and insurers pay for verified triggers.
> And it's global: the same open data covers every river basin on Earth — Nepal to Bihar, Myanmar, East Africa. A new country is a config file and a 15-minute calibration."

### 2:45–3:00 — Close

> "Google can predict a flood. Agam makes sure the grandmother on the char hears it, in her language, in time. We're looking for a pilot union in Feni this monsoon. Thank you."

---

## Likely judge questions — prepared answers

**"Isn't this what FFWC / Google Flood Hub already do?"**
They forecast river levels on major rivers, which is excellent for the Brahmaputra or Jamuna with days of lead time. Flash floods from Tripura and Meghalaya hit in hours, on small rivers those models don't resolve, and the warning often never reaches the last household. Agam watches *upstream rain across the border* and focuses on the last mile: plain-language voice calls, the most vulnerable first, volunteer door-knocks. We complement official warnings; we don't replace them.

**"How accurate is it? Won't it cause false alarms?"**
Thresholds are not guesses: each location's levels come from 30–40 years of its own history. The 30-year backtest is in `docs/EVALUATION.md`: detection of known floods and how many Danger episodes per year each area would get. Danger alone is held for 72 hours, and a human officer approves every message.

**"What if the AI writes something wrong?"**
The AI never decides the alert level — a transparent rule-based engine does. Claude only words the message, from verified facts. Seven automatic checks run (level word, area name, no invented numbers, SMS length, 999, checklist, sender named). If any fails, or the AI is down, the verified template is sent. Then a signed-in officer approves — or two officers for Danger.

**"Is this real time?"**
Yes. Live mode and the replays use hourly rain (rolling 24 h / 72 h / 5-day totals), and a background worker checks every 15 minutes. The replay uses the near-real-time model analysis as it was archived at the time, so it shows what an operator would really have seen. Next we add satellite rain (GPM IMERG Early) and BMD/IMD gauges, which see local cloudbursts the 25 km model grid smooths out.

**"Where do the travel times come from?"**
They are indicative estimates from geography and reported events (for example, 5–8 hours from Tripura to Feni, reported by FFWC staff in Prothom Alo). Validating them with BWDB gauge records is the first task of the pilot.

**"How do you make money?"**
Citizens never pay. Revenue comes from: (1) NGOs and donors running anticipatory-action programmes (cash before the flood), who need trusted triggers; (2) union and upazila disaster committees, funded through DDM and donor projects, paying per-upazila subscriptions; (3) microfinance institutions and insurers who need early flood signals for their clients and parametric products; (4) telecom partners for call capacity. Pricing will be validated in the pilot.

**"Why will people trust a phone call?"**
The message comes from their own union disaster committee, in their own dialect, with a familiar voice. Volunteers (CPP/BDRCS-style) knock on doors where there is no phone. The pilot will measure comprehension with residents.

**"What if the officer is asleep at 2 a.m.?"**
Agam texts officer 1 ("reply 1 4821 to send"). After 15 minutes it asks officer 2, then officer 3. For Danger only, if nobody answers in 45 minutes, the verified template goes out automatically — the committee can switch this off.

**"What did you build vs. use?"**
Built: the risk engine (rain, river, tide, residents' reports), local calibration from 30–40 years of data, the bias correction between data sources, honest hourly replays, the alert pipeline with guardrails, officer sign-in, escalation and SMS approval, multi-channel delivery with retries, the field-test page, the MCP server and the backtest. Used: open data (ERA5, GloFAS, Open-Meteo), Claude for language, OpenStreetMap.

## Sources for the numbers in the pitch

- 5.8 million people affected in 11 districts; 502,501 people in 3,403 shelters: [UN OCHA Situation Report No. 02, 30 Aug 2024](https://reliefweb.int/report/bangladesh/bangladesh-eastern-flash-floods-2024-situation-report-no-02-30-august-2024)
- 71 deaths; cloudbursts began the morning of 19 August: [August 2024 Bangladesh floods — Wikipedia](https://en.wikipedia.org/wiki/August_2024_Bangladesh_floods)
- Water from Tripura reaches Feni in 5–8 hours; no forecast of such a severe flood: [Prothom Alo, "No forecast on such severe flood"](https://en.prothomalo.com/bangladesh/c64ir024gd)
- Forecast models missed the rain 1–3 days ahead: our own check with the Open-Meteo Previous Runs API (ECMWF, GFS, ICON, JMA) — see `docs/EVALUATION.md`.
