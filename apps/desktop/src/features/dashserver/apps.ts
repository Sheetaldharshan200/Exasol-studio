// Pure helpers for the Dashboards tab, kept out of the component so they are
// unit-tested: which URL a hosted app is framed at, and nothing else.

/** The URL of a hosted app on the local server — or null when the route
 *  would leave it. A route from the inventory is data: it must resolve to the
 *  server's own origin and to an app or preview path, or it is not framed. */
export function appUrl(base: string, route: string): string | null {
  let origin: URL;
  let url: URL;
  try {
    origin = new URL(base);
    url = new URL(route, base);
  } catch {
    return null;
  }
  if (url.origin !== origin.origin) return null;
  if (!/^\/(apps|preview)\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*\/?$/.test(url.pathname)) return null;
  return `${origin.origin}${url.pathname}`;
}
