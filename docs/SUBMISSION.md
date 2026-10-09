# Idea to Unicorn — submission text (copy into the CloudCamp platform)

> Fields marked **[TEAM]** need your team's own information. Everything else is ready to paste. Check the deadline on your dashboard (the Phases widget showed Oct 31, 2026 for the preliminary round).

---

## 1. Basics

**Project name:** Agam (আগাম) — flash-flood warnings that reach every household in time

**One-line pitch:** Agam watches rain across the border and turns it into verified, plain-Bangla voice calls that reach every household — the most vulnerable first — hours before flash floods hit.

**Domain:** ClimateSphere AI
**Challenge:** Climate Shield — climate risk prediction and disaster early warning

**Public summary:**
In August 2024, record rain in the hills of Tripura sent flash floods into Feni, Cumilla and Noakhali within hours. 5.8 million people were affected and 71 died, and officials said there was no forecast of a flood that severe. Agam checks rainfall every hour at 15 upstream points across the border, plus 24 flood-prone upazilas, 9 river points and the tide at the river mouths, and judges it against each location's own history. Residents' "water rising" reports count as evidence too. When risk rises, Agam drafts the alert by itself: Claude writes a plain-Bangla SMS, voice call and loudspeaker announcement, seven automatic checks verify it, and a signed-in local officer approves it — from the dashboard, by SMS reply or on Telegram, with escalation to the next officer if nobody answers. Agam then reaches every household: voice calls and SMS (retried, then a backup number), volunteer door-knocks for homes without a phone, the elderly, disabled and pregnant first. Replayed on the 2024 Feni flood using only the data available at each hour, Agam reached Warning on 17 August and Danger for Feni Sadar at noon on 19 August (heavy rain in Tripura plus a spring tide), and for Parshuram at noon on 20 August — while every forecast stayed quiet. In a 30-year backtest it raised Danger on or before the onset of 20 of 35 documented area-floods, with a median of 0.6 Danger episodes per area per year. Agam is a working prototype: no community uses it yet, and a pilot is our next step.

**Primary team language:** Bangla / English

---

## 2. Problem statement

**Who the user is:**
- *Primary:* Union and Upazila Disaster Management Committees, plus the volunteers (CPP, BDRCS, local youth) who must warn villages.
- *Beneficiaries:* families living along flashy border rivers in Feni, Cumilla, Brahmanbaria, Habiganj, Sylhet, Sunamganj and Netrokona, and along the Brahmaputra–Jamuna and Teesta. Many are elderly, have no smartphone or limited literacy, or live on chars and low-lying land.

**What problem they face today:**
- Flash floods from Tripura and Meghalaya reach Bangladesh in hours. In Aug 2024, water from Tripura reached Feni in 5–8 hours (FFWC staff, Prothom Alo).
- Rain forecasts failed. We checked four global models (ECMWF, GFS, ICON, JMA) through the Open-Meteo archive of forecasts as issued. One day ahead, they predicted 24–35 mm for 20 August at Udaipur (Tripura). ECMWF's own analysis for that day showed 176 mm (Open-Meteo best match: 197 mm).
- The warnings that do exist are technical (water levels in metres, "danger level"), in standard Bangla, and spread through TV, radio, mosque loudspeakers and word of mouth. The elderly, disabled, phone-less and people on chars hear last.

**Why existing solutions fail:**
- FFWC and Google Flood Hub forecast river levels on major rivers. That works well for the Brahmaputra with days of lead time, but not for small, flashy cross-border rivers like the Muhuri, Gumti, Khowai and Someshwari, which global models do not resolve.
- Upstream rain data from India is shared irregularly ("the Indian counterpart usually provides updates twice a day, but did not provide any details this time" — FFWC engineer, Prothom Alo).
- No existing tool turns a warning into a prioritised, household-level outreach plan.

**The measurable outcome Agam will change:**
- **Lead time:** hours to days of warning. Hourly replay of Feni 2024: Watch 17 Aug 06:00, Warning 17 Aug 18:00, Danger 19 Aug 12:00 for Feni Sadar and Sonagazi (192 mm in 72 h at Belonia plus a spring tide) and 20 Aug 12:00 for Parshuram (172 mm in 24 h at Santirbazar, its 5-year level is 124 mm; estimated arrival 3–10 h). 30-year backtest: Danger on or before onset in 20 of 35 documented area-floods. We also publish our partial miss: Chattogram, July 2026 (see `docs/EVALUATION.md`).
- **Reach:** % of households personally reached before water arrives (target: 100% in a pilot union within 30 minutes of approval).
- **Equity:** time until the most vulnerable households are reached (they come first).
- **Comprehension:** % of residents who can repeat the action after a voice alert (target ≥ 80% in pilot testing).

