# Repository Guidelines

## Project Structure & Module Organization
This Node.js + React monorepo keeps frontend code in `src/` (Vite + TypeScript UI, co-located hooks/services) and static assets in `public/`. Express route handlers live in `routes/`, with shared business logic in `services/` and middleware in `middleware/`. Database migrations and seeds sit under `database/`, while deployment and maintenance scripts are in `scripts/`. Built artifacts land in `dist/`; Playwright assets and reports stay in `tests/` and `playwright-report/`. Update environment examples in `env.example` whenever configuration keys change.

## Build, Test & Development Commands
Install dependencies once with `npm install`. For day-to-day work, run:
```bash
npm run dev:backend        # Express API with Nodemon watching server.js
npm run dev                # Vite dev server with hot reload proxied to :8080
npm run build              # Type-check (tsc -b) and produce Vite build into dist/
npm start                  # Serve the combined production build
npm run migrate            # Apply pending database migrations
```
Use `npm run test` for the full suite (backend integration + Playwright). To isolate suites, prefer `npm run test:backend` or `npm run test:e2e`. Lint locally with `npm run lint` before opening a PR.

## Coding Style & Naming Conventions
TypeScript and TSX files follow the ESLint configs in `eslint.config.js`; run `npm run lint -- --fix` to auto-resolve style issues. Use 2-space indentation, semicolons, and single quotes to match existing code. Components and hooks are PascalCase (e.g., `PairingInvitationHandler.tsx`), while services and utilities stay camelCase (`apiService.ts`). Keep React components functional and colocate related styles/assets under the same directory to mirror the current layout.

## Testing Guidelines
Backend integration tests run through `test-integration.js` (Mocha + Chai). UI flows rely on Playwright specs under `tests/*.spec.ts`; mirror new scenarios with descriptive filenames (`feature-name.spec.ts`). When adding endpoints, extend the integration harness and update fixtures so `npm run test:backend` passes without manual state. For UI changes, capture at least one Playwright assertion covering the new behavior and re-run the full suite before pushing.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`). Keep messages imperative and scoped to a single change set. Pull requests should include: a concise summary, testing notes (commands run), and linked issue or task IDs. Attach screenshots or short videos for visible UI updates, and mention any migration or configuration changes so reviewers know to run `npm run migrate` or update `.env`. Tag reviewers familiar with the affected modules for faster feedback.
