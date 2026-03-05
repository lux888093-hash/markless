# Repository Guidelines

## Project Structure & Module Organization
This repository has a split frontend/backend layout:

- `frontend/`: React + Vite UI.
- `frontend/src/`: application code (`App.jsx`, `main.jsx`, styles).
- `frontend/public/`: static assets.
- `backend/`: Express API server (`index.js`) for parse/download endpoints.
- Root scripts: `start.ps1` / `start.bat` to launch both services, `stop.ps1` / `stop.bat` to stop them.
- Product notes: `PRD.md`.

Keep feature changes scoped: UI/state logic in `frontend/src`, parsing/network behavior in `backend/index.js`.

## Build, Test, and Development Commands
- Frontend dev: `cd frontend && npm run dev`  
  Starts Vite dev server (LAN-enabled via `vite.config.js`).
- Frontend build: `cd frontend && npm run build`  
  Produces production assets in `frontend/dist/`.
- Frontend lint: `cd frontend && npm run lint`  
  Runs ESLint rules.
- Backend run: `cd backend && node index.js`  
  Starts API on port `3001`.
- One-click run (Windows): `.\start.bat`  
  Starts frontend + backend and prints local/LAN URLs.

## Coding Style & Naming Conventions
- JavaScript/JSX only; use 2-space indentation and semicolons (match existing files).
- React components: PascalCase file/component names where applicable.
- Variables/functions: `camelCase`; constants: `UPPER_SNAKE_CASE`.
- Keep API route names explicit (`/api/parse-batch`, `/api/download`).
- Run `npm run lint` in `frontend/` before submitting changes.

## Testing Guidelines
There is currently no formal automated test suite.

Minimum validation before PR:
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- Manual smoke test: parse at least one Douyin and one Xiaohongshu link, then verify download works.

If adding tests, place frontend tests under `frontend/src/__tests__/` and backend tests under `backend/tests/`.

## Commit & Pull Request Guidelines
Current history is minimal and uses short, imperative commit subjects (e.g., `Remove xhs_toolkit.log file`).

Use this format:
- Commit subject: imperative, <= 72 chars.
- Optional body: what changed and why.

PRs should include:
- Change summary and affected paths.
- How to run/verify locally.
- Screenshots or short recordings for UI changes.
- Linked issue/task if available.

## Security & Configuration Tips
- Do not hardcode machine-specific URLs in frontend code; use Vite proxy or `VITE_API_BASE`.
- Avoid committing logs, temporary files, or downloaded media samples unless required for reproducibility.
