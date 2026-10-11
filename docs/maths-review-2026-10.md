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

### Owner decisions (11 October 2026)
1. **Debt:** when someone has card or personal-loan debt, the line under the date says so first: "This date doesn't count your $40,000 of debt. Paying it off first could move it to around 2060, age 65." It assumes savings go to the debt, and the rest is paid from monthly saving at a typical 20% card rate. The investing line then says "once your debt is paid off".
2. **Under 50:** the Age Pension line never takes the main spot. It stays behind "More about this date".
3. **Short of a three-month buffer:** the investing line says "Investing what you add beyond a three-month buffer…".
4. **Spending after the kids leave:** not now. The retirement spending setting (80%) covers it.
5. **Home care for someone barely a part pensioner:** kept at the halfway rate (cautious).

## Round 3 (11 October 2026): 15 people at the gaps, plus every page

Clean (matched to the dollar or month):
- #28 couple on weekly pay
- #29 fortnightly couple with a mortgage
- #30 19-year-old apprentice
- #31 85-year-old with $1.9M
- #33 spending 20% more with a mortgage
- #35 already free at 46
- #37 surgeon on $380k with HELP

### Fixed
1. **The years after stopping are now worked out month by month.**
   - **How it works now:** savings are spent first while super keeps earning super's return. It works once, on stopping or at any super unlock, the money you can reach is the freedom number. A pot that unlocks later is extra.
   - **What was wrong:** unlocked super was treated as earning the savings rate. For cash savers with a partner whose super unlocked 22 years later, $1 more of partner super pushed the date out 17 months (#27).
   - **Also fixes:**
     - the pension line was about 6 months late (#38);
     - one to two months of caution (#29);
     - negative "savings at 60" (#39).
2. **The Age Pension when savings are spent down** (#36). Round 2 tested the pension only at the amount held. But spending down raises the pension, and money settles where savings plus 25× the pension cover spending. So anyone holding at least the smallest amount that works is covered.
   - **Example:** a 68/72 couple with $910k is free now (it said 2035).
   - **Kept from round 2:** the pension shown is the one on what you'd hold, and it rises as savings fall.
3. **The pension line no longer takes credit for growth from 60 to 67** (#28, #30). It shows only when the pension itself moves the date by six months or more.
4. **Partners:**
   - a partner who works but has $0 super now gets employer super. The date was 11 months late, and in the wrong band (#26);
   - "my partner is self-employed" is read (#27);
   - when only you are 67, only your half of the couple rate counts (#27).
5. **No employer super from 67** (#31, #36).
6. **Market range:**
   - each simulated path must also carry the years until super unlocks (#32);
   - no range once free;
   - it works out much faster now.
7. **Odd inputs:** ages outside 15–109 count as unknown. Repayments bigger than spending aren't counted, and a note says to check them (#32).
8. **Pages agree** (#40):
   - Freedom gap and Freedom options pass homeowner and rent, so a 67+ renter's pension counts;
   - Freedom options keeps Rent Assistance;
   - What if… keeps the mortgage and the saved savings on "Keep the house" and "Stay put";
   - every page shows the calendar year of the freedom month (not this year + rounded years);
   - Ask FirePath uses the same range as every page;
   - Pro reads old plans without a pay cycle as monthly;
   - Pro works out a 67+ couple's gross pay as a couple.
9. **Wording:**
   - the debt line says "push it back to", and a small effect stays behind "More". From 50 it competes with the pension line;
   - the cushion figure is spending only, and there's no cushion line when already free;
   - the mortgage note gives one year and says "now" when already free;
   - the savings line is hidden when investing lands on the same year and age;
   - the ideas list:
     - co-contribution not from 67;
     - concession cards for pensioners;
     - "on what you hold today" for the pension amount;
     - "already covered" for spending less;
     - debt interest "often 7–20%";
   - HELP "stops once the debt is paid off";
   - the aged care retention row explains it comes off the refund.

### Checked and not a bug
- **Withdrawal planner franking** (#34, #35): $1.26M × 1.6% Australian dividends × 75% franked × 30/70 = $6,480, as shown. The checkers applied the 75% twice.

### For the owner to decide
1. **People already retired (#34):** FirePath assumes everyone still works. Should it offer an "I've already stopped work" note that shows how long the money lasts instead of a date?
2. **Long gaps before super (#39):** for someone stopping at 30, the years until 60 assume a steady return with no cushion. Should the safer rate also apply to those years?
3. **Smaller:**
   - a short caution for recent migrants (10 years' residence for the Age Pension);
   - a note that a teenager's spending rises when they move out;
   - the First Home Super Saver scheme as an idea;
   - a flag when super will pass the $2M transfer balance cap or the $3M Division 296 line.

## Round 4 (11 October 2026): the two owner decisions, 5 final checkers

**Built:**
1. **The safer-rate cushion covers the years before super unlocks.** Spending is about 14% more before 50 and about 7% more in your 50s.
2. **"I've stopped work" in the note,** or the tap-to-add button for people 50 and over:
   - no wages or employer super;
   - instead of a date, how long the money could last, with the Age Pension as it comes in;
   - "free now" if they're already covered.

**Checked:**
- #41 the retired 62-year-old, plus variants at 57 and 68
- #42 a retired couple who rent
- #43 a 28-year-old early stopper, with a test of the 50s band
- #44 a 47-year-old with a partner, a mortgage and mixed savings

Every figure matched the checkers' own month-by-month scripts.

**Fixed:**
- **The couple pension** in "how long it lasts" now starts each partner's half at their own 67. A younger partner's super stays out of the test until then (#42).
- **Wording of the stopped-work line:**
  - the pension is mentioned only if and when it comes in ("about $X a year now", "from 67", or "from about age N");
  - before 60 it says "Your super can carry you from 60".
- **The mortgage note** now leads the line under the date only when it's a warning. Otherwise the line that moves the date leads (#29, #44).
- **Smaller wording:**
  - "$1.12M";
  - "you could stop now";
  - "From 67, on what you hold today";
  - no "(less while you're earning)" for someone who has stopped work.
- **Every page for someone who has stopped work** (#45):
  - no market range, "stop saving" point, path chart, projection chart, "Try it" sliders, savings promise or milestones;
  - Pro shows "You've stopped work" on reopening a plan, on a fresh Calculate and with the dollars toggle, and hides the range and "Life unlocked" cards;
  - Freedom gap and Freedom options pass "stopped work" on, and Freedom gap shows how long the money lasts;
  - What if… works out its dates with no wages and says why;
  - Ask FirePath gives the AI the stopped-work line.
- **The free calculator and Freedom gap** say when someone is covered only because of the Age Pension.
- **The tap-to-add buttons** update when age changes.

## Round 5 (11 October 2026): 20 random client profiles

Twenty random, realistic profiles were generated with a fixed seed. They cover singles and couples, renters, mortgages and owners, cash, offset, mix and ETF savings, debts, weekly and fortnightly pay, self-employed people, people who have stopped work, and ages 27 to 75.

**Two layers of checking:**
- Automatic checks on all 20 (more money never makes a date later, no broken text, every page agrees, no wage ideas for someone who has stopped work, the range sits around the date). All held.
- Five independent checkers, four clients each, worked every figure out from scratch. Every core figure (tax, gross pay, super, freedom number, band, date, mortgage) matched to the month or the dollar.

**Fixed:**
1. **"…and put $8,000 a year into super myself"** (the self-employed tap-to-add wording) now reads the $8,000. For two clients the date moved 31 months and 13 years.
2. **A partner with no super and no pay** is still a partner, so the couple's Age Pension rules apply. Client 11 now gets a pension line.
3. **Repayments bigger than spending** leave the mortgage out of the pension line too (as in the headline), so the line shows (client 18).
4. **Someone who has stopped work and has a mortgage:** the mortgage note stays behind "More about this date" (client 20).
5. **The Age Pension line's band:** the pension's value is sized on each band's own number (26.7× in the 50s), not plain 25× (client 04).
6. **Debt line:**
   - now worded "Counting it, the date would be around…", because "push it back" read as if paying off debt were bad;
   - under 50 it leads only when it moves the date a year or more.
7. **Mortgage note:**
   - a loan paid off before the date now says what saving the freed-up repayments could do (the date itself still assumes saving stays the same);
   - there's no "around 2056" when that would be past age 100.
8. **The Age Pension idea** counts the pay of someone 67+ who is still working (client 12's was $21,900; on their $136k of pay it is nil).
9. **Tax & Strategy** reads the note: self-employed or stopped work means no employer super, super you add yourself counts towards the cap, and someone who has stopped work is told super from 60 is usually tax-free.
10. **The cushion line** says "a freedom number of $411K", not "your yearly spending ($411K)".

**Checked and not a bug:** the "If invested" figures some checkers quoted came from the test script's own extra field, not from what the page shows.

**For the owner to decide:** employer super from 67.
- FirePath assumes none, a cautious default chosen because retirees used to get wages wrongly counted.
- By law, employer super has no upper age limit (since July 2022). So someone still employed at 67+ gets it, and their date would come sooner.
- Now that "I've stopped work" can be said in the note, the default could be: employer super continues at any age unless the note says they've stopped work.

**Owner decision (11 October 2026):** employer super continues at any age, as the law allows. It stops only when the note says the person has stopped work (or is self-employed).

## Automated random-profile testing (11 October 2026)

`tests/fuzz.test.cjs` makes random Australians, deliberately wider than real clients:
- ages 16–92;
- $0–$40k a month take-home;
- up to $3–4M in savings and super;
- couples with and without ages;
- mortgages that never shrink or cost more than all spending;
- every note pattern.

Each one is checked against rules that must always hold:
- no broken numbers;
- the date's figures agree;
- more money or a smaller number never makes the date later (or money run out sooner);
- people who have stopped work get no date and no wage ideas;
- no broken text in any line or idea;
- the ideas list agrees with the date;
- the Age Pension line is never later than the date;
- "stop saving now" really gets there by 65;
- the market range sits around the date.

It caught two deliberately planted bugs before being trusted.

- `npm test` runs 300 profiles every time; `npm run test:fuzz` runs 10,000.
- Two full sets of 10,000 (seeds 20261011 and 777) now pass with no failures.

**Fixed from the first 10,000:**
- **Stopped work, a mortgage, not yet covered:** the mortgage note said "around null". It now says "now" and uses today's balance.
- **Repayments that leave under $600 a month for everything else** get the "check your figures" note. They could give "free now" on a near-zero freedom number.
- **Market range:**
  - it follows the band's "not before 60/50" rule;
  - it allows super to pay off a loan on the day it unlocks;
  - it's worked out exactly within a year of the date.
