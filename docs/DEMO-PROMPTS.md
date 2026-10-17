# Custos — prompts for the WITH-Custos run

Press **▶ Play demo** first. The WITHOUT-Custos column plays the whole
scripted demo on its own and Custos stays parked until it finishes. Then paste
the lines below into the composer **one at a time, in order** — copy each line
exactly (the app matches it to its scripted beat, re-applies that beat's fault,
and scores both columns' checks).

| # | Beat | Prompt to paste |
|---|------|-----------------|
| 1 | A task both assistants pass | `Turn on the hall light.` |
| 2 | The failure: a cheerful lie | `Turn on the kitchen light.` |
| 3 | The showcase: dinner for 4 | `Plan dinner for 4.` |
| 4 | Show your work | `Why did you pick that?` |

## What to watch for

1. **Turn on the hall light.** — Custos performs the switch, verifies it against
   the device, and only then claims it. Both columns pass this one.
2. **Turn on the kitchen light.** — the device stops acknowledging (fault
   injected). The simulated column says "Done! Kitchen light is on ??" — a
   cheerful lie. Custos reports honestly: unverified, so it never claims
   success.
3. **Plan dinner for 4.** — the remembered peanut allergy blocks the obvious
   pick, ingredient lists come from real recipe data, the pantry is checked,
   and the shopping list write is verified (outside quiet hours you also get
   the ntfy push).
4. **Why did you pick that?** — Custos answers from the receipt log, not from a
   guess.

## Retakes

Pasting any prompt again re-applies that beat's fault, so you can re-record any
line in any order. Off-script prompts still go to Custos only, but the last
scripted beat's fault stays active until you paste a scripted prompt again
(`Turn on the hall light.` clears it).
