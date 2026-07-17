# Core Invariants

This document catalogs Tonncade's cross-cutting invariants — properties that must hold
regardless of mode, viewport, or orientation. Each is backed by a test. Together with those
tests, this doc is the source of truth for what "correct" means at this level; per-feature
behavior lives in `tests/mobile.spec.js` and `tests/desktop.spec.js` instead.

**Protection policy:** don't weaken, skip, or delete an invariant test to make an unrelated
change land. If a change genuinely requires redefining an invariant, update this document
first — with the reasoning — then update the corresponding test to match, in the same commit.
A test going red here is a signal to fix the product, not the test. `tests/invariants.spec.js`
carries a copy of this policy in its header comment for the same reason.

---

### INV-1: Every mode is reachable from every screen, in every orientation

You can always navigate from any mode to any other mode (Sandbox, Melody, Snake, Blast,
Gravity), regardless of current viewport size or orientation. On mobile/tablet widths the mode
list lives inside the collapsible `#top-drawer` (open it first); on desktop it's always
visible. Either way, the path to switching modes must never be blocked.

**Test:** `tests/invariants.spec.js` — "INV-1: every mode is reachable from every other mode,
in portrait and landscape"

### INV-2: Anything you can summon, you can dismiss

Any interactive element or state the player can open/invoke must have a way to close/undo it:
the mobile drawer opens and closes, the chord guide populates and clears, a candidate piece
can be picked up and put back down without being forced to place it.

**Tests:** `tests/invariants.spec.js` — the three "INV-2: ..." tests (drawer, chord guide,
candidate piece)

### INV-3: No dead click targets

The converse of INV-2: nothing that JS explicitly relocates into an "always visible" area is
ever left unreachable because it (or something JS forgot to move alongside it) ends up behind
a hidden ancestor. This is exactly the bug class `#chord-guide-reset` had — the `<select>` and
results got moved into `#mobile-always-visible`, but the reset button was left behind inside
`#sandbox-guide`, which then got hidden, orphaning it.

**Test:** `tests/invariants.spec.js` — "INV-3: nothing moved into the always-visible mobile
area is left unreachable by a hidden ancestor"

### INV-4: Audio comes from exactly the notes it claims to

Every sound the app plays corresponds exactly to the Tonnetz note(s) of the cell(s) actually
responsible for it — tapping an empty cell plays that cell's note, picking up a placed piece
plays a chord of precisely that piece's own cells, nothing more or less.

**Tests:** `tests/invariants.spec.js` — the two "INV-4: ..." tests

### INV-5: Audio and visuals stay in sync

When a cell sounds, that exact cell shows visible feedback (the `active-note` class) — not a
neighboring cell, not all of them.

**Test:** `tests/invariants.spec.js` — "INV-5: tapping a cell in Melody mode both sounds its
note AND visibly highlights that exact cell"

### INV-6: Tonnetz translational isomorphism

The lattice is a true Tonnetz: translating by one step along any axis shifts the resulting
MIDI pitch by the same fixed interval everywhere on the lattice, for both the Standard tuning
(p: +7 semitones, q: +3, resultant: -4) and the Gravity tuning (p: -3, q: +4, resultant: +7).

**Test:** `tests/run_tests.js` — "Tonnetz isomorphism tests" (pure logic, no DOM — lives in the
Node unit-test runner rather than Playwright)

### INV-7: Piece geometry validity

Every piece, at every one of its 6 rotations, is a single connected set of cells (no floating
sub-parts), has no overlapping/duplicate cells, and is closed under a full rotation cycle (six
60° rotations return the piece to its original shape).

**Test:** `tests/run_tests.js` — "Piece geometry validity (invariants.md) tests"

### INV-8: Controls maintain edge clearance

Interactive mobile controls never sit flush against the screen edge — real device chrome (iOS
Safari's toolbars, notches, gesture bars) can obscure real estate a flat 0px/10px offset would
assume is clear. (The much larger bottom-edge floor needed for iOS Safari's toolbar has its
own dedicated, more specific test in `tests/mobile.spec.js`.)

**Test:** `tests/invariants.spec.js` — "INV-8: no mobile control button sits within 10px of
the viewport edge"

### INV-9: Game state survives orientation change

Rotating the device mid-game (switching between portrait and landscape) never resets or
corrupts in-progress state — score, placed pieces, snake body, etc. A lot of layout
reshuffling happens on resize (drawer restructuring, board refitting); none of it should touch
game state.

**Tests:** `tests/invariants.spec.js` — the two "INV-9: ..." tests (Snake, Blast)