---

## 3. Solution

**Product:** a web dashboard for disaster committees, plus a voice and SMS alert pipeline. It also has an MCP server so AI assistants can query it.

**AI system architecture:**

```
Open data (free, global)                    Agam engine                                   Last mile
──────────────────────────                  ───────────────────────────────────────       ──────────────────────────
ERA5 rain (30 yrs) ───► per-location ─────► Risk engine (rules, explainable)               Officer(s) approve: dashboard,
GloFAS river (40 yrs)   thresholds            upstream rain across border ──┐                SMS "1 4821" or Telegram;
Sea level (2.5 yrs) ──► tide levels           local rain                    │                escalates to next officer
Forecast models ──────► bias factor           forecast rain                 ├─► Normal/Watch/     │
Live hourly rain, ──────────────────────────► river flow                    │   Warning/Danger    ▼
river, tide                                   tide at river mouth           │   + arrival time   Voice calls + SMS (retry → backup no.)
Residents' reports ─────────────────────────► "water rising" reports       ┘        │           Volunteer door-knock lists
                                                                                     │           Loudspeaker script (mosque / CPP)
                                              Claude (claude-opus-5-5) ◄─────────────┘           Most vulnerable first
                                              writes SMS / voice / loudspeaker / checklist from verified facts
                                              → 7 automatic safety checks → verified template if any check fails
```

**Key features:**
1. **Cross-border upstream watch, every hour:** 15 rain points in Tripura, Meghalaya, Assam, West Bengal and the Chittagong hills, each linked to the downstream upazilas with travel-time estimates. A background worker checks every 15 minutes and drafts alerts by itself.
2. **Thresholds from local history:** 2/5/10-year return levels for every point (24 h, 72 h and 5-day rain), from 30 years of rain, 40 years of river flow and 2.5 years of sea level. A per-location bias factor makes forecast-model data comparable.
3. **Tides and residents' reports:** a high tide at the river mouth while it rains raises the level (water cannot drain). Three different residents reporting rising water in six hours (Telegram 🌊 or SMS `PANI <area>`) raise it to Warning — this catches floods rain data cannot see, like blocked sluice gates.
4. **Explainable alerts:** every level shows its evidence (what rained where, compared with what is normal there), the expected arrival time (labelled as an estimate) and today's official FFWC/BMD status, so officers see when Agam is ahead of it.
5. **Honest replays, hour by hour:** Feni Aug 2024, Sylhet Jun 2024, Jamuna Jul 2024 and Chattogram Jul 2026, in 6-hour steps, using only the data and forecasts that existed at that hour.
6. **AI-written, verified Bangla alerts:** an SMS of 200 characters or less, a voice-call script, a dialect version, a loudspeaker announcement, a checklist and an English summary — always in the name of the local disaster committee. Seven automatic checks; the AI cannot invent numbers, and the template is used if any check fails.
7. **Safe approval:** officers sign in with a PIN; optional two-person rule for Danger; approve from the dashboard, by SMS reply or Telegram; unanswered alerts escalate to the next officer every 15 minutes; every action is in an audit log. Demo mode can never send to a real phone.
8. **Every channel, most vulnerable first:** officers upload their household list (collected with consent). Voice calls and SMS go to every phone through any Bangladeshi SMS/IVR gateway; unanswered calls are retried, then a backup number is called, then the home goes to a volunteer. Homes without a phone get volunteer door-knock lists; mosques and CPP volunteers get a loudspeaker script.
9. **Two-way replies from any phone:** every SMS ends with "reply 1 = safe, 2 = need help" and every voice call with "press 1 or 2"; Telegram users tap a button. "Need help" is texted at once to the area's volunteers (name, village, number) and appears on the rescue list; silent households go to volunteers.
10. **Hold rule:** Danger is held as Warning for 72 hours after the rain.
11. **Field-test page:** `/field-test` plays the alert to a resident and records, anonymously, whether they understood it.
12. **MCP server:** `list_areas`, `get_flood_risk`, `draft_alert`.

**Target user journey:**
Agam turns an area red and drafts the alert → the union officer gets an SMS ("reply 1 4821 to send") or opens the dashboard and reads why (rain in Tripura, arrival in 3–10 h) → listens to the message and checks the seven safety ticks → approves → calls and SMS go out, volunteers get door-knock lists, the mosque gets an announcement script → the officer watches the outbox: answered, retried, handed to volunteers, "safe" and "need help" replies.

**How it maps to the Climate Shield winning signal:** it predicts climate risk (flash and riverine floods) from live data, gives early warning with explicit lead time, and gets that warning to every person, measured per household.

