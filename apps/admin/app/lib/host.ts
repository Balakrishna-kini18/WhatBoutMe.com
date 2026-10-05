/**
 * The apps are configured with localhost addresses for development. On a
 * phone opening them over Wi-Fi, "localhost" is the phone itself, so in the
 * browser a localhost address is pointed at whichever host served the page.
 * A real (deployed) address is returned unchanged.
 */
export function onThisHost(url: string) {
  if (typeof window === "undefined") return url;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return url;
  return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/, `$1${host}`);
}
