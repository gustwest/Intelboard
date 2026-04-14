/**
 * GestureDetector — Detects hand gestures from the front camera using MediaPipe Hands.
 *
 * Recognises an "open palm held steady for ~1.5 seconds" as the scoring gesture.
 */

// ── Tiny event emitter ───────────────────────────────────────

type Listener = (...args: any[]) => void;
class Emitter {
  protected _l: Record<string, Listener[]> = {};
  on(e: string, fn: Listener) {
    if (!this._l[e]) this._l[e] = [];
    this._l[e].push(fn);
    return () => this.off(e, fn);
  }
  off(e: string, fn: Listener) {
    const a = this._l[e];
    if (a) this._l[e] = a.filter(f => f !== fn);
  }
  emit(e: string, ...a: any[]) {
    if (this._l[e]) this._l[e].forEach(fn => fn(...a));
  }
}

// ── Constants ────────────────────────────────────────────────

const HOLD_DURATION_MS = 1500;
const COOLDOWN_MS      = 3000;
const STEADY_RADIUS    = 0.08;
const MIN_FINGER_SPREAD = 0.06;

const FINGERTIP_IDS = [4, 8, 12, 16, 20];
const FINGER_MCP_IDS = [2, 5, 9, 13, 17];

export interface GestureDetectorOptions {
  holdDuration?: number;
  cooldown?: number;
}

// ── GestureDetector ──────────────────────────────────────────

export class GestureDetector extends Emitter {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;

  holdDuration: number;
  cooldown: number;

  private _hands: any = null;
  private _running: boolean = false;
  private _gestureStart: number | null = null;
  private _gesturePalmPos: { x: number; y: number } | null = null;
  private _lastConfirmTime: number = 0;
  private _holdProgress: number = 0;
  private _rafId: number | null = null;
  private _latestResults: any = null;
  private _stream: MediaStream | null = null;

  constructor(videoEl: HTMLVideoElement, canvasEl: HTMLCanvasElement | null = null, opts: GestureDetectorOptions = {}) {
    super();
    this.video = videoEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl ? canvasEl.getContext('2d') : null;

    this.holdDuration = opts.holdDuration ?? HOLD_DURATION_MS;
    this.cooldown = opts.cooldown ?? COOLDOWN_MS;
  }

  async start() {
    if (this._running) return;
    this._running = true;

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      this.video.srcObject = this._stream;
      await this.video.play();
    } catch (err) {
      this._running = false;
      throw new Error(`Camera access denied or unavailable: ${err}`);
    }

    if (this.canvas) {
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
    }

