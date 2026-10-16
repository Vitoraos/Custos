# Custos UI Design Plan

> **Status:** Design specification only. This file guides the UI redesign; it does not claim that the redesign has been implemented.
> **Scope:** The one-page simulator interface in `simulator/web/`. The MCP server remains the product. The UI is a development, evaluation, and explanatory surface.

## 1. Purpose and product hierarchy

Custos is an MCP enforcement layer that applies standing rules, verifies actions against observed state, and records an auditable receipt. The simulator helps developers inspect that behavior. It is not the product itself, and it is not evidence of a completed Alexa+ integration.

The interface should make the enforcement story understandable at a glance:

**Request → Policy decision → Action → Observed state → Receipt**

The main UI job is to help a reviewer understand the difference between an unguarded baseline and Custos, and to inspect the evidence behind the result. It should not look like a generic AI chat app or require judges to operate a live demo.

### Non-goals

- Do not move policy or business logic into the frontend.
- Do not build an admin dashboard, mobile app, or a second product surface.
- Do not imply that simulated devices are physical devices.
- Do not imply that the simulator agent is a validated Alexa+ client.
- Do not add decorative charts, metrics, or cards without a clear evaluation purpose.

## 2. Design direction

### Brand idea: the evidence trail

The visual concept is **quiet authority**: legible, restrained, accountable, and technically credible. Use a subtle line/trace motif to connect request, decision, action, observation, and receipt. The evidence should be visually prominent; decoration should not compete with it.

Avoid:
- Purple gradients, glassmorphism, neon, and generic “AI glow”.
- Stock shield/lock imagery or Amazon/Alexa marks.
- Too many rounded cards, excessive shadows, oversized headings, and gratuitous animation.
- Using color alone to communicate verified, blocked, warning, or unknown outcomes.

Prefer:
- A neutral canvas, white or near-white surfaces, dark ink, muted secondary text, thin borders, and one restrained forest-green brand accent.
- A clear type hierarchy, disciplined alignment, and whitespace used to group related information.
- Dense technical details presented in a readable, inspectable way rather than hidden behind decorative panels.

## 3. Colour system

Start with a neutral-first palette. The values below are **initial candidates**, not approved tokens; test actual combinations in the implemented UI and verify contrast before shipping.

| Token | Candidate | Intended use |
|---|---|---|
| Canvas | `#F7F7F4` | Main page background |
| Surface | `#FFFFFF` | Primary content surfaces |
| Ink | `#202522` | Primary text |
| Muted text | `#626B65` | Supporting labels and metadata |
| Border | `#DDE2DC` | Dividers, outlines, panel boundaries |
| Brand | `#426B55` | Primary action, focus accents, selected states |

Define semantic tokens separately from brand color:
- **Verified:** success state with icon/label and restrained color.
- **Blocked:** clear refusal state with icon/label and concise reason.
- **Warning / partial:** action or result needs attention.
- **Unverified / unknown:** explicit lack of evidence; never style this as success.
- **Neutral / running:** processing, pending, or informational state.

Rules:
1. Keep status colors consistent throughout the app.
2. Pair every meaningful status color with text and/or an icon.
3. Test text contrast to WCAG AA: at least 4.5:1 for normal text and 3:1 for large text. Check meaningful non-text boundaries and focus indicators too.
4. Check the UI in grayscale and with color-vision simulation.
5. Do not add a dark theme unless it can be tested and maintained intentionally.

## 4. Typography

- Evaluate **Inter** or **Geist Sans** for the interface; choose one, not both.
- Use a system fallback stack so text remains usable if the preferred font fails to load.
- Use a compact, predictable type scale. Page titles should not overpower the evidence.
- Reserve monospace for tool names, IDs, timestamps, structured values, and raw evidence.
- Use comfortable line-height for explanatory text and avoid tiny low-contrast labels.
- Prefer sentence case and direct labels over decorative uppercase labels.

Typography must help users distinguish the request, outcome, explanation, and raw data without having to infer hierarchy from color alone.

## 5. Spacing, alignment, and surfaces

Use a consistent spacing scale:

`4, 8, 12, 16, 24, 32, 48px`

