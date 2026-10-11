import { useEffect, useRef, useState } from "react";
import { chat, issueGuest, type SimEvent, setFaults, truth } from "./api";
import Column, { type Turn, type UserMsg } from "./components/Column";
import TruthPanel from "./components/TruthPanel";
import type { ToolTrace } from "./verdict";
import { voice } from "./voice";

let nextId = 1;
const nid = (): number => nextId++;

const SCENARIOS: { label: string; text: string }[] = [
  {
    label: "Vegan + allergy",
    text: "I'm vegan and my daughter Maya is allergic to peanuts. Remember that.",
  },
  { label: "Dinner ×4", text: "Plan dinner for four." },
  { label: "Kitchen light", text: "Turn on the kitchen light." },
  {
    label: "Oven reminder",
    text: "Remind me in 20 seconds to check the oven.",
  },
  { label: "Why?", text: "Why did you pick that?" },
  { label: "Forget allergy", text: "Forget Maya's peanut allergy." },
  { label: "News", text: "What's in the news?" },
  { label: "Hall light", text: "Turn on the hall light." },
];
const FAULTS = ["none", "lost_ack:30%", "delayed:2s", "offline:20%", "flaky"];

function faultParams(f: string): {
  profile: string;
  params: Record<string, unknown>;
} {
  const [profile] = f.split(":");
  if (profile === "lost_ack")
    return { profile, params: { p: 0.3, seed: Date.now() % 100000 } };
  if (profile === "delayed") return { profile, params: { ms: 2000 } };
  if (profile === "offline")
    return { profile, params: { p: 0.2, seed: Date.now() % 100000 } };
  if (profile === "flaky")
    return { profile, params: { seed: Date.now() % 100000 } };
  return { profile: "none", params: {} };
}

type Col = "forge" | "baseline";

export default function App() {
  const [guestId, setGuestId] = useState("");
  const [started, setStarted] = useState(false);
  const [userMsgs, setUserMsgs] = useState<UserMsg[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ground, setGround] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fault, setFault] = useState("none");
  const [mode, setMode] = useState<"ab" | "forge" | "replay">("ab");
  const [replayName, setReplayName] = useState("dinner.json");
  const [speaking, setSpeaking] = useState(false);
  const partial = useRef<Record<Col, string>>({ forge: "", baseline: "" });
  const turnId = useRef<Record<Col, number | null>>({
    forge: null,
    baseline: null,
  });
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

  function ensureTurn(col: Col): number {
    if (turnId.current[col] == null) {
      const id = nid();
      turnId.current[col] = id;
      setTurns((ts) => [
        ...ts,
        { id, col, text: "", traces: [], finished: false },
      ]);
    }
    return turnId.current[col] as number;
  }

  function patchTurn(id: number, fn: (t: Turn) => Turn) {
    setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
  }

  function handleEvent(ev: SimEvent) {
    if (mode === "forge" && ev.col === "baseline") return;
    if (ev.type === "token") {
      partial.current[ev.col] += ev.text ?? "";
      const id = ensureTurn(ev.col);
      const text = partial.current[ev.col];
      patchTurn(id, (t) => ({ ...t, text }));
    } else if (ev.type === "tool_call") {
      const id = ensureTurn(ev.col);
      const trace: ToolTrace = {
        name: ev.name ?? "?",
        args: ev.args,
        done: false,
      };
      patchTurn(id, (t) => ({ ...t, traces: [...t.traces, trace] }));
    } else if (ev.type === "tool_result") {
      const id = ensureTurn(ev.col);
      patchTurn(id, (t) => {
        const traces = [...t.traces];
        const i = traces.map((x) => x.name).lastIndexOf(ev.name ?? "");
        const idx = i >= 0 ? i : traces.length - 1;
        if (idx < 0) {
          traces.push({
            name: ev.name ?? "?",
            outcome: ev.outcome,
            say: ev.say,
            done: true,
          });
        } else {
          traces[idx] = {
            ...traces[idx],
            outcome: ev.outcome,
            say: ev.say,
            done: true,
          };
        }
        return { ...t, traces };
      });
    } else if (ev.type === "final" && ev.text) {
      const id = ensureTurn(ev.col);
      partial.current[ev.col] = "";
      turnId.current[ev.col] = null;
      patchTurn(id, (t) => ({ ...t, text: ev.text as string, finished: true }));
      if (!muted) void voice.speak(ev.text);
    } else if (ev.type === "error") {
      const id = ensureTurn(ev.col);
      turnId.current[ev.col] = null;
      patchTurn(id, (t) => ({
        ...t,
        text: `Error: ${ev.text}`,
        finished: true,
      }));
    }
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy || !guestId) return;
    setBusy(true);
    setUserMsgs((m) => [...m, { id: nid(), text: t }]);
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
      setUserMsgs((m) => [...m, { id: nid(), text: "replay failed to load" }]);
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
        <h1>Custos simulator</h1>
        <p>
          Text in, agent works, voice out. One input feeds two columns: without
          and with Custos guard + verification.
        </p>
        <button type="button" onClick={start}>
          Start
        </button>
      </main>
    );
  }

  const devices = (ground.devices as Record<string, unknown> | undefined) ?? {};
  const show: Col[] = mode === "forge" ? ["forge"] : ["forge", "baseline"];

  return (
    <main>
      <header className="app">
        <h1>
          Custos simulator
          {speaking ? <span className="speaking"> ● speaking</span> : null}
        </h1>
        <div className="controls">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            aria-label="Mode"
          >
            <option value="ab">A/B</option>
            <option value="forge">Custos only</option>
            <option value="replay">Replay</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setMuted(!muted);
              if (!muted) voice.cancel();
            }}
          >
            {muted ? "🔇 muted" : "🔊 voice"}
          </button>
          <select
            value={fault}
            onChange={(e) => void changeFault(e.target.value)}
            aria-label="Chaos"
          >
            {FAULTS.map((f) => (
              <option key={f} value={f}>
                chaos: {f}
              </option>
            ))}
          </select>
          {mode === "replay" && (
            <>
              <input
                value={replayName}
                onChange={(e) => setReplayName(e.target.value)}
                size={18}
                aria-label="Replay file"
              />
              <button
                type="button"
                onClick={() => void playReplay()}
                disabled={busy}
              >
                Play
              </button>
            </>
          )}
        </div>
      </header>
      <div className="cols">
        {show.includes("baseline") && (
          <Column
            name="baseline"
            title="WITHOUT guard + verification"
            sub="memory only, raw acks"
            userMsgs={mode === "forge" ? [] : userMsgs}
            turns={turns.filter((t) => t.col === "baseline")}
            truthDevices={devices}
          />
        )}
        <Column
          name="forge"
          title="WITH Custos"
          sub="guard + verify + receipts"
          userMsgs={userMsgs}
          turns={turns.filter((t) => t.col === "forge")}
          truthDevices={devices}
        />
      </div>
      <TruthPanel ground={ground} />
      <div className="scenarios">
        {SCENARIOS.map((s) => (
          <button
            type="button"
            key={s.label}
            title={s.text}
            onClick={() => void send(s.text)}
            disabled={busy}
          >
            {s.label}
          </button>
        ))}
      </div>
      <form
        className="input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="type a request…"
          aria-label="Message"
        />
        <button type="submit" disabled={busy}>
          Send
        </button>
      </form>
    </main>
  );
}
