# Demo video script (recording takes)

Setup: `npm run demo:seed -- --user demo` (or press **Reset demo data** —
same thing). Faults via terminal (no UI surface by design):
`POST /sim/faults` with a `guestId` from `POST /sim/demo`. Record each row
as its own take (`npm run sim:record -- --base <url> --out <name> -- "<text>"`).

| # | Input | What the audience sees | Narration (≈15s) |
|---|---|---|---|
| 1 | *(cold open)* empty Ground Truth | "This assistant remembers nothing." | "Meet Custos — the accountability layer Alexa+ doesn't have." |
| 2 | Reset demo data (button) | Truth fills: 2 rules, devices, list | "One click loads the demo household: vegan, Maya's peanut allergy, five devices." |
| 3 | "Plan dinner for four." | Both consult rules; compliant recipe + excluded reasons | "Dinner for four — checked against real ingredient lists, rejects shown with reasons." |
| 4 | Terminal: `lost_ack p=1` → "Turn on the kitchen light." → back to `none` | Left: "Done!" while Truth stays OFF. Right: retries or admits failure | "Watch the left column lie while the light stays off. Ours either fixes it or tells you." |
| 5 | "Remind me in 20 seconds to check the oven." | Real push scheduled (cut to phone buzzing) | "A real phone notification — scheduled, verified accepted." |
| 6 | "Why did you pick that?" | Receipt: decision, rules checked, observation | "Every action leaves a receipt. Ask why, get the record — not a guess." |
| 7 | "Forget Maya's peanut allergy." → confirm | Needs confirmation → verified deletion, Truth updates | "Even forgetting a safety rule takes confirmation — then proves it's gone." |
| 8 | *(Inspector, 10s)* same `/mcp`, Bearer key, `tools/list` | "Same server, any client — the UI disappears and nothing breaks." | — |
| 9 | *(end card)* benchmark table + URL | "Zero silent failures in 156 fault-injected runs. Try the video link below." | — |

Total ≈2:30. Mute the room — the voice track comes from the UI itself. 1080p,
no Amazon logos, no copyrighted music, burned-in captions.