Guidelines:
- Align panel edges, headings, labels, and actions to a deliberate page grid.
- Use 16–24px for most internal panel spacing and larger gaps between major sections.
- Group related content with spacing first; use borders when a boundary genuinely helps.
- Establish a small radius vocabulary and apply it consistently.
- Use shadows sparingly. Prefer contrast and thin borders over stacked floating cards.
- Avoid one-off margins that make the page feel assembled from unrelated components.
- Keep control heights and interactive hit areas consistent.

Start in grayscale before tuning brand colors. This reveals whether the layout and hierarchy work without relying on visual decoration.

## 6. Information architecture and layout

### Header

- Keep the Custos identity and purpose compact.
- Label the environment prominently as **“Simulator · simulated devices”**.
- Put mode, voice, reset, and replay controls in a predictable secondary control area.
- Do not make simulator controls look like part of the MCP product API.

### Request composer

- Make the user request the clearest input on the page.
- Provide a small set of representative scenario shortcuts only if they improve evaluation speed.
- Show loading, failure, and disabled states clearly.
- Keep voice controls understandable, with captions always visible when speech is used.

### Baseline vs Custos comparison

- One request must feed both conditions.
- Keep the comparison columns equal in width on desktop and use the same prompt, model, and fault seed. The server mode is the intended variable.
- Make the difference between **Baseline** and **Custos** explicit.
- On narrow screens, stack the results with **Custos first**, followed by the baseline.
- Do not rely on color alone to distinguish the two outcomes.

### Action trace and evidence

The action trace should show the sequence of events in plain language:
1. Request received.
2. Relevant rules checked.
3. Policy decision and reasons.
4. Tool/action attempted.
5. Verification attempt and observed result.
6. Receipt identifier and summary.

Make **Observed state** and **Receipt** high-priority sections, not footnotes. The user needs to see what the adapter actually reported and whether that matches the intended state.

- Render concise summaries by default.
- Allow raw structured JSON to be expanded when needed.
- Keep tool names, timestamps, IDs, and raw values aligned and easy to scan.
- Distinguish expected state from observed state.
- If verification failed or was not possible, say so explicitly.

### Simulator-only controls

Fault injection controls are secondary to the main comparison. Group them in a clearly labelled area with a visible **“Simulator only”** label. They must not appear to be real household controls or MCP tools available to external clients.

### Replay mode

If replay exists:
- Label it **“Recorded replay”**.
- State that devices are simulated.
- Do not present recorded results as live runs.
- Keep replay controls separate from live execution controls.

## 7. Interaction and accessibility

- All controls must work with keyboard navigation.
- Provide visible focus states.
- Use semantic HTML and accessible names for controls.
- Announce meaningful async state changes to assistive technology where appropriate.
- Respect reduced-motion preferences; animation must not carry essential information.
- Preserve captions even when voice output is muted.
- Provide useful empty, loading, error, blocked, and unverified states.
- Avoid changing layout unpredictably when results stream in.
- Make the distinction between “action attempted”, “action verified”, and “action unverified” explicit in both text and structure.

## 8. Responsive behavior

Test at minimum:
- Wide desktop: full side-by-side comparison.
- Laptop/tablet: tighter spacing without clipping evidence.
- Mobile-width viewport: stacked comparison, usable controls, no horizontal scrolling.

The evidence panel should retain its hierarchy at every size. Raw JSON may wrap or scroll within its own region, but it must not force the whole page wider than the viewport.

## 9. Design tokens and implementation boundaries

- Use `simulator/web/src/theme.css` as the single source of truth for shared design tokens if that file remains the project’s theme entry point.
- Define semantic CSS variables for canvas, surfaces, text, borders, brand, focus, and status colors.
- Reuse existing components where they are sound; do not rewrite the application architecture for a visual redesign.
- Keep UI presentation separate from server policy, verification, and receipt logic.
- Do not introduce a large component library just to achieve this visual direction.
- Avoid duplicate hard-coded colors and spacing values across components.

Before editing, inspect the actual frontend structure and existing styling system. If the paths or framework have changed, update this plan to match reality rather than creating parallel theme files.

## 10. Implementation sequence

### Phase A: inspect and baseline
- [ ] Inspect the current `simulator/web/` component tree, styles, and theme entry point.
- [ ] Identify existing working behavior and protect it from accidental redesign regressions.
- [ ] Capture desktop and mobile screenshots of the current interface.
- [ ] Record the current color, font, spacing, and component patterns.

