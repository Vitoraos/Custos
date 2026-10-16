import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AssertResult,
  chat,
  loadDemo,
  type SimEvent,
  type TheaterBeat,
  theater,
  theaterAssert,
  theaterFault,
  truth,
} from "./api";
import Column, { type Turn, type UserMsg } from "./components/Column";
import TruthPanel from "./components/TruthPanel";
import type { ToolTrace } from "./verdict";
import { voice } from "./voice";

let nextId = 1;
const nid = (): number => nextId++;

type Col = "forge" | "baseline";

export default function App() {
  const [guestId, setGuestId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [userMsgs, setUserMsgs] = useState<UserMsg[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ground, setGround] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mode, setMode] = useState<"ab" | "forge" | "replay" | "demo">("ab");
  const [replayName, setReplayName] = useState("dinner.json");
  const [speaking, setSpeaking] = useState(false);
  const [beats, setBeats] = useState<TheaterBeat[] | null>(null);
  const [disclaimer, setDisclaimer] = useState("");
  const [beatIndex, setBeatIndex] = useState(0);
  const [asserts, setAsserts] = useState<Record<string, AssertResult[]>>({});
  const [live, setLive] = useState<Record<Col, "idle" | "running" | "done">>({
    forge: "idle",
    baseline: "idle",
  });
  const partial = useRef<Record<Col, string>>({ forge: "", baseline: "" });
  const turnId = useRef<Record<Col, number | null>>({
    forge: null,
    baseline: null,
  });
  const timer = useRef(0);

  const boot = useCallback(async () => {
    setLoadError("");
    try {
      const d = await loadDemo();
      setGuestId(d.guestId);
      setUserMsgs([]);
      setTurns([]);
      partial.current = { forge: "", baseline: "" };
      turnId.current = { forge: null, baseline: null };
      setGround(await truth(d.guestId));
    } catch (e) {
      setLoadError(
        `Could not load the demo household: ${(e as Error).message}. Is the backend running?`,
      );
    }
  }, []);

  // Recording build: no guest flow, the demo household loads itself.
  useEffect(() => {
    void boot();
    const t = window.setInterval(() => setSpeaking(voice.speaking), 500);
    return () => window.clearInterval(t);
  }, [boot]);

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
    if (ev.type === "column_start") {
      setLive((l) => ({ ...l, [ev.col]: "running" }));
      return;
    }
    if (ev.type === "column_done") {
      setLive((l) => ({ ...l, [ev.col]: "done" }));
      return;
    }
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
    setLive({ forge: "idle", baseline: "idle" });
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

  async function ensureBeats(): Promise<TheaterBeat[]> {
    if (beats) return beats;
    const t = await theater();
    setDisclaimer(t.disclaimer);
    setBeats(t.beats);
    return t.beats;
  }

  async function runBeat(i: number) {
    const list = await ensureBeats();
    const beat = list[i];
    if (!beat || busy || !guestId) return;
    setBusy(true);
    setBeatIndex(i);
    try {
      await theaterFault(guestId, beat.id);
      if (beat.input) {
        setUserMsgs((m) => [...m, { id: nid(), text: beat.input as string }]);
        // Left column: scripted fixtures, staggered for readability.
        for (const fx of beat.alexa) {
          await new Promise((res) => setTimeout(res, 350));
          handleEvent({ col: "baseline", ...fx });
        }
        // Right column: always live.
        for await (const ev of chat(guestId, beat.input, ["forge"]))
          handleEvent(ev);
      }
      const left = await theaterAssert(guestId, beat.id, "left");
      const right = await theaterAssert(guestId, beat.id, "right");
      setAsserts((a) => ({
        ...a,
        [`${beat.id}:left`]: left.results,
        [`${beat.id}:right`]: right.results,
      }));
      setGround(await truth(guestId));
      setBeatIndex(Math.min(i + 1, list.length - 1));
    } finally {
      setBusy(false);
    }
  }

  async function restartDemo() {
    setAsserts({});
    setBeatIndex(0);
    await boot();
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
            <option value="demo">Demo</option>
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
          <button
            type="button"
            onClick={() => void boot()}
            disabled={busy || !guestId}
            title="Re-seed the demo household"
          >
            Reset demo data
          </button>
          {mode === "demo" && (
            <>
              <button
                type="button"
                onClick={() => void runBeat(beatIndex)}
                disabled={busy || !beats}
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => void restartDemo()}
                disabled={busy}
              >
                Restart demo
              </button>
            </>
          )}
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
      {loadError ? (
        <section className="panel" role="alert">
          {loadError}
        </section>
      ) : null}
      {!guestId && !loadError ? (
        <section className="start" aria-label="Loading">
          <h1>Custos simulator</h1>
          <p>Loading the demo household…</p>
        </section>
      ) : null}
      {guestId ? (
        <>
          {mode === "demo" && beats ? (
            <section className="panel" aria-label="Demo director">
              <p className="sub">{disclaimer}</p>
              <h2>
                Beat {beatIndex + 1} of {beats.length}:{" "}
                {beats[beatIndex]?.caption}
              </h2>
              <p>{beats[beatIndex]?.narration}</p>
              <div className="chips" aria-hidden="true">
                {beats.map((b, i) => (
                  <span
                    key={b.id}
                    className={`chip${i === beatIndex ? " open" : ""}`}
                  >
                    {i + 1}. {b.caption}
                  </span>
                ))}
              </div>
              {(["left", "right"] as const).map((phase) => {
                const key = `${beats[beatIndex]?.id}:${phase}`;
                const list = asserts[key];
                if (!list) return null;
                return (
                  <div key={phase}>
                    <h3>
                      {phase === "left" ? "Simulated column" : "Custos column"}{" "}
                      checks
                    </h3>
                    <ul>
                      {list.map((r) => (
                        <li key={r.description}>
                          {r.pass ? "✓" : "×"} {r.description}{" "}
                          <span className="sub">({r.detail})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ) : null}
          <div className="cols">
            {show.includes("baseline") && (
              <Column
                name="baseline"
                title="WITHOUT guard + verification"
                sub="memory only, raw acks"
                userMsgs={userMsgs}
                turns={turns.filter((t) => t.col === "baseline")}
                truthDevices={devices}
                stage={live.baseline}
                guestId={guestId}
              />
            )}
            <Column
              name="forge"
              title="WITH Custos"
              sub="guard + verify + receipts"
              userMsgs={userMsgs}
              turns={turns.filter((t) => t.col === "forge")}
              truthDevices={devices}
              stage={live.forge}
              guestId={guestId}
            />
          </div>
          <TruthPanel ground={ground} />
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
        </>
      ) : null}
    </main>
  );
}
