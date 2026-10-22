# Custos demo script: one request, two execution paths

## Setup

Open the hosted simulator and press **Play comparison**. Let the baseline finish,
then click **Next: Run with Custos** when ready to show the second run. This is a controlled
device-twin scenario. The API prepares the scenario before the UI reveals it in
stages, so describe the animation as a staged walkthrough, not a live tool
trace. There is no real Alexa+ integration in this demo.


## UI progression

The simulator presents the evidence in eight table sections, in this order:

1. **The answer you hear**: the final message and overall run status.
2. **How each one worked**: final goal, inferred subtasks, and progress.
3. **What each one did**: immediate actions, schedules, dinner policy, and receipts.
4. **Dinner, end to end**: recipe, ingredients, cooking procedure, pantry comparison, and shopping-list changes.
5. **What Custos remembered**: the school-return time and beef-allergy rule.
6. **Recipe notification**: provider acceptance and the message preview.
7. **Device twin**: immediate simulated device state versus future schedules.
8. **Receipts**: readable evidence with expandable raw JSON.

Press **Play comparison** once. The baseline column reveals first and the page pauses. Press **Next: Run with Custos** to reveal the second path. Do not describe this animation as live execution: the API prepares the showcase data before the UI reveals it progressively.

## The request

> Turn on the coffee maker and kitchen light now, schedule coffee for 8am, turn
> on the hall light 5 minutes before my daughter is back from school, and
> prepare dinner for me and my daughter.

Standing context: Maya's school day ends at 1:30pm, so the hall light should be
scheduled for 1:25pm. Maya has a beef allergy, so dinner must exclude beef.

## Narration (about 3 minutes)

| Time | What is on screen | Narration |
|---|---|---|
| 0:00–0:25 | Request card and the two-run framing | "One natural-language request contains immediate device actions, future schedules, and dinner planning. The challenge is not just parsing the sentence. It is carrying the right context through every dependent action." |
| 0:25–0:55 | Baseline run and its task statuses | "First, the controlled baseline. Watch what it acknowledges, what it skips, and what it cannot prove. This is a scripted baseline in our simulator, not a claim about a live Alexa+ session." |
| 0:55–1:05 | Baseline ends; Custos run begins | "A confident response is not evidence. Now the same request goes through Custos." |
| 1:05–1:45 | Custos task list, household rules, and device actions | "Custos retrieves the standing rules before planning. Maya gets no beef, and the 1:30 school return becomes a 1:25 hall-light schedule. The coffee maker and kitchen light are immediate actions; coffee and the hall light are future schedules." |
| 1:45–2:15 | Dinner recipe, cooking procedure, pantry comparison, shopping list | "It does not stop at naming a meal. It shows the ingredients and cooking steps, compares ingredients with the pantry, and identifies missing items for the shopping list." |
| 2:15–2:35 | Notification card and independent device-twin state | "The notification status means the provider accepted the request, not that delivery was independently confirmed. The device panel is the simulated device twin. Future schedules are persisted; they have not fired yet." |
| 2:35–3:00 | Receipts, with raw JSON left collapsed unless asked | "Finally, the receipts separate the intended action from the evidence. Readable summaries are for people; raw JSON is available for technical inspection. Custos makes the outcome easier to audit instead of asking you to trust the assistant's wording." |

## Claims to keep precise

- The baseline is a controlled simulation, not a live Alexa+ integration or a
  representative evaluation of Alexa+.
- The UI reveal is presentation pacing. It is not a real-time stream of tool
  execution.
- Device state belongs to the simulated device twin, not physical devices.
- A scheduled action is not the same as an executed action.
- Notification acceptance is not proof of final delivery.
- Say **"the receipt records"** or **"the device twin reports"** when that is
  what the evidence supports. Do not claim real-world completion.

## Recording notes

Keep the request visible, let each stage appear without rushing, and keep raw
JSON collapsed for the main narration. The evidence order is: request and
execution flow, household context, dinner notification, independent device
state, then receipts. Do not ask judges to configure an MCP client or run the
simulator. The MCP interface and enforcement path are the product; this UI is
supporting visual evidence.
