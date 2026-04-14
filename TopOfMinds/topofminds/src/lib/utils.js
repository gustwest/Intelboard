export function formatDate(date) {
  return new Date(date).toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function daysUntil(date) {
  const now = new Date();
  const target = new Date(date);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getContractStatusInfo(endDate, renewalNoticeDays = 30) {
  const days = daysUntil(endDate);
  if (days < 0) return { status: 'EXPIRED', label: 'Utgånget', color: 'danger', days };
  if (days <= renewalNoticeDays) return { status: 'EXPIRING_SOON', label: 'Löper ut snart', color: 'warning', days };
  return { status: 'ACTIVE', label: 'Aktivt', color: 'success', days };
}

export function getStatusLabel(status) {
  const labels = {
    AVAILABLE: 'Tillgänglig',
    ON_CONTRACT: 'På uppdrag',
    ON_LEAVE: 'Ledig',
    DRAFT: 'Utkast',
    ACTIVE: 'Aktivt',
    EXPIRING_SOON: 'Löper ut snart',
    EXPIRED: 'Utgånget',
    RENEWED: 'Förnyat',
    TERMINATED: 'Avslutat',
    HOURLY: 'Per timme',
    MONTHLY: 'Per månad',
    FIXED: 'Fast pris',
  };
  return labels[status] || status;
}

export function getStatusColor(status) {
  const colors = {
    AVAILABLE: 'success',
    ON_CONTRACT: 'primary',
    ON_LEAVE: 'neutral',
    DRAFT: 'neutral',
    ACTIVE: 'success',
    EXPIRING_SOON: 'warning',
    EXPIRED: 'danger',
    RENEWED: 'primary',
    TERMINATED: 'neutral',
  };
  return colors[status] || 'neutral';
}

export function parseSkills(skillsString) {
  if (!skillsString) return [];
  try {
    return JSON.parse(skillsString);
  } catch {
    return [];
  }
}

export function formatCurrency(amount) {
  if (!amount) return '–';
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
  }).format(amount);
}
