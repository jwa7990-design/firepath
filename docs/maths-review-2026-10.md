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

## Decisions made (11 October 2026)
1. **Savings held in cash now count as cash,** not as if invested. That's about 0.5% a year above inflation after tax over the long run, because most everyday Australians keep their savings in a high-interest account. Cash savers see what investing could change ("If they were invested in shares instead, this could be around …"), a one-tap change if they do invest, and Learning Lab links. Super stays invested.
2. **People already 67 or over:** the main date now includes today's Age Pension. Under 67 it stays a separate line.
3. **Couples stopping work on the same date:** kept as is.
4. **Tax on investment income in retirement** uses today's working rate: kept as is (cautious).
5. **Capital losses** in the Withdrawal planner aren't carried forward: cautious, small effect.

## Round 2 (11 October 2026): 10 more people, aimed at the edges

| # | Person |
|---|---|
| 16 | 40, mortgage with $80k in the offset |
| 17 | 36, renter, savings "a mix" |
| 18 | 41, single parent of 3, renting, no hospital cover |
| 19 | 39, self-employed tradie |
| 20 | Couple, 63 and 65, part-time |
| 21 | 31, $40k credit card debt |
| 22 | 52, mortgage running past 67 |
| 23 | 66, then the same person at 67 |
| 24 | 70, widowed renter, home care |
| 25 | 44, public servant on 15.4% super |

**What matched exactly again:**
- tax (including the family Medicare levy surcharge and SAPTO);
- super, insurance in super, salary sacrifice and the co-contribution;
- Age Pension amounts, Rent Assistance and home care fees;
- the Withdrawal planner's tax;
- the date itself, once the checkers used the same inputs.

### Bugs found and fixed
1. **More savings can mean less Age Pension.**
   - **What was wrong:** the pension line found the smallest amount of savings that, with the pension, reaches the number. It then treated anyone with more as covered. In the assets-test taper, each extra $1,000 cuts the pension by $78 a year. So people holding roughly $500k–$1.4M near pension age could be told "now" when they weren't free. Examples: a couple at 63/65 with $1.1M, and a 67-year-old with $600k.
   - **Now:** each month is tested on the money the person would actually hold at 67, and the pension shown is the one on that amount.
2. **Savings in an offset were counted twice.** They earned the offset return and also cut the loan's interest, which made dates about 7 months early. They now count once.
3. **Repayments that don't cover the interest.**
   - **What was wrong:** the mortgage was ignored and its repayments stayed in spending for ever. That created a cliff edge: $1,800 a month gave age 75, while $1,809 gave 71½.
   - **Now:** what's owing is paid off when you stop, and a note says the loan isn't shrinking.
4. **The Age Pension line with a mortgage running past 67** kept the repayments in, so the line never showed. It now pays the loan off when you stop, as the main date does.
5. **Self-employed people were given 12% employer super.** For the example tradie, the date came out about 16 months early, super at 60 about $200k high, and "stop saving now" wrong. Now:
   - the note box reads "self-employed", "sole trader" and "run my own business", plus super they add themselves;
   - a tap-to-add chip "Self-employed" is offered;
   - the tax idea says "add to super yourself and claim a deduction".
6. **The note box missed** "None of my shares are Australian", "All my shares are international", "Most of my shares are Australian" and "Australian shares: none".
7. **"If invested…" left out franking credits for cash savers,** which made it about 3–4 months too cautious.
8. **Market range:**
   - too narrow for cash savers (super is invested and moves too);
   - ignored the Age Pension from 67;
   - didn't pay the mortgage off on the day, so it could sit earlier than the date.
9. **A renter's "mix" averaged in an offset account,** which they can't have.
10. **Freedom options** dropped employer super, insurance, the mortgage and where savings sit when it took the plan over from Freedom gap.

### Wording fixed
- "Add your rent in the note" no longer shows once rent is counted.
- For people 67 and over: "(less while you're earning)" instead of "once you stop work", which was wrong for people already retired.
- The mortgage note:
  - drops the misleading "so";
  - says "savings and super" after 60;
  - says when a loan won't be paid off before 90;
  - says "sooner with your savings in the offset".
- "Than your current mix" for mix savers on the investing idea.
- "If invested…" adds that shares can fall, when the date is within five years.

### For the owner to decide
1. **Debt and the date:** $40k of card debt doesn't change the date, only the ideas list. Options:
   - a short line saying so, and roughly how much clearing it first would move the date;
   - "once your debt is cleared" on the invested line.
2. **Far from 67:** should the one line under the date prefer something the person controls, like the savings line, over the Age Pension line when they're under about 50?
3. **"If invested…" before a three-month buffer:** say "investing what you add beyond a 3-month buffer".
4. **Spending after the kids leave:** an optional tap-to-add prompt for parents.
5. **Home care for someone barely a part pensioner:** it uses the halfway rate (cautious). It could be scaled to how close they are to the full pension.
