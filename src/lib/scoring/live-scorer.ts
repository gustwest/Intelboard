/**
 * LiveScorer — Beach volleyball scoring engine (TypeScript version).
 *
 * Tracks score, sets, serving, and side changes for a 2v2 match.
 * All state is kept in-memory with a full undo stack.
 */

// ── Types ──────────────────────────────────────────────────

export type TeamId = 'A' | 'B';

export interface PlayerInfo {
  name: string;
  players: string[];
}

export interface SetResult {
  A: number;
  B: number;
  winner: TeamId;
}

export interface MatchState {
  score: { A: number; B: number };
  sets: { A: number; B: number };
  currentSet: number;
  setHistory: SetResult[];
  serving: TeamId;
  sidesSwapped: boolean;
  matchOver: boolean;
  matchWinner: TeamId | null;
  teamA: PlayerInfo;
  teamB: PlayerInfo;
  canUndo: boolean;
  setTarget: number;
  sideChangeInterval: number;
  pointsUntilSideChange: number;
}

export interface ScoringMeta {
  player?: string;
  [key: string]: any;
}

export interface LiveMatchOptions {
  teamA?: PlayerInfo;
  teamB?: PlayerInfo;
  firstServe?: TeamId;
}

// ── Event emitter mixin ──────────────────────────────────────

type Listener = (...args: any[]) => void;

class EventEmitter {
  private _listeners: Record<string, Listener[]> = {};

  on(event: string, fn: Listener) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => this.off(event, fn);
  }

  off(event: string, fn: Listener) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter((f) => f !== fn);
  }

  emit(event: string, ...args: any[]) {
    if (this._listeners[event]) {
      this._listeners[event].forEach((fn) => fn(...args));
    }
  }
}

// ── Constants ────────────────────────────────────────────────

const SET_POINTS_NORMAL = 21;
const SET_POINTS_TIEBREAK = 15;
const SIDE_CHANGE_NORMAL = 7;
const SIDE_CHANGE_TIEBREAK = 5;
const SETS_TO_WIN = 2; // best of 3

// ── LiveMatch ────────────────────────────────────────────────

export class LiveMatch extends EventEmitter {
  teamA: PlayerInfo;
  teamB: PlayerInfo;

  sets: { A: number; B: number };
  currentSet: number;

  score: { A: number; B: number };
  setHistory: SetResult[];

  serving: TeamId;
  sidesSwapped: boolean;

  matchOver: boolean;
  matchWinner: TeamId | null;
  startedAt: number;

  private _undoStack: any[];

  constructor({ teamA, teamB, firstServe = 'A' }: LiveMatchOptions = {}) {
    super();

    this.teamA = { name: teamA?.name || 'Team A', players: [...(teamA?.players || [])] };
    this.teamB = { name: teamB?.name || 'Team B', players: [...(teamB?.players || [])] };

    this.sets = { A: 0, B: 0 };
    this.currentSet = 1;

    this.score = { A: 0, B: 0 };
    this.setHistory = [];

    this.serving = firstServe;
    this.sidesSwapped = false;

    this._undoStack = [];

    this.matchOver = false;
    this.matchWinner = null;
    this.startedAt = Date.now();
  }

  // ── Public API ───────────────────────────────────────────

  point(team: TeamId, meta: ScoringMeta = {}) {
    if (this.matchOver) return;

    this._pushUndo();

    this.score[team] += 1;
    this.serving = team;

    // Check side change
    const totalPoints = this.score.A + this.score.B;
    const interval = this._sideChangeInterval();
    if (totalPoints > 0 && totalPoints % interval === 0) {
      this.sidesSwapped = !this.sidesSwapped;
      this.emit('sideChange', this.getState());
    }

    // Check set win
    const setTarget = this._setTarget();
    if (this.score[team] >= setTarget && this.score[team] - this.score[this._other(team)] >= 2) {
      this._winSet(team);
    }

    this.emit('scoreChanged', { ...this.getState(), meta });
  }

  undo(): boolean {
    if (this._undoStack.length === 0) return false;
    const snap = this._undoStack.pop();
    this._restoreSnapshot(snap);
    this.emit('scoreChanged', this.getState());
    this.emit('undo', this.getState());
    return true;
  }

  getState(): MatchState {
    return {
      score: { ...this.score },
      sets: { ...this.sets },
      currentSet: this.currentSet,
      setHistory: [...this.setHistory],
      serving: this.serving,
      sidesSwapped: this.sidesSwapped,
      matchOver: this.matchOver,
      matchWinner: this.matchWinner,
      teamA: this.teamA,
      teamB: this.teamB,
      canUndo: this._undoStack.length > 0,
      setTarget: this._setTarget(),
      sideChangeInterval: this._sideChangeInterval(),
      pointsUntilSideChange: this._pointsUntilSideChange(),
    };
  }

  newSet() {
    this.score = { A: 0, B: 0 };
    this._undoStack = [];
    this.sidesSwapped = false;
    this.emit('scoreChanged', this.getState());
  }

  toJSON() {
    return {
      teamA: this.teamA,
      teamB: this.teamB,
      sets: this.sets,
      setHistory: this.setHistory,
      matchOver: this.matchOver,
      matchWinner: this.matchWinner,
      startedAt: this.startedAt,
      endedAt: this.matchOver ? Date.now() : null,
    };
  }

  // ── Private helpers ──────────────────────────────────────

  private _setTarget() {
    return this.currentSet >= 3 ? SET_POINTS_TIEBREAK : SET_POINTS_NORMAL;
  }

  private _sideChangeInterval() {
    return this.currentSet >= 3 ? SIDE_CHANGE_TIEBREAK : SIDE_CHANGE_NORMAL;
  }

  private _pointsUntilSideChange() {
    const total = this.score.A + this.score.B;
    const interval = this._sideChangeInterval();
    return interval - (total % interval);
  }

  private _other(team: TeamId): TeamId {
    return team === 'A' ? 'B' : 'A';
  }

  private _winSet(team: TeamId) {
    this.setHistory.push({ A: this.score.A, B: this.score.B, winner: team });
    this.sets[team] += 1;

    if (this.sets[team] >= SETS_TO_WIN) {
      this.matchOver = true;
      this.matchWinner = team;
      this.emit('matchOver', this.getState());
    } else {
      this.currentSet += 1;
      this.score = { A: 0, B: 0 };
      this.sidesSwapped = false;
      this._undoStack = [];
      this.emit('setWon', this.getState());
    }
  }

  private _pushUndo() {
    this._undoStack.push({
      score: { ...this.score },
      sets: { ...this.sets },
      currentSet: this.currentSet,
      setHistory: this.setHistory.map((s) => ({ ...s })),
      serving: this.serving,
      sidesSwapped: this.sidesSwapped,
      matchOver: this.matchOver,
      matchWinner: this.matchWinner,
    });
  }

  private _restoreSnapshot(snap: any) {
    this.score = snap.score;
    this.sets = snap.sets;
    this.currentSet = snap.currentSet;
    this.setHistory = snap.setHistory;
    this.serving = snap.serving;
    this.sidesSwapped = snap.sidesSwapped;
    this.matchOver = snap.matchOver;
    this.matchWinner = snap.matchWinner;
  }
}
