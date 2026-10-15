# Synthetic Kidney + Liver Paired-Exchange Pools for Simulation (India-first)

Scope: parameters and methods to build a synthetic generator (no real patient data) that simulates ~1 year of pair arrivals, match runs and failures for kidney and liver swaps in India. All numbers below are from cited sources; anything not directly sourced is labelled as an inference or assumption.

---

## 1. Kidney generators: Saidman (2006) and successors — exact parameters, code and instance sets

### Takeaway
The Saidman et al. (2006) generator is fully specified by a small table: patient ABO, patient sex, spouse share among unrelated donors, three PRA bands with fixed positive-crossmatch probabilities, and a 0.75 multiplier on negative-crossmatch probability for husband-to-wife donation. Delorme et al. (2022) showed that it produces far denser graphs than real UK data. They give a better compatibility rule (P(compatible) = 0.58 - 0.55 x cPRA/100, plus cPRA-band and cPRA-0 fixes) and open-source code.

### Cited Findings

**Saidman et al., Transplantation 2006;81:773-782 (the "Saidman generator", calibrated on US OPTN/SRTR 1993-2002 data)** — [Saidman et al. 2006, PDF](https://stanford.edu/%7Ealroth/papers/SaidmanRothSonmezUnverDelmonico.Transplantation.2006.pdf)
- Table 5 inputs: patient blood type O 48.14%, A 33.73%, B 14.28%, AB 3.85%. Patient sex: female 40.90%, male 59.10%. Unrelated living donors: spouse 48.97%, other 51.03%. PRA distribution: low 70.19%, medium 20.00%, high 9.81%.
- Positive-crossmatch probability with a random donor: low PRA (<10%) 5%, medium PRA (10-80%) 45%, high PRA (>80%) 90%.
- Spousal effect: the positive-crossmatch probability between a female patient and her husband is about 33%, against about 11% for random pairs. The paper models the *negative* crossmatch probability for wife-patient/husband-donor as 75% of the random-donor value, since (1-0.33)/(1-0.11) is about 0.75. So P(positive XM) = 1 - 0.75 x (1 - PRA_XM).
- Process: draw patient-donor pairs (one donor per patient) from these distributions and keep a pair only if it is incompatible by ABO or by positive crossmatch, until n incompatible pairs exist. Building 25 incompatible pairs took 48 generated pairs on average, and 100 took 198. Monte Carlo used 500 populations of n = 25 and n = 100. The same crossmatch probabilities apply to cross-pair edges.
- Donor ABO uses the same population distribution (Saidman assumes a single composite-race ABO distribution). In a variant, each patient can have 0-2 parents, 0-1 sibling and 0-1 spouse as donors, with each of the 12 combinations equally likely.
- Validation outputs, Table 6 (mean patients matched, SE in parentheses):
  - n = 25: 2-way only 8.86 (3.49); 2+3-way 11.27 (4.00); unrestricted 11.99 (3.95).
  - n = 100: 2-way 49.77 (7.36); 2+3-way 59.78 (7.45); unrestricted 60.46 (7.30).
- Modified multi-donor model, Table 7: n = 25 gives 9.28 / 12.18 / 13.35, and n = 100 gives 54.19 / 66.63 / 67.31.
- Selection effects in the incompatible pool: O patients make up 59% of all patients in incompatible pairs, while O donors appear in only 23% of incompatible pairs. High-PRA patients are 10% of all patients but 18% of incompatible pairs, and 35% of those with an incompatible O donor.
- With n = 25, 61% of matched patients were in 3-way cycles. With n = 100, 49% were.

**Delorme, García, Gondzio, Kalcsics, Manlove, Pettersson, Trimble — "Improved instance generation for kidney exchange programmes", Computers & Operations Research 141 (2022) 105707** — [Enlighten record + open PDF](https://eprints.gla.ac.uk/263124); [PDF](https://eprints.gla.ac.uk/263124/2/263124.pdf)
- Describes the generic Saidman process (Sec. 4.2.1). Blood group and cPRA are drawn independently, as is the number of donors per recipient. A donor-recipient pair is compatible iff ABO-compatible and r > cPRA/100 with r ~ U[0,1]. Any recipient compatible with one of their own donors is discarded along with all their donors. Non-directed donors (NDDs) get a blood group only.
- Result: Saidman instances have substantially more edges, and larger maximum transplant sets, than real UKLKSS instances.
- Calibrated on 32 UKLKSS matching runs (quarterly), Jan 2012 to Oct 2019. For each real instance they generated 20 random instances of the same size, giving 640 instances per configuration.
- Fix 1, "SplitPRA": the cPRA distribution differs depending on whether the recipient's donor is ABO-compatible. They use two cPRA distributions, plus donor ABO conditional on recipient ABO.
- Fix 2, "CalcXMatch": in UK data, cPRA versus compatibility has correlation about -0.519, and the weighted least-squares fit is P(compatible) = 0.58 - 0.55 x cPRA/100. Recipients with cPRA 100 are compatible with about 1% of ABO-compatible donors; CalcXMatch gives them 3%.
- "TweakXMatch" uses 0.55 - 0.55 x cPRA/100 (cPRA 100 gives 0).
- "BandXMatch" fits a separate regression per cPRA band: [0,50), [50,95), [95,96), [96,97), [97,98), [98,99), [99,100), and 100.
- Fix 3, "PRA0": cPRA-0 recipients are compatible with only about 58% of ABO-compatible donors on average. About 18% are compatible with all of them, about 40% with more than 95%, and about 26% with fewer than 25%. The fix samples each cPRA-0 recipient's compatibility probability from a smoothed empirical histogram.
- Recommendation for simulating the UKLKSS: "SplitPRA BandXMatch PRA0".
- For 1024-pair instances from the new generators, the maximum number of transplants averaged 364.1 (about 36% of pairs).
- Code: generator web app at https://wpettersson.github.io/kidney-webapp/#/generator and source at https://github.com/wpettersson/kidney-webapp/. Instances: http://dx.doi.org/10.5525/gla.researchdata.1213 (cited in the PDF).
- Instance set: "ImprovedInstanceGeneration-Instances.zip" (118 MB), CC BY 4.0, published 5 Nov 2021 — [Glasgow research data 1213](https://researchdata.gla.ac.uk/1213).
- PrefLib hosts kidney instances produced with the Saidman generator (Dickerson et al., 2012). They have far higher edge density than real instances — [Delorme et al. 2022](https://eprints.gla.ac.uk/263124/2/263124.pdf).

**Other code**
- Dickerson's `kidney_solver` (Python 2 with Gurobi) reads instances in the PrefLib format — [GitHub JohnDickerson/kidney_solver](https://github.com/JohnDickerson/kidney_solver). Search results also list jamestrimble/kidney_solver, ptoulis/kidney-exchange and JohnDickerson/KidneyExchange.
- James Trimble built a Saidman-type generator and a kidney-exchange file converter — [James Trimble homepage](https://www.dcs.gla.ac.uk/~jamest).
- Julia package with generators and solvers — [KidneyExchange.jl](https://github.com/jeremyomer/KidneyExchange.jl).
- Santos, Tubertini, Viana et al., "Kidney exchange simulation and optimization", JORS 68(12), 2017 — [IDEAS record](https://ideas.repec.Org/a/pal/jorsoc/v68y2017i12d10.1057_s41274-016-0174-3.html). Delorme et al. cite Santos et al. (2017) for parameter sweeping to tune generator inputs. No public repository for that generator was found.

### Inferences
- A minimal "Saidman-IN" generator: replace the ABO table with Indian frequencies (Section 2) and keep the three PRA bands and their crossmatch probabilities. Apply the 0.75 negative-crossmatch multiplier to every *husband donor to wife patient* pair. In India most spousal donations run wife to husband (Section 2), so the multiplier will apply to a small share of spousal pairs.
- The Saidman rule over-connects the graph. For realism, also offer a "Delorme mode": compatible with probability 0.58 - 0.55 x cPRA/100 for ABO-compatible pairs, with a separate cPRA-0 heterogeneity draw. Run both modes as low and high bounds on match rate.
- Calibration loop (Delorme Sec. 4.2.1): because compatible pairs are discarded, tune the *input* ABO and PRA distributions until the *output* pool matches the target incompatible-pool composition.

### Gaps
- I could not open Delorme et al. Appendix B (the actual UK input distributions and band regression coefficients) in the extracted PDF. They should be in the paper's appendix or in the kidney-webapp source defaults.
- I found no current public repository for the Santos/Tubertini/Viana generator or for an "ENCKEP generator". ENCKEP's instance generator was not located in this pass.
- I found no Ashlagi/Gamarnik "UNOS-like" public dataset; Ashlagi's simulations resample proprietary APD and MSA data (Section 3).

---

## 2. India-specific population parameters (ABO/Rh, HLA/sensitisation, donor relationships)

### Takeaway
Indian ABO is B-heavy compared with Western populations: O ~37%, B ~32%, A ~23%, AB ~8%, with Rh+ ~94-95%. Living donors are about 80% female, and spouses (mostly wives) supply roughly 28-35% of living kidneys at large centres. They dominate KPD pairs: 71% of donors in one IKDRC KPD series were spouses. Indian sensitisation data are sparse.

### Cited Findings
- **Multicentre India ABO/Rh** (Agrawal et al., Asian J Transfus Sci 2014; 10,000 donors from North, South, East and Central blood banks): O 37.12%, B 32.26%, A 22.88%, AB 7.74%; Rh(D)+ 94.61% — [PMC4140055](https://pmc.ncbi.nlm.nih.gov/articles/PMC4140055); figures as reported in [ScienceOpen record](https://www.scienceopen.com/document/vid/31b3b254-b1a1-4d84-adef-3dc5429faabc).
- **Regional variation**:
  - Ahmedabad, 109,771 donors: B 35.81%, O 32.74%, A 22.68%, AB 8.77%; Rh+ 94.48% — [search summary of NJIRM study](https://nicpd.ac.in/ojs-/index.php/njirm/article/view/2209).
  - Western Rajasthan, 83,631 donors: B 36.4%, O 31.7%, A 22.2%, AB 9.4%; Rh+ 91.75% — [NJMR](https://njmr.in/index.php/file/article/view/580).
- **Indian KEP data used in an arXiv simulation** (Indian Transplant Registry extract: 383 donors and 195 patients). Donors: O 53.26% (O+ 50.91, O- 2.35), A 24.28%, B 21.41%, AB 1.04%. Recipients: O 36.41%, A 33.85%, B 25.64%, AB 4.10% — ["Indian Kidney Exchange Program: A Game Theoretic Perspective", arXiv 2112.02932](https://arxiv.org/pdf/2112.02932). Caveat: this is a transplanted (mostly compatible) population, not an incompatible-pair pool. Donors are O-enriched for that reason.
- **Spousal donors**:
  - At PGIMER Chandigarh, spouses rose from 17.2% (2002-06) to 34% (2012-13) of living donors. At SGPGI Lucknow they rose from 5% (to 1998) to 34.3%. At AIIMS New Delhi they were 27.7% over the last decade. Wives were about 87% of spousal donors (Sakhuja & Kumar, Indian J Nephrol, 2014 editorial) — [Indian J Nephrol](https://indianjnephrol.org/spouses-as-kidney-donors-in-india-trends-and-outcomes/).
  - AIIMS New Delhi, 1,171 live kidney transplants 2013-2022 (Jamwal, Jain, Bansal, Indian J Nephrol, 2026): 79% of donors female and 81.5% of recipients male. Female donors were 50.1% mothers, 35.6% wives and 7.5% sisters. Male donors were about 54% fathers, 17.9% brothers and 14.7% husbands — [Indian J Nephrol](https://indianjnephrol.org/gendered-patterns-and-societal-drivers-of-living-kidney-donation-in-north-india/).
  - IKDRC Ahmedabad KPD cohort (2013; 56 patients in 25 two-way and 2 three-way exchanges). Donors were spouses (n = 40), parents (13) and others (3). Pairs entered KPD for ABO incompatibility (n = 52) or positive crossmatch (n = 4) — [Kute et al., Transplant International](https://frontierspartnerships.org/journals/transplant-international/articles/10.1111/tri.12078/full).
- **HLA**: 712 consecutive living donors in North Kerala (Dec 2011 to Dec 2021) were used to build a local cPRA calculator. The most common haplotype was A*33:03-B*44:03-DRB1*07:01, followed by A*01:01-B*57:01-DRB1*07:01. Antigen frequencies differ markedly from the US OPTN calculator; for example, A2 is 47.9% in OPTN versus 28.65% in this population (Sasindran et al., 2025) — [Indian J Nephrol](https://indianjnephrol.org/calculated-panel-reactive-antibody-for-an-organ-sharing-zone-concept-and-execution-based-on-data-from-north-kerala/).
- **Sensitisation (low confidence)**: a search snippet reported PRA positivity in 29/185 (15.7%) patients in one prospective Indian single-centre study, and 23% in 52 subjects at a Pune centre. Female sex, longer RRT and HCV were associated with positivity — [search result list incl. PMC5067500](https://pmc.ncbi.nlm.nih.gov/articles/PMC5067500) (page blocked by a captcha, so not verified).

### Inferences
- **Recommended India ABO input for patients and donors** (multicentre Agrawal 2014): O 0.3712, A 0.2288, B 0.3226, AB 0.0774. Offer region presets (West/North-West: B ~0.36, O ~0.32). Rh is irrelevant to solid-organ compatibility and can be ignored.
- **Recommended PRA input for India (assumption)**: a lower-sensitised population than the US is plausible, given 15-23% PRA positivity in the snippets above. The 2015 IKDRC KPD cohort entered for sensitisation in 26 of 77 cases (34%), so the incompatible pool is enriched for sensitised patients. Suggested default: low 0.75 / medium 0.17 / high 0.08, flagged as an assumption, with a sensitivity sweep around Saidman's 0.70/0.20/0.10.
- **Donor relationship (inferred from AIIMS 2013-22)**: spouse donors are about 0.79 x 0.356 + 0.21 x 0.147, which is roughly 31% of all living donors. About 90% of those are wives donating to husbands, so the Saidman husband-to-wife crossmatch penalty applies to roughly 3% of all pairs. Patient sex: about 80% male.
- **Pool composition for KPD in India**: ABO incompatibility dominates entry: 52 of 56 (93%) in 2013 and 45 of 77 (58%) in 2015 at IKDRC, with sensitisation accounting for most of the rest. A synthetic Indian pool should therefore be mainly ABO-incompatible, with a 10-35% crossmatch-incompatible share as a tunable parameter.

### Gaps
- I found no published Indian cPRA distribution for KPD candidates and no national Indian HLA frequency set suitable for virtual crossmatch. The Kerala study covers one region.
- The 15.7% and 23% PRA figures were not verified against full text.

---

## 3. Arrival process, departures, match-run frequency and dynamic-pool modelling

### Takeaway
Ashlagi et al. (AJT 2018) give a complete, reusable dynamic template:
- Arrivals: 1 pair every 2 days (~180 per year).
- Departures: geometric with mean stay 420 days, or 800 days in a single-centre pool.
- Failures: 27% offer refusal, plus crossmatch failure of 38% (cPRA > 90) or 10% (others).
- Match-run intervals: 2 to 120 days.

More frequent matching never reduced transplants, and benefits from higher arrival rates flatten above about 350-700 pairs per year. Theory (Anderson et al. 2017) says greedy matching is near-optimal.

### Cited Findings
- **Ashlagi et al., "Effect of match-run frequencies on the number of transplants and waiting times in kidney exchange", AJT 2018;18(5):1177-1186** — [PDF](https://web.stanford.edu/~iashlagi/papers/frequency-ajt-final.pdf)
  - Data: APD had 1,571 incompatible pairs and 50 NDDs (Jan 2007 to Aug 2016). Methodist San Antonio (MSA) had 592 pairs and 4 NDDs (Jul 2013 to Feb 2017).
  - Each run is 50 Monte Carlo iterations of 5,000 arriving pairs, resampled with replacement. Statistics are taken only after the 100th arrival (warm-up).
  - Base arrival: one pair or NDD every 2 days, with 160 NDDs per 5,000 pairs (APD).
  - Departure: each pair or NDD leaves with probability 1/420 per day (Cox model, mean stay 420 days) for APD, and 1/800 per day for MSA.
  - Failures: 27% of 1-way offers are rejected, and those pairs go inactive for one inter-arrival period. Actual crossmatch failure is 38% for cPRA > 90 and 10% for others. A chain proceeds until its first failure.
  - Two delay regimes. "No-delay": failures are realised immediately and the solver re-optimises. "Delay": a pair is inactive for 2 days at the offer stage plus 7 more days at the crossmatch stage.
  - Match-run intervals tested: 2, 4, 7, 14, 30, 60 and 120 days. Longer intervals did not increase total transplants, and waiting time rose with the interval.
  - Arrival sensitivity: one pair every t periods for t = 1, 2, 4, 7, 14. A higher arrival rate gives a higher fraction transplanted and shorter waits, with the benefit "minor for very high arrival rates (after 350-700 pairs annually)".
  - Pool PRA distribution (bands 0-90 / 90-98 / 98-100): MSA 0.5845 / 0.0946 / 0.3209; APD 0.6416 / 0.1286 / 0.2298.
  - Pair ABO (patient-donor, % of pairs), APD versus MSA: O-A 28.64 vs 21.79; O-O 20.81 vs 26.52; A-A 9.42 vs 7.26; A-O 8.53 vs 16.89; O-B 8.4 vs 7.43; B-A 6.62 vs 4.05; B-O 4.33 vs 5.57; A-B 3.95 vs 4.05; O-AB 2.42 vs 0.68; B-B 2.16 vs 1.35; A-AB 1.4 vs 1.35; B-AB 1.15 vs 0.68; AB-O 0.7 vs 1.35; AB-A 0.7 vs 1.01; AB-B 0.45 vs 0; AB-AB 0.32 vs 0.
  - Ratio of O donors to O patients: 0.57 in APD versus 0.89 in MSA. Pairs with an O donor: 34.4% versus 50.3%. The fraction matched differed by about 11 percentage points between the pools for that reason.
  - Priority weights tested by cPRA band (strategies S1/S2/S3): 98-100 gets 1.05 / 2 / 10; 90-98 gets 1.05 / 1.5 / 5; 80-90 gets 1.05 / 1.05 / 2; 0-80 gets 1.
- **Anderson, Ashlagi, Gamarnik, Kanoria, "Efficient Dynamic Barter Exchange", Operations Research 2017** — [DSpace@MIT](https://dspace.mit.edu/handle/1721.1/109184)
  - Model: agents arrive over time, and each pair of agents is compatible independently with probability p.
  - Greedy matching is near-optimal. Average wait is Θ(1/p²) with 2-cycles only, and Θ(1/p^{3/2}) with 2- and 3-cycles; chains reduce it further.
- **UNOS KPD Pilot match-offer failures** (2013-14): only 8% of matches resulted in a transplant. In 332 failed offers (Jan-Sep 2014), 52% were accepted by the candidate's centre but failed because another match in the exchange was refused. Of outright refusals, 36% were positive crossmatch or unacceptable antigens, 10% candidate/donor in another exchange, and 10% candidate/donor too ill or unavailable. UNOS then moved from monthly to weekly runs — [ATC abstract](https://atcmeetingabstracts.com/abstract/reasons-for-match-offer-refusals-and-efforts-to-reduce-them-in-the-optnunos-kidney-paired-donation-pilot-program-kpdpp/).
- **Alliance for Paired Donation** preventable failure reasons: positive laboratory crossmatch 28%, transplant centre declined donor 17%, pair transplanted outside the APD 14% — [ATC abstracts search result](https://atcmeetingabstracts.com/?p=7655).
- **UK LKSS (Manook et al., Transplant Int 2021;34:153-162)** — [PDF](https://www.frontierspartnerships.org/articles/10.1111/tri.13776/pdf)
  - Runs are quarterly. From 2007 to 2018, 1,874 patients registered and 842 were transplanted (about 45%).
  - 2014: 329 patients in matching runs, 72 transplanted (about 22% per year), 250 left. 2018: 517 in runs, 365 left (so about 152 transplanted, about 29%). By 2017/18 there were about 200 pairs per run and 123 transplants per year.
  - Of patients left at end-2014, 21.6% had cRF 0-9% and 60% had cRF > 85%. The median stay was 4 runs (1 year), and 42% of all registrants had cRF > 85%. Highly sensitised patients accumulate in the pool.
- **India operational practice**: IKDRC Ahmedabad performed 300 KPD transplants out of 3,616 living-donor transplants (8.3%) between Jan 2000 and Jul 2016. Its 2015 cohort of 77 KPD transplants comprised 25 two-way exchanges, 7 three-way exchanges and one 6-pair domino chain — [Indian Transplant Newsletter](https://www.itnnews.co.in/indian-transplant-newsletter/issue46/77-Kidney-Paired-donation-Transplantation-in-2015-at-IKDRC-ITS-Ahmedabad-India-434.htm); [arXiv 2112.02932](https://arxiv.org/pdf/2112.02932).
- IKDRC carried out non-simultaneous 10-pair cycles in 2020 and a simultaneous 10-pair cycle in 2013. Apex Kidney Foundation's swap registry in Mumbai dates from 2011. Altruistic (non-directed) donors are restricted by Indian law, so the arXiv simulation excluded them — [arXiv 2112.02932](https://arxiv.org/pdf/2112.02932).

### Inferences (proposed defaults for a one-year India simulation)
- **Arrivals**: Poisson process.
  - Kidney: baseline about 3-4 incompatible pairs per week for a multi-centre city or state programme, i.e. about 150-200 per year. This mirrors Ashlagi's 1 per 2 days and IKDRC's scale of about 77 transplants per year.
  - Kidney sweep: 1-10 per week.
  - Liver: an order of magnitude lower, about 0.5-1 pair per week (assumption; Medanta did about 46 swaps in 13 years, so true liver-swap demand at a single centre is small).
- **Departures**: daily hazard 1/420 as baseline, or 1/365 to 1/800 as a sweep (kidney).
  - Liver: much shorter tolerance; make it MELD-dependent (Section 5). Assumption: daily hazard (death or delisting) of 1/90 for MELD ≥ 25 and 1/365 for MELD < 15.
- **Match runs**: weekly by default, with a sweep over 1, 7, 14, 30 and 90 days.
- **Failures**: use the probabilities in Section 4. Re-optimise immediately (the "no-delay" model) for single-centre or simultaneous Indian surgeries. Use the delay model (offer stage plus crossmatch, 2 + 7 days) for multi-centre setups.
- **Warm-up**: start the year with a seeded backlog (e.g., 50-100 pairs) or discard the first 100 arrivals, following Ashlagi.

### Gaps
- I found no published Indian data on KPD arrival rates, dropout rates or time-to-transplant; Indian parameters above are assumptions anchored to IKDRC volumes.
- I did not retrieve the absolute "fraction of pairs matched" values from Ashlagi's figures; text extraction gave only relative statements.

---

## 4. Failure probabilities to model (crossmatch, withdrawal, illness)

### Takeaway
Model failure in two stages:
1. Offer or centre refusal: about 27%.
2. Physical crossmatch failure: about 10% for cPRA ≤ 90 and 38% for cPRA > 90.

Add small separate hazards for donor withdrawal (reneging) and recipient illness. Real programmes saw 38-92% of identified transplants fail to proceed, so a pessimistic scenario is needed.

### Cited Findings
- Offer refusal 27%; crossmatch failure 38% for cPRA > 90 and 10% otherwise; one failure breaks the downstream chain or the whole cycle — [Ashlagi et al. 2018](https://web.stanford.edu/~iashlagi/papers/frequency-ajt-final.pdf).
- UNOS KPDPP 2013-14: only 8% of matches led to a transplant. Among outright refusals: 36% crossmatch or unacceptable antigen, 10% in another exchange, 10% too ill or unavailable — [ATC abstract](https://atcmeetingabstracts.com/abstract/reasons-for-match-offer-refusals-and-efforts-to-reduce-them-in-the-optnunos-kidney-paired-donation-pilot-program-kpdpp/).
- APD: positive laboratory crossmatch 28%, centre declined donor 17%, pair transplanted outside the APD 14% of failures — [ATC abstract](https://atcmeetingabstracts.com/?p=7655).
- UK LKSS, Jan 2012 to Jan 2016: 1,438 patients registered, 899 transplants identified and 563 proceeded. That means about 37% of identified transplants did not proceed — [search summary citing UKLKSS analyses](https://comsoc-community.org/archive/comsoc-2016/slides/robb.pdf) (slides not opened; treat as secondary).
- Reneging in non-simultaneous chains: [NKR "Broken Chains and Reneging: A Review of 1748 KPD Transplants"](https://www.kidneyregistry.com/wp-content/uploads/2021/03/Broken-Chains-and-Reneging_-A-Review-of-1748-Kidney-Paired-Donation-Transplants.pdf) (exact rates not extracted in this pass).
- Saidman crossmatch probabilities can double as "virtual-crossmatch miss" rates: 5%, 45% and 90% by PRA band — [Saidman et al. 2006](https://stanford.edu/%7Ealroth/papers/SaidmanRothSonmezUnverDelmonico.Transplantation.2006.pdf).

### Inferences (proposed per-edge and per-pair failure model)
- **Edge (arc) failure** when a match is proposed:
  - P(crossmatch failure) = 0.10 if cPRA ≤ 90, else 0.38.
  - If the platform does a virtual crossmatch with real HLA, these are residual errors. If the edge comes only from a Saidman draw, the crossmatch outcome is already "known", so apply only the residual.
- **Pair-level failure** per proposed transaction:
  - Centre or medical refusal 0.15-0.27 (Ashlagi's 27% as pessimistic).
  - Donor withdrawal 0.02-0.05 (assumption; Indian swaps are usually done simultaneously, which removes most reneging risk).
  - Recipient too ill 0.05-0.10 for kidney (UNOS: 10% of refusals). For liver, use a MELD-dependent value, e.g. 0.05 + 0.01 x (MELD - 15)+ (assumption).
- **Cycle semantics**: a cycle fails if any edge or pair in it fails, and its pairs return to the pool. A chain executes up to the first failure.
- Use the UNOS 8% conversion rate as a stress-test lower bound, and the UK LKSS ~63% proceed rate (563/899) as a realistic central case.

### Gaps
- I found no Indian data on failure or withdrawal rates for kidney or liver swaps.
- Exact NKR reneging rates were not extracted.

---

## 5. Liver paired exchange: compatibility rules, size parameters, Indian anthropometrics, simulation studies

### Takeaway
Liver swap compatibility is:
- ABO (identical or compatible), plus
- graft size: GRWR ≥ 0.8% or graft ≥ 40% of the recipient's standard liver volume, plus
- donor safety: remnant ≥ 30-35%.

Left lobe ≈ 35% of liver volume (30-40%); right lobe ≈ 60-70%. Ergin, Sönmez and Ünver (Econometrica 2020) give a fully specified Korean-calibrated generator. Exchange raised transplants by 34-44% for K = 100, with 12.5% of pairs left-lobe compatible and 45.5% right-lobe-only compatible.

### Cited Findings
- **Ergin, Sönmez, Ünver, "Efficient and Incentive-Compatible Liver Exchange", Econometrica 88(3), 2020** — [PDF](https://sites.bc.edu/utku-unver/wp-content/uploads/sites/67/2020/08/ecta200165.pdf)
  - Lobe sizes: left lobe normally 30-40% of the liver, right lobe 60-70%. A patient needs a graft of at least 40% of their own (standard) liver volume.
  - Donor risk: mortality about 0.1% for left hepatectomy versus 0.4-0.5% for right. Morbidity 7.5% left versus 28% right (Mishra et al. 2018).
  - Calibration (South Korea, KONOS 2010-14): live-donation recipients 34.55% female and 64.45% male; live donors 26.61% female and 73.39% male. Height is female 157.40 ± 5.99 cm and male 170.70 ± 6.40 cm, drawn from a normal truncated at ±3 SD. Blood types are O 37%, A 33%, B 21%, AB 9%. Blood type, sex and height are drawn independently for patient and donor.
  - Weight: w = a·h^b (h in metres), with a = 26.58, b = 1.92 for males and a = 32.79, b = 1.45 for females.
  - BSA (Mosteller, per Um et al. 2015): BSA = sqrt(h·w)/6 with h in metres.
  - Standard liver volume (Korean): lv = 893.485·BSA - 439.169 ml.
  - Left lobe = 35% of donor liver volume; right lobe = remainder.
  - Rules: "left-lobe compatible" means ABO-compatible and donor left lobe ≥ 40% of the patient's liver volume. "Right-lobe-only compatible" means ABO-compatible, right lobe ≥ 40% and left lobe < 40%. Each pair's willingness to donate the right lobe is a scenario parameter: 0, 0.2, 0.4, 0.6, 0.8 or 1.
  - Results, K = 100, no exchange: left-lobe direct transplants 12.497. Total transplants range from 12.497 (w = 0) to 58.058 (w = 1).
  - Results, K = 100, proposed mechanism: 17.995 (w = 0) to 77.842 (w = 1). Full-information maximum: 17.995 to 78.635.
  - K = 50: no exchange 6.204 to 29.074; mechanism 8.122 to 37.608.
  - K = 250: no exchange 31.031 to 145.115; mechanism 50.683 to 200.826; full-information maximum up to 203.15.
  - Headline: exchange increases living-donor liver transplants by 34-44% (K = 100) and raises the left-lobe share.
  - The authors flag that independent sizes and blood types bias gains upward: no genetic or spousal correlation is modelled, and patients are adults only.
- **Clinical thresholds**: GRWR 0.8% or GV/SLV 40%, with donor remnant liver volume ≥ 30%, as safety assurance for recipient and donor — [BMC Surgery 2019 (s12893-019-0606-5)](https://bmcsurg.biomedcentral.com/counter/pdf/10.1186/s12893-019-0606-5.pdf). Some centres accept a remnant below 30% under strict criteria (donor ≤ 40 y, middle hepatic vein preserved, minimal steatosis) — [ATC abstract](https://atcmeetingabstracts.com/?p=30180). Grafts below 0.8% can be used in selected recipients — [UT Southwestern](https://utsouthwestern.elsevierpure.com/en/publications/the-role-of-the-graft-to-recipient-weight-ratio-on-enhanced-recov).
- **India (Medanta, Gurugram)**:
  - 46 two-way liver swaps (92 transplants) between 2009 and about 2022, then India's first three-way swap without a non-directed donor.
  - Main reasons donors are rejected: ABO incompatibility, steatosis and low GRWR.
  - In the three-way swap, one pair (recipient AB, donor O) had a right-lobe GRWR of only 0.57%. After the swap, GRWRs were 0.93%, 1.02% and 1.18%, and donor future liver remnants were 38.82%, 44.65% and 36.43% — [Medanta case study](https://www.medanta.org/case-studies/novel-strategy-to-expand-the-donor-pool).
- **Korea (Asan)**: 1,351 adult LDLTs from July 2003 to June 2009 included 16 donor exchanges and 7 ABO-incompatible LDLTs. Initial mismatches were mostly A↔B (6 + 6). After exchange (7 swaps, 1 domino), all 16 recipients had ABO-identical (13) or compatible (3) grafts (Hwang et al., Liver Transpl 2010) — [ScienceDaily](https://www.sciencedaily.com/releases/2010/04/100401101808.htm); [Korea Univ. record](https://pure.korea.ac.kr/en/publications/exchange-living-donor-liver-transplantation-to-overcome-abo-incom/).
- **Turkey (İnönü)**: a 5-way liver exchange; one pair was ABO-incompatible and four were size-incompatible. One example GRWR was 0.66%, and one remnant was 27% (unsuitable for right-lobe donation) — [PMC11827512](https://pmc.ncbi.nlm.nih.gov/articles/PMC11827512/).
- Another Turkish series: 18 paired-exchange LDLT recipients, 78% male, mean recipient age 50.7 and mean donor age 29.3; 1-year patient survival 83.3% and graft survival 88.9% — [Koç Univ. record](https://research.hub.ku.edu.tr/entities/publication/d7e7eac6-20ab-454f-987d-48c3af326bbc).
- **Indian LDLT recipient profile (moderate confidence; from a search summary of a PMC paper)**: mean age 43 ± 12, BMI 23 ± 3 kg/m², MELD 15.5 ± 6. In India, about 85% of liver transplants are LDLT, about 80% of recipients are male and about 85% are adults — [PMC7897854](https://pmc.ncbi.nlm.nih.gov/articles/PMC7897854) (not opened directly). A study including Indian potential donors reported mean BMI 25.1 ± 4.0 — [same search set](https://pmc.ncbi.nlm.nih.gov/articles/PMC8785916/) (not verified).

### Inferences (proposed India liver generator)
- **Recipient**: about 80% male. Height from Indian adult distributions (assumption: male 165 ± 7 cm, female 153 ± 6 cm; replace with NFHS-5 or ICMR values). BMI ~ N(23, 3), so weight = BMI·h². MELD ~ N(15.5, 6) truncated to [6, 40].
- **Donor**: sex split about 50/50 or female-leaning (assumption; Indian living donation overall is about 80% female for kidney). BMI ~ N(25, 4). Reject donors with BMI > 30 or a steatosis flag; assume P(steatosis exclusion) of about 0.1-0.2.
- **Donor liver volume**: use the Ergin/Um formula lv = 893.485·BSA - 439.169 ml (Korean, a reasonable Asian proxy). Alternatively GRWR = graft_volume_ml x 1 g/ml / recipient_weight_g x 100. Left (lateral and left) lobe = 35% of total, right lobe = 65%. Add ±5% noise for anatomical variation.
- **Edge feasibility (donor d → recipient r)**:
  - ABO-compatible (O → any; A → A, AB; B → B, AB; AB → AB). Optionally allow ABOi in liver at a penalty.
  - GRWR(lobe) ≥ 0.8% (configurable 0.7-1.0).
  - Remnant = 1 - lobe fraction ≥ 0.30 (or 0.35 conservative). With a 65% right lobe, the remnant is about 35%, so right-lobe feasibility hinges on the noise term.
  - Prefer the left lobe when feasible; right-lobe edges only if the pair is "willing". Willingness w is a parameter; India practises mostly right-lobe adult LDLT, so default w = 0.8.
- **Urgency**: weight edges or pairs by MELD (e.g., priority boost for MELD ≥ 25). Pair dropout hazard rises with MELD (Section 3).
- Validate the liver generator by re-running the Ergin Korean parameters and reproducing the Table II numbers (e.g., K = 100: about 12.5 direct left-lobe transplants and about 18.0 transplants at w = 0 with exchange) before switching to Indian parameters.

### Gaps
- I found no published simulation of liver paired exchange calibrated to Indian anthropometrics, and no Indian standard-liver-volume formula in this pass. Indian SLV formulas exist in the literature but were not retrieved.
- I found no Indian data on the share of LDLT donor evaluations rejected for ABO, GRWR or steatosis.

---

## 6. Validation targets (published match rates by pool size)

### Takeaway
Use several published benchmarks: Saidman (static, US), Delorme/UK (realistic graph density), Ashlagi (dynamic), Ergin (liver) and IKDRC (Indian volumes). A correctly implemented Saidman generator must reproduce about 35% / 45% matched at n = 25 and about 50% / 60% matched at n = 100 for 2-way and 2+3-way cycles.

### Cited Findings
- **Saidman static, US parameters**, 2-way / 2+3-way / unrestricted — [Saidman 2006](https://stanford.edu/%7Ealroth/papers/SaidmanRothSonmezUnverDelmonico.Transplantation.2006.pdf):
  - n = 25: 35.4% / 45.1% / 48.0%.
  - n = 100: 49.8% / 59.8% / 60.5%.
  - Multi-donor variant: n = 25 gives 37.1% / 48.7% / 53.4%; n = 100 gives 54.2% / 66.6% / 67.3%.
  - Local real dataset of 45 patients (68 pairs): 8 transplanted with 2-way only, 11 with 3-way, 12 with a 5-way cycle allowed.
- **Delorme UK-realistic**: about 36% of pairs matched (364.1 of 1,024) with the improved generator, and Saidman instances systematically overestimate edges and matches — [Delorme 2022](https://eprints.gla.ac.uk/263124/2/263124.pdf).
- **UK LKSS real-world**:
  - About 22% of the 2014 pool transplanted within the year (72/329) and about 29% in 2018 (about 152/517).
  - 45% of registrants transplanted cumulatively, 2007-2018 (842/1,874).
  - About 63% of identified transplants proceeded, 2012-2016 (563/899) — [Manook 2021](https://www.frontierspartnerships.org/articles/10.1111/tri.13776/pdf); [search summary](https://comsoc-community.org/archive/comsoc-2016/slides/robb.pdf).
- **Liver (Korea calibration)**: K = 100 gives 18% (w = 0) to 78% (w = 1) of pairs transplanted with exchange, against 12.5-58% without — [Ergin et al. 2020](https://sites.bc.edu/utku-unver/wp-content/uploads/sites/67/2020/08/ecta200165.pdf).
- **Dynamic**: no gain from waiting longer between runs, and more arrivals help up to about 350-700 pairs per year — [Ashlagi 2018](https://web.stanford.edu/~iashlagi/papers/frequency-ajt-final.pdf).
- **India volumes**:
  - IKDRC: 8.3% of living-donor kidney transplants via KPD (300/3,616, 2000-2016); 77 KPD transplants in 2015, comprising 25 two-way, 7 three-way and one 6-pair chain — [ITN 2015](https://www.itnnews.co.in/indian-transplant-newsletter/issue46/77-Kidney-Paired-donation-Transplantation-in-2015-at-IKDRC-ITS-Ahmedabad-India-434.htm).
  - Medanta: about 3.5 liver swaps per year (46 over 13 years) — [Medanta](https://www.medanta.org/case-studies/novel-strategy-to-expand-the-donor-pool).

### Inferences
- **Three-tier validation for the generator**:
  1. **Unit**: with Saidman US inputs, reproduce the Table 6 means within about 1 SE (500 replications).
  2. **Realism**: with Delorme mode, edge density should fall well below Saidman's, and matched share near 35-40% for large pools.
  3. **India plausibility**: a one-year run at about 3-4 pairs per week with weekly runs should yield about 50-100 kidney swap transplants. That is IKDRC-scale, and roughly 30-50% of arrivals transplanted, consistent with UK annual rates of 22-29% plus India's ABO-dominated (easier) pool.
- Expect India's B-rich ABO mix to raise the share of B-A and A-B reciprocal pairs, which match easily in 2-way swaps (as in the Asan liver data, where most mismatches were A↔B). India's matched fraction should therefore be higher than the US Saidman benchmark at the same pool size. This is an inference, to be confirmed by simulation.

### Gaps
- I found no published match-rate-versus-pool-size results for Indian-parameter simulations. The arXiv IKEP paper simulated pools of 100, 1,000 and 10,000 from ITR data, but its outcome numbers were not extracted.
- I found no published validation targets for combined kidney and liver (cross-organ) exchange pools.
