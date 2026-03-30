# Contributing to SafeSkill

Thanks for your interest in improving SafeSkill. This document explains how to
set up the project locally and what we look for in contributions.

## Code of conduct

By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [pnpm](https://pnpm.io/) — the repo is pinned to **pnpm 10.33** (see root
  `package.json` `packageManager`)

## Quick start

```bash
pnpm install
make build      # or: pnpm build
make test       # or: pnpm test
make lint       # or: pnpm lint
make typecheck  # or: pnpm typecheck
```

Useful workflows:

- **Web app**: `make dev` (runs the `@safeskill/web` dev server)
- **Batch / data scripts**: see `make help` and the root [README](README.md)

## Making changes

1. **Fork** the repository and create a **branch** from `main` with a clear
   name (for example `fix/scanner-false-positive` or `feat/issue-templates`).
2. **Keep changes focused** — one logical change per pull request when possible.
3. **Run checks** before opening a PR:

   ```bash
   make lint typecheck test
   ```

4. **Describe the change** in the PR: what problem it solves, how you tested it,
   and any trade-offs.

## Scanner and scoring changes

If you touch detectors, scoring, or analyzers under `packages/scanner`, add or
update tests in the same package when behavior changes. Prefer small, targeted
fixtures over huge snapshots unless the project already uses them for that
area.

## Docs and marketing site

Copy changes in `apps/web` or public docs should stay consistent with existing
tone and layout. Avoid drive-by formatting-only edits across large files unless
they fix a real problem.

## Licensing

By contributing, you agree that your contributions will be licensed under the
same terms as the project (see [LICENSE](LICENSE)).

## Questions

For product and usage questions, see [safeskill.dev/docs](https://safeskill.dev/docs).
For development discussion, open an issue or PR and we will respond when we can.
