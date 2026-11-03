/**
 * Small History-API router helpers.
 *
 * The app historically used `#/route` links. Every internal link is still
 * written that way for backwards compatibility, but this module converts it to
 * a real path (`/route`) so search engines see distinct, canonical URLs.
 */

export function toPath(target) {
  if (!target) return "/today";
  let value = String(target).trim();
  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#")) value = value.slice(1);
  if (!value.startsWith("/")) value = `/${value}`;
  return value;
}

export function currentPath() {
  if (location.hash.startsWith("#/")) return location.hash.slice(1);
  return `${location.pathname}${location.search}` || "/today";
}

export function navigateTo(target, { replace = false } = {}) {
  const path = toPath(target);
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  window.dispatchEvent(new Event("gndec:navigate"));
}

export function syncHashToPath() {
  if (location.hash.startsWith("#/")) {
    history.replaceState({}, "", location.hash.slice(1));
    return true;
  }
  return false;
}

/** Rewrite `href="#/x"` anchors to `href="/x"` after a render. */
export function rewriteLinks(root = document) {
  for (const anchor of root.querySelectorAll('a[href^="#/"]')) {
    anchor.setAttribute("href", anchor.getAttribute("href").slice(1));
  }
}

export function isInternalUrl(url) {
  if (!url || !url.startsWith("/")) return false;
  if (url.startsWith("//")) return false;
  if (url.startsWith("/assets/") || url.startsWith("/data/") || url.startsWith("/api/")) return false;
  if (url.startsWith("/map/") || url.startsWith("/fonts/")) return false;
  if (/\.(?:png|jpe?g|webp|svg|ico|css|js|json|xml|txt|woff2?|pdf)$/i.test(url.split("?")[0])) return false;
  return true;
}
