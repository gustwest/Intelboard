// Universal document text extractor — PDF, DOCX, XLSX, PPTX, Google Docs

export async function extractText(input, filename = '', mimeType = '') {
  if (typeof input === 'string') {
    return extractGoogleDoc(input);
  }

  const ext = (filename.split('.').pop() || '').toLowerCase();
  const type = (mimeType || '').toLowerCase();

  if (type.includes('pdf') || ext === 'pdf') {
    return extractPdf(input, filename);
  }
  if (type.includes('wordprocessingml') || type.includes('msword') || ext === 'docx' || ext === 'doc') {
    return extractDocx(input, filename);
  }
  if (type.includes('spreadsheetml') || type.includes('excel') || ext === 'xlsx' || ext === 'xls') {
    return extractExcel(input, filename);
  }
  if (type.includes('presentationml') || type.includes('powerpoint') || ext === 'pptx') {
    return extractPptx(input, filename);
  }
  // Plain text fallback
  return { text: input.toString('utf-8'), format: 'text', filename };
}

async function extractPdf(buffer, filename) {
  const mod = await import('pdf-parse');
  const pdfParse = mod.default || mod;
  const data = await pdfParse(buffer);
  return { text: data.text.trim(), format: 'pdf', filename };
}

async function extractDocx(buffer, filename) {
  const mod = await import('mammoth');
  const mammoth = mod.default || mod;
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value.trim(), format: filename.endsWith('.doc') ? 'doc' : 'docx', filename };
}

async function extractExcel(buffer, filename) {
  const mod = await import('xlsx');
  const XLSX = mod.default || mod;
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { RS: '\n' });
    if (csv.trim()) parts.push(`[${sheetName}]\n${csv}`);
  }
  return { text: parts.join('\n\n').trim(), format: filename.endsWith('.xls') ? 'xls' : 'xlsx', filename };
}

async function extractPptx(buffer, filename) {
  const mod = await import('jszip');
  const JSZip = mod.default || mod;
  const zip = await JSZip.loadAsync(buffer);
  const texts = [];

  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] || 0);
      const nb = parseInt(b.match(/(\d+)/)?.[1] || 0);
      return na - nb;
    });

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async('text');
    const matches = [...xml.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g)];
    const slideText = matches.map((m) => m[1]).filter(Boolean).join(' ');
    if (slideText.trim()) texts.push(slideText);
  }

  return { text: texts.join('\n\n').trim(), format: 'pptx', filename };
}

async function extractGoogleDoc(url) {
  const docMatch = url.match(/docs\.google\.com\/document\/d\/([^\/\?#]+)/);
  const sheetMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([^\/\?#]+)/);
  const slideMatch = url.match(/docs\.google\.com\/presentation\/d\/([^\/\?#]+)/);

  let exportUrl;
  if (docMatch) {
    exportUrl = `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
  } else if (sheetMatch) {
    exportUrl = `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=csv`;
  } else if (slideMatch) {
    exportUrl = `https://docs.google.com/presentation/d/${slideMatch[1]}/export/pdf`;
  } else {
    throw new Error('Ogiltig Google-dokumentlänk. Klistra in en länk till Google Docs, Sheets eller Slides.');
  }

  const res = await fetch(exportUrl, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Kunde inte hämta Google-dokument (${res.status}). Kontrollera att dokumentet är delat med "Alla med länken".`);
  }

  if (slideMatch) {
    const buffer = Buffer.from(await res.arrayBuffer());
    const mod = await import('pdf-parse');
    const pdfParse = mod.default || mod;
    const data = await pdfParse(buffer);
    return { text: data.text.trim(), format: 'google-slides', filename: 'presentation.pdf' };
  }

  const text = await res.text();
  const format = docMatch ? 'google-doc' : 'google-sheet';
  return { text: text.trim(), format, filename: `google-${format.replace('google-', '')}.txt` };
}
