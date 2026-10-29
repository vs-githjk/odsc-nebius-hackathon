# Registration: ODSC x Nebius Hackathon (2-minute walkthrough)

Read-only research, 2026-10-28 23:20 PDT. Nothing was submitted and no account was created. Form source: HubSpot form JSON (portal 1865444, form f432bc3c-2e85-4624-a0f0-6cde804a6636, definition updated 2026-10-23 05:26 PDT) plus a Playwright render of https://share.hsforms.com/19DK8PC6FRiSg8GzegEpmNg13zdw (VERIFIED, all fields visible, no captcha, no hidden conditional fields).

## Step 1: the ODSC form (each of the 4 teammates)
Open https://share.hsforms.com/19DK8PC6FRiSg8GzegEpmNg13zdw (the "Register now" button on https://hackathon.odsc.ai/event points here).

| # | Field (as shown) | Type | Required | What to enter |
|---|---|---|---|---|
| 1 | First name | text | yes | |
| 2 | Last name | text | yes | |
| 3 | Email | text | yes | The inbox you watch: the submission link and prize news come by email only |
| 4 | Country (Current Residence) | dropdown (about 250 options) | yes | United States |
| 5 | State/Province | free text | yes | Pennsylvania (where you live) |
| 6 | Do you have a team? | radio Yes / No | yes | Yes |
| 7 | Team Name | text | **yes, even if solo** | Says Who (every teammate types it identically) |
| 8 | Teammates emails | textarea, "separated by a comma (,)" | no | The other 3 emails |
| 9 | LinkedIn profile | text | no | optional |
| 10 | I have read and agree to ODSC Privacy Policy and Terms & Conditions | checkbox | yes | must tick |
| 11 | I agree to receive other communications from ODSC. | checkbox | **yes (forced marketing consent)** | must tick to submit |
| 12 | State/Region | dropdown (US states, DC, "Remote", "Outside of the USA") | yes | Pennsylvania (your own state; each teammate picks theirs) |

Then press Submit. The page shows: "Thank you for registering for the Hackathon. We will be in touch closer to the event with more details. For any questions, email the organizer address shown on the page" (form `inlineMessage`, VERIFIED).

Notes:
- Field 7 is stored in HubSpot property `university` (a reused field), so a placeholder like "solo" would be saved as your team name. Decide the name first.
- Whether teammates listed in field 8 are registered automatically is UNRESOLVED. Recommendation: all 4 fill the form with the same team name, so each gets the Expo pass and the emailed submission link.

## Step 2: what happens after
| Item | What we know | State | Source |
|---|---|---|---|
| Confirmation | On-page thank-you message; a confirmation email is not promised | VERIFIED (message) / UNRESOLVED (email) | form JSON |
| Submission link | Emailed to registered participants near the end | VERIFIED | hackathon.odsc.ai/event |
| Prizes and judges | Announced later by email | VERIFIED | same |
| Expo pass | Complimentary ODSC AI West Expo pass for registered hackers; delivery method not stated | VERIFIED / UNRESOLVED | same |
| Discord or Slack invite | No event channel named anywhere. Nebius's public builder Discord: https://discord.com/invite/nN58zxSTFR | UNRESOLVED | dev.nebius.com |
| Hackathon promo code for credits | NOT FOUND (searched the event bundle for "credit", "promo"; the odsc.ai page; web search "Nebius Token Factory hackathon credits promo code 2026"). The older odsc.ai page promised "API credits for Nebius Token Factory" for the one-day format | UNRESOLVED | odsc.ai/west/nebius-hackathon |

## Step 3: Nebius Token Factory API key (each builder; do it after Vidyut's go)
1. Go to https://tokenfactory.nebius.com and sign in with Google or GitHub (docs quickstart, VERIFIED).
2. Onboarding forces a billing account: **a bank card is required**, you cannot finish onboarding without it. New sign-ups get **$1 trial credit valid 30 days** (https://docs.tokenfactory.nebius.com/other-capabilities/billing-new.md, VERIFIED). Card is charged automatically when the balance goes negative or hits the threshold, so set a low threshold.
3. Promo code (if ODSC or Nebius hands one out at kickoff or by email): balance, then **Top up**, then **With promo code**, enter it, **Top up**. Codes expire; apply on receipt (same doc, VERIFIED).
4. Key: open https://tokenfactory.nebius.com/project/api-keys, click **Create API key**, name it, click **Create**, and **copy it immediately: it cannot be viewed again** (https://docs.tokenfactory.nebius.com/api-reference/introduction.md, VERIFIED).
5. Store it as `NEBIUS_API_KEY` in a local `.env` that is git-ignored; never paste it in chat or the repo.
6. Rate limits: default cap shown at https://tokenfactory.nebius.com/project/rate-limits; the docs' example baseline is 60 RPM and 400,000 TPM, auto-scaling up to 20x (rate-limits doc, VERIFIED example values).
7. Extra free credit worth taking: the **Nebius AI Builder Program** (free to join) includes **$25 Token Factory credit, $25 Tavily credit, $100 LangSmith credit** (https://dev.nebius.com/builders, fetched 23:08 PDT, VERIFIED; "Partner offers are subject to eligibility, availability, and individual partner terms").

## Step 4: Tavily API key (each builder)
1. Go to https://app.tavily.com and sign up. **Free "Researcher" plan: 1,000 API credits per month, no credit card** (https://docs.tavily.com/documentation/api-credits.md, VERIFIED). Credits reset on the 1st of each month (FAQ, VERIFIED), so Oct and Nov allowances both count.
2. The key (prefix `tvly-`) appears on the app home page (https://app.tavily.com/home per the FAQ). Store as `TAVILY_API_KEY`.
3. Free keys are "Development" keys: 100 RPM (crawl 100, research 20 RPM). Production keys need a paid plan or PAYGO (rate-limits doc, VERIFIED).
4. No key needed to start: **keyless mode** for `/search` and `/extract` with header `X-Tavily-Access-Mode: keyless`, free and rate-limited, identical response schema (https://docs.tavily.com/documentation/keyless.md, VERIFIED). Good for the first spike before accounts exist.
5. Team budget: 4 people x 1,000 credits = 4,000 credits a month; basic search = 1 credit, advanced = 2, extract = 1 credit per 5 URLs (basic) or 2 per 5 (advanced), research = 4 to 250 credits per call.

## What Vidyut must do (only these)
1. Agree the team name with teammates, then all 4 submit the ODSC form (2 minutes each).
2. Say "go" for each person creating Token Factory (card needed) and Tavily accounts, and optionally joining the Nebius AI Builder Program.
3. OK the smoke calls listed in `plan/research.md` section 5 (all free or under one cent).
4. Watch the registered inbox for the deadline time and the submission link; forward the email to the main session.

CHECKED_AT: Wed Oct 28 23:20 PDT 2026
SUBJECT: HubSpot form f432bc3c (portal 1865444); docs.tokenfactory.nebius.com; docs.tavily.com; dev.nebius.com/builders
CHECKED: form JSON and live render (read only), billing, API key, rate-limit, credits, keyless docs
NOT CHECKED: the Token Factory and Tavily sign-up screens themselves (no sign-up allowed); Builder Program join form fields
UNRESOLVED: whether listed teammates are auto-registered; confirmation email; Expo pass delivery; event promo code; event support channel
