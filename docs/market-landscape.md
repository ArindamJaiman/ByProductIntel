# Market landscape and prior art

Research conducted 14 October 2026 using web search and direct page reads. "Reviewed" below says how deeply each source was read; search-engine summaries are labelled as such. **Verified facts** are what the source states. **Interpretation** is ours. Absence of a feature on a public page is *not* treated as evidence that a product lacks it.

## Sources

| # | Title | Organisation / author | URL | Published | Accessed | Reviewed |
|---|---|---|---|---|---|---|
| 1 | SYNERGie 4.0 (good practice) | Interreg Europe / International Synergies | https://www.interregeurope.eu/good-practices/synergie-40-0 | not stated | 2026-10-14 | search summary |
| 2 | e-Symbiosis: technology-enabled support for industrial symbiosis | Cecelja, Kokosis, Trokanas, Raafat et al., Univ. of Surrey | https://openresearch.surrey.ac.uk/esploro/outputs/journalArticle/e-Symbiosis-technology-enabled-support-for-industrial-symbiosis/99510964402346 | not stated | 2026-10-14 | search summary |
| 3 | Development of knowledge-based web services to promote and advance industrial symbiosis in Europe (eSymbiosis, LIFE09 ENV/GR/000300) | EU LIFE programme | https://webgate.ec.europa.eu/life/publicWebsite/project/LIFE09-ENV-GR-000300/development-of-knowledge-based-web-services-to-promote-and-advance-industrial-symbiosis-in-europe | not stated | 2026-10-14 | search summary |
| 4 | AIChE 2013 papers on eSymbiosis ontology engineering and semantic matching | AIChE Annual Meeting proceedings | https://www.aiche.org/conferences/aiche-annual-meeting/2013/proceeding/paper/710a-ontology-engineering-development-industrial-symbiosis-networks-1 | 2013 | 2026-10-14 | search summary |
| 5 | Excess Materials Exchange — B2B matchmaking for high-value reuse | Sitra case study; Solar Impulse profile | https://arkisto.sitra.fi/en/cases/b2b-matchmaking-platform-to-find-high-value-reuse-options-for-materials-and-products/ | not stated | 2026-10-14 | search summary |
| 6 | Rheaply acquires Materials Marketplace | Rheaply | https://rheaply.com/press/materials-marketplace/ | 2022-10-24 | 2026-10-14 | search summary |
| 7 | Value Chain Generator — CORDIS reporting (grant 101188906) | European Commission / VCG.AI GmbH | https://cordis.europa.eu/project/id/101188906/reporting/pl | reporting period to 2025-11-30 | 2026-10-14 | full page read |
| 8 | recircular (AI-powered B2B marketplace) | b2match participant listing; Caplight profile | https://www.b2match.com/e/sustainablesolutionsmatch2026/participations/708934 | not stated | 2026-10-14 | search summary |
| 9 | Hitachi / SEKISUI CHEMICAL recycled-material matching PoC | Hitachi, Ltd. | https://www.hitachi.com/en/press/articles/2024/06/0605/ | 2024-06-05 | 2026-10-14 | search summary |
| 10 | User Guidelines for Waste and Byproduct Materials in Pavement Construction — Steel Slag, Granular Base | US FHWA (FHWA-RD-97-148) | https://www.fhwa.dot.gov/publications/research/infrastructure/structures/97148/ssa3.cfm | not shown | 2026-10-14 | full page read |
| 11 | Tata Steel launches India's first branded LD slag products | Tata Steel | https://www.tatasteel.com/newsroom/press-releases/india/2018/tata-steel-launches-indias-first-branded-ld-slag-product/ | 2018-01-18 | 2026-10-14 | full page read |

## Findings

### SYNERGie / NISP (1)
- **Verified:** SYNERGie is a database tool used to identify and realise industrial-symbiosis "synergies"; it supported the UK National Industrial Symbiosis Programme and is offered for practitioner, direct-company and white-label use. Sector variants exist. Outcome figures on the page are self-reported.
- **Interpretation:** a practitioner-facilitated model. Matching quality relies heavily on human facilitators, which is a strength, not a gap.

