// Systemets klocka i frontend — alltid Stockholm-tid.
//
// Backend lagrar instant-tidsstämplar i UTC (ISO 8601 med offset). `toLocaleString`
// formaterar visserligen på svenska med 'sv-SE', men TIDSZONEN blir körmiljöns: en
// svensk webbläsare råkar vara Stockholm, men server-rendering (UTC) och användare
// utomlands blir fel. Därför pinnar vi `timeZone: 'Europe/Stockholm'` explicit på varje
// visning så klockan ALLTID visar svensk tid, oavsett var koden kör.
//
// Använd dessa helpers i stället för rå `new Date(x).toLocaleString('sv-SE')`.

const TZ = 'Europe/Stockholm';
const LOCALE = 'sv-SE';

type DateInput = string | number | Date | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/** Datum + tid i Stockholm-tid (sv-SE). Ogiltig/saknad input → '—'. */
export function fmtDateTime(input: DateInput, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = toDate(input);
  return d ? d.toLocaleString(LOCALE, { timeZone: TZ, ...opts }) : '—';
}

/** Endast datum i Stockholm-tid (sv-SE). Ogiltig/saknad input → '—'. */
export function fmtDate(input: DateInput, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = toDate(input);
  return d ? d.toLocaleDateString(LOCALE, { timeZone: TZ, ...opts }) : '—';
}

/** Endast klockslag i Stockholm-tid (sv-SE). Ogiltig/saknad input → '—'. */
export function fmtTime(input: DateInput, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = toDate(input);
  return d ? d.toLocaleTimeString(LOCALE, { timeZone: TZ, ...opts }) : '—';
}