### Phase B: foundation
- [ ] Establish semantic design tokens and a consistent spacing/radius scale.
- [ ] Choose one interface font after checking loading and fallback behavior.
- [ ] Verify contrast for actual foreground/background pairs.
- [ ] Create or refine shared styles for buttons, inputs, labels, panels, badges, and focus states.

### Phase C: page hierarchy
- [ ] Redesign the header and simulator disclosure.
- [ ] Improve the request composer and its async states.
- [ ] Build a clear, balanced desktop comparison and responsive stacked layout.
- [ ] Improve action trace, observed state, and receipt hierarchy.
- [ ] Visually subordinate and label simulator-only fault controls.
- [ ] Make replay/live states unmistakable if both modes exist.

### Phase D: validation
- [ ] Compare before/after screenshots at desktop and mobile sizes.
- [ ] Check keyboard navigation and visible focus.
- [ ] Test grayscale and color-vision simulation.
- [ ] Test empty, loading, success, blocked, unverified, and error states.
- [ ] Confirm the same request still drives both comparison conditions.
- [ ] Run the project’s available typecheck, lint, and tests.
- [ ] Check that no UI copy implies real devices or a validated Alexa+ integration.

## 11. Acceptance criteria

The redesign is complete only when:
- A new reviewer can identify Custos, the simulator, and the simulated-device limitation quickly.
- The request and baseline/Custos comparison are the primary visual focus.
- The evidence trail is understandable without opening raw JSON.
- Observed state and receipt are prominent and clearly distinguish expected from observed behavior.
- Verified, blocked, warning, and unverified outcomes remain distinguishable without color.
- Desktop and mobile layouts work without clipping or horizontal page scrolling.
- Text and controls meet accessibility checks, including contrast and keyboard focus.
- The redesign preserves existing simulator behavior and does not move business logic into the frontend.
- No copy or visual treatment suggests that the Alexa+ add-on integration has been completed or validated.

## 12. Design research and references

Use these as learning material and reference points, not as templates to copy blindly. The guidance here reflects the principles worth applying to Custos, not a claim that every linked video was fully reviewed frame by frame.

### Visual hierarchy and practical UI design
- [Steve Schoger / Refactoring UI](https://refactoringui.com/) — hierarchy, spacing, typography, practical interface refinement.
- [Steve Schoger: Refactoring UI and WP Pusher checkout redesign search](https://www.youtube.com/results?search_query=Steve+Schoger+Refactoring+UI+WP+Pusher+checkout) — reducing visual noise and improving checkout hierarchy.
- [Steve Schoger: How to Think Like a Visual Designer](https://www.youtube.com/results?search_query=Steve+Schoger+How+to+Think+Like+a+Visual+Designer) — visual hierarchy and purposeful styling.

### Layout and spacing
- [Flux Academy: Perfect Spacing for Web Designers](https://www.classcentral.com/course/youtube-perfect-spacing-for-web-designers-306869) — use spacing to group information and establish rhythm. Replace this link with the specific course page if the resource moves.
- [Envato Tuts+: Creating a Figma Design System: Typography, Spacing and Sizing](https://www.classcentral.com/course/youtube-creating-a-figma-design-system-typography-spacing-and-sizing-136436) — consistent scales instead of arbitrary values.
- [DesignCourse: How to Use Figma for UI/UX Design in 2025](https://www.youtube.com/watch?v=cvm_ECH94x4) — practical workflow and UI composition.
- [Figma Design for Beginners (2025)](https://help.figma.com/hc/en-us/articles/30848209492887-Course-overview-Figma-Design-for-beginners-2025) — fundamentals and design workflow.

### Brand and accessibility
- [Google Design: Staying True to Your Identity, Material Branding](https://design.google/library/staying-true-to-your-identity-material-branding) — brand expression within a consistent system.
- [Google Design: Brand New](https://design.google/library/brand-new) — define brand goals before exploring visual directions.
- [Google Design: YouTube’s New Hue](https://design.google/library/youtube-new-red-color) — deliberate use of brand color across an interface.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) — accessibility requirements, including contrast and keyboard operation.

**Research rule:** borrow principles, not screenshots. Any palette, font, or layout remains a hypothesis until checked in Custos itself. The final UI must be judged in context with actual evidence states, not on a standalone mockup.
