'use client';

/**
 * Procedural Web Audio API sound effects for Tactile Chrono UI.
 * Zero external audio assets required; generates subtle mechanical ticks and UI chimes.
 */

const STORAGE_KEY = 'solaria-sound-enabled';

class SoundFXController {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private lastTickMs = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
          this.enabled = stored === 'true';
        }
      } catch {
        // ignore storage errors
      }
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
    }
    if (next) {
      this.playSwitch(true);
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Subtle mechanical chronograph tick when scrubbing time slider.
   * Rate-limited so rapid dragging sounds like a precision watch bezel.
   */
  public playChronoTick(altitudeDeg = 30): void {
    const now = performance.now();
    if (now - this.lastTickMs < 38) return;
    this.lastTickMs = now;

    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Higher pitch during bright noon, deeper pitch at night/twilight
      const normalizedAlt = Math.max(-15, Math.min(85, altitudeDeg));
      const baseFreq = 920 + ((normalizedAlt + 15) / 100) * 580;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.018);

      gain.gain.setValueAtTime(0.032, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.022);
    } catch {
      // ignore audio context restrictions
    }
  }

  /**
   * Soft spatial glass click when switching modes or toggling studio layers.
   */
  public playSwitch(active = true): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const startFreq = active ? 520 : 680;
      const endFreq = active ? 880 : 440;
      osc.frequency.setValueAtTime(startFreq, t);
      osc.frequency.exponentialRampToValueAtTime(endFreq, t + 0.055);

      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.065);
    } catch {
      // ignore
    }
  }
}

export const soundFX = new SoundFXController();
