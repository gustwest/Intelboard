/**
 * PlayerIdentifier — Maps a detected gesture to one of the 4 registered players.
 *
 * During setup the user assigns each player to a zone.
 * During play, when a gesture is confirmed, the palm position is matched to the
 * nearest player zone to determine which player signalling.
 */

export interface PlayerZone {
  x: number;
  y: number;
}

export interface RegisteredPlayer {
  name: string;
  team: 'A' | 'B';
  zone: PlayerZone;
}

export interface IdentificationResult {
  name: string;
  team: 'A' | 'B';
  distance: number;
  confidence: 'high' | 'low' | 'none';
}

const HIGH_CONFIDENCE_DIST = 0.15;
const MAX_MATCH_DIST = 0.35;

export class PlayerIdentifier {
  players: RegisteredPlayer[];

  constructor() {
    this.players = [];
  }

  registerPlayer(name: string, team: 'A' | 'B', zone: PlayerZone) {
    this.players.push({ name, team, zone: { ...zone } });
  }

  clear() {
    this.players = [];
  }

  getPlayers() {
    return this.players.map((p) => ({ ...p, zone: { ...p.zone } }));
  }

  identify(palmX: number, palmY: number): IdentificationResult | null {
    if (this.players.length === 0) return null;

    let best: RegisteredPlayer | null = null;
    let bestDist = Infinity;

    for (const player of this.players) {
      const dx = palmX - player.zone.x;
      const dy = palmY - player.zone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = player;
      }
    }

    if (!best || bestDist > MAX_MATCH_DIST) {
      return null;
    }

    return {
      name: best.name,
      team: best.team,
      distance: Math.round(bestDist * 1000) / 1000,
      confidence: bestDist <= HIGH_CONFIDENCE_DIST ? 'high' : 'low',
    };
  }

  autoAssignZones(teamAPlayers: string[], teamBPlayers: string[]) {
    this.clear();
    // Default zones for portrait / landscape view. Adjust depending on camera angle context.
    // Assuming team A is on left, team B is on right in landscape
    if (teamAPlayers[0]) this.registerPlayer(teamAPlayers[0], 'A', { x: 0.20, y: 0.35 });
    if (teamAPlayers[1]) this.registerPlayer(teamAPlayers[1], 'A', { x: 0.20, y: 0.65 });
    
    if (teamBPlayers[0]) this.registerPlayer(teamBPlayers[0], 'B', { x: 0.80, y: 0.35 });
    if (teamBPlayers[1]) this.registerPlayer(teamBPlayers[1], 'B', { x: 0.80, y: 0.65 });
  }

  toJSON() {
    return this.players.map((p) => ({ ...p, zone: { ...p.zone } }));
  }

  static fromJSON(arr: any[]) {
    const pi = new PlayerIdentifier();
    for (const p of arr) {
      pi.registerPlayer(p.name, p.team, p.zone);
    }
    return pi;
  }
}
