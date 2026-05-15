const LOGIN_NOTICE_KEY = 'lims_login_notice';

export function shouldReauthOn401(data) {
  if (!data || typeof data !== 'object') return false;
  const c = data.code;
  if (c === 'TOKEN_EXPIRED' || c === 'INVALID_TOKEN' || c === 'AUTH_REQUIRED') return true;
  const e = String(data.error || '').toLowerCase();
  return e === 'invalid token' || e === 'missing token';
}

export function redirectToLoginAfter401(message) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('lims_user');
  } catch (_) {}
  const text = (message && String(message).trim()) ? String(message).trim() : '登录已失效，请重新登录';
  try {
    sessionStorage.setItem(LOGIN_NOTICE_KEY, text);
  } catch (_) {}
  const isMobileCtx =
    (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.()) ||
    (window.location?.pathname?.startsWith('/mobile'));
  const path = isMobileCtx ? '/mobile/login' : '/login';
  window.location.replace(path);
}

/** 登录页挂载时读取并清除，用于展示友好提示 */
export function consumeLoginNotice() {
  if (typeof window === 'undefined') return '';
  try {
    const v = sessionStorage.getItem(LOGIN_NOTICE_KEY);
    if (v) sessionStorage.removeItem(LOGIN_NOTICE_KEY);
    return v || '';
  } catch {
    return '';
  }
}

export async function readApiJson(r, defaultErr) {
  const text = await r.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 240) };
    }
  }
  if (r.status === 401 && shouldReauthOn401(data)) {
    const msg = data.error || defaultErr || '登录已失效，请重新登录';
    redirectToLoginAfter401(msg);
    throw new Error(msg);
  }
  if (!r.ok) {
    throw new Error(data.error || defaultErr);
  }
  return data;
}

/** 响应体为 blob 成功、失败为 JSON 时的 401 处理（如导出） */
export async function throwIfErrorOrReturnBlob(r, errDefault) {
  if (r.ok) return r.blob();
  const text = await r.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 240) };
    }
  }
  if (r.status === 401 && shouldReauthOn401(data)) {
    const msg = data.error || errDefault || '登录已失效，请重新登录';
    redirectToLoginAfter401(msg);
    throw new Error(msg);
  }
  throw new Error(data.error || errDefault);
}
