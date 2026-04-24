export class GameSound {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.masterVolume = 0.07;
    this.heartbeatTimer = null;
    this.rhythmTimer = null;
    this.mood = {
      losingSide: null,
      evaluation: 0,
      lowPassCutoff: 6000,
      distortion: 0.08
    };
    this.nodes = null;
  }

  ensureContext() {
    if (!this.enabled) {
      return null;
    }
    if (!this.context) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        this.enabled = false;
        return null;
      }
      this.context = new AudioCtx();
      this.setupGraph();
    }
    return this.context;
  }

  setupGraph() {
    if (!this.context || this.nodes) {
      return;
    }

    const ctx = this.context;
    const master = ctx.createGain();
    master.gain.value = this.masterVolume;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = this.mood.lowPassCutoff;
    lowpass.Q.value = 1.1;

    const distortion = ctx.createWaveShaper();
    distortion.curve = this.makeDistortionCurve(80);
    distortion.oversample = "4x";

    const postGain = ctx.createGain();
    postGain.gain.value = 0.8;

    master.connect(lowpass);
    lowpass.connect(distortion);
    distortion.connect(postGain);
    postGain.connect(ctx.destination);

    this.nodes = { master, lowpass, distortion, postGain };
  }

  makeDistortionCurve(amount = 50) {
    const k = typeof amount === "number" ? amount : 50;
    const nSamples = 22050;
    const curve = new Float32Array(nSamples);
    const deg = Math.PI / 180;
    for (let i = 0; i < nSamples; i += 1) {
      const x = (i * 2) / nSamples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  playTone(frequency, duration = 0.08, gainValue = 0.06, type = "sine", delay = 0) {
    const ctx = this.ensureContext();
    if (!ctx || !this.nodes) {
      return;
    }

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainValue * this.masterVolume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.nodes.master);
    osc.start(now);
    osc.stop(now + duration);
  }

  playChord(frequencies, duration, gainValue, type = "triangle", delay = 0) {
    frequencies.forEach((frequency, index) => {
      this.playTone(frequency, duration, gainValue, type, delay + index * 0.015);
    });
  }

  move() {
    this.playChord([660, 990], 0.09, 0.7, "triangle");
  }

  capture() {
    this.playChord([220, 330], 0.1, 1, "square");
    this.playTone(170, 0.16, 0.8, "sawtooth", 0.03);
    this.playMetalRiff();
  }

  castle() {
    this.playChord([392, 523, 659], 0.11, 0.8, "triangle");
  }

  check() {
    this.playChord([784, 932], 0.14, 0.85, "sawtooth");
  }

  gameOver() {
    this.playChord([392, 494, 587], 0.12, 0.85, "triangle", 0);
    this.playChord([349, 440, 523], 0.14, 0.82, "triangle", 0.16);
    this.playChord([262, 330, 392], 0.18, 1, "triangle", 0.34);
  }

  triumphant() {
    this.playChord([659, 784, 988], 0.14, 1, "triangle");
    this.playChord([784, 1046, 1318], 0.16, 1, "triangle", 0.16);
  }

  fail() {
    this.playTone(240, 0.18, 1, "sawtooth");
    this.playTone(160, 0.22, 1, "square", 0.08);
    this.playTone(120, 0.24, 0.9, "square", 0.16);
  }

  mock() {
    this.playTone(320, 0.12, 0.95, "square");
    this.playTone(370, 0.12, 0.95, "square", 0.1);
    this.playTone(290, 0.16, 0.9, "triangle", 0.2);
  }

  playMetalRiff() {
    this.playTone(110, 0.12, 1.2, "sawtooth");
    this.playTone(82, 0.14, 1, "sawtooth", 0.08);
    this.playTone(73, 0.16, 0.95, "square", 0.16);
  }

  breakdown() {
    this.playTone(98, 0.2, 1.3, "sawtooth");
    this.playTone(82, 0.22, 1.2, "sawtooth", 0.18);
    this.playTone(65, 0.26, 1.2, "square", 0.36);
    this.playTone(55, 0.3, 1.1, "square", 0.6);
  }

  heartbeat(strength = 1) {
    const gain = 0.65 + Math.min(0.5, strength * 0.12);
    this.playTone(58, 0.08, gain, "sine");
    this.playTone(54, 0.08, gain, "sine", 0.15);
  }

  startHeartbeat(intensity = 1) {
    this.stopHeartbeat();
    const bpm = Math.min(170, 72 + Math.round(intensity * 16));
    const intervalMs = Math.max(360, Math.floor(60000 / bpm));
    this.heartbeat(intensity);
    this.heartbeatTimer = window.setInterval(() => this.heartbeat(intensity), intervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  startRhythm(intensity = 1) {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }
    this.stopRhythm();
    const bpm = Math.min(190, 88 + Math.round(intensity * 14));
    const intervalMs = Math.max(260, Math.floor(60000 / bpm));
    this.rhythmPulse(intensity);
    this.rhythmTimer = window.setInterval(() => this.rhythmPulse(intensity), intervalMs);
  }

  stopRhythm() {
    if (this.rhythmTimer) {
      window.clearInterval(this.rhythmTimer);
      this.rhythmTimer = null;
    }
  }

  rhythmPulse(intensity = 1) {
    this.playTone(45, 0.12, 0.8 + Math.min(0.5, intensity * 0.15), "triangle");
    this.playTone(90, 0.06, 0.3, "sine", 0.05);
  }

  // ─── Blackjack SFX ─────────────────────────────────────────────────────────

  bjShuffle() {
    // Rapid bursts simulating cards riffling
    for (let i = 0; i < 8; i++) {
      const freq = 200 + Math.random() * 400;
      this.playTone(freq, 0.04, 0.5, "sawtooth", i * 0.04);
    }
  }

  bjDeal() {
    // Crisp friction snap of a card sliding across felt
    this.playTone(900, 0.03, 0.9, "sawtooth");
    this.playTone(500, 0.04, 0.6, "triangle", 0.02);
  }

  bjFlip() {
    // Soft whoosh of a card flipping
    this.playTone(440, 0.05, 0.5, "triangle");
    this.playTone(660, 0.04, 0.4, "sine", 0.04);
  }

  bjChip() {
    // Metallic chip click
    this.playTone(1200, 0.04, 0.7, "triangle");
    this.playTone(900, 0.06, 0.5, "sine", 0.02);
  }

  bjWin() {
    // Uplifting ascending chord
    this.playChord([523, 659, 784], 0.12, 0.9, "triangle");
    this.playChord([659, 784, 988], 0.14, 1, "triangle", 0.14);
  }

  bjLose() {
    // Descending somber tones
    this.playTone(392, 0.14, 0.85, "triangle");
    this.playTone(330, 0.16, 0.8, "triangle", 0.14);
    this.playTone(262, 0.2, 0.9, "triangle", 0.28);
  }

  bjBlackjack() {
    // Special dramatic fanfare
    this.playChord([784, 988, 1318], 0.1, 1, "triangle");
    this.playChord([880, 1108, 1318], 0.12, 1, "triangle", 0.12);
    this.playChord([988, 1244, 1568], 0.18, 1, "triangle", 0.26);
  }

  updateMood(evaluation, sideToMove) {
    const ctx = this.ensureContext();
    if (!ctx || !this.nodes) {
      return;
    }
    const perspective = sideToMove === "white" ? evaluation : -evaluation;
    const losing = perspective < -1;
    const severity = Math.min(1, Math.max(0, (-perspective - 1) / 7));

    const cutoff = losing ? 6000 - severity * 5200 : 6200;
    const distortionAmount = losing ? 70 + severity * 160 : 65;
    this.nodes.lowpass.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.08);
    this.nodes.distortion.curve = this.makeDistortionCurve(distortionAmount);
    this.mood = {
      losingSide: losing ? sideToMove : null,
      evaluation,
      lowPassCutoff: cutoff,
      distortion: distortionAmount
    };
  }
}
