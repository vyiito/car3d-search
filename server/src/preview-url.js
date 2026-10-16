// Shared by collection, detail recovery and the UI (including saved results).
export function previewUrl(value, base) {
  if (!value || typeof value !== 'string') return null
  try {
    const url = new URL(value.trim(), base)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    // RenderHub keeps promotional flags, cart icons and site art here;
    // model renders live under /author/model/ on its CDN.
    if (/(?:^|\.)renderhub\.com$/i.test(url.hostname) && /^\/images\//i.test(url.pathname)) return null
    if (/(?:^|[\/_.-])(?:logo|avatar)(?:s)?(?:[\/_.-]|$)/i.test(url.pathname)) return null
    if (/(?:^|\/)(?:logos?|avatars?|icons?|emoji|sprites?)(?:\/|[_.-])/i.test(url.pathname)) return null
    if (/(?:^|\/)(?:blank|spacer|transparent|placeholder|loading|no[-_]?(?:image|thumbnail)|default[-_]?(?:image|thumbnail))(?:[_.\/-]|$)/i.test(url.pathname)) return null
    // These pages publish HTTP OG URLs although their images also use HTTPS.
    if (url.protocol === 'http:' && /^(?:www\.)?rigmodels\.com$/i.test(url.hostname)) url.protocol = 'https:'
    return url.href
  } catch { return null }
}
