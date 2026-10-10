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
