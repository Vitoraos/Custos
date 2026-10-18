# Demo video script (recording takes)

Open the simulator. The demo household loads itself. Press **▶ Play demo**:
the WITHOUT guard + verification column plays the four scripted beats alone —
canned replies, raw writes, no proofs — and its checks are scored beat by beat
against ground truth. When the script ends the house is reset to its starting
state (the transcript and the simulated column's scores stay on screen), and
Custos wakes up. Paste the four prompts from `docs/DEMO-PROMPTS.md` one at a
time; each one runs Custos alone for that beat and scores its checks.

| # | Input | What the audience sees | Narration (~15s) |
|---|---|---|---|
| 1 | *(cold open)* empty Ground Truth | "This assistant remembers nothing." | "Meet Custos — the accountability layer Alexa+ doesn't have." |
| 2 | ▶ **Play demo**, beat 1 | Both columns switch the coffee maker and kitchen light; 2 of 2 checks pass on each side | "A fair fight first: two switches in one sentence. Both assistants get it right — one of them can prove it." |
| 3 | ▶ **Play demo**, beat 2 | Left: "Heating cranked to 30", peanut butter added — 1 of 3. Right: blocked at 26, allergen refused — 5 of 5 | "Three jobs in one breath. The thermostat rule is 18 to 26. Watch which assistant notices." |
| 4 | ▶ **Play demo**, beat 3 | Left: "All set! The house is ready." Ground truth unchanged — 0 of 5 | "Five jobs, one sentence. One says it's handled. Nothing moved." |
| 5 | ▶ **Play demo**, beat 4 | Left: "Done! Hall light is off." — the light is still on; no checks to score | "This one is the whole point: a confident 'done' with nothing behind it." |
| 6 | *(house resets, transcript stays)* | Ground truth back to the starting house | "Same house for both. Now the same four prompts, with Custos." |
| 7 | Paste beat 1 | Two verified writes, receipts | — |
| 8 | Paste beat 2 | Blocked 30 retried at 26, peanut refused with Maya's reason, list write verified | "It tried what you asked, hit the household rule, and corrected itself." |
| 9 | Paste beat 3 | Three verified writes, pantry read, verified list write — 7 of 7 | "Every action read back from the device before it claims anything." |
| 10 | Paste beat 4 | `unverified` — it retries, fails, and says so | "It cannot confirm the switch, so it says exactly that. No silent failure." |
| 11 | *(optional, free chat)* "Forget Maya's peanut allergy." → confirm | Needs confirmation → verified deletion, Ground Truth updates | "Even forgetting a safety rule takes confirmation — then proves it's gone." |
| 12 | *(optional, free chat)* "Remind me in 20 seconds to check the oven." | Real push scheduled (cut to phone buzzing) | "A real phone notification, scheduled and verified." |
| 13 | *(Inspector, 10s)* same `/mcp`, Bearer key, `tools/list` | "Same server, any client — the UI disappears and nothing breaks." | - |
| 14 | *(end card)* benchmark table + URL | "Zero silent failures across fault-injected runs. Try the video link below." | - |

Rows 11–12 are off-script prompts: they run Custos only and score no checks,
so they need live model access (they will not work while the model quota is
exhausted). Manual fallback for any row: `npm run sim:record -- --base <url>
--out <name> -- "<text>"`. Faults stay available in the terminal
(`POST /sim/faults` with a `guestId` from `POST /sim/demo`) — beat 4 injects its
own automatically.

Total ~2:30 with the optional rows. Mute the room — the voice track comes from
the UI itself. 1080p, no Amazon logos, no copyrighted music, burned-in captions.
