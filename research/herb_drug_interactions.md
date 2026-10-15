# Herb–Drug Interactions with Transplant Immunosuppressants, and Herbal/CAM Use Among Transplant and CKD Patients (India focus)

Research date: 2026-10-04. About 18 search/fetch calls. Several snippets come from search-result summaries, not full-text reads, and are marked "(snippet)". Confirm exact numbers against the primary paper before using them in product copy.

## Q1. Mechanisms: how the anti-rejection drugs are metabolised and why small changes matter

### Takeaway
Tacrolimus, cyclosporine and the mTOR inhibitors (sirolimus, everolimus) are cleared mainly by CYP3A4/5 and pumped out by P-glycoprotein (P-gp). Their safe range is narrow. Herbs that block CYP3A/P-gp push blood levels up, which risks kidney damage and nerve toxicity. Herbs that switch these enzymes on (induce them) push levels down, which risks rejection. Mycophenolate works differently: it depends on glucuronidation by UGT enzymes and on enterohepatic recirculation, which gut bacteria drive.

### Cited Findings
- Tacrolimus is metabolised in the liver by CYP3A4 and is a P-gp substrate. It has a narrow therapeutic window, toxicity that rises with dose, and high variability both between and within patients. Raised levels cause nephrotoxicity and neurotoxicity. Low levels risk rejection. — [Miedziaszczyk et al., Pharmaceutics 2022;14(10):2154](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)
- CYP3A4 inhibitors raise tacrolimus levels and reveal its side effects, "particularly nephrotoxicity". CYP3A4 inducers such as St John's wort "may result in a lack of therapeutic effect". — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)
- Drug interactions can lower the effect of immunosuppression or raise the risk of serious harm, including organ rejection. Transplant recipients are exposed to herbal products both before and after transplant. — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)
- How strongly Schisandra (Wuzhi capsule) raises tacrolimus depends on CYP3A5 genotype: the rise is larger in CYP3A5 expressers. So the "enzyme" node in the graph should allow a genotype modifier. — [Annals of Transplantation 2019 (Wuzhi/tacrolimus)](https://annalsoftransplantation.com/abstract/full/idArt/918980) (snippet)
- Mycophenolate: how much mycophenolic acid (MPA) recirculates varies a lot between patients and drives large pharmacokinetic variability. The proposed cause is gut-microbial β-glucuronidase cleaving MPA-glucuronide that is excreted in bile. — [Microbiome-derived reactivation of mycophenolate, PMC12291295](https://pmc.ncbi.nlm.nih.gov/articles/PMC12291295/) (snippet)
- In kidney transplant patients, rifampin 300 mg twice daily lowered MPA AUC by 17.5%. The cause was rifampin inducing UGTs and disrupting MPAG enterohepatic recirculation. This is a drug, not a herb, but it is the model for how an inducer acts on MPA. Oral antibiotics also lower MMF exposure. — search snippet citing [PMC2878413](https://pmc.ncbi.nlm.nih.gov/articles/PMC2878413) and [Erasmus University record on oral antibiotics and MMF](https://pure.eur.nl/en/publications/oral-antibiotics-lower-mycophenolate-mofetil-drug-exposure-possib/)
- Ginsenoside Rc selectively inhibited UGT1A9 in vitro but had a negligible effect on MPA disposition in vivo. This shows that in-vitro signals often do not carry over to patients. — search snippet ([PMC10207934](https://pmc.ncbi.nlm.nih.gov/articles/PMC10207934))

### Inferences
- Graph modelling: each drug node needs a "direction-of-risk" mapping. Inhibition → ↑ level → nephrotoxicity, neurotoxicity, infection. Induction → ↓ level → rejection. For tacrolimus, cyclosporine, sirolimus and everolimus, the same CYP3A4 + P-gp edges apply. MPA needs separate UGT and gut-microbiome/enterohepatic edges.
- An immune-stimulation (pharmacodynamic) edge is needed alongside the PK edges, for echinacea, guduchi and other "immune boosters".

### Gaps
- I did not retrieve primary sources for sirolimus/everolimus or prednisolone metabolism (prednisolone is partly CYP3A4-metabolised), or for specific target trough ranges. Use product labels or KDIGO for these.
- I found no herb-specific clinical PK data for mycophenolate apart from the ginsenoside negative result.

## Q2. Well-documented herb interactions: evidence level, direction, citations

### Takeaway
Only a few herbs have human clinical evidence: St John's wort (↓ cyclosporine/tacrolimus, clinical PK studies plus rejection case reports), Schisandra/Wuzhi (↑ tacrolimus, clinical cohort data from China), berberine (↑ cyclosporine, a randomised trial in renal transplant recipients), and grapefruit/pomelo (↑, case reports plus PK data). Turmeric has one striking case report but conflicting animal data. Most Ayurvedic herbs (ashwagandha, guduchi, triphala, Phyllanthus, neem, Boswellia) have only in-vitro or animal data, or none. Guduchi's main documented risk is liver injury, not a PK interaction.

### Cited Findings

**Strong clinical evidence**
- **St John's wort (Hypericum; hyperforin) → induces CYP3A4 + P-gp → ↓ cyclosporine.** A systematic review found 11 case reports and 2 case series. Several cases led to transplant rejection. — [Borrelli & Izzo review, via search; Frontiers Partnerships / Transplant International 2003 case report of acute rejection in 2 patients](https://www.frontierspartnerships.org/articles/10.1111/j.1432-2277.2003.tb00345.x/pdf) (snippet)
- Prospective PK study: Bauer S, … Mai I. *Br J Clin Pharmacol* Feb 2003. In 11 renal transplant patients, 600 mg/day SJW extract for 14 days caused a "rapid and significant reduction" in cyclosporine concentrations. — [Bauer et al. 2003, PMC1894728](https://pmc.ncbi.nlm.nih.gov/articles/PMC1894728) (snippet)
- SJW and tacrolimus: the 2022 review reports tacrolimus AUC fell by about 57.8% with SJW 600 mg/day for 14 days (clinical trial). It classes SJW as the strongest-evidence interaction. — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/). I did not confirm the underlying primary trial (likely Hebert 2004 or Mai 2003).
- **Berberine (from Coptis, Berberis/daruharidra, goldenseal) → inhibits CYP3A4 → ↑ cyclosporine.** Wu X et al., *Eur J Clin Pharmacol* Sep 2005. Randomised controlled trial: 52 renal transplant recipients on cyclosporine + berberine 0.2 g three times daily for 3 months vs 52 controls. Trough rose 88.9% and C/D ratio rose 98.4% from baseline. A PK sub-study in 6 patients took berberine for 12 days. — [PubMed 16133554](https://pubmed.ncbi.nlm.nih.gov/16133554/); [DOI 10.1007/s00228-005-0952-3](https://dx.doi.org/10.1007/s00228-005-0952-3) (snippet). Indian relevance: *Berberis aristata* (daruharidra) is an Ayurvedic berberine source. That species-to-compound link is an inference, not sourced here; IMPPAT can verify it.
- **Schisandra sphenanthera (Wuzhi capsule; schisandrin, schisantherin A, deoxyschizandrin) → inhibits CYP3A4/5 (reversible and mechanism-based) and P-gp → ↑ tacrolimus.** Clinical studies in renal transplant recipients found higher dose- and weight-adjusted troughs. In China it is used deliberately to spare tacrolimus dose. The effect is larger in CYP3A5 expressers, with no negative effect on renal function reported. — [Annals of Transplantation 2019](https://annalsoftransplantation.com/abstract/full/idArt/918980); [Front Pharmacol 2022 956166](https://www.frontiersin.org/journals/pharmacology/articles/10.3389/fphar.2022.956166/pdf); [DMD 41(7):1398](https://dmd.aspetjournals.org/content/41/7/1398) (snippets). The review reports 1.57–4.66-fold increases. — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)

**Moderate (case reports + animal/PK)**
- **Grapefruit (furanocoumarins) → inhibits intestinal CYP3A4 (± P-gp) → ↑ tacrolimus**, about a two-fold rise reported. — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)
- **Pomelo (6′,7′-dihydroxybergamottin) → CYP3A4/P-gp → ↑ tacrolimus.** One case report (Egashira) after a single 100 g serving, plus rat AUC/Cmax increases. — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)
- Other foods reported to raise tacrolimus: pomegranate (case, about two-fold), clementine (case, >1 kg/day). — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)
- **Turmeric/curcumin → CYP3A4 inhibition (proposed) → ↑ tacrolimus.** Case report (Nayeri et al.): a transplant patient took ≥15 spoonfuls of turmeric powder daily for 10 days, then presented with acute nephrotoxicity and tacrolimus 29 ng/mL (previously 9.7). — [Natural Medicines monograph update, Mar 2017](https://naturalmedicines.therapeuticresearch.com/news/news-items/2017/march/monograph-update-turmeric-might-interact-with-immunosuppressant.aspx); [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/). This conflicts with a rabbit PK study that found curcumin at the tested doses did not change tacrolimus PK. — [Iraqi J Pharm Sci (bijps 1514)](https://www.bijps.uobaghdad.edu.iq/index.php/bijps/article/view/1514). Ginger is also listed as ↑ (animal AUC data). — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)

**Controversial or inconclusive**
- **Panax ginseng:** weak CYP3A/2D6 and P-gp inhibition; clinically insignificant in most data; risk "rather low" but not negligible. — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)
- **Green tea:** one case showed a 1.5–2× rise in tacrolimus, while animal models show a decrease. Conflicting. — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)
- **Echinacea:** PK effect on CYP3A is inconclusive (Gorski, Gurley). — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/). The pharmacodynamic concern is immunostimulation working against immunosuppression. Consumer monographs advise against use with transplant immunosuppressants. — [Mount Sinai/ADAM-derived health library "Possible interactions with: Echinacea"](https://limamemorial.org/health-library/Complementary%20and%20Alternative%20Medicine/33/000894) (theoretical, not clinical-outcome evidence)
- **Cranberry:** inconclusive (one case of decreased levels; in-vitro CYP inhibition). — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)
- A case report found a commonly eaten food changed sirolimus levels in a renal transplant recipient. — [Ther Adv Drug Saf, Apr 2021 (DOAJ record)](https://oalib-perpustakaan.upi.edu/Record/doaj_76438c2a28874ed0b85697a27a1d659d/Description) (I did not open the record to identify the food.)

**Ayurvedic herbs: mostly in-vitro or no data**
- **Ashwagandha (Withania somnifera):** in human liver microsomes it showed no inhibition of CYP3A4, CYP2C8 or CYP2D6. The authors judged co-administration with CYP3A4 substrates likely safe (in vitro only). — [PMC9597875 (Withania, AYUSH-64, remdesivir), 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9597875/)
- **Triphala:** its constituent gallic acid inhibited CYP1A2/2C9/2C19 but only weakly inhibited CYP3A4/2D6. Chronic triphala dosing in rats induced CYP1A2 mRNA but not CYP3A1 (animal and in-vitro). — [Front Pharmacol 2022, 10.3389/fphar.2022.973768](https://www.frontiersin.org/journals/pharmacology/articles/10.3389/fphar.2022.973768/pdf)
- **Guduchi/Giloy (Tinospora cordifolia):** the documented harm is drug-induced liver injury, not a PK interaction. Kulkarni AV et al. (Liver Research Club India), *Hepatology Communications* 2022: a multicentre study of 43 patients from 13 hospitals over 16 months during COVID-19, when giloy was promoted as an "immune booster". 60% had autoantibodies. Probable drug-induced autoimmune hepatitis was confirmed in only 4 of 22 biopsied patients, which experts disputed. — [PMC9348287 (response/commentary)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9348287/); [case review PMC10238282](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10238282/). India's AYUSH ministry publicly disputed the giloy–liver link in 2021. — [The Hitavada, 8 Jul 2021](https://www.thehitavada.com/Encyc/2021/7/8/Relating-Giloy-to-liver-damage-completely-misleading-Govt.amp.html). For transplant patients, Tinospora's reported immunomodulatory action is a theoretical pharmacodynamic concern. I found no clinical data on it with immunosuppressants.
- **Garlic:** one complementary-medicine source describes garlic as potentially helpful with cyclosporine rather than lowering its levels. — [Alternative & Complementary Therapies, 10.1089/act.2013.19605](https://journals.sagepub.com/doi/pdf/10.1089/act.2013.19605) (snippet; low-quality evidence). I found no sourced clinical PK data.

### Inferences
- Suggested evidence tiers for the graph: **A**, clinical PK study or RCT in transplant patients (SJW–CsA, berberine–CsA, Wuzhi–Tac). **B**, clinical PK study in healthy volunteers, or multiple case reports (SJW–Tac, grapefruit). **C**, single case reports (turmeric, pomelo, pomegranate, clementine, green tea). **D**, animal or in vitro only (ginger, triphala, ginseng). **E**, theoretical or pharmacodynamic (echinacea, guduchi immunostimulation). **"Studied, no effect found"** (ashwagandha CYP3A4 in vitro; ginsenoside–MPA in vivo). Keep "no data" separate from "studied, no effect".
- Dose matters: the turmeric case involved culinary-excess doses (≥15 spoons a day). Warnings should mention supplements and concentrated extracts more than ordinary food use.
- Schisandra is a special case: some clinicians use it deliberately. The warning should be "tell your transplant team, because levels may change", not "dangerous".

### Gaps
- No sourced clinical or PK data found for: ginkgo, licorice (theoretically could affect corticosteroid handling via 11β-HSD2 inhibition; unsourced here), neem, Boswellia, Phyllanthus, goldenseal (beyond berberine), garlic. These need targeted PubMed searches or Natural Medicines/Stockley's.
- I did not find a published Indian clinical PK study of any Ayurvedic herb with tacrolimus.
- I did not identify the primary sources for the SJW–tacrolimus 57.8% figure or the 40–60% reduction claim, which appeared on a non-peer-reviewed site (empathia.ai) and is excluded.

## Q3. Prevalence of CAM/Ayurveda use among transplant and CKD patients, and disclosure

### Takeaway
CAM use is common. About 66% of CKD outpatients in a South Indian clinic used CAM, mostly Ayurveda. 23% of Turkish kidney transplant recipients used CAM, and two-thirds of them did not tell their doctors. US data suggest transplant recipients use CAM more than the general public. I found no Indian survey specifically of transplant recipients.

### Cited Findings
- **India (CKD):** cross-sectional study, Mangalore nephrology OPD, Jan–Jun 2017. 66.3% had used ≥1 CAM in the past 6 months. Of CAM users: Ayurveda 63.6% (117), herbal/dietary supplements 7.1%, naturopathy/homeopathy/Unani 16.3%, faith healing 8.7%, acupuncture 4.3%. Use correlated with older age, occupation and income. *Saudi J Kidney Dis Transpl*, Jan 2019. — [DOAJ record](https://doaj.org/article/ccc8682c5f0e47e2bd25acd2acadf9f6) (snippet; disclosure rate not retrieved)
- **India (CKDu, Telangana):** in an *Indian Journal of Nephrology* study, 40% of patients had used alternative herbal "medicines". — [The South First (news report of IJN paper)](https://thesouthfirst.com/health/kidney-disease-mystery-in-telangana-solved-culprit-is-unprescribed-alternative-herbal-medicines) (secondary news source)
- **Turkey (kidney transplant):** 830 recipients at 5 university hospitals, May 2019–May 2020. 22.8% used CAM, and **64.5% of CAM users did not tell their physicians**. *Journal of Herbal Medicine*, 2023. — [Gazi University record](https://avesis.gazi.edu.tr/yayin/a15958dd-aad6-46c6-a270-7ee68bf4ecf3/complementary-and-alternative-medicine-use-among-kidney-transplant-patients-in-turkey-prevalence-clinical-features-and-outcomes) (snippet)
- **USA:** transplant recipients used CAM more than the general public (56.9% vs 38.3%). — [APHA 2011 abstract 245829](https://apha.confex.com/apha/139am/webprogram/Paper245829.html) (conference abstract)
- **US survey (older):** 20% of transplant patients reported using herbal medicines or health-food supplements. Transplant staff were often unaware of this, even when patients said they had told them. — [GWU, "Survey of alternative medicine use among organ transplant patients", J Transpl Coord](https://hsrc.himmelfarb.gwu.edu/smhs_psych_facpubs/1449) (snippet; year not confirmed)
- **Saudi Arabia:** herbal supplement use fell from 44.3% before transplant to 19.2% after. — [Imam Abdulrahman Bin Faisal Univ record](https://iau.sa.elsevierpure.com/en/publications/herbal-medicine-use-among-transplant-recipients-in-saudi-arabia-p/) (snippet)
- Italy (Palermo) surveyed herbal remedy use, disclosure and adverse reactions in transplant recipients. — [IRIS UniPA](https://iris.unipa.it/handle/10447/53812) (numbers not retrieved)
- A systematic review of alternative medical systems in adult CKD exists. — [PMC9867890](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9867890/) (not read)

### Inferences
- Indian transplant recipients probably use CAM at least as much as Turkish ones, since Ayurveda use in Indian CKD is about 64%. This is extrapolation; there is no direct survey.
- The low disclosure rate (about 2 in 3 not telling) is the key justification for the feature: the app can prompt patients to tell their transplant team.

### Gaps
- No India-specific survey of post-transplant CAM use was found. Search Indian J Nephrology / Indian J Transplantation further.
- Disclosure figures from the Mangalore study were not retrieved.

## Q4. Interaction databases and licensing

### Takeaway
IMPPAT (plant → phytochemical, Indian focus) is open but non-commercial (CC BY-NC 4.0). DrugBank is free only for non-commercial use, and commercial use or redistribution needs a paid licence. MSKCC About Herbs is free to read, but I did not confirm its reuse terms. Natural Medicines and Stockley's are subscription products. A commercial product would need licences or would have to build its own curated layer from primary literature.

### Cited Findings
- **IMPPAT** (IMSc Chennai): 1,742 plants, 9,596 phytochemicals and 27,074 plant–phytochemical links (v1). IMPPAT 2.0 covers 4,010 plants and 17,967 phytochemicals with plant-part-level links. Licence: **CC BY-NC 4.0**. — [IMPPAT paper, PMC5847565](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5847565/); [IMPPAT 2.0 bioRxiv](https://www.biorxiv.org/content/10.1101/2022.06.17.496609.full.pdf); [site](https://cb.imsc.res.in/imppat/)
- **DrugBank:** available "solely for educational, scientific, and non-commercial research purposes" unless a commercial licence is bought. API access and redistribution need a paid licence. Includes drug–drug and drug–food interactions. — [DrugBank Terms of Use](https://trust.drugbank.com/drugbank-trust-center/terms-of-use)
- **MSKCC About Herbs:** free, evidence-based monographs for the public and professionals, with about 290 entries covering adverse effects and herb–drug interactions. — [MSKCC About Herbs](https://www.mskcc.org/cancer-care/treatments/symptom-management/integrative-medicine/herbs); [app page](https://www.mskcc.org/cancer-care/treatments/symptom-management/integrative-medicine/herbs/about-herbs)
- **Natural Medicines (TRC):** publishes monograph updates such as the turmeric–tacrolimus warning (2017). Subscription product. — [Natural Medicines news item](https://naturalmedicines.therapeuticresearch.com/news/news-items/2017/march/monograph-update-turmeric-might-interact-with-immunosuppressant.aspx)

### Inferences
- A practical architecture: use IMPPAT (non-commercial licence, or negotiate) for the herb → compound layer, and curate compound → enzyme → drug edges by hand from cited primary studies. Link to MSKCC/NCCIH pages for patient-facing reading rather than copying their content.

### Gaps
- Licence terms not verified for: NCCIH "Herbs at a Glance" (US government work, likely public domain; not confirmed), MSKCC reuse, Stockley's (Pharmaceutical Press, commercial), SuperCYP, NPACT. Check each site's terms page.

## Q5. Regulatory and ethical cautions (presenting evidence gaps; not giving advice)

### Takeaway
The evidence shows: most herb interactions are uncertain; effects depend on dose, preparation and genotype; patients often don't disclose use; and government bodies (e.g., AYUSH on giloy) may dispute safety signals. The feature should warn, show its evidence tier and the date checked, and always send the patient to their transplant team. It should never say "stop" or "adjust dose".

### Cited Findings
- The 2022 review concludes that human PK studies are limited for most herb–drug interactions, animal models predominate, and every supplement should be reported to the physician during immunosuppressive therapy. — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/)
- Evidence conflicts within a single herb: turmeric (human case vs rabbit study), green tea (human case vs animal). — [Miedziaszczyk 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9611668/); [bijps 1514](https://www.bijps.uobaghdad.edu.iq/index.php/bijps/article/view/1514)
- Schisandra is used therapeutically to raise tacrolimus in China, so "interaction" is not always harmful. Context matters. — [Annals of Transplantation 2019](https://annalsoftransplantation.com/abstract/full/idArt/918980)
- Contested safety signals: AYUSH called reports linking giloy to liver damage "completely misleading" (2021). — [The Hitavada](https://www.thehitavada.com/Encyc/2021/7/8/Relating-Giloy-to-liver-damage-completely-misleading-Govt.amp.html)

### Inferences
- Copy guidance: plain-language "may raise/lower your anti-rejection medicine levels". Name the consequence (kidney damage vs rejection). Show the evidence tier ("based on a study in transplant patients" vs "based on lab studies only"). Use "Tell your transplant doctor before starting or stopping". Never suggest stopping prescribed drugs.
- Avoid framing that disparages Ayurveda as a whole. Keep it specific to each herb and its evidence.

### Gaps
- I did not research Indian legal frameworks (e.g., CDSCO software-as-medical-device rules, the Digital Personal Data Protection Act 2023, the Telemedicine Practice Guidelines 2020) or liability precedent for interaction checkers. A separate legal or regulatory research pass is needed.
