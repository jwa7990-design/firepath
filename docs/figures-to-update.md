# Figures to update

FirePath uses official figures that change on set dates. A reminder runs before each date.
When one fires, ask Claude: *"Update FirePath's figures for <date>"*.

After updating:
1. Run `npm test`. The tests check the worked examples, so update any expected figures that legitimately changed.
2. Build.
3. Check How we calculate shows the new figures.

All figure files are in `public/js/`.

## 20 March and 20 September (reminders on 13 March and 13 September)
| Figure | Where | Source |
|---|---|---|
| Age Pension rates (single, couple), supplements | `tax-engine.js` → `AGE_PENSION` (update `effectiveFrom`) | servicesaustralia.gov.au/how-much-age-pension-you-can-get |
| Assets test thresholds and cut-offs (homeowner, non-homeowner) | `AGE_PENSION.assets` (thresholds also change 1 July) | servicesaustralia.gov.au, assets test for Age Pension |
| Income test free area | `AGE_PENSION.income` (also 1 July) | servicesaustralia.gov.au, income test for Age Pension |
| Deeming rates and thresholds | `AGE_PENSION.deeming` | servicesaustralia.gov.au/deeming |
| Rent Assistance (threshold, maximum) | `AGE_PENSION.rentAssistance` | servicesaustralia.gov.au/how-much-rent-assistance-you-can-get |
| Work Bonus | `AGE_PENSION.workBonusFortnight` (rarely changes) | servicesaustralia.gov.au/how-work-bonus-works |
| Commonwealth Seniors Health Card income limits (20 September only) | wording in `moves.js` → `concession-cards` | servicesaustralia.gov.au, CSHC income test |
| Aged care fees: basic daily fee, hotelling, non-clinical, lifetime cap | `tax-engine.js` → `AGED_CARE` (update `asAt`) | myagedcare.gov.au/aged-care-home-costs-and-fees |

## 1 July (reminder on 24 June)
| Figure | Where | Source |
|---|---|---|
| Tax brackets, LITO, Medicare levy thresholds | `tax-engine.js` → `TAX_YEARS` (add the new year) | ato.gov.au tax rates |
| SAPTO thresholds and seniors' Medicare threshold | `TAX_YEARS[year].sapto`, `medicareLevyThresholdSenior` | ato.gov.au, seniors and pensioners tax offset |
| Medicare levy surcharge tiers | `TAX_YEARS[year].mls` | ato.gov.au, MLS income thresholds and rates |
| HELP repayment thresholds | `TAX_YEARS[year].help` | ato.gov.au, study and training loan repayment thresholds |
| Concessional / non-concessional caps, super guarantee rate | `TAX_YEARS[year]` | ato.gov.au, key super rates and thresholds |
| Transfer balance cap | `TAX_YEARS[year].transferBalanceCap` | ato.gov.au, transfer balance cap |
| Co-contribution thresholds | `TAX_YEARS[year].coContribution` | ato.gov.au, key super rates: government contributions |
| Division 296 thresholds ($3M / $10M, CPI-indexed) | `financial-engine.js` → `DIV296` | ato.gov.au, Division 296 tax |
| Support at Home budgets (also changed 1 October 2026) | `AGED_CARE.homeBudgets` | health.gov.au, Support at Home classification levels |

## Every quarter: 1 January, 1 April, 1 July, 1 October (reminders a few days before)
| Figure | Where | Source |
|---|---|---|
| Aged care room interest rate (MPIR) | `AGED_CARE.mpir` | health.gov.au schedule of fees and charges, or myagedcare.gov.au accommodation costs |

## Updated automatically (no action)
- RBA cash rate, CPI, savings and mortgage rates: the live assumptions fetch (`calculations.js` → `FP_ASSUMPTIONS`, fallbacks in the file).

## FirePath's own assumptions (change only by decision)
These live in `financial-engine.js` and are explained on How we calculate:
- 7% real return
- 3% income yield
- 0.65% extra super fees
- the fund tax mix
- 0.5% long-run cash return
- franking settings
- safer withdrawal rates
- the insurance 85c / 16 months / 70 rules

## Last full check: 11 October 2026

Every figure below was checked against the official source on this date. All matched; nothing needed changing.

| Figure | FirePath | Source checked |
|---|---|---|
| Age Pension maximum (incl. supplements) | $1,237.70 single, $1,866.00 couple a fortnight | Services Australia, How much Age Pension you can get |
| Assets test: full pension to / cut-off | single $333,000/$745,750 (homeowner), $600,000/$1,012,750 (non-homeowner); couple $499,000/$1,121,000, $766,000/$1,388,000 | Services Australia, Assets test (20 Sep 2026) |
| Income test free area, taper | $226 single, $396 couple; 50c per $1 (25c each for a couple) | Services Australia, Income test |
| Deeming | 1.75% to $66,800 single / $110,600 couple, 3.75% above | Services Australia, Deeming (Age Pension) |
| Rent Assistance (with a pension) | single over $157.80, max $223.80; couple over $255.80, max $211.00 | Services Australia, How much Rent Assistance |
| Work Bonus | $300 a fortnight, balance to $11,800 | Services Australia, How Work Bonus works |
| Commonwealth Seniors Health Card income limits (wording) | about $105,000 / $168,000 | Services Australia: $105,048 / $168,076 |
| Tax brackets 2026–27 | 0 / 15% from $18,201 / 30% from $45,001 / 37% from $135,001 / 45% from $190,001 | ATO, Tax rates for Australian residents |
| Medicare levy low-income thresholds | $28,011 ($44,268 seniors) | ATO (2025–26 figures; 2026–27 not yet published) |
| SAPTO 2026–27 | single $2,230, $36,034–$53,874; couple each $1,602, $31,847–$44,663 | ATO revised 2026–27 table (via the CFS Firsttech tax tables) |
| Medicare levy surcharge 2026–27 | singles $105,000 / $123,000 / $164,000; families double, +$1,500 per child after the first | ATO, MLS thresholds and rates |
| HELP 2026–27 | $69,528; 15c to $129,717; $9,028 + 17c to $186,050; then 10% | ATO, Study and training loan thresholds |
| Concessional cap 2026–27 | $32,500 | ATO, Contributions caps |
| Transfer balance cap 2026–27 | $2.1M | ATO, Transfer balance cap |
| Co-contribution 2026–27 | $500, $49,293–$64,293 | ATO, Government contributions |
| Division 296 | +15% on earnings over $3M, +10% more over $10M, from 1 July 2026 | Passed March 2026 (commentary sources; ATO page not found by search) |
| Aged care home fees | basic $68.93/day; hotelling to $22.15; non-clinical to $109.45; lifetime cap $140,652.80 or 4 years | My Aged Care, Aged care home costs and fees |
| Room interest rate (MPIR) | 8.51% (1 Oct–31 Dec 2026) | Dept of Health, BIR and MPIR table |
| Support at Home budgets (1 Oct 2026) | levels 1–8: $11,031.56 … $80,294.00 | Dept of Health, Support at Home classifications and budgets |

**Small known gap:** Rent Assistance for a single person sharing a home has a lower maximum ($149.20 a fortnight). FirePath uses the full single rate, so it slightly overstates the pension for single sharers who rent.
