# FLYBOX launch checklist

This checklist is for a public open-source release.

## Repository

- [x] Open-source software license
- [x] CONTRIBUTING.md
- [x] Code of Conduct
- [x] Security policy
- [x] Third-party/data licensing notices
- [x] Pull request template
- [x] Bug and feature issue templates
- [x] Dependabot configuration
- [ ] GitHub Actions CI temporarily disabled while the account billing dispute is unresolved; run backend/frontend validation locally before merges
- [ ] Protect `main` without requiring GitHub Actions until the billing dispute is resolved
- [ ] Enable GitHub private vulnerability reporting
- [ ] Add repository topics/description/homepage in GitHub settings

## Product

- [ ] Publish the new static browser-runtime build to the production host
- [x] Official documentation routes
- [x] Explicit real/simulated/experimental/game provenance
- [x] Mock mode never silently replaces production simulation
- [x] Ephemeral session model documented
- [x] Scientific limitations documented
- [ ] Verify production deploy from a clean browser
- [ ] Verify `/docs` and nested docs URLs after deployment
- [ ] Verify mobile layout
- [ ] Verify static-host cache headers for `/connectome/*` and SPA fallback routes

## Validation

- [ ] Run optional Python reference-backend tests locally on the launch commit
- [ ] Run frontend typecheck/build locally on the launch commit
- [ ] Run at least one clean-browser smoke test using the real browser FlyBrain graph
- [ ] Confirm browser mode reports anatomy unavailable until real soma XYZ metadata is added; never render fake coordinates
- [ ] Confirm PLAY/PURE LAB labels remain visible and accurate
- [ ] Confirm experiment export/import round trip
- [ ] Confirm separate tabs receive separate Web Worker neural/world states

## Scientific release hygiene

- [x] Third-party MaleCNS attribution separated from software license
- [x] Experimental encoders/decoders documented
- [x] Claims exclude consciousness/cognition/complete biological equivalence
- [x] Add CITATION.cff (currently credits the FLYBOX contributors collectively; individual author metadata can be expanded later)
- [ ] Pin a release tag (for example `v0.2.0`) after CI and production smoke tests pass

## Community

- [x] Contribution pathways documented
- [x] Scientific contribution standard documented
- [x] Create a beginner-friendly `good first issue` ticket
- [x] Create contributor issues for morphology, protocol builder, population explorer, and recorder work
