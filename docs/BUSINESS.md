# Business model, costs and a letter-of-intent template

## Who pays (citizens never do)

| Customer | What they buy | Why they need it |
|---|---|---|
| NGOs / donors running **anticipatory action** (cash or support released before a flood) | Objective, auditable triggers per upazila + household outreach + delivery records | Anticipatory programmes must justify when they release money |
| **Union / Upazila Disaster Management Committees** (through DDM or donor projects) | Per-area subscription: dashboard, alerts, dispatch, audit log | Turns a warning into documented action |
| **Microfinance institutions and insurers** | Early flood signals for borrowers' areas; triggers for parametric products | Protect clients and portfolios |
| **Telecom operators** | Partnership: voice / SMS capacity, Cell Broadcast | CSR + traffic |

## What one union costs per monsoon (fill in real quotes)

Everything below is an **assumption to replace with real quotes** from providers.

| Item | Formula | Example assumption | Example cost |
|---|---|---|---|
| SMS | households with phone × alert rounds × SMS parts × price per part | 5,000 × 5 rounds × 3 parts (Bangla SMS) × Tk 0.30 | Tk 22,500 |
| Voice calls | households with phone × rounds × attempts × price per call | 5,000 × 5 × 1.3 × Tk 0.60 | Tk 19,500 |
| Volunteer / announcer SMS | contacts × rounds × parts × price | 40 × 5 × 3 × Tk 0.30 | Tk 180 |
| Hosting (shared by many unions) | small server per month ÷ unions served | US$10 ÷ 20 unions × 6 months | ≈ Tk 400 |
| Weather data (commercial) | Open-Meteo API plan ÷ unions served | see open-meteo.com/en/pricing | small when shared |
| AI alert writing | Claude API per alert | < US$0.05 per alert × 5 | ≈ Tk 30 |
| **Total** | | | **≈ Tk 43,000 per union per monsoon** (≈ Tk 8–9 per household) |

Alert rounds per year come from the 30-year backtest (≈ 0.6 Danger episodes plus several Warning days per area per year). **Compare:** one avoided livestock loss or one evacuated family is worth more than the whole union's yearly cost.

## Pricing hypothesis to test in the pilot
- **NGO / donor anticipatory-action licence:** per district per monsoon (covers several unions, includes reporting).
- **Union subscription:** cost-recovery price (SMS + calls at cost + a small platform fee), funded through DDM / donor projects.
- **Telecom partner:** SMS / voice at reduced or zero cost in exchange for visibility.

## Letter of intent — template (for an NGO, union or company)

> **[Organisation letterhead]**
> Date: …
>
> To: Team Agam, International AI Builders Congress 2026
>
> **Subject: Letter of intent to pilot Agam (আগাম) flood early-warning**
>
> [Organisation] works on [disaster response / community development] in [union / upazila / district]. We have reviewed the Agam prototype, which watches upstream rainfall and helps local committees send Bangla voice and SMS alerts to every household, most vulnerable first.
>
> We are interested in piloting Agam in [area] during the [year] monsoon, subject to a final agreement. Our expected role: [share household lists collected with consent / provide volunteers / co-fund SMS and call costs / evaluate results].
>
> This letter is not a binding commitment.
>
> Name, title, signature, contact
