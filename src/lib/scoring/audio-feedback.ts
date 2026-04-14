/**
 * AudioFeedback — Score announcements and sound effects.
 *
 * Uses Web Speech API for voice and AudioContext for beeps.
 */

export interface AudioFeedbackOptions {
  enabled?: boolean;
  voiceEnabled?: boolean;
  soundsEnabled?: boolean;
  volume?: number;
  lang?: string;
}

export class AudioFeedback {
  enabled: boolean;
  voiceEnabled: boolean;
  soundsEnabled: boolean;
  volume: number;
  lang: string;

  private _ctx: AudioContext | null = null;
  private _synth: SpeechSynthesis | null = null;

  constructor(opts: AudioFeedbackOptions = {}) {
    this.enabled = opts.enabled ?? true;
    this.voiceEnabled = opts.voiceEnabled ?? true;
    this.soundsEnabled = opts.soundsEnabled ?? true;
    this.volume = opts.volume ?? 0.7;
    this.lang = opts.lang ?? 'en-US';

    this._synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  }

  announceScore(scoreA: number, scoreB: number, servingTeamName: string) {
    if (!this.enabled || !this.voiceEnabled) return;
    this._speak(`${scoreA} serving ${scoreB}`);
  }

  announceSetWon(teamName: string, setsA: number, setsB: number) {
    if (!this.enabled || !this.voiceEnabled) return;
    this._speak(`Set to ${teamName}. Sets: ${setsA} ${setsB}`);
  }

  announceMatchOver(teamName: string) {
    if (!this.enabled || !this.voiceEnabled) return;
    this._speak(`Match point! ${teamName} wins!`);
  }

  announceSideChange() {
    if (!this.enabled || !this.voiceEnabled) return;
    this._speak('Change sides');
  }

  beepGestureDetected() {
    if (!this.enabled || !this.soundsEnabled) return;
    this._playTone(660, 0.08, 'sine');
  }

  beepScoreConfirmed() {
    if (!this.enabled || !this.soundsEnabled) return;
    const ctx = this._getContext();
    if (!ctx) return;
    // Two-note "ding-dong"
    this._playTone(880, 0.12, 'sine', 0);
    this._playTone(1100, 0.15, 'sine', 0.13);
  }

  beepError() {
    if (!this.enabled || !this.soundsEnabled) return;
    this._playTone(220, 0.2, 'square');
  }

  toggle(on?: boolean) {
    this.enabled = on ?? !this.enabled;
  }

  private _getContext(): AudioContext | null {
    if (!this._ctx && typeof window !== 'undefined') {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this._ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this._ctx?.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  private _playTone(freq: number, duration: number, type: OscillatorType = 'sine', delay = 0) {
    const ctx = this._getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = this.volume * 0.3;

    osc.connect(gain);
    gain.connect(ctx.destination);

    const t = ctx.currentTime + delay;
    osc.start(t);
    // Fade out
    gain.gain.setValueAtTime(this.volume * 0.3, t + duration * 0.7);
    gain.gain.linearRampToValueAtTime(0, t + duration);
    osc.stop(t + duration + 0.01);
  }

  private _speak(text: string) {
    if (!this._synth) return;
    this._synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = this.lang;
    utter.rate = 1.1;
    utter.volume = this.volume;
    this._synth.speak(utter);
  }
}
