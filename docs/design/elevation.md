# Depth & Elevation Design System

**Status:** Approved (April 2026)
**Scope:** Mobile home screen — opt-in via utility classes. NOT yet rolled
out globally to shadcn primitives, desktop sidebar, or modals.

A short reference for the elevation language we landed on so future work
(and future agents) can match the existing visual treatment exactly.

---

## 1. Goals

1. Give cards a clear "lifted from page" feel without heavy borders.
2. Make the active bottom-nav tab read as a floating, physical object.
3. Honor `prefers-reduced-motion` so the morph effect respects a11y.
4. Work in both light and dark mode — including dark mode, where naive
   black-on-near-black shadows are invisible.

---

## 2. Tokens

Defined in `client/src/index.css` under `:root` (light) and `.dark`.

```css
/* Light */
--elev-rest: 0 1px 2px 0 hsl(0 0% 0% / 0.10),
             0 6px 16px -2px hsl(0 0% 0% / 0.14);
--elev-lift: 0 6px 12px -2px hsl(0 0% 0% / 0.20),
             0 18px 36px -8px hsl(0 0% 0% / 0.30);
--hairline:  0 0% 0% / 0.08;

/* Dark — soft WHITE halo, not black */
--elev-rest: 0 1px 2px 0 hsl(0 0% 100% / 0.12),
             0 8px 22px -2px hsl(0 0% 100% / 0.22);
--elev-lift: 0 8px 18px -2px hsl(0 0% 100% / 0.28),
             0 24px 48px -8px hsl(0 0% 100% / 0.34);
--hairline:  0 0% 100% / 0.18;

/* Sunken / inset (inputs, recessed surfaces) */
/* Light: dark inset, classic "pressed in" look */
--elev-inset: inset 0 2px 4px 0 hsl(0 0% 0% / 0.10),
              inset 0 1px 2px 0 hsl(0 0% 0% / 0.06);
/* Dark: bright top rim (suggests surrounding surface is higher)
   plus a soft inner darken */
--elev-inset: inset 0 1px 0 0 hsl(0 0% 100% / 0.16),
              inset 0 3px 8px -1px hsl(0 0% 0% / 0.45);
```

### Why white halos in dark mode?
Black shadows on a near-black background do nothing — your eye can't
detect the contrast. Inverting to a low-alpha white shadow simulates a
"rim light" and reads as elevation. Alphas are tuned so it's clearly
visible without looking ghostly.

---

## 3. Utilities

```css
.elev-rest  { box-shadow: var(--elev-rest); }
.elev-lift  { box-shadow: var(--elev-lift); }
.elev-inset { box-shadow: var(--elev-inset); }
.hairline   { border: 1px solid; border-color: hsl(var(--hairline)); }
```

### Usage rule of thumb
- **Card at rest:** `hairline elev-rest`
- **Floating / active element:** `hairline elev-lift` (or just
  `elev-lift` if a hairline border isn't appropriate).
- **Replace** existing `border border-border` with `hairline` when
  adopting — they conflict otherwise (double border).
- **Colored/semantic borders (e.g. payment-card green):** keep the
  colored border, just add `elev-rest`/`elev-lift`. Don't replace
  semantic color with `hairline`.
- **Filled/colored backgrounds (e.g. chat bubbles):** add `elev-rest`
  only — skip `hairline` so the colored fill isn't outlined.

### Nesting (UPDATED — was previously "outermost only")
Per user direction (Apr 2026), elevation IS applied to nested cards as
well as outermost ones. Nested cards inside an already-elevated card
should still receive `elev-rest`. Examples:
- Poll cards rendered inside a chat thread: elevated
- Message bubbles: elevated (with `elev-rest` only, no hairline)
- File preview chips inside the composer: elevated
- Poll/payment-request creator panels inside the composer: elevated

The earlier "don't stack shadows" guideline has been retired. If a
nested elevation looks visually noisy in a future surface, prefer
tuning the token alphas globally rather than reintroducing per-element
exclusions.

---

## 4. Active Bottom-Nav Tab

The active tab is a circular "pill" lifted out of the bar using
`--elev-lift`. It morphs between tabs via framer-motion:

```tsx
<LayoutGroup>
  {tabs.map(t => (
    <button key={t.id}>
      {isActive && (
        <motion.div
          layoutId="active-nav-pill"
          transition={{ type: 'spring', stiffness: 520, damping: 30, mass: 0.9 }}
          className="elev-lift ..."
        />
      )}
    </button>
  ))}
</LayoutGroup>
```

- Inner icon springs in separately (600 / 28 / 0.6, delay 0.05) so the
  icon swap reads as the pill changing identity mid-flight.
- Centering uses inline `left:50% + marginLeft:-24px` (NOT
  `-translate-x-1/2`) so framer-motion's layout transform doesn't
  compose with our centering transform.
- App is wrapped in `<MotionConfig reducedMotion="user">` so the OS
  reduce-motion setting hard-cuts the morph instead of animating it.

---

## 5. Themed Accent Glow

Pulsing-glow effects (`.alerts-glow` on the team selector,
`.bracket-glow` on tournament cards) all use the theme's primary blue
`rgb(59, 130, 246)`. Avoid red glow — it reads as an error state.

`.alerts-glow` is conditionally applied: it only fires when a context
*other than* the currently-selected one has unreviewed alerts. It's a
"switch contexts to see this" cue, not a generic notification badge.

---

## 6. Currently Applied To

- `client/src/pages/Dashboard.tsx` — all 13 mobile home cards
  (selector, 4-grid, tournament focus, Games Left, Alerts,
  Scorekeeper, loading, approved scrimmages, bracket-glow, game,
  empty, etc.)
- `client/src/components/BottomNavigation.tsx` — the floating active
  tab pill + framer-motion morph
- `client/src/components/dashboard/ScheduleCalendarMobile.tsx` — the
  mobile month-grid calendar container

## 7. Intentionally NOT Applied (yet)

Tracked for a future broader rollout:

- Shared shadcn primitives (`Card`, `Input`, `Textarea`, `Select`,
  modals/dialogs)
- Desktop sidebar / DesktopAppShell

(Inner/nested cards used to be on this list. They are no longer
excluded — see section 3 "Nesting".)

---

## 8. Tuning Notes

If the effect needs to be stronger or softer in the future, change the
**tokens** in `index.css` — never hard-code shadow values on individual
elements. Everything downstream picks up the change automatically.

Recent tuning history for context:
1. Initial pass: light shadows, very subtle.
2. Round 2: bumped intensities ~2× across both modes.
3. Round 3 (dark mode): switched from black to white halos so dark
   mode actually showed elevation; then bumped white-halo alphas
   ~2.5× because the first pass was too faint.
