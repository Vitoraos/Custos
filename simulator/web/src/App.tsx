import { useEffect, useRef, useState } from "react";
import { chat, issueGuest, setFaults, truth, type SimEvent } from "./api";
import { voice } from "./voice";

interface Msg {
  who: "you" | "asst";
  col?: "forge" | "baseline";
  text: string;
}
interface ToolChip {
  col: "forge" | "baseline";
  name: string;
  args?: unknown;
  outcome?: string;
  say?: string;
  open?: boolean;
}

const SCENARIOS = [
  "I'm vegan and my daughter Maya is allergic to peanuts. Remember that.",
  "Plan dinner for four.",
  "Turn on the kitchen light.",
  "Remind me in 20 seconds to check the oven.",
  "Why did you pick that?",
  "Forget Maya's peanut allergy.",
  "What's in the news?",
  "Turn on the hall light.",
];
const FAULTS = ["none", "lost_ack:30%", "delayed:2s", "offline:20%", "flaky"];

function faultParams(f: string): { profile: string; params: Record<string, unknown> } {
  const [profile, arg] = f.split(":");
  if (profile === "lost_ack") return { profile, params: { p: 0.3, seed: Date.now() % 100000 } };
  if (profile === "delayed") return { profile, params: { ms: 2000 } };
  if (profile === "offline") return { profile, params: { p: 0.2, seed: Date.now() % 100000 } };
  if (profile === "flaky") return { profile, params: { seed: Date.now() % 100000 } };
  void arg;
  return { profile: "none", params: {} };
}

