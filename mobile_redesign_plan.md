# Implementation Plan - Mobile Layout & Gesture Redesign

This document outlines the layout and touch gesture redesign for mobile devices to solve the lack of hover state on mobile, distinguish between tablets and phones, and provide a guide on the mobile emulator and automated testing landscape.

It also tracks status: what's already shipped, how the implementation diverged from the original plan below, and the next round of work (renames, pan clamping, mobile cell sizing, and carousel fixes).

---

## Status as of 2026-07-15

The original plan (see "Goal Description" below) is substantially implemented and verified, and so is the round of renames/polish/carousel-fix work that followed it (renames, chord-guide placeholder text, mobile cell size, pan clamp, and the carousel scroll/drag-to-place fixes, including two follow-up root causes found post-launch: a `touch-action: none` rule that was unintentionally blocking the carousel's own scroll, and a flexbox `min-width: auto` trap that kept `#palette` from ever actually overflowing/clipping). Implementation plan and commit history: `docs/superpowers/plans/2026-07-15-sandbox-blast-rename-and-mobile-polish.md`.

- **8/8 unit tests pass** (`node tests/run_tests.js`)
- **47/47 Playwright tests pass** across Desktop Chrome, Mobile Chrome (Pixel 5), and Tablet Chrome (`npx playwright test`) — covering hex/label visibility, piece carousel (native scroll non-interference, drag-to-candidate, full-list reachability), chord dropdown, drag/tap/swipe gestures, pan clamping, mobile cell sizing, drawer handle, keyboard-hiding, MIDI/Snake touch, and more.

The real implementation evolved past the original spec text below in a few ways — this is expected drift from iterative work, not a bug:

- The bottom "Pieces / Chord Guide" tabbed drawer described below was **not** what got built. Instead, the sidebar controls collapse into a `#top-drawer` at the top of the screen (`drawer-handle`, swipe or tap to expand/collapse), and Sandbox mode's piece palette renders as a horizontally-scrolling **piece carousel** (`#sandbox-mobile-tools #palette` / `#piece-list`) inside that drawer's always-visible area, alongside the chord guide dropdown.
- The floating gamepad-style `#mobile-controls` pad is shown **only in Gravity mode** on phones, not "Snake & Gravity" as originally planned — Snake mode uses its own touch-steering instead.
- Chop Mode was renamed to Sandbox Mode and Puzzle Mode to Blast Mode in the code (`js/sandbox.js`/`SandboxMode`, `js/blast.js`/`BlastMode`, mode strings `'sandbox'`/`'blast'`), matching the UI display names that already said "Sandbox"/"Blast".
- Dragging a carousel/chord-guide piece onto the board leaves a **candidate** placement (tap-to-rotate/tap-to-move/swipe-to-place still apply) rather than placing immediately on release — this diverged from the original "drag-to-place" framing below once real-device feedback showed immediate placement was too eager.

---

## Next Round: Chord Guide draggable pieces + tap-to-move candidate (spec, 2026-07-15)

Two small UX gaps in Sandbox Mode, reported after using the shipped work above on a real device:

1. The Chord Guide's result list (`#chord-guide-results`, populated by `SandboxMode.updateGuideResults` in `js/sandbox.js`) shows each matching piece/rotation as a text row with a static "Use" badge — no visual preview, and no touch drag-to-candidate the way the carousel now supports.
2. Once a piece is a selected candidate, tapping the board on touch always rotates it (`js/main.js`, `touchend`'s `isTap` branch, ~line 696) — even when the intent was to move it somewhere else.

### 1. Draggable, correctly-oriented piece previews in Chord Guide results

Each result row already carries the matched piece's `type` and `rotation` (`data-type`/`data-rotation` on `.chord-match-item`). Replace the "Use" `<span>` with a small `<svg class="chord-match-preview">`, rendered the same way the carousel's `.piece-preview` icons are — but built from the *rotated* cells (`Pieces.getAbsoluteCells(type, 0, 0, rotation)`) instead of the piece's raw rotation-0 cells, so the preview visually matches the rotation that actually produces the chord.

The bounds-computation/hex-drawing logic currently inlined in `renderPalette` should be extracted into a shared helper (e.g. `renderPiecePreview(svgEl, cells, color)`) used by both `renderPalette` and `updateGuideResults`.

### 2. Drag-to-candidate from Chord Guide results

Generalize the existing `setupCarouselTouchGestures` (currently hardcodes `#piece-list`, `.piece-item`, `data-key`, and rotation 0) into a reusable `setupDragToCandidate(containerId, itemSelector, getPieceInfo)`, where `getPieceInfo(item)` returns `{ key, rotation }`. Call it twice from `init()`:

- `setupDragToCandidate('piece-list', '.piece-item', item => ({ key: item.dataset.key, rotation: 0 }))`
- `setupDragToCandidate('chord-guide-results', '.chord-match-item', item => ({ key: item.dataset.type, rotation: parseInt(item.dataset.rotation) }))`

Behavior is otherwise identical to the carousel's existing drag gesture: a predominantly-vertical drag on the item selects the piece (with the row's specific rotation, not always 0) and tracks `hoverCell`/`updateGhost()` as the finger moves over the board; releasing leaves it as a normal selected candidate. A predominantly-horizontal drag is left alone so the browser can scroll the results list natively. A plain tap/click on a result row is unchanged from today: selects the piece and sets its rotation immediately.

### 3. X (reset) button for the Chord Guide

An inline `✕` button sits next to `#chord-guide-select`, visible whenever a chord is chosen (hidden when the dropdown is blank). Clicking it resets the dropdown to `-- Choose a Chord --` and clears `#chord-guide-results` — exactly equivalent to manually re-selecting the blank option. It does not touch `SandboxMode.state.selectedPiece`: a candidate you already picked (via tap or drag) stays selected/on-board after the guide is reset.

### 4. Tap elsewhere moves the candidate instead of rotating it

In `js/main.js`, the `touchend` handler's `isTap` branch (currently: any tap while a piece/candidate is active always rotates it CW) is replaced with a 3-way classification of the tapped cell (`touchStartCell`, since `isTap` implies negligible movement):

1. **Tapped cell is one of the candidate ghost's own cells** (`Pieces.getAbsoluteCells(pieceType, hoverCell.p, hoverCell.q, rotation)`) → rotate clockwise, exactly as today (including the confirmation chord sound). This also covers the case where no cell could be resolved from the tap.
2. **Tapped cell is covered by an existing placed piece** (Sandbox: `SandboxMode.state.placedPieces`; Blast: `!Board.isCellEmpty(p, q)`) →
   - Sandbox: pick that placed piece up as the new candidate, reusing `SandboxMode.pickupPieceAt(p, q)` (after setting `hoverCell` to the tapped cell so the ghost reappears at the right spot).
   - Blast: ignored — Blast has no concept of picking a locked cell back up, so the tap is a no-op.
3. **Anything else (an empty cell)** → move the candidate's anchor there: set `modeObj.state.hoverCell` to the tapped cell and call `updateGhost()`. No rotation, no sound.

This branch is shared code for both Sandbox and Blast Mode (`modeObj`/`pieceType` are already mode-generic here), so the behavior applies uniformly except where called out above.

### Testing

- Playwright coverage (`tests/mobile.spec.js`, `tests/desktop.spec.js`) for:
  - Chord Guide result rows render a piece preview at the correct rotation (spot-check one known chord/rotation pair's rendered cells against `Pieces.getAbsoluteCells`).
  - Dragging a chord-guide result row onto the board leaves a candidate (not an immediate placement) at the dragged-to cell, with the row's specific rotation — mirrors the existing carousel drag-to-candidate test.
  - The X button: appears only once a chord is selected, clears the select + results on click, and leaves an already-selected candidate untouched.
  - Tap-to-move: with a candidate selected, tapping a cell outside the ghost moves the candidate there (no rotation); tapping a cell inside the ghost still rotates; tapping an existing placed piece (Sandbox) picks it up as the new candidate; tapping a locked cell (Blast) is a no-op.
- Manual/real-device check (native touch scroll and drag still can't be driven by Playwright's synthetic `TouchEvent`s, per the existing carousel testing caveat above).

---

## Goal Description (original)
Mobile devices do not have a cursor hover state. In Desktop mode, hover is used to show piece previews/ghosts and trigger chord tooltips. 
To solve this on mobile, we will implement **natural touch gestures** for piece manipulation, floating overlays for realtime modes, and a collapsible bottom drawer for sidebar controls.

Specifically, we will:
1. **Sandbox & Blast Mode Gestures**:
   - **Drag-to-Move**: Dragging on the lattice moves the active piece preview/ghost to follow the finger.
   - **Tap-to-Rotate**: A quick tap rotates the active piece clockwise.
   - **Swipe Down-to-Place**: A fast downward swipe places the active piece on the lattice.
   - **Swipe Up-to-Pickup**: A fast upward swipe picks up a placed piece under the starting touch point (Sandbox/Chop mode only).
   - **Taps (without active piece)**: Plays the note under the finger, serving as a virtual keyboard.
2. **Realtime Modes (Snake & Gravity)**:
   - Floating gamepad-style overlay pads positioned at the bottom corners of the board (d-pad on the left, action/rotate buttons on the right), displayed only in Snake and Gravity modes to keep Sandbox and Blast screens clean and gesture-driven.
3. **Collapsible Bottom Dock**:
   - On phones, a slide-up drawer houses the Sandbox piece palette and Chord Guide, so they do not eat up layout height.
4. **Mobile Testing & Emulator Walkthrough**:
   - Document exactly how to run a local virtual emulator (Android/iOS) and how to configure Playwright for automated mobile testing.

*(Note: item 2 shipped as Gravity-only, and item 3 shipped as a top drawer with a piece carousel rather than a bottom tabbed dock — see "Status as of 2026-07-15" above.)*

---

## User Review Required
No breaking changes to the desktop layout. Gestures are mapped using standard Pointer/Touch listeners on the SVG canvas and are active only on touch-enabled device widths.

---

## Verification Plan

### Manual Verification
1. **DevTools emulation**: Verify layout, drawer toggling, gesture detection, cell size, and pan clamping under mobile viewports.
2. **Local network test**: Run local server and verify gesture response (tap to rotate, swipe to place, carousel scroll, carousel drag-to-place) on a real device.

### Automated Tests
```
node tests/run_tests.js
npx playwright test
```

---

## Mobile Testing & Emulation Landscape

To manually test the mobile interface before pushing your code, you can use either built-in browser emulators or OS-level emulators:

### 1. Browser Device Emulation (Fastest & Easiest)
Your standard web browser has built-in mobile layout and touch event emulation.
1. Open your project on `localhost` or your local server.
2. Open DevTools (Right-click -> Inspect, or press `Option+Cmd+I` on Mac).
3. Toggle Device Toolbar (click the Mobile/Tablet icon, or `Cmd+Shift+M`).
4. Select a preset (e.g., iPhone SE or Pixel 5).
5. Drag your mouse to test the **Drag-to-Move** gestures. Flick downwards/upwards quickly to test the **Swipe** gestures. Click quickly to test the **Tap-to-Rotate** gesture.

### 2. Desktop Android Emulator (OS-Level Emulation)
If you want to test on a virtual device running a complete Android OS:
1. **Download Android Studio**: Visit [developer.android.com/studio](https://developer.android.com/studio) and install it.
2. **Create a Virtual Device**:
   * Open Android Studio.
   * Open the **Device Manager** (found in settings or tools menu).
   * Click **Create Device**, select a hardware profile (e.g., Pixel 7), choose a system image (e.g., API 34), and click **Finish**.
3. **Run the Emulator**:
   * Launch the virtual device from the Device Manager.
   * Open the **Google Chrome** app inside the virtual device.
4. **Access Host Local Server**:
   * Run your local project server on your computer (e.g., `python3 -m http.server 8000`).
   * Inside the Android Emulator's Chrome browser, navigate to the special loopback address: **`http://10.0.2.2:8000`**. This points directly to the host machine's port `8000`!
   * You can now test the touch interfaces exactly as they would run on a native Android phone.

### 3. Automated Mobile Testing (Playwright)
Playwright is already set up in this repo (`playwright.config.js`, `tests/desktop.spec.js`, `tests/mobile.spec.js`), covering Desktop Chrome, Mobile Chrome (Pixel 5), and Tablet Chrome projects.

1. **Install** (already in `package.json` devDependencies): `npm install`
2. **Run a local server** the config points at (`baseURL: 'http://localhost:8001'`), e.g. `python3 -m http.server 8001`.
3. **Run the tests**:
   ```bash
   npx playwright test
   ```
   Playwright runs headless browsers in the background, executing touch events and asserting that SVG lattice elements, the drawer, the carousel, and gesture-driven state updates all behave correctly.
