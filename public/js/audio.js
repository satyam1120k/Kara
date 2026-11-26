/**
 * KĀRA: Sound Synthesis Engine (Web Audio API)
 * Pure procedural synthesis - no external audio files required.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.volume = 0.5;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  createMasterGain() {
    if (!this.ctx || this.isMuted) return null;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    gain.connect(this.ctx.destination);
    return gain;
  }

  playSelect() {
    this.init();
    const master = this.createMasterGain();
    if (!master) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playMove() {
    this.init();
    const master = this.createMasterGain();
    if (!master) return;
    const now = this.ctx.currentTime;

    // Soft resonant wood/stone slide tap
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(320, now);
    osc1.frequency.exponentialRampToValueAtTime(160, now + 0.12);

    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc1.connect(gain1);
    gain1.connect(master);
    osc1.start(now);
    osc1.stop(now + 0.12);
  }

  playStack() {
    this.init();
    const master = this.createMasterGain();
    if (!master) return;
    const now = this.ctx.currentTime;

    // Resonant wooden tower thud with harmonic chime
    [220, 440, 660].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.9, now + 0.22);

      gain.gain.setValueAtTime(0.2 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.22);
    });
  }

  playCapture() {
    this.init();
    const master = this.createMasterGain();
    if (!master) return;
    const now = this.ctx.currentTime;

    // Crisp physical impact
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.18);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playPeel() {
    this.init();
    const master = this.createMasterGain();
    if (!master) return;
    const now = this.ctx.currentTime;

    // Layer-stripping chime: descending frequency + quick shatter burst
    [600, 450, 300].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.04);
      osc.frequency.exponentialRampToValueAtTime(f * 0.7, now + i * 0.04 + 0.14);

      gain.gain.setValueAtTime(0.25, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.14);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.14);
    });
  }

  playAegis() {
    this.init();
    const master = this.createMasterGain();
    if (!master) return;
    const now = this.ctx.currentTime;

    // Golden shield barrier ricochet
    [587.33, 880, 1174.66].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.3 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.35);
    });
  }

  playAwaken() {
    this.init();
    const master = this.createMasterGain();
    if (!master) return;
    const now = this.ctx.currentTime;

    // Celestial shimmer arpeggio (C-major / radiant Eclipse awaken)
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);

      gain.gain.setValueAtTime(0.2, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.25);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.25);
    });
  }

  playDeploy() {
    this.init();
    const master = this.createMasterGain();
    if (!master) return;
    const now = this.ctx.currentTime;

    // Summoning resonance
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.15);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playCheck() {
    this.init();
    const master = this.createMasterGain();
    if (!master) return;
    const now = this.ctx.currentTime;

    // Tense dramatic bell alert
    [392, 415.3].forEach(freq => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.4);
    });
  }

  playAscension() {
    this.init();
    const master = this.createMasterGain();
    if (!master) return;
    const now = this.ctx.currentTime;

    // Grand celestial ascension fanfare
    const chords = [
      [440, 554.37, 659.25],
      [554.37, 659.25, 880],
      [659.25, 880, 1108.73],
      [880, 1108.73, 1318.51]
    ];

    chords.forEach((chord, step) => {
      const stepTime = now + step * 0.18;
      chord.forEach(f => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, stepTime);

        gain.gain.setValueAtTime(0.2, stepTime);
        gain.gain.exponentialRampToValueAtTime(0.001, stepTime + 0.5);

        osc.connect(gain);
        gain.connect(master);
        osc.start(stepTime);
        osc.stop(stepTime + 0.5);
      });
    });
  }

  playVictory() {
    this.init();
    const master = this.createMasterGain();
    if (!master) return;
    const now = this.ctx.currentTime;

    // Victory flourish
    const notes = [440, 440, 440, 554.37, 659.25, 880];
    const times = [0, 0.12, 0.24, 0.36, 0.5, 0.7];
    const durs = [0.1, 0.1, 0.1, 0.12, 0.18, 0.6];

    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + times[i]);

      gain.gain.setValueAtTime(0.28, now + times[i]);
      gain.gain.exponentialRampToValueAtTime(0.001, now + times[i] + durs[i]);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now + times[i]);
      osc.stop(now + times[i] + durs[i]);
    });
  }
}

export const sounds = new SoundEngine();