    await this._initMediaPipe();
    this._processFrame();
  }

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this.video.srcObject = null;
      this._stream = null;
    }
  }

  get progress() {
    return this._holdProgress;
  }

  private async _initMediaPipe() {
    // Dynamically importing mediapipe from CDN safely
    const mpHands = await import('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js' as any);
    const HandsClass = mpHands.Hands || (window as any).Hands;
    
    if (!HandsClass) {
        throw new Error('Failed to load MediaPipe Hands');
    }

    this._hands = new HandsClass({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
    });

    this._hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

    this._hands.onResults((results: any) => {
      this._latestResults = results;
    });
  }

  private async _processFrame() {
    if (!this._running) return;

    try {
      if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
        await this._hands.send({ image: this.video });
      }
    } catch (e) {
      console.warn("MediaPipe frame drop", e);
    }

    if (this._latestResults) {
      this._analyseResults(this._latestResults);
      if (this.ctx) this._drawOverlay(this._latestResults);
    }

    this._rafId = requestAnimationFrame(() => this._processFrame());
  }

  private _analyseResults(results: any) {
    const now = Date.now();

    if (now - this._lastConfirmTime < this.cooldown) {
      this._resetGesture();
      return;
    }

    let openPalm = null;
    if (results.multiHandLandmarks) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const lm = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness?.[i]?.label || 'Unknown';
        if (this._isOpenPalm(lm)) {
          const palmCenter = this._palmCenter(lm);
          openPalm = { landmarks: lm, handedness, ...palmCenter };
          break;
        }
      }
    }

    if (!openPalm) {
      if (this._gestureStart) {
        this.emit('gestureCancelled');
        this._resetGesture();
      }
      return;
    }

    if (!this._gestureStart) {
      this._gestureStart = now;
      this._gesturePalmPos = { x: openPalm.x, y: openPalm.y };
      this.emit('gestureStart', { palmX: openPalm.x, palmY: openPalm.y });
    } else if (this._gesturePalmPos) {
      const dx = openPalm.x - this._gesturePalmPos.x;
      const dy = openPalm.y - this._gesturePalmPos.y;
      const drift = Math.sqrt(dx * dx + dy * dy);

      if (drift > STEADY_RADIUS) {
        this.emit('gestureCancelled');
        this._resetGesture();
        return;
      }
    }

    const elapsed = now - this._gestureStart!;
    this._holdProgress = Math.min(1, elapsed / this.holdDuration);
    this.emit('gestureProgress', { progress: this._holdProgress, palmX: openPalm.x, palmY: openPalm.y });

    if (elapsed >= this.holdDuration) {
      this._lastConfirmTime = now;
      this.emit('gestureConfirmed', {
        palmX: openPalm.x,
        palmY: openPalm.y,
        handedness: openPalm.handedness,
      });
      this._resetGesture();
    }
  }

  private _resetGesture() {
    this._gestureStart = null;
    this._gesturePalmPos = null;
    this._holdProgress = 0;
  }

  private _isOpenPalm(landmarks: any[]) {
    for (let i = 0; i < FINGERTIP_IDS.length; i++) {
      const tip = landmarks[FINGERTIP_IDS[i]];
      const mcp = landmarks[FINGER_MCP_IDS[i]];
      if (i === 0) {
        const wrist = landmarks[0];
        const tipDist = Math.abs(tip.x - wrist.x);
        const mcpDist = Math.abs(mcp.x - wrist.x);
        if (tipDist < mcpDist * 0.8) return false;
      } else {
        if (tip.y > mcp.y + 0.02) return false;
      }
    }

    let totalSpread = 0;
    for (let i = 1; i < FINGERTIP_IDS.length; i++) {
      const a = landmarks[FINGERTIP_IDS[i - 1]];
      const b = landmarks[FINGERTIP_IDS[i]];
      totalSpread += Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }
    const avgSpread = totalSpread / (FINGERTIP_IDS.length - 1);
    if (avgSpread < MIN_FINGER_SPREAD) return false;

    return true;
  }

  private _palmCenter(landmarks: any[]) {
    const points = [0, ...FINGER_MCP_IDS];
    let sx = 0, sy = 0;
    for (const id of points) {
      sx += landmarks[id].x;
      sy += landmarks[id].y;
    }
    return { x: sx / points.length, y: sy / points.length };
  }

  private _drawOverlay(results: any) {
    if (!this.ctx || !this.canvas) return;
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    if (!results.multiHandLandmarks) return;

    for (const landmarks of results.multiHandLandmarks) {
      this.ctx.fillStyle = this._gestureStart ? '#00ff88' : '#ffffff';
      for (const lm of landmarks) {
        this.ctx.beginPath();
        this.ctx.arc(lm.x * width, lm.y * height, 3, 0, 2 * Math.PI);
        this.ctx.fill();
      }

      this.ctx.strokeStyle = this._gestureStart ? '#00ff8866' : '#ffffff44';
      this.ctx.lineWidth = 1.5;
      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16],
        [13, 17], [17, 18], [18, 19], [19, 20],
        [0, 17],
      ];
      for (const [a, b] of connections) {
        this.ctx.beginPath();
        this.ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
        this.ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
        this.ctx.stroke();
      }
    }

    if (this._holdProgress > 0 && this._gesturePalmPos) {
      const cx = this._gesturePalmPos.x * width;
      const cy = this._gesturePalmPos.y * height;
      const r = 40;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + this._holdProgress * 2 * Math.PI);
      this.ctx.strokeStyle = '#00ff88';
      this.ctx.lineWidth = 4;
      this.ctx.stroke();
    }
  }
}
