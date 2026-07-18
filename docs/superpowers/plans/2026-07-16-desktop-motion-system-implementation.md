# StudyPilot Desk Desktop Motion System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified, spatially coherent, accessible and performant desktop motion system across StudyPilot Desk.

**Architecture:** Centralize motion decisions in a pure route/view-transition contract, use a small presence primitive for exit-safe conditional surfaces, and keep all visual choreography in a dedicated CSS layer. Existing components only expose semantic motion hooks and stable shared-element names.

**Tech Stack:** React 19, TypeScript, CSS View Transitions with CSS fallback, Vitest, Testing Library, Vite, Electron.

---

### Task 1: Motion contract

**Files:**
- Create: `frontend/src/ui/motion.ts`
- Create: `frontend/tests/motion-system.test.tsx`
- Modify: `frontend/src/app/router.ts`

- [ ] Write failing tests for route depth, forward/back/lateral/replace intent, stable shared names, reduced-motion fallback and native View Transition dispatch.
- [ ] Run `npm.cmd test -- frontend/tests/motion-system.test.tsx` and verify failure because the contract does not exist.
- [ ] Implement the minimal pure contract and route integration.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Exit-safe presence

**Files:**
- Create: `frontend/src/components/MotionPresence.tsx`
- Test: `frontend/tests/motion-system.test.tsx`
- Modify: `frontend/src/features/CourseWizard.tsx`
- Modify: `frontend/src/features/NotebookLibrary.tsx`
- Modify: `frontend/src/components/SafeTrashMenu.tsx`

- [ ] Add a failing fake-timer test proving closing content remains in `exiting` state before unmount.
- [ ] Run the focused test and verify the missing component failure.
- [ ] Implement `MotionPresence` with enter/entered/exit phases and apply it to major modal/menu surfaces.
- [ ] Re-run focused component tests.

### Task 3: Shared spatial anchors and stable chrome

**Files:**
- Modify: `frontend/src/features/CourseLibrary.tsx`
- Modify: `frontend/src/features/CourseHome.tsx`
- Modify: `frontend/src/features/NotebookLibrary.tsx`
- Modify: `frontend/src/features/Knowledge.tsx`
- Modify: `frontend/src/components/NavRail.tsx`
- Test: `frontend/tests/motion-system.test.tsx`

- [ ] Add failing assertions for matching course/notebook view-transition names and the sidebar indicator index.
- [ ] Apply stable shared names and add the nav indicator semantic element.
- [ ] Re-run the focused tests.

### Task 4: Unified visual motion layer

**Files:**
- Modify: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/motion.css`
- Modify: `frontend/src/main.tsx`
- Modify: `tests/unit/motion-policy.test.ts`

- [ ] Expand the policy test to require motion tokens, View Transition choreography, presence exit states, reduced-motion coverage, and absence of infinite decorative animation.
- [ ] Run the policy test and verify it fails before `motion.css` exists.
- [ ] Implement page directions, shared element choreography, nav movement, card/list staging, toolbar/inspector/drawer/modal/menu/toast feedback, theme-safe compositing and reduced-motion overrides.
- [ ] Re-run policy and focused UI tests.

### Task 5: Verification and build

**Files:**
- Modify only if verification exposes a defect.

- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd run build`.
- [ ] Run the relevant Playwright smoke/critical flow if the desktop test environment is available.
- [ ] Inspect the final diff and verify every design requirement against the implementation.

