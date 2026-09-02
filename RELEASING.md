# Releasing

Releases run manually from the `Release` GitHub Actions workflow on `main`.
The workflow derives the next version and changelog from Conventional Commits
since the latest `v*` tag, runs the full validation suite, and publishes through
npm Trusted Publishing.

Choose `latest` for a stable version such as `0.0.13`. Choose `next` for a
prerelease such as `0.0.13-next.0`; subsequent runs increment the prerelease
number. A later `latest` run promotes the line to a stable version after at
least one new commit.

Before the first release, configure `@antelopejs/interface-core` on npmjs with
this trusted publisher:

- Organization: `AntelopeJS`
- Repository: `interface-core`
- Workflow: `release.yml`
- Environment: `npm-publish`

Never add a long-lived npm publish token to this repository.
