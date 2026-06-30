# Source Action Guidance Implementation Plan

**Goal:** Add a frontend-only next-step hint for IMDb so the UI says whether to configure cache, download datasets, sync local cache, or inspect a failed sync.

**Architecture:** Derive guidance in a small frontend utility from `SourceSettingsView.localState`, `latestRun`, and `manualCommands`. Render that guidance in the source catalog row and in the source configuration dialog. No backend routes or persisted state are added.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library.

## Global Constraints

- Do not execute shell commands from the web UI.
- Do not add API routes, task queues, logs, WebSocket streams, or scheduler work.
- Do not include secrets, proxy URLs, database credentials, or cache paths in UI command text.
- Keep IMDb as a planned/manual source.
- JavaScript and TypeScript use 2-space indentation and no semicolons.

## File Structure

- Add `frontend/src/utils/sourceActionGuidance.ts`.
- Add `frontend/tests/sourceActionGuidance.test.ts`.
- Modify `frontend/src/pages/SourcesPage.tsx`.
- Modify `frontend/src/components/SourceConfigDialog.tsx`.
- Modify `frontend/src/styles.css`.
- Modify `frontend/tests/pages.test.tsx`.
- Modify `frontend/tests/settingsPage.test.tsx`.

## Task 1: Guidance Utility

- [ ] Write failing utility tests for missing config, missing files, ready without sync, cache newer than sync, failed sync, running sync, and successful sync.
- [ ] Run `npm test --workspace frontend -- sourceActionGuidance` and confirm the expected failure.
- [ ] Implement `sourceActionGuidance(source)`.
- [ ] Re-run the utility tests and confirm they pass.

## Task 2: Source Catalog Display

- [ ] Write or update `/sources` page tests so IMDb shows a next-step title and the recommended command.
- [ ] Run `npm test --workspace frontend -- pages` and confirm the expected failure.
- [ ] Render guidance in `SourcesPage`; keep the old first-command hint only as fallback for sources without guidance.
- [ ] Add compact source guidance styles.
- [ ] Re-run the page test.

## Task 3: Settings Dialog Display

- [ ] Write or update settings page tests so the IMDb dialog shows the next-step title inside “本地操作”.
- [ ] Run `npm test --workspace frontend -- settingsPage` and confirm the expected failure.
- [ ] Render guidance in `SourceConfigDialog` above the complete manual command list.
- [ ] Add dialog guidance styles.
- [ ] Re-run the settings page test.

## Final Verification

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Confirm ports `19992` and `19993` were not started by this work.
- [ ] Commit and push.
