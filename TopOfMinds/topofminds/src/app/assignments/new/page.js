import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/dal';
import IntakeForm from './IntakeForm';

export const metadata = { title: 'Nytt uppdrag — TopOfMinds' };

export default async function NewAssignmentPage() {
  await requireAdmin();

  return (
    <div className="page">
      <div className="page-header">
        <Link href="/assignments" className="page-back">← Tillbaka till uppdrag</Link>
        <h1 className="page-title">Nytt uppdrag</h1>
        <p className="page-subtitle">
          Klistra in mail från konsultmäklare — AI extraherar strukturerade detaljer.
        </p>
      </div>

      <IntakeForm />
    </div>
  );
}
