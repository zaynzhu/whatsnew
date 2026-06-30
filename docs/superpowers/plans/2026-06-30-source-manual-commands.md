# Source Manual Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show safe terminal commands for sources that require manual local operations, starting with IMDb cache download and sync.

**Architecture:** Store manual command metadata in the backend source catalog, expose it through existing settings and sources APIs, and render compact command hints in the source catalog page plus a detailed command list in the source configuration dialog. The commands are text-only and never executed by the web app.

**Tech Stack:** TypeScript, Express, React, Vitest, React Testing Library.

## Global Constraints

- Do not execute manual commands from the web UI.
- Do not include API keys, tokens, cookies, proxy URLs, database credentials, or local cache paths in command text.
- Keep IMDb `implementationStatus="planned"`.
- Do not add scheduler entries or new API routes for IMDb download/sync.
- JavaScript and TypeScript use 2-space indentation and no semicolons.

---

## File Structure

- Modify `shared/src/settings.ts`: add `SourceManualCommandView` and `manualCommands`.
- Modify `backend/src/settings/sourceCatalog.ts`: attach manual commands to IMDb.
- Modify `backend/src/routes/settings.ts` and `backend/src/routes/sources.ts`: return `manualCommands`.
- Modify `backend/tests/sourceCatalog.test.ts` and `backend/tests/settingsApi.test.ts`: API coverage.
- Modify `frontend/src/components/SourceConfigDialog.tsx`: render detailed command list.
- Modify `frontend/src/pages/SourcesPage.tsx`: render compact command hint.
- Modify `frontend/src/styles.css`: command display styling.
- Modify `frontend/tests/settingsPage.test.tsx` and `frontend/tests/pages.test.tsx`: UI coverage.

## Task 1: Backend Manual Command Metadata

**Files:**
- Modify: `shared/src/settings.ts`
- Modify: `backend/src/settings/sourceCatalog.ts`
- Modify: `backend/src/routes/settings.ts`
- Modify: `backend/src/routes/sources.ts`
- Test: `backend/tests/sourceCatalog.test.ts`
- Test: `backend/tests/settingsApi.test.ts`

**Interfaces:**
- Produces: `manualCommands: SourceManualCommandView[]` on every `SourceSettingsView`

- [ ] **Step 1: Write failing backend tests**

Update `backend/tests/sourceCatalog.test.ts`:

```ts
expect(getSourceDefinition("imdb").manualCommands).toEqual([
  expect.objectContaining({
    label: "下载或刷新 IMDb 缓存",
    command: "npm run download:imdb --workspace backend"
  }),
  expect.objectContaining({
    label: "同步 IMDb 本地缓存",
    command: "npm run sync:imdb --workspace backend"
  })
])
```

Update `backend/tests/settingsApi.test.ts` to assert both `/api/settings` and `/api/sources` return the IMDb commands.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test --workspace backend -- settingsApi sourceCatalog
```

Expected: fail because `manualCommands` does not exist.

- [ ] **Step 3: Implement backend metadata**

In `shared/src/settings.ts`, add:

```ts
export type SourceManualCommandView = {
  label: string
  command: string
  description: string
}
```

Add `manualCommands: SourceManualCommandView[]` to `SourceSettingsView`.

In `backend/src/settings/sourceCatalog.ts`:

- Import `SourceManualCommandView`.
- Add `manualCommands: readonly SourceManualCommandView[]` to `SourceDefinition`.
- Extend `source()` with optional `manualCommands: SourceManualCommandView[] = []`.
- Pass the two IMDb commands as the final argument for IMDb.

In both route source view objects, add:

```ts
manualCommands: source.manualCommands
```

- [ ] **Step 4: Run backend tests and typecheck**

Run:

```bash
npm test --workspace backend -- settingsApi sourceCatalog
npm run typecheck --workspace backend
```

- [ ] **Step 5: Commit**

```bash
git add shared/src/settings.ts backend/src/settings/sourceCatalog.ts backend/src/routes/settings.ts backend/src/routes/sources.ts backend/tests/sourceCatalog.test.ts backend/tests/settingsApi.test.ts
git commit -m "feat: 暴露数据源手动命令"
```

## Task 2: Frontend Manual Command Display

**Files:**
- Modify: `frontend/src/components/SourceConfigDialog.tsx`
- Modify: `frontend/src/pages/SourcesPage.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/tests/settingsPage.test.tsx`
- Test: `frontend/tests/pages.test.tsx`

**Interfaces:**
- Consumes: `source.manualCommands`
- Produces: text-only command hints

- [ ] **Step 1: Write failing frontend tests**

Update fixtures to include IMDb `manualCommands`.

In `frontend/tests/settingsPage.test.tsx`, open IMDb config and assert:

```ts
expect(screen.getByText("本地操作")).toBeInTheDocument()
expect(screen.getByText("npm run download:imdb --workspace backend")).toBeInTheDocument()
expect(screen.getByText("npm run sync:imdb --workspace backend")).toBeInTheDocument()
```

Also verify TMDb config does not show `本地操作`.

In `frontend/tests/pages.test.tsx`, assert `/sources` shows the IMDb download command.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test --workspace frontend -- settingsPage pages
```

Expected: fail because UI does not render manual commands.

- [ ] **Step 3: Implement UI**

In `SourceConfigDialog`, after the field grid and empty field text, render:

```tsx
{source.manualCommands.length > 0 && (
  <section className="manualCommandPanel" aria-labelledby="manual-command-heading">
    <h3 id="manual-command-heading">本地操作</h3>
    <div className="manualCommandList">
      {source.manualCommands.map((command) => (
        <div className="manualCommandItem" key={command.command}>
          <strong>{command.label}</strong>
          <code>{command.command}</code>
          <span>{command.description}</span>
        </div>
      ))}
    </div>
  </section>
)}
```

In `SourcesPage`, after `sourceRiskNote`, render:

```tsx
{source.manualCommands[0] && (
  <p className="sourceCommandHint">
    <code>{source.manualCommands[0].command}</code>
  </p>
)}
```

Add compact CSS classes in `frontend/src/styles.css`.

- [ ] **Step 4: Run frontend tests and typecheck**

Run:

```bash
npm test --workspace frontend -- settingsPage pages
npm run typecheck --workspace frontend
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SourceConfigDialog.tsx frontend/src/pages/SourcesPage.tsx frontend/src/styles.css frontend/tests/settingsPage.test.tsx frontend/tests/pages.test.tsx
git commit -m "feat: 展示数据源手动命令"
```

## Final Verification

- [ ] Run:

```bash
npm run typecheck
npm test
npm run build
lsof -nP -iTCP:19992 -sTCP:LISTEN
lsof -nP -iTCP:19993 -sTCP:LISTEN
```

- [ ] Confirm git status is clean.
- [ ] Push:

```bash
git push
```
