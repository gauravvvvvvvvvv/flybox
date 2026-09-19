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
- [x] CI for backend tests and frontend typecheck/build
- [ ] Protect `main` and require passing CI before merge
- [ ] Enable GitHub private vulnerability reporting
- [ ] Add repository topics/description/homepage in GitHub settings

## Product

- [x] Public live URL
- [x] Official documentation routes
- [x] Explicit real/simulated/experimental/game provenance
- [x] Mock mode never silently replaces production simulation
- [x] Ephemeral session model documented
- [x] Scientific limitations documented
- [ ] Verify production deploy from a clean browser
- [ ] Verify `/docs` and nested docs URLs after deployment
- [ ] Verify mobile layout
- [ ] Verify Vercel Analytics receiving production events

## Validation

- [ ] Green backend CI on launch commit
- [ ] Green frontend CI on launch commit
- [ ] Run at least one smoke test using real FlyBrain
- [ ] Confirm 3D brain view receives real xyz soma coordinates
- [ ] Confirm PLAY/PURE LAB labels remain visible and accurate
- [ ] Confirm experiment export/import round trip
- [ ] Confirm separate tabs receive separate ephemeral sessions

## Scientific release hygiene

- [x] Third-party MaleCNS attribution separated from software license
- [x] Experimental encoders/decoders documented
- [x] Claims exclude consciousness/cognition/complete biological equivalence
- [ ] Add a formal CITATION.cff once the preferred project author/citation string is finalized
- [ ] Pin a release tag (for example `v0.2.0`) after CI and production smoke tests pass

## Community

- [x] Contribution pathways documented
- [x] Scientific contribution standard documented
- [ ] Create a few beginner-friendly `good first issue` tickets
- [ ] Create `help wanted` issues for morphology, protocol builder, population explorer, and recorder work
