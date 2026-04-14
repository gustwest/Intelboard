'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Settings, RotateCcw, X, PlusCircle, Check } from 'lucide-react';
import { LiveMatch, MatchState, TeamId } from '@/lib/scoring/live-scorer';
import { GestureDetector } from '@/lib/scoring/gesture-detector';
import { PlayerIdentifier } from '@/lib/scoring/player-identifier';
import { AudioFeedback } from '@/lib/scoring/audio-feedback';

export default function LiveScoreInterface() {
  // ── State ──────────────────────────────────────────────────
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [isSetup, setIsSetup] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Setup fields
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [teamAP1, setTeamAP1] = useState('');
  const [teamAP2, setTeamAP2] = useState('');
  const [teamBP1, setTeamBP1] = useState('');
  const [teamBP2, setTeamBP2] = useState('');

  // Settings
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [recordMatch, setRecordMatch] = useState(true);

  // UI feedback
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [idFlash, setIdFlash] = useState<{ msg: string; visible: boolean }>({ msg: '', visible: false });
  const [gestureActive, setGestureActive] = useState(false);

  // ── Refs ───────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const matchRef = useRef<LiveMatch | null>(null);
  const detectorRef = useRef<GestureDetector | null>(null);
  const identifierRef = useRef<PlayerIdentifier>(new PlayerIdentifier());
  const audioRef = useRef<AudioFeedback>(new AudioFeedback({ voiceEnabled, soundsEnabled }));
  const wakeLockRef = useRef<any>(null);
  
  // Recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  // Sync audio settings
  useEffect(() => {
    audioRef.current.voiceEnabled = voiceEnabled;
    audioRef.current.soundsEnabled = soundsEnabled;
  }, [voiceEnabled, soundsEnabled]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      detectorRef.current?.stop();
      wakeLockRef.current?.release();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // ── Helpers ────────────────────────────────────────────────
  const showToast = (msg: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const flashId = (msg: string) => {
    setIdFlash({ msg, visible: true });
    setTimeout(() => setIdFlash({ msg: '', visible: false }), 2000);
  };

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch { /* ignore */ }
  };

  // ── Actions ────────────────────────────────────────────────
  const startMatch = async () => {
    const tAName = teamAName.trim() || 'Team A';
    const tBName = teamBName.trim() || 'Team B';
    const ap1 = teamAP1.trim() || 'Player 1';
    const ap2 = teamAP2.trim() || 'Player 2';
    const bp1 = teamBP1.trim() || 'Player 3';
    const bp2 = teamBP2.trim() || 'Player 4';

    const match = new LiveMatch({
      teamA: { name: tAName, players: [ap1, ap2] },
      teamB: { name: tBName, players: [bp1, bp2] },
      firstServe: 'A',
    });

    identifierRef.current.autoAssignZones([ap1, ap2], [bp1, bp2]);

    match.on('scoreChanged', (state) => setMatchState(state));
    match.on('sideChange', () => {
      showToast('⟲ Change sides!');
      audioRef.current.announceSideChange();
    });
    match.on('setWon', (state) => {
      const winner = state.setHistory[state.setHistory.length - 1].winner;
      const name = winner === 'A' ? tAName : tBName;
      showToast(`🏆 Set to ${name}!`);
      audioRef.current.announceSetWon(name, state.sets.A, state.sets.B);
    });
    match.on('matchOver', (state) => {
      const name = state.matchWinner === 'A' ? tAName : tBName;
      audioRef.current.announceMatchOver(name);
    });

    matchRef.current = match;
    setMatchState(match.getState());
    setIsSetup(false);
    requestWakeLock();

    // Start camera
    if (videoRef.current) {
      const detector = new GestureDetector(videoRef.current, canvasRef.current || undefined);
      
      detector.on('gestureStart', () => {
        setGestureActive(true);
        audioRef.current.beepGestureDetected();
      });
      
      detector.on('gestureCancelled', () => setGestureActive(false));
      
      detector.on('gestureConfirmed', ({ palmX, palmY }) => {
        setGestureActive(false);
        handleGesture(palmX, palmY);
      });

      detectorRef.current = detector;
      try {
        await detector.start();

        // Start recording if requested
        if (recordMatch && videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          let options = { mimeType: 'video/webm;codecs=vp9,opus' };
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            // Fallback for iOS Safari which prefers mp4
            options = { mimeType: 'video/mp4' };
          }
          
          recordedChunksRef.current = [];
          const mr = new MediaRecorder(stream, options);
          mr.ondataavailable = (e) => {
            if (e.data.size > 0) {
              recordedChunksRef.current.push(e.data);
            }
          };
          mr.start(1000); // capture in chunks
          mediaRecorderRef.current = mr;
        }

      } catch (err) {
        console.warn('Camera err:', err);
        showToast('📷 Camera unavailable - use manual buttons');
      }
    }
  };

  const handleGesture = (palmX: number, palmY: number) => {
    const result = identifierRef.current.identify(palmX, palmY);
    if (!result) {
      audioRef.current.beepError();
      flashId('❓ Unknown player');
      return;
    }

    if (matchRef.current) {
      matchRef.current.point(result.team, { player: result.name });
      audioRef.current.beepScoreConfirmed();
      flashId(`${result.name} → +1`);

      const s = matchRef.current.getState();
      const tName = result.team === 'A' ? s.teamA.name : s.teamB.name;
      audioRef.current.announceScore(s.score.A, s.score.B, tName);
    }
  };

  const manualScore = (team: TeamId) => {
    if (matchRef.current && !matchRef.current.matchOver) {
      matchRef.current.point(team);
      audioRef.current.beepScoreConfirmed();
      const s = matchRef.current.getState();
      const tName = team === 'A' ? s.teamA.name : s.teamB.name;
      audioRef.current.announceScore(s.score.A, s.score.B, tName);
    }
  };

  const undo = () => {
    if (matchRef.current?.undo()) {
      showToast('↩ Point undone');
    }
  };

  const endMatch = () => {
    if (confirm('End match entirely?')) {
      detectorRef.current?.stop();
      wakeLockRef.current?.release();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsSetup(true);
      setMatchState(null);
    }
  };

  const downloadVideo = () => {
    if (recordedChunksRef.current.length === 0) return;
    const isMp4 = mediaRecorderRef.current?.mimeType.includes('mp4');
    const blob = new Blob(recordedChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BeachCoach-Match-${new Date().toISOString().split('T')[0]}.${isMp4 ? 'mp4' : 'webm'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // ── Render Components ──────────────────────────────────────

  if (isSetup) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-6 font-sans text-slate-100">
        <h1 className="text-4xl font-extrabold mb-8 tracking-tight bg-gradient-to-br from-blue-400 via-emerald-400 to-red-400 bg-clip-text text-transparent text-center">
          🏐 Live Score
        </h1>
        
        <div className="flex flex-col md:flex-row gap-8 w-full max-w-2xl">
          {/* Team A */}
          <div className="flex-1 bg-slate-900 rounded-2xl p-6 border-2 border-blue-500/30">
            <h2 className="text-xl font-bold text-blue-400 mb-4">Team A</h2>
            <div className="space-y-3">
              <input 
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Team Name (opt)" 
                value={teamAName} onChange={e => setTeamAName(e.target.value)} 
              />
              <input 
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Player 1" 
                value={teamAP1} onChange={e => setTeamAP1(e.target.value)} 
              />
              <input 
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Player 2" 
                value={teamAP2} onChange={e => setTeamAP2(e.target.value)} 
              />
            </div>
          </div>

          {/* Team B */}
          <div className="flex-1 bg-slate-900 rounded-2xl p-6 border-2 border-red-500/30">
            <h2 className="text-xl font-bold text-red-400 mb-4">Team B</h2>
            <div className="space-y-3">
              <input 
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-red-500 transition-colors"
                placeholder="Team Name (opt)" 
                value={teamBName} onChange={e => setTeamBName(e.target.value)} 
              />
              <input 
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-red-500 transition-colors"
                placeholder="Player 3" 
                value={teamBP1} onChange={e => setTeamBP1(e.target.value)} 
              />
              <input 
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:outline-none focus:border-red-500 transition-colors"
                placeholder="Player 4" 
                value={teamBP2} onChange={e => setTeamBP2(e.target.value)} 
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 bg-slate-900 border border-slate-700/50 py-3 px-6 rounded-xl cursor-pointer" onClick={() => setRecordMatch(!recordMatch)}>
          <div className={`w-12 h-6 rounded-full relative transition-colors ${recordMatch ? 'bg-emerald-500' : 'bg-slate-700'}`}>
            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${recordMatch ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </div>
          <span className="font-semibold text-slate-300">Record match to local camera roll</span>
        </div>

        <button 
          onClick={startMatch}
          className="mt-8 px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-lg shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:scale-105 active:scale-95"
        >
          Start Match →
        </button>
      </div>
    );
  }

  // Live Match View

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      
      {/* Toasts */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="bg-slate-800 border border-emerald-500 text-slate-100 px-5 py-2 rounded-xl font-semibold shadow-lg animate-in fade-in slide-in-from-top-4">
            {t.msg}
          </div>
        ))}
      </div>

      {/* Header / Score */}
      <div className="flex items-center justify-center gap-6 p-4 md:p-6 shrink-0 z-10">
        <div className={`flex flex-col items-center p-4 md:px-8 rounded-2xl min-w-[120px] md:min-w-[160px] transition-all ${matchState?.serving === 'A' ? 'ring-2 ring-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.2)] bg-blue-500/10' : 'bg-blue-500/5'}`}>
          <div className="text-blue-400 font-bold tracking-widest uppercase text-xs md:text-sm mb-1">{matchState?.teamA.name}</div>
          <div className="text-6xl md:text-8xl font-black leading-none">{matchState?.score.A}</div>
        </div>
        
        <div className="text-4xl font-light text-slate-600">–</div>

        <div className={`flex flex-col items-center p-4 md:px-8 rounded-2xl min-w-[120px] md:min-w-[160px] transition-all ${matchState?.serving === 'B' ? 'ring-2 ring-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.2)] bg-red-500/10' : 'bg-red-500/5'}`}>
          <div className="text-red-400 font-bold tracking-widest uppercase text-xs md:text-sm mb-1">{matchState?.teamB.name}</div>
          <div className="text-6xl md:text-8xl font-black leading-none">{matchState?.score.B}</div>
        </div>
      </div>

      {/* Match info row */}
      <div className="flex justify-center items-center gap-6 px-4 pb-2 text-xs md:text-sm font-medium text-slate-400 shrink-0">
        <div>Set {matchState?.currentSet} (to {matchState?.setTarget})</div>
        <div className="flex gap-1.5">
          {[1,2,3].map(i => {
            const isCurrent = i === matchState?.currentSet && !matchState?.matchOver;
            const wonA = matchState?.setHistory[i-1]?.winner === 'A';
            const wonB = matchState?.setHistory[i-1]?.winner === 'B';
            
            return (
              <div key={i} className={`w-2.5 h-2.5 rounded-full border ${isCurrent ? 'border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : wonA ? 'bg-blue-500 border-blue-500' : wonB ? 'bg-red-500 border-red-500' : 'border-slate-700 bg-slate-800'}`} />
            );
          })}
        </div>
        <div className="text-emerald-400">🏐 {matchState?.serving === 'A' ? matchState?.teamA.name : matchState?.teamB.name} serves</div>
        <div>Swap in {matchState?.pointsUntilSideChange} pts</div>
      </div>

      {/* Camera Area */}
      <div className="relative flex-1 bg-black mx-4 mb-2 mt-1 rounded-2xl overflow-hidden min-h-0 border border-slate-800">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full scale-x-[-1] pointer-events-none" />
        
        {/* Gesture feedback ring */}
        <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200 ${gestureActive ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-24 h-24 rounded-full border-4 border-emerald-500 animate-[ping_1s_cubic-bezier(0,0,0.2,1)_infinite]" />
        </div>

        {/* Player ID flash */}
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-emerald-500/50 text-emerald-400 px-6 py-2 rounded-full font-bold shadow-lg transition-opacity duration-300 ${idFlash.visible ? 'opacity-100' : 'opacity-0'}`}>
          {idFlash.msg}
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className="flex items-center justify-between px-4 pb-6 pt-2 shrink-0 gap-2">
        <button 
          onClick={undo} 
          disabled={!matchState?.canUndo}
          className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-30 active:scale-95 transition-all"
        >
          <RotateCcw size={20} />
        </button>

        <div className="flex gap-3">
          <button 
            onClick={() => manualScore('A')}
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-blue-500/50 text-blue-400 font-bold active:scale-95 transition-all flex items-center gap-2"
          >
            <PlusCircle size={16} /> <span>{matchState?.teamA.name}</span>
          </button>
          <button 
            onClick={() => manualScore('B')}
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-red-500/50 text-red-400 font-bold active:scale-95 transition-all flex items-center gap-2"
          >
            <PlusCircle size={16} /> <span>{matchState?.teamB.name}</span>
          </button>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-slate-300 active:scale-95 transition-all"
          >
            <Settings size={20} />
          </button>
          <button 
            onClick={endMatch}
            className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-900 border border-red-500/30 text-red-400 hover:bg-red-500/10 active:scale-95 transition-all"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" onClick={(e) => { if (e.target === e.currentTarget) setIsSettingsOpen(false); }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Settings size={20}/> Settings</h3>
            
            <div className="flex items-center justify-between py-3 border-b border-slate-800">
              <span className="font-medium text-slate-300">Voice Announcements</span>
              <button onClick={() => setVoiceEnabled(!voiceEnabled)} className={`w-12 h-6 rounded-full relative transition-colors ${voiceEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${voiceEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            
            <div className="flex items-center justify-between py-3">
              <span className="font-medium text-slate-300">Sound Effects</span>
              <button onClick={() => setSoundsEnabled(!soundsEnabled)} className={`w-12 h-6 rounded-full relative transition-colors ${soundsEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${soundsEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <button onClick={() => setIsSettingsOpen(false)} className="mt-6 w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-colors">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Match Over Overlay */}
      {matchState?.matchOver && (
        <div className="absolute inset-0 bg-slate-950/95 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95">
          <h2 className="text-5xl font-black mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            🏆 {matchState.matchWinner === 'A' ? matchState.teamA.name : matchState.teamB.name} Wins!
          </h2>
          <div className="text-xl text-slate-400 mb-10 font-medium">
            Sets: {matchState.sets.A} – {matchState.sets.B} 
            <span className="opacity-60 ml-2">({matchState.setHistory.map(s => `${s.A}-${s.B}`).join(', ')})</span>
          </div>
          
          <div className="flex flex-col gap-4 w-full max-w-xs">
            {recordedChunksRef.current.length > 0 && (
              <button onClick={downloadVideo} className="px-8 py-4 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                💾 Save Match Video
              </button>
            )}
            <button onClick={endMatch} className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2">
              <Check size={20} /> Finish Match
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
