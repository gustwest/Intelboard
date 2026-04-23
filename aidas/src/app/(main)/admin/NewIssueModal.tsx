'use client';

import { useState, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import styles from './page.module.css';
import type { KanbanIssueData } from './KanbanBoard';

interface Props {
  onClose: () => void;
  onCreated: (issue: KanbanIssueData) => void;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function NewIssueModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<{ url: string; caption: string; preview: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const newImages: typeof images = [];

    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) continue;
      if (file.size > MAX_FILE_SIZE) continue;

      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      const dataUrl = `data:${file.type};base64,${base64}`;

      newImages.push({
        url: dataUrl,
        caption: file.name.replace(/\.[^.]+$/, ''),
        preview: dataUrl,
      });
    }

    setImages((prev) => [...prev, ...newImages]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      setError('Titel och beskrivning krävs');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/admin/kanban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          images: images.map((img) => ({ url: img.url, caption: img.caption })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Något gick fel');
        return;
      }

      const issue = await res.json();
      onCreated(issue);
    } catch {
      setError('Kunde inte skapa ärende');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <button
            className={styles.modalBack}
            onClick={onClose}
            aria-label="Tillbaka"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <h2>🆕 Nytt ärende</h2>
          <button className={styles.modalClose} onClick={onClose} aria-label="Stäng">✕</button>
        </div>

        <div className={styles.modalBody}>
          {error && <div className={styles.modalError}>{error}</div>}

          <div className={styles.formGroup}>
            <label>Titel *</label>
            <input
              type="text"
              className={styles.formInput}
              placeholder="Kort sammanfattning av ärendet..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label>Beskrivning *</label>
            <textarea
              className={styles.formTextarea}
              placeholder="Beskriv ärendet i detalj — vad behöver göras, varför, eventuella krav..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Bilder (valfritt)</label>
            <div
              className={styles.imageDropZone}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add(styles.imageDropZoneActive); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove(styles.imageDropZoneActive); }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove(styles.imageDropZoneActive);
                handleFiles(e.dataTransfer.files);
              }}
            >
              <span>📎 Dra bilder hit eller klicka för att välja</span>
              <span className={styles.imageDropHint}>Max 2MB per bild · JPG, PNG, WebP, GIF</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {images.length > 0 && (
              <div className={styles.imagePreviews}>
                {images.map((img, i) => (
                  <div key={i} className={styles.imagePreview}>
                    <img src={img.preview} alt={img.caption} />
                    <button
                      className={styles.imageRemove}
                      onClick={() => removeImage(i)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className="btn btn-secondary" onClick={onClose}>
            Avbryt
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim() || !description.trim()}
          >
            {isSubmitting ? 'Skapar...' : '🚀 Skapa ärende'}
          </button>
        </div>
      </div>
    </div>
  );
}
