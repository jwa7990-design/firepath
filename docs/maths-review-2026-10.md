# FirePath maths review: October 2026

## How it was done
- **15 independent checkers,** each given one example Australian, worked out that person's numbers from scratch. They used only FirePath's stated rules and official figures, and never saw FirePath's maths code.
- **They compared their numbers** with FirePath's, line by line.
- **Every difference was classed** as a bug, an assumption (a reasonable modelling choice), or the checker's own mistake.

The 15 people:

| # | Person |
|---|---|
| 01 | 24, renter, low savings |
| 02 | 30, ETF investor |
| 03 | 34, couple, 2 kids, $550k mortgage |
| 04 | 38, mortgage, right on age 50 |
| 05 | 42, $260k income, HELP, no hospital cover |
| 06 | 45, modest savings |
| 07 | 50, couple, partner 58 |
| 08 | 55, renter |
| 09 | 58, $2.6M super |
| 10 | 62, nearly free |
| 11 | 68, working part-time |
| 12 | 33, university job, 17% super |
| 13 | 29, low income |
| 14 | 75, aged care |
| 15 | 47, FIRE investor drawing down |

## What matched exactly (to the dollar or the month)
- **Tax:** income tax, low income offset, Medicare levy and its low-income phase-in, the Medicare levy surcharge (single and family), HELP, SAPTO and the seniors' Medicare threshold.
- **Super:** employer super, super growth (fees and the fund's ~7% tax), franking credits (outside and inside super), Division 296, the transfer balance cap and insurance in super.
- **Age Pension:** the means tests, deeming, Rent Assistance and the Work Bonus.
- **Government contributions:** the co-contribution, and the salary sacrifice maths.
- **Aged care:** every fee in all three setups.
- **The Withdrawal planner's tax:** dividends, franking and capital gains.
- **The date itself** for the people without any of the bugs below.

## Bugs found and fixed
1. **Employer super was skipped when super started at $0.** Young workers with no super yet got no employer contributions, so their dates were years too late.
2. **The bridge to 60 drew too much.** Before super unlocks, the plan drew the freedom number ÷ 25, which includes the early-retiree cushion (and any mortgage owing), instead of real spending. Dates came out up to about 9 months too late.
3. **Mortgages in the bridge years.**
   - **What was wrong:** the balance still owing was partly counted twice, and the Age Pension line could come out about 18 months too early.
   - **Now:** what's still owing is paid out of savings on the day you stop.
4. **The age-50 and age-60 boundaries.** When a date fell right on a boundary, the old rule could add up to 10 months. Dates can now land exactly on 50 or 60.
5. **"Savings at 60"** kept adding savings after freedom. It now shows what's left after the bridge years.
6. **Division 293 on employer super** (incomes over $250,000) was missing. Super at 60 was too high: about $147k for the $260k earner.
7. **From 67, gross pay was worked out without the seniors' tax rules.** Tax & Strategy showed too much take-home, with small knock-ons elsewhere.
8. **Renters' Age Pension stopped too early** on the assets test, because Rent Assistance wasn't allowed for in the cut-off.
9. **The ideas list:**
   - "already free" used a rougher check than the date;
   - the salary sacrifice idea suggested $5,000 when less cap room was left;
   - "1 years to bridge".
10. **The note** missed "employer contributes 17%", "17 percent super" and "15.4%", and would have used a partner's rate as yours.
11. **The Withdrawal planner** ignored the Australian-share figure from the note.

## Wording fixed
- **The mortgage note** now says the repayments are left out and any balance owing is paid off from savings when you stop.
- **The Age Pension line:**
  - for people already 67 or over, it now speaks in the present ("You're already Age Pension age…");
  - for renters who haven't entered rent, it says Rent Assistance isn't counted yet.
- **The Age Pension idea** now says "once you stop work", because wages reduce the pension.
- **Tax & Strategy:**
  - "Tax saved" no longer includes the 15% offset on amounts over the cap, which only cancels the fund's tax;
  - "each dollar you salary sacrifice saves about X cents";
  - "Super at 60 if you keep working to 60";
  - Division 293 on employer super is shown.
- **Aged care:** a lump sum's 2%-a-year retention now has its own line.

Every fix has a test built from the checkers' own figures, so it can't quietly come back.

## Decisions for you (modelling choices, not bugs)
1. **Savings held in cash are assumed to be invested.** The date grows all savings at the investment return. Several checkers flagged that someone keeping savings in a bank account would get there later. The options:
   - a) keep it as is, but say so under the date;
   - b) use a cash return for cash savers, so the "invest idle cash" idea shows a real gain.
2. **People already 67 or over.** The main date ignores the Age Pension (your option B), so a 68-year-old can be told "age 82" while the pension line says "now". For people already past 67, the pension isn't speculative. Should their main date include it?
3. **Couples stop work on the same date.** If one partner is much older, they're assumed to keep working until the other stops.
4. **Tax on investment income in retirement** uses today's working tax rate. That's cautious, especially for people 67 and over.
5. **Capital losses** in the Withdrawal planner aren't carried forward. That's cautious and has a small effect.