---

## 4. Demo & links

- **Prototype / live demo:** https://agam-flood-warning.vercel.app (demo mode: officer PIN `0000`; nothing is sent to real phones)
- **GitHub repository:** https://github.com/samir11441S/agam-flood-warning (public)
- **YouTube video (max 3 min 1 s = 181 s, Public or Unlisted):** **[TEAM]** upload `video/out/agam-demo-3min-bn.mp4` (Bangla voice, add the English subtitles `agam-demo-3min-bn.en.srt`) or `agam-demo-3min.mp4` (English). Made with `npm run video:3min:bn` / `npm run video:3min`.
- **Slide deck (optional):** **[TEAM]**

---

## 5. Data & AI provenance

See `docs/DATA_PROVENANCE.md` (paste the tables). In summary: all data is open (Open-Meteo / Copernicus ERA5, GloFAS and sea level, OpenStreetMap). The demo households are synthetic. Real household lists are uploaded only by officers, only with each household's consent, and can be deleted at any time. The model is Anthropic `claude-opus-5-5`, which only writes text from verified facts and never decides the alert level.

## 6. Tooling + IDE + memory/context files

See `docs/TOOLING.md`.

## 7. MCP usage disclosure

See `docs/TOOLING.md` → MCP usage. Agam ships its own MCP server (3 tools).

## 8. Prompt library

See `docs/PROMPTS.md`. The alert-writer system prompt and facts message are published; nothing is proprietary.

---

## Target user (preliminary field)

Union / Upazila Disaster Management Committees and their volunteers in flash-flood-prone border districts of Bangladesh. The beneficiaries are the households they protect, especially the elderly, disabled, phone-less and people living on chars.

## Team roles — Quantum Builders

| Name | Role | Responsibility |
|---|---|---|
| MD Samir Hossan | Team Leader | Leads the project, the build, the pitch and the submission |
| Nadia Islam Priya | Team Coordinator | Coordinates the team, outreach and partners |
| **[TEAM]** | **[Role]** | **[Responsibility]** |
| **[TEAM]** | **[Role]** | **[Responsibility]** |
| **[TEAM]** | **[Role]** | **[Responsibility]** |

(The FAQ says teams without domain and business roles "consistently score lower".)

## Initial mentor engagement notes — [TEAM]

Suggested questions for your first mentor session:
1. Introductions to a Union Disaster Management Committee or CPP/BDRCS unit in Feni or Sunamganj for a pilot.
2. Validation of travel times with BWDB/FFWC gauge data.
3. Telecom partner for voice-call capacity (bulk IVR in Bangla).
4. NRB experts in hydrology or disaster risk who could join as collaborators.

---

## Business model + global readiness (talking points)

**Citizens never pay.** Revenue comes from those who need trusted, early flood signals:

| Customer | What they buy | Why |
|---|---|---|
| NGOs and donors running **anticipatory action** (cash or support released *before* a flood) | Verified, auditable triggers per upazila + household outreach | Anticipatory programmes need objective triggers and a way to reach people |
| Union / Upazila Disaster Management Committees (via DDM and donor-funded projects) | Per-upazila subscription: dashboard, alerting, dispatch | Turns a warning into documented action |
| Microfinance institutions and insurers | Early flood signals for borrowers' areas; triggers for parametric products | Protect clients and portfolios |
| Telecom operators | Partnership: voice and SMS capacity | Social impact + traffic |

Pricing is a hypothesis to validate in the pilot.

**Global readiness:** every data source (ERA5, GloFAS, Open-Meteo forecasts) is global and free. Adding a new region means adding areas and upstream stations to `geo.json` and running the 15-minute calibration. The same cross-border flash-flood problem exists from Nepal into Bihar, in Northeast India, Myanmar, Pakistan and East Africa.

**Scalability + NRB collaboration:** the team does not have an NRB member yet. Our plan is to recruit at least one NRB professional (hydrologist, disaster-risk specialist or climate-data scientist abroad) as a collaborator or mentor to review the method and open doors to international disaster-risk networks (outreach message in `docs/OUTREACH.md`).

---

## Sources

- [UN OCHA — Bangladesh Eastern Flash Floods 2024, Situation Report No. 02 (30 Aug 2024)](https://reliefweb.int/report/bangladesh/bangladesh-eastern-flash-floods-2024-situation-report-no-02-30-august-2024)
- [August 2024 Bangladesh floods — Wikipedia](https://en.wikipedia.org/wiki/August_2024_Bangladesh_floods)
- [Prothom Alo — "No forecast on such severe flood"](https://en.prothomalo.com/bangladesh/c64ir024gd)