export default function App() {
  const [guestId, setGuestId] = useState("");
  const [started, setStarted] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chips, setChips] = useState<ToolChip[]>([]);
  const [ground, setGround] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fault, setFault] = useState("none");
  const [mode, setMode] = useState<"ab" | "forge" | "replay">("ab");
  const [replayName, setReplayName] = useState("dinner-ab.json");
  const [speaking, setSpeaking] = useState(false);
  const partial = useRef<{ forge: string; baseline: string }>({ forge: "", baseline: "" });
  const timer = useRef(0);

  useEffect(() => {
    if (!guestId) return;
    window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      try {
        setGround(await truth(guestId));
      } catch {
        // server away; keep last truth
      }
    }, 1000);
    return () => window.clearInterval(timer.current);
  }, [guestId]);

  useEffect(() => {
    const t = window.setInterval(() => setSpeaking(voice.speaking), 500);
    return () => window.clearInterval(t);
  }, []);

  async function start() {
    const g = await issueGuest();
    setGuestId(g.guestId);
    setStarted(true);
  }

  function handleEvent(ev: SimEvent) {
    if (mode === "forge" && ev.col === "baseline") return;
    if (ev.type === "token") {
      partial.current[ev.col] += ev.text ?? "";
      setMsgs((m) => {
        const last = m[m.length - 1];
        if (last && last.who === "asst" && last.col === ev.col && !last.text.endsWith(".")) {
          return [...m.slice(0, -1), { ...last, text: partial.current[ev.col] }];
        }
        return [...m, { who: "asst", col: ev.col, text: partial.current[ev.col] }];
      });
    } else if (ev.type === "tool_call") {
      setChips((c) => [...c, { col: ev.col, name: ev.name ?? "?", args: ev.args }]);
    } else if (ev.type === "tool_result") {
      setChips((c) => {
        const i = [...c].map((x) => x.col).lastIndexOf(ev.col);
        if (i < 0) return c;
        const next = [...c];
        next[i] = { ...next[i], outcome: ev.outcome, say: ev.say };
        return next;
      });
    } else if (ev.type === "final" && ev.text) {
      partial.current[ev.col] = "";
      setMsgs((m) => [...m.filter((x) => !(x.who === "asst" && x.col === ev.col && !x.text.endsWith("."))), { who: "asst", col: ev.col, text: ev.text as string }]);
      if (!muted) void voice.speak(ev.text);
    } else if (ev.type === "error") {
      setMsgs((m) => [...m, { who: "asst", col: ev.col, text: `Error: ${ev.text}` }]);
    }
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy || !guestId) return;
    setBusy(true);
    setMsgs((m) => [...m, { who: "you", text: t }]);
    setInput("");
    try {
      for await (const ev of chat(guestId, t)) handleEvent(ev);
    } finally {
      setBusy(false);
      try {
        setGround(await truth(guestId));
      } catch {
        // ignore
      }
    }
  }

  async function playReplay() {
    setBusy(true);
    try {
      const r = await fetch(`/replays/${replayName}`);
      if (!r.ok) throw new Error("no such replay");
      const events = (await r.json()) as { at: number; ev: SimEvent }[];
      const t0 = Date.now();
      for (const { at, ev } of events) {
        const wait = t0 + at - Date.now();
        if (wait > 0) await new Promise((res) => setTimeout(res, wait));
        handleEvent(ev);
      }
    } catch {
      setMsgs((m) => [...m, { who: "asst", text: "No recording found. Record one with npm run sim:record when the model is available." }]);
    } finally {
      setBusy(false);
    }
  }

  async function changeFault(f: string) {
    setFault(f);
    if (!guestId) return;
    const { profile, params } = faultParams(f);
    await setFaults(guestId, profile, params);
  }

  if (!started) {
    return (
      <main className="start">
        <h1>Simulated voice assistant</h1>
        <p>Text in, agent works, voice out. One input feeds two columns: without and with ContextForge.</p>
        <button type="button" onClick={start}>Start</button>
      </main>
    );
  }

  const col = (name: "forge" | "baseline", title: string, sub: string) => (
    <section className="panel">
      <h2>{title}<span className="sub">{sub}</span></h2>
      <div className="feed">
        {msgs.filter((m) => !m.col || m.col === name).map((m, i) => (
          <div key={i} className={`bubble ${m.who}`}>{m.who === "you" ? "you: " : "asst: "}{m.text}</div>
        ))}
      </div>
      <div className="chips">
        {chips.filter((c) => c.col === name).map((c, i) => (
          <button type="button" key={i} className="chip" onClick={() => setChips((all) => all.map((x, j) => (j === i ? { ...x, open: !x.open } : x)))}>
            ⚙ {c.name}{c.outcome ? ` → ${c.outcome}` : ""}{c.open ? <pre>{JSON.stringify({ args: c.args, say: c.say }, null, 1)}</pre> : null}
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <main>
      <header>
        <h1>Simulated voice assistant{speaking ? <span className="-speaking"> ● speaking</span> : null}</h1>
        <div className="controls">
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="ab">A/B</option>
            <option value="forge">Forge only</option>
            <option value="replay">Replay</option>
          </select>
          <button type="button" onClick={() => { setMuted(!muted); if (!muted) voice.cancel(); }}>{muted ? "🔇 muted" : "🔊 voice"}</button>
          <select value={fault} onChange={(e) => void changeFault(e.target.value)}>
            {FAULTS.map((f) => <option key={f} value={f}>chaos: {f}</option>)}
          </select>
          {mode === "replay" && (
            <>
              <input value={replayName} onChange={(e) => setReplayName(e.target.value)} size={18} />
              <button type="button" onClick={() => void playReplay()} disabled={busy}>Play</button>
            </>
          )}
        </div>
      </header>
      <div className="cols">
        {col("baseline", "WITHOUT guard + verification", "memory only, raw acks")}
        {col("forge", "WITH ContextForge", "guard + verify + receipts")}
      </div>
      <section className="panel truth">
        <h2>GROUND TRUTH <span className="sub">independent of the assistants</span></h2>
        <pre>{JSON.stringify(ground, null, 1)}</pre>
      </section>
      <div className="scenarios">
        {SCENARIOS.map((s) => <button type="button" key={s} onClick={() => void send(s)} disabled={busy}>{s}</button>)}
      </div>
      <form className="input" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="type a request…" />
        <button type="submit" disabled={busy}>Send</button>
      </form>
    </main>
  );
}
