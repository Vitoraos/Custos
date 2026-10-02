// Static replay of demo-fixtures.json — no backend, no LLM (spec §7.3 v2).
const $ = (id) => document.getElementById(id);
const SPEED = Number(new URLSearchParams(location.search).get('speed') || 1);
const wait = (ms) => new Promise((r) => setTimeout(r, ms / SPEED));
let fx;

function title(panel, text) {
  const el = document.createElement('div');
  el.className = 'scene-title';
  el.textContent = text;
  $(panel).append(el);
}

function bubble(panel, who, text, badge) {
  const el = document.createElement('div');
  el.className = `bubble ${who}${badge ? ' failed' : ''}`;
  el.textContent = text;
  if (badge) {
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = badge;
    el.append(b);
  }
  $(panel).append(el);
}

function chip(call) {
  const el = document.createElement('div');
  el.className = 'chip';
  const detail =
    call.workflow && call.workflow.verifier_report
      ? ` → ${call.workflow.verifier_report.summary}`
      : call.result_summary
        ? ` → ${call.result_summary}`
        : call.result
          ? ` → ${String(call.result).slice(0, 80)}`
          : '';
  el.textContent = `⚙ ${call.tool}${detail}`;
  el.title = JSON.stringify(call.args);
  $('with').append(el);
}

const speak = (t) =>
  $('voice').checked &&
  'speechSynthesis' in window &&
  speechSynthesis.speak(new SpeechSynthesisUtterance(t));

const showMemory = (name) => {
  $('memory').textContent = JSON.stringify(fx.memory_snapshots[name], null, 2);
};

async function playFailure(scene) {
  title('without', `${scene.id}: ${scene.title} — ${scene.caption}`);
  for (const t of scene.turns) {
    if (t.annotation) continue; // stage direction, not dialogue
    await wait(t.delay_ms);
    bubble('without', t.speaker, t.text, t.badge);
  }
}

async function playSuccess(scene) {
  title('with', `${scene.id}: ${scene.title} — ${scene.caption}`);
  if (scene.clock_jump) bubble('with', 'alexa', `⏩ ${scene.clock_jump}`);
  showMemory(scene.memory_before);
  bubble('with', 'user', scene.user_say);
  for (const call of scene.tool_calls) {
    await wait(call.ui_delay_ms);
    chip(call);
  }
  showMemory(scene.memory_after);
  bubble('with', 'alexa', scene.alexa_response);
  speak(scene.alexa_response);
  await wait(1500);
}

async function main() {
  fx = await (await fetch('./demo-fixtures.json')).json();
  $('play').onclick = async () => {
    $('play').disabled = true;
    for (const s of fx.scenes.without_contextforge) await playFailure(s);
    for (const s of fx.scenes.with_contextforge) await playSuccess(s);
    $('play').disabled = false;
  };
}
main();
