export function extractSampleFlowToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^SF_[A-Za-z0-9_-]{12,60}$/.test(raw)) return raw;
  try {
    const parsed = new URL(raw, window.location.origin);
    const token = String(parsed.searchParams.get('token') || '').trim();
    return /^SF_[A-Za-z0-9_-]{12,60}$/.test(token) ? token : '';
  } catch {
    return '';
  }
}

export function buildSampleFlowPath(token) {
  return `/sample-flow/scan?token=${encodeURIComponent(token)}`;
}
