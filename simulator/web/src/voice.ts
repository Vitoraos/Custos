// Voice output: Web Speech API behind a tiny interface (Kokoro P2 plugs in here).
export interface Voice {
  speak(text: string): Promise<void>;
  cancel(): void;
  readonly speaking: boolean;
}

class WebSpeechVoice implements Voice {
  private queue: string[] = [];
  private busy = false;
  muted = false;
  get speaking(): boolean {
    return this.busy || window.speechSynthesis.speaking;
  }
  async speak(text: string): Promise<void> {
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
    for (const s of sentences) {
      const t = s.trim();
      if (t) this.queue.push(t);
    }
    return this.drain();
  }
  cancel(): void {
    this.queue = [];
    window.speechSynthesis.cancel();
    this.busy = false;
  }
  private drain(): Promise<void> {
    if (this.busy || this.queue.length === 0 || this.muted) {
      if (this.muted) this.queue = [];
      return Promise.resolve();
    }
    this.busy = true;
    const next = this.queue.shift() as string;
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(next);
      u.onend = () => {
        this.busy = false;
        void this.drain().then(resolve);
      };
      u.onerror = () => {
        this.busy = false;
        void this.drain().then(resolve);
      };
      window.speechSynthesis.speak(u);
    });
  }
}

export const voice = new WebSpeechVoice();
