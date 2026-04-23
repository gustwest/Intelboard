import { getCurrentUser } from '@/lib/auth/dal';
import { isAdmin } from '@/lib/auth/roles';
import { extractText } from '@/lib/documents/extract';

export const runtime = 'nodejs';

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const contentType = req.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      const { url } = await req.json();
      if (!url) return Response.json({ error: 'url krävs' }, { status: 400 });
      const result = await extractText(url, '', '');
      return Response.json(result);
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file) return Response.json({ error: 'Ingen fil bifogad' }, { status: 400 });

    const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return Response.json({ error: 'Filen är för stor (max 20 MB).' }, { status: 413 });
    }

    const buffer = Buffer.from(arrayBuffer);
    const result = await extractText(buffer, file.name, file.type);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message || 'Extraction misslyckades' }, { status: 500 });
  }
}
