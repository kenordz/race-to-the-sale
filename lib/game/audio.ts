// Small Web Audio helpers. No long-lived AudioContext — each cue creates
// and closes its own so we never have to manage suspended-context state.

/**
 * Urgent triple-pulse on a low A (440/440/523) for "a lead just opened up
 * for stealing" — reads as alarm, not chime. Same no-op behavior pre-gesture.
 */
export function playStealAlert() {
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtor();
    const play = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + startOffset;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.08, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      osc.start(t0);
      osc.stop(t0 + duration);
    };
    play(440, 0, 0.12);
    play(440, 0.16, 0.12);
    play(523, 0.32, 0.2);
    setTimeout(() => {
      void ctx.close();
    }, 700);
  } catch (err) {
    console.warn("[steal alert] suppressed:", err);
  }
}

/**
 * Ascending double-chime (C6 → E6) for "new lead just landed".
 * Silently no-ops on browsers that block audio before a user gesture.
 */
export function playLeadBeep() {
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtor();
    const play = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + startOffset;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      osc.start(t0);
      osc.stop(t0 + duration);
    };
    play(1046, 0, 0.18); // C6
    play(1318, 0.11, 0.22); // E6
    setTimeout(() => {
      void ctx.close();
    }, 500);
  } catch (err) {
    // Pre-gesture browsers throw; the visual toast covers the alert path.
    console.warn("[lead beep] suppressed:", err);
  }
}
