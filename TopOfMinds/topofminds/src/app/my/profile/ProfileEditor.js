'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ChipInput from '@/components/ChipInput';
import { updateMyProfileAction } from './actions';

const LANG_LEVELS = ['native', 'fluent', 'basic'];

export default function ProfileEditor({ consultant, initial }) {
  const [skills, setSkills] = useState(initial.skills);
  const [industries, setIndustries] = useState(initial.industryExpertise);
  const [certs, setCerts] = useState(initial.certifications);
  const [languages, setLanguages] = useState(initial.languages);
  const [status, setStatus] = useState(initial.status);
  const [wantsNew, setWantsNew] = useState(initial.wantsNewAssignment);
  const [saveState, setSaveState] = useState(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('skills', JSON.stringify(skills));
    fd.set('industryExpertise', JSON.stringify(industries));
    fd.set('certifications', JSON.stringify(certs.filter((c) => c.name)));
    fd.set('languages', JSON.stringify(languages.filter((l) => l.language)));
    fd.set('status', status);
    if (wantsNew) fd.set('wantsNewAssignment', 'on');
    setSaveState(null);
    startTransition(async () => {
      const res = await updateMyProfileAction(undefined, fd);
      if (res?.ok) {
        setSaveState({ ok: true, msg: '✓ Profilen är sparad' });
        router.refresh();
      } else {
        setSaveState({ ok: false, msg: res?.message || 'Sparningen misslyckades' });
      }
    });
  };

  const addCert = () => setCerts([...certs, { name: '', year: '' }]);
  const updateCert = (i, field, val) => {
    const next = [...certs];
    next[i] = { ...next[i], [field]: val };
    setCerts(next);
  };
  const removeCert = (i) => setCerts(certs.filter((_, idx) => idx !== i));

  const addLang = () => setLanguages([...languages, { language: '', level: 'fluent' }]);
  const updateLang = (i, field, val) => {
    const next = [...languages];
    next[i] = { ...next[i], [field]: val };
    setLanguages(next);
  };
  const removeLang = (i) => setLanguages(languages.filter((_, idx) => idx !== i));

  return (
    <form onSubmit={onSubmit} className="profile-editor">
      <div className="ai-setting-card">
        <h3 className="profile-section-title">Kontakt & synlighet</h3>
        <div className="ai-setting-grid">
          <div className="ai-field">
            <label>Namn (ändras via admin)</label>
            <input type="text" value={`${consultant.firstName} ${consultant.lastName}`} disabled />
          </div>
          <div className="ai-field">
            <label>E-post (ändras via admin)</label>
            <input type="email" value={consultant.email} disabled />
          </div>
          <div className="ai-field">
            <label>Titel</label>
            <input type="text" name="title" defaultValue={initial.title} disabled={isPending} placeholder="Ex: Senior Projektledare" />
          </div>
          <div className="ai-field">
            <label>Telefon</label>
            <input type="text" name="phone" defaultValue={initial.phone} disabled={isPending} />
          </div>
          <div className="ai-field ai-field-wide">
            <label>LinkedIn</label>
            <input type="text" name="linkedin" defaultValue={initial.linkedin} disabled={isPending} placeholder="https://linkedin.com/in/..." />
          </div>
        </div>
      </div>

      <div className="ai-setting-card">
        <h3 className="profile-section-title">Tillgänglighet</h3>
        <div className="ai-setting-grid">
          <div className="ai-field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={isPending}>
              <option value="AVAILABLE">Tillgänglig</option>
              <option value="ON_CONTRACT">På uppdrag</option>
              <option value="ON_LEAVE">Ledig / borta</option>
            </select>
          </div>
          <div className="ai-field">
            <label className="profile-checkbox">
              <input
                type="checkbox"
                checked={wantsNew}
                onChange={(e) => setWantsNew(e.target.checked)}
                disabled={isPending}
              />
              <span>Öppen för nytt uppdrag</span>
            </label>
            <div className="ai-field-hint">Används som viktning vid matchning även om du står som "På uppdrag".</div>
          </div>
        </div>
      </div>

      <div className="ai-setting-card">
        <h3 className="profile-section-title">Om dig</h3>
        <div className="ai-field">
          <label>Bio</label>
          <textarea name="bio" rows={5} defaultValue={initial.bio} disabled={isPending} placeholder="Kort beskrivning av din profil, ledarstil och styrkor." />
        </div>
      </div>

      <div className="ai-setting-card">
        <h3 className="profile-section-title">Kompetenser</h3>
        <div className="ai-field">
          <label>Skills</label>
          <ChipInput value={skills} onChange={setSkills} disabled={isPending} placeholder="Ex: Projektledning, SAFe, Scrum Master" />
          <div className="ai-field-hint">Tryck Enter eller komma för att lägga till. Backspace för att ta bort sist tillagda.</div>
        </div>
        <div className="ai-field" style={{ marginTop: 14 }}>
          <label>Branscherfarenhet</label>
          <ChipInput value={industries} onChange={setIndustries} disabled={isPending} placeholder="Ex: Bank, E-handel, Telekom" />
        </div>
      </div>

      <div className="ai-setting-card">
        <h3 className="profile-section-title">Intressen & lärande</h3>
        <div className="ai-field">
          <label>Intresseområden</label>
          <textarea
            name="interests"
            rows={3}
            defaultValue={initial.interests}
            disabled={isPending}
            placeholder="Vilka områden brinner du extra för? (påverkar matchning positivt)"
          />
        </div>
        <div className="ai-field" style={{ marginTop: 10 }}>
          <label>Vill lära mig mer om</label>
          <textarea
            name="developmentGoals"
            rows={3}
            defaultValue={initial.developmentGoals}
            disabled={isPending}
            placeholder="Områden du vill utveckla – används för att hitta uppdrag som passar din utveckling."
          />
        </div>
      </div>

      <div className="ai-setting-card">
        <h3 className="profile-section-title">Certifieringar</h3>
        {certs.length === 0 && <p className="ai-empty">Inga certifieringar tillagda.</p>}
        {certs.map((c, i) => (
          <div key={i} className="profile-row">
            <input
              type="text"
              placeholder="Certifieringsnamn"
              value={c.name || ''}
              onChange={(e) => updateCert(i, 'name', e.target.value)}
              disabled={isPending}
            />
            <input
              type="text"
              placeholder="År"
              value={c.year || ''}
              onChange={(e) => updateCert(i, 'year', e.target.value)}
              disabled={isPending}
              style={{ maxWidth: 100 }}
            />
            <button type="button" className="ai-toggle-btn" onClick={() => removeCert(i)}>Ta bort</button>
          </div>
        ))}
        <button type="button" className="ai-toggle-btn" onClick={addCert} style={{ marginTop: 10 }}>+ Lägg till</button>
      </div>

      <div className="ai-setting-card">
        <h3 className="profile-section-title">Språk</h3>
        {languages.length === 0 && <p className="ai-empty">Inga språk tillagda.</p>}
        {languages.map((l, i) => (
          <div key={i} className="profile-row">
            <input
              type="text"
              placeholder="Språk"
              value={l.language || ''}
              onChange={(e) => updateLang(i, 'language', e.target.value)}
              disabled={isPending}
            />
            <select
              value={l.level || 'fluent'}
              onChange={(e) => updateLang(i, 'level', e.target.value)}
              disabled={isPending}
              style={{ maxWidth: 140 }}
            >
              {LANG_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
            </select>
            <button type="button" className="ai-toggle-btn" onClick={() => removeLang(i)}>Ta bort</button>
          </div>
        ))}
        <button type="button" className="ai-toggle-btn" onClick={addLang} style={{ marginTop: 10 }}>+ Lägg till</button>
      </div>

      <div className="profile-save-bar">
        {saveState && (
          <span className={saveState.ok ? 'ai-saved' : 'auth-error'}>{saveState.msg}</span>
        )}
        <button type="submit" className="ai-save-btn" disabled={isPending}>
          {isPending ? 'Sparar…' : 'Spara profil'}
        </button>
      </div>
    </form>
  );
}
