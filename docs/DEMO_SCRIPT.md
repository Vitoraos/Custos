# Custos demo script: make done mean done

## Setup

Open the simulator at its idle state. The opening screen contains one household request and a **Play comparison** button. It does not show a time-of-day setup or ask the audience to inspect technical details.

The API prepares the showcase data before the interface reveals it in stages. Describe the UI as a staged walkthrough, not a live tool trace. The baseline is scripted and is not a live Alexa+ integration.

## The sales story

1. **Pain:** one household request, with no evidence yet.
2. **Promise:** an assistant should prove what it says it did.
3. **Contrast:** run the scripted baseline first and let its “Done” response land before pointing to the missing evidence.
4. **Proof:** advance to Custos, then inspect device state, household rules, dinner policy, shopping-list changes, and receipts.
5. **Call to action:** “Make done mean done.” End card links to the repository and notes MIT licensing and the README.

## Narration (about 2:50)

| Time | What to do | Narration |
|---|---|---|
| 0:00–0:20 | Leave the opening request card idle. Do not click yet. | “You ask your assistant: start the coffee, turn on the lights, bring the hall light on before my daughter gets home, and plan dinner. It says… ‘Done.’ You walk out the door. But was it?” |
| 0:20–0:35 | Keep the request card still. Pause after “You'd never know.” | “Because ‘done’ is just a word. Maybe the coffee maker never switched on. Maybe nothing was scheduled. Maybe dinner has beef, and your daughter is allergic. You'd find out at six o'clock. And people report assistants saying it's done when it isn't.” |
| 0:35–0:45 | Keep the same screen; let the product promise land before starting. | “So here's the idea. What if your assistant couldn't just say ‘done’, it had to prove it? That's Custos.” |
| 0:45–1:05 | Click **Play comparison**. Let the baseline sequence complete and its spoken summary finish. | “First, how it works today. This is a scripted baseline, not live Alexa+, same request. ‘Done!’ Now look. The device twin reports the state. Coffee: never scheduled. Dinner: never checked for the allergy. And no record of it. You'd never know.” |
| 1:05–1:10 | Click **Next**. | “Now, the same morning, with Custos.” |
| 1:10–1:55 | Let Custos tasks reveal. Scroll slowly only when needed to keep the current task visible. | “Custos remembers your family. Maya has a beef allergy, and school ends at one-thirty. So the hall light is set for one twenty-five, five minutes before she's home. It checks before it acts. The beef tacos? Refused. Lentil stew? Safe, and it adds only the missing ingredients to your shopping list. And it proves what it did. Coffee maker, kitchen light: turned on, then checked. Really on.” |
| 1:55–2:25 | In the proof stage, show device states, dinner decision, then receipts. The receipt section opens by default; open the blocked-recipe receipt if needed. | “And look how honest it is. The hall light is still off, because it's scheduled for later, and Custos says exactly that. The recipe message? Sent, but not confirmed delivered. It only claims what it can prove. Every action leaves a receipt: what it meant to do, what really happened. Here's the beef it blocked. That's your family's paper trail.” |
| 2:25–2:50 | Click **Finish** to show the end card. Leave it on screen. | “Today this runs in a simulated home. But the promise is simple: trust, but verify. Custos is open source and built to plug into your assistant. Your assistant shouldn't just say done. Custos makes done mean done.” |

## Delivery notes

- Pause for one full second after “Done” in the hook and after “You'd never know.”
- Slow down on “Refused”, “Really on”, and “paper trail”.
- Address one parent, not a panel.
- The interface should reveal faster than the narration. Scroll to the relevant result just before naming it.
- The baseline speaks its final summary. Wait for it to finish before pressing **Next**.
- Voice summaries can be muted with the voice control if recording conditions require it.

## Claims to keep precise

- The baseline is a controlled simulation, not a live Alexa+ integration or a representative evaluation of Alexa+.
- The UI reveal is presentation pacing, not a real-time stream of tool execution.
- Device state belongs to the simulated device twin, not physical devices.
- A scheduled action is not the same as an executed action.
- Notification-provider acceptance is not proof of final delivery.
- Say “the receipt records” or “the device twin reports” when that is what the evidence supports.
- The script’s spoken claims must be checked against the returned showcase data before recording. Do not claim a recipe was blocked unless a matching policy decision or receipt exists.

## End card

- Tagline: **Make done mean done.**
- Repository: https://github.com/Vitoraos/Custos
- License: MIT
- Supporting technical detail: **Evidence and architecture in the README.**

The MCP interface and enforcement path are the product. The simulator is supporting visual evidence, not a substitute for a live MCP integration.
