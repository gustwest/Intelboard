'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './feedback-bubble.module.css';

type Tool = 'pen' | 'text' | 'arrow';

interface Point {
  x: number;
  y: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function FeedbackBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'idle' | 'capturing' | 'annotate' | 'form'>('idle');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Annotation state
  const [currentTool, setCurrentTool] = useState<Tool>('pen');
  const [penColor, setPenColor] = useState('#ff4444');
  const [isDrawing, setIsDrawing] = useState(false);
  const [annotations, setAnnotations] = useState<ImageData[]>([]);

  // Zoom state
  const [zoomLevel, setZoomLevel] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const internalSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const captureScreenshot = async () => {
    setStep('capturing');
    try {
      const bubbleEl = document.getElementById('feedback-bubble-root');
      if (bubbleEl) bubbleEl.style.display = 'none';

      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        logging: false,
        ignoreElements: (el) => el.id === 'feedback-bubble-root',
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      });

      const dataUrl = canvas.toDataURL('image/png');
      setScreenshot(dataUrl);
      setStep('annotate');
      setZoomLevel(1);

      if (bubbleEl) bubbleEl.style.display = '';
    } catch (err) {
      console.error('Screenshot failed:', err);
      setStep('form');
      if (document.getElementById('feedback-bubble-root')) {
        document.getElementById('feedback-bubble-root')!.style.display = '';
      }
    }
  };

  const initCanvas = useCallback(() => {
    if (!canvasRef.current || !screenshot) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      internalSizeRef.current = { w: img.width, h: img.height };
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      bgImageRef.current = img;
    };
    img.src = screenshot;
  }, [screenshot]);

  useEffect(() => {
    if (step === 'annotate') {
      const timer = setTimeout(initCanvas, 100);
      return () => clearTimeout(timer);
    }
  }, [step, initCanvas]);

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (currentTool === 'text') return;
    e.preventDefault();
    const point = getCanvasPoint(e);
    if (!point) return;
    setIsDrawing(true);
    lastPointRef.current = point;
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const point = getCanvasPoint(e);
    if (!ctx || !point || !lastPointRef.current) return;

    const lineW = 4 * (canvasRef.current.width / 800);

    if (currentTool === 'pen') {
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = penColor;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else if (currentTool === 'arrow') {
      if (bgImageRef.current) {
        ctx.drawImage(bgImageRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        annotations.forEach((data) => ctx.putImageData(data, 0, 0));
      }
      drawArrow(ctx, lastPointRef.current, point, penColor, lineW);
    }

    if (currentTool === 'pen') {
      lastPointRef.current = point;
    }
  };

  const endDraw = () => {
    if (isDrawing && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const data = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        setAnnotations((prev) => [...prev, data]);
      }
    }
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (currentTool !== 'text' || !canvasRef.current) return;
    const point = getCanvasPoint(e);
    if (!point) return;

    const text = prompt('Skriv text:');
    if (!text) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const fontSize = Math.round(24 * (canvasRef.current.width / 800));
    ctx.font = `bold ${fontSize}px sans-serif`;

    const metrics = ctx.measureText(text);
    const pad = fontSize * 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(point.x - pad, point.y - fontSize, metrics.width + pad * 2, fontSize * 1.3);
    ctx.fillStyle = penColor;
    ctx.fillText(text, point.x, point.y);

    const data = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    setAnnotations((prev) => [...prev, data]);
  };

  const drawArrow = (ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, lineW: number) => {
    const headLen = lineW * 5;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  const undoAnnotation = () => {
    if (!canvasRef.current || !bgImageRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const newAnnotations = annotations.slice(0, -1);
    setAnnotations(newAnnotations);
    ctx.drawImage(bgImageRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    if (newAnnotations.length > 0) {
      ctx.putImageData(newAnnotations[newAnnotations.length - 1], 0, 0);
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    setZoomLevel((prev) => {
      const next = direction === 'in' ? prev + 0.5 : prev - 0.5;
      return Math.max(0.5, Math.min(4, next));
    });
  };

  const proceedToForm = () => {
    if (canvasRef.current) {
      setScreenshot(canvasRef.current.toDataURL('image/png'));
    }
    setStep('form');
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Titel krävs');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const pagePath = window.location.pathname;
      const fullDesc = `${description.trim()}\n\n---\n📍 Sida: ${pagePath}\n📅 ${new Date().toLocaleString('sv-SE')}`;

      const body: Record<string, unknown> = {
        title: `[Feedback] ${title.trim()}`,
        description: fullDesc,
      };

      if (screenshot) {
        body.images = [{ url: screenshot, caption: `Skärmdump från ${pagePath}` }];
      }

      const res = await fetch(`${API_URL}/api/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setError('Kunde inte skapa ärende');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        resetState();
      }, 2000);
    } catch {
      setError('Något gick fel — kontrollera att backend körs');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetState = () => {
    setIsOpen(false);
    setStep('idle');
    setScreenshot(null);
    setTitle('');
    setDescription('');
    setError('');
    setSuccess(false);
    setAnnotations([]);
    setCurrentTool('pen');
    setZoomLevel(1);
    bgImageRef.current = null;
    lastPointRef.current = null;
  };

  const handleOpen = () => {
    if (isOpen) {
      resetState();
    } else {
      setIsOpen(true);
    }
  };

  const getCanvasDisplayStyle = (): React.CSSProperties => {
    const { w, h } = internalSizeRef.current;
    if (!w || !h) return {};
    const maxDisplayW = Math.min(window.innerWidth - 48, 860);
    const baseScale = Math.min(maxDisplayW / w, 1);
    const displayW = w * baseScale * zoomLevel;
    const displayH = h * baseScale * zoomLevel;
    return {
      width: `${displayW}px`,
      height: `${displayH}px`,
      cursor: currentTool === 'text' ? 'text' : 'crosshair',
    };
  };

  return (
    <div id="feedback-bubble-root" className={styles.root} data-feedback-bubble>
      {/* Floating Button */}
      <button
        className={`${styles.fab} ${isOpen ? styles.fabActive : ''}`}
        onClick={handleOpen}
        title="Ge feedback"
      >
        {isOpen ? '✕' : '💡'}
      </button>

      {/* Quick Menu */}
      {isOpen && step === 'idle' && (
        <div className={styles.quickMenu}>
          <div className={styles.quickMenuTitle}>Ge feedback</div>
          <button className={styles.quickMenuItem} onClick={captureScreenshot}>
            📸 Skärmdump + feedback
          </button>
          <button className={styles.quickMenuItem} onClick={() => setStep('form')}>
            ✍️ Bara text
          </button>
        </div>
      )}

      {/* Capturing indicator */}
      {step === 'capturing' && (
        <div className={styles.capturing}>
          <div className={styles.capturingSpinner} />
          Tar skärmdump...
        </div>
      )}

      {/* Annotation Canvas */}
      {step === 'annotate' && (
        <div className={styles.annotateOverlay} onClick={(e) => e.target === e.currentTarget && proceedToForm()}>
          <div className={styles.annotatePanel}>
            <div className={styles.annotateHeader}>
              <h3>✏️ Annotera skärmdumpen</h3>
              <button className={styles.annotateSkip} onClick={proceedToForm}>
                Hoppa över →
              </button>
            </div>

            <div className={styles.annotateToolbar}>
              <div className={styles.toolGroup}>
                <button className={`${styles.toolBtn} ${currentTool === 'pen' ? styles.toolBtnActive : ''}`} onClick={() => setCurrentTool('pen')} title="Penna">🖊️</button>
                <button className={`${styles.toolBtn} ${currentTool === 'arrow' ? styles.toolBtnActive : ''}`} onClick={() => setCurrentTool('arrow')} title="Pil">➡️</button>
                <button className={`${styles.toolBtn} ${currentTool === 'text' ? styles.toolBtnActive : ''}`} onClick={() => setCurrentTool('text')} title="Text">Aa</button>
              </div>

              <div className={styles.colorGroup}>
                {['#ff4444', '#ffaa00', '#44ff44', '#4488ff', '#ffffff'].map((c) => (
                  <button
                    key={c}
                    className={`${styles.colorDot} ${penColor === c ? styles.colorDotActive : ''}`}
                    style={{ background: c }}
                    onClick={() => setPenColor(c)}
                  />
                ))}
              </div>

              <div className={styles.toolGroup}>
                <button className={styles.toolBtn} onClick={undoAnnotation} title="Ångra">↩️</button>
              </div>

              <div className={styles.zoomGroup}>
                <button className={styles.toolBtn} onClick={() => handleZoom('out')} title="Zooma ut" disabled={zoomLevel <= 0.5}>−</button>
                <span className={styles.zoomLabel}>{Math.round(zoomLevel * 100)}%</span>
                <button className={styles.toolBtn} onClick={() => handleZoom('in')} title="Zooma in" disabled={zoomLevel >= 4}>+</button>
              </div>
            </div>

            <div className={styles.canvasContainer} ref={canvasContainerRef}>
              <canvas
                ref={canvasRef}
                className={styles.canvas}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
                onClick={handleCanvasClick}
                style={getCanvasDisplayStyle()}
              />
            </div>

            <div className={styles.annotateFooter}>
              <button onClick={resetState}>Avbryt</button>
              <button onClick={proceedToForm}>✅ Klar — fortsätt</button>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      {step === 'form' && (
        <div className={styles.formPanel}>
          {success ? (
            <div className={styles.successMsg}>
              <span className={styles.successIcon}>✅</span>
              <span>Ärende skapat!</span>
            </div>
          ) : (
            <>
              <div className={styles.formHeader}>
                <h3>💡 Ny feedback</h3>
                <button className={styles.formClose} onClick={resetState}>✕</button>
              </div>

              {error && <div className={styles.formError}>{error}</div>}

              {screenshot && (
                <div className={styles.screenshotPreview}>
                  <img src={screenshot} alt="Skärmdump" />
                  <button className={styles.screenshotRemove} onClick={() => setScreenshot(null)}>
                    ✕ Ta bort bild
                  </button>
                </div>
              )}

              <input
                type="text"
                className={styles.formInput}
                placeholder="Kort titel — vad ska förbättras?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />

              <textarea
                className={styles.formTextarea}
                placeholder="Beskriv förbättringen eller problemet i detalj..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />

              <button
                className={styles.formSubmit}
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim()}
              >
                {isSubmitting ? 'Skickar...' : '🚀 Skicka feedback'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
