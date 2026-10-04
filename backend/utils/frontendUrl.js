/**
 * Resolves the canonical user-facing frontend URL for email links, verification,
 * password resets, and redirects.
 */
function getFrontendBaseUrl() {
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL.trim().replace(/\/+$/, '');
  }

  if (process.env.FRONTEND_ORIGINS) {
    const origins = process.env.FRONTEND_ORIGINS.split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    const publicOrigin = origins.find(
      (o) => !o.includes('localhost') && !o.includes('127.0.0.1')
    );
    if (publicOrigin) return publicOrigin;
    if (origins.length > 0) return origins[0];
  }

  if (process.env.APP_URL) {
    let url = process.env.APP_URL.trim().replace(/\/+$/, '');
    // Auto-correct if APP_URL was accidentally configured as the backend API
    if (url.includes('-api') || url.includes('.api.')) {
      url = url.replace('-api', '-web').replace('.api.', '.web.');
    }
    return url;
  }

  return 'http://localhost:3000';
}

module.exports = { getFrontendBaseUrl };