### eSymbiosis (2–4)
- **Verified:** an ontology-driven matching service that models flows and technologies semantically and ranks partners by "semantic distance"/vector similarity over properties including quantity, availability, location and hazardousness. Tested on real data in Viotia, Greece.
- **Interpretation:** this is directly comparable prior art for automated, multi-attribute matching. Claims that "AI/semantic matching of by-products" is new would be false.

### Excess Materials Exchange (5)
- **Verified:** a matchmaking platform built around a "resource passport", with tracking, valuation (financial, environmental, societal) and matchmaking modules, described as AI-enabled. A Sitra update notes the site address was not working as of June 2025; current status is unconfirmed.
- **Interpretation:** strong on structured material identity and valuation.

### Materials Marketplace / Rheaply (6)
- **Verified:** the US BCSD Materials Marketplace, an industrial waste and by-product exchange, moved into Rheaply in 2022; it offers listings, AI-generated listing details and in-platform transactions.
- **Interpretation:** marketplace-first; listing-centred rather than specification-centred.

### Value Chain Generator (7)
- **Verified:** an EIC-funded platform linking residual producers, conversion-technology holders and buyers using literature-derived "BioLink" value-chain models; it states that matches are evaluated for technical feasibility, economics and environmental impact. The reporting page does not describe missing-data handling, regulatory checks or failure explanations.
- **Interpretation:** the closest to our "pathway feasibility" framing, focused on bio-based residues.

### recircular (8) and Hitachi/SEKISUI (9)
- **Verified:** recircular describes itself as an AI-powered B2B marketplace with its own impact-measurement methodology. Hitachi's PoC uploads analyser-measured quality data to the listing so buyers can judge fitness, with generative-AI matching support.
- **Interpretation:** Hitachi's PoC shows that measured quality data feeding the match is already practised in one sector (plastics).

### Domain sources (10–11)
- FHWA documents that steel-slag suitability depends on selection, processing, ageing and testing (expansion, free lime, leachate). Tata Steel's 2018 release shows LD-slag road-aggregate, brick and clinker applications exist commercially in India. These support the *need* for evidence-gated matching; they are not competitors.

## Similar features that already exist
- Multi-attribute and semantic matching (eSymbiosis, VCG, others).
- Structured material identity / passports and valuation (EME).
- Marketplace listings and transactions (Rheaply/Materials Marketplace, recircular).
- Feasibility evaluation of value chains, including economics and environment (VCG, as stated).
- Measured quality data attached to listings (Hitachi PoC).

## Plausible gaps (hypotheses requiring validation)
These are **hypotheses**. They are based on what public pages say, and none has been confirmed with the vendors.

1. **H1. Evidence-gated eligibility states.** We did not find public descriptions of a platform that separates "unknown" from "pass" in a formal state machine (potentially eligible / incomplete evidence / ineligible) and refuses to rank a pathway as actionable when safety-critical evidence is missing.
2. **H2. Rule-derived next steps for uncertain matches.** We did not find a public description of a planner that turns each missing measurement, test, certificate or review into a specific, prioritised action traced to the rule that requires it (the Missing-Bridge Planner).
3. **H3. Provenance on every value and rule.** Labelling each threshold as source-referenced or a demonstration assumption, and each value with provenance and verification state, did not appear in public descriptions.
4. **H4. Reproducible scores.** Versioned engine/scoring/ruleset identifiers with an input fingerprint per run did not appear in public descriptions.

## Evidence needed to validate the differentiation
- Demonstrations or documentation from SYNERGie, VCG, EME/its successor, Rheaply and recircular showing how they handle missing data and failure explanations (H1, H2).
- Interviews with 5–10 by-product coordinators or industrial-symbiosis facilitators: do they currently produce "what is missing" plans manually, and how long does it take?
- A pilot on real (authorised) profiles: compare the planner's actions with the actions an expert reviewer would list, measuring precision and recall.
- Measurement of whether evidence-gated ranking changes which pathways teams fund for testing.

## Research limitations
- Several sources were read only through search-engine summaries. Some vendor pages were not opened directly.
- Commercial products may have capabilities that their public pages do not describe.
- Literature coverage is narrow (a few days' desk research), and no paywalled papers were read in full.
