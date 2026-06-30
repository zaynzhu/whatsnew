# Source URL Visibility Implementation Plan

**Goal:** Make existing `sourceUrl` values visible and clickable in the frontend so users can verify where release, trend, and event records came from.

**Architecture:** Add a small `SourceLink` React component that renders a plain text fallback when `sourceUrl` is missing and an external link when present. Replace repeated `来源 ${sourceLabel(source)}` spans in targeted pages.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library, lucide-react.

## Global Constraints

- Do not change backend routes or database schema.
- Do not validate external URLs during render.
- Do not expose secrets, proxy URLs, cache paths, or credentials.
- External links open in a new tab with `rel="noreferrer"`.
- JavaScript and TypeScript use 2-space indentation and no semicolons.

## File Structure

- Add `frontend/src/components/SourceLink.tsx`.
- Modify `frontend/src/pages/CalendarPage.tsx`.
- Modify `frontend/src/pages/TrendingPage.tsx`.
- Modify `frontend/src/pages/MediaDetailPage.tsx`.
- Modify `frontend/src/styles.css`.
- Modify `frontend/tests/pages.test.tsx`.

## Task 1: Red Tests

- [ ] Update page tests to expect clickable source links on trending, calendar, and detail views.
- [ ] Run `npm test --workspace frontend -- pages` and confirm the expected failure.

## Task 2: Component And UI

- [ ] Implement `SourceLink`.
- [ ] Replace source text in targeted rows with `SourceLink`.
- [ ] Add compact source link styles.
- [ ] Re-run `npm test --workspace frontend -- pages`.
- [ ] Run `npm run typecheck --workspace frontend`.

## Final Verification

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Confirm ports `19992` and `19993` are not started.
- [ ] Commit and push.
