# Limitations

## Most important
**The thresholds are mostly demonstration assumptions.** The engine faithfully applies whatever rules it is given, but only five property thresholds in the demo are source-referenced, and even those come from secondary summaries or another jurisdiction. Results show how the method behaves. They do not show whether a real material suits a real use. Production use requires application-specific, validated specifications agreed with recipients and checked against licensed standards.

## Technical
- Rules are univariate thresholds. Interactions (e.g. grading curves, mix design, combined chemistry), statistical variability between samples and test-method equivalence are not modelled.
- A measurement is a single value. There are no distributions, sampling plans or representativeness checks.
- Leaching is handled only as "report present / absent". No leachate values or limits are evaluated, by design.
- Distances are great-circle × a circuity factor, not routed. Only road transport is modelled.
- Economics are per-tonne linear estimates with no capex, contracts, taxes, seasonality or price elasticity.
- The circularity component is an ordinal tier, not a life-cycle assessment. No greenhouse-gas figures are produced.
- Score weights and anchors are not industry-validated.

## Operational
- The demo store is a single JSON file with in-process locking. It is suitable for one local instance, not for concurrent multi-instance deployment. On read-only hosts it falls back to memory and says so.
- The Supabase adapter is type-checked and its SQL and RLS are tested in PGlite, but **it has not been run against a live Supabase project** in this environment. Auth flows (sign-in, session refresh) are untested end to end.
- User provisioning (creating users and `profiles` rows) is manual via the service role. There is no admin UI.
- There is no approval workflow. Review states record workflow only.
- Partially prerendered routes return HTTP 200 (with `noindex`) for unknown record ids, because the status cannot change after streaming starts; top-level unknown routes return 404.
- On Windows, the webapp-testing skill's `with_server.py` can leave the `next start` process running after it exits. `tests/e2e/run_e2e.py` frees the port before and after each run.

## Regulatory
- The software does not know which regulations, permits or test methods apply in a jurisdiction, and does not determine safety or compliance.
- Hazard declarations are recorded as stated. Classification remains the responsibility of the producer and competent authorities.
- Laboratory testing, qualified engineering review and regulatory confirmation are always required.
