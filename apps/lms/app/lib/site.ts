import { getMarketingUrl } from "./host";
import { clearEnrollmentIntent, sanitizeReturnUrl } from "./auth-redirect";

/**
 * The portal has no sign-in form of its own: learners sign in on the public
 * website, which hands the session over to /sso. These build the website
 * addresses the portal sends people to.
 */
export const SITE_URL = getMarketingUrl();

/**
 * Click handler for a link to the website that is rendered on the server.
 * There the address is still "localhost", and React keeps that href when the
 * page loads, so on a phone over Wi-Fi the link would go nowhere. The address
 * is worked out again at the moment of the tap.
 */
export const toSite = (path = "") => (e: { preventDefault(): void }) => {
  e.preventDefault();
  const base = getMarketingUrl();
  window.location.assign(`${base}${path}`);
};

/** Only paths inside the portal are carried, so the link cannot point elsewhere. */
const portalPath = (path: string) => sanitizeReturnUrl(path, "/");

/** Helper to retrieve the current LMS origin for handoff preservation */
function getCurrentLmsOrigin(): string | null {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return null;
}

/** Website sign-in that returns to `path` in the portal afterwards. */
export const siteLoginUrl = (path = "/", reason?: string) => {
  const safePath = portalPath(path);
  const params = new URLSearchParams({
    portal: safePath,
    redirect: safePath,
  });
  const currentOrigin = getCurrentLmsOrigin();
  if (currentOrigin) {
    params.set("lms_origin", currentOrigin);
  }
  if (reason) params.set("reason", reason);
  return `${getMarketingUrl()}/login?${params.toString()}`;
};

/** Website sign-up that returns to `path` in the portal afterwards. */
export const siteSignupUrl = (path = "/") => {
  const safePath = portalPath(path);
  const params = new URLSearchParams({
    portal: safePath,
    redirect: safePath,
  });
  const currentOrigin = getCurrentLmsOrigin();
  if (currentOrigin) {
    params.set("lms_origin", currentOrigin);
  }
  return `${getMarketingUrl()}/signup?${params.toString()}`;
};

/**
 * Signs out here and on the website. Without the website half, the portal
 * would be handed the same session straight back.
 */
export function signOutEverywhere(reason?: string) {
  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
  clearEnrollmentIntent();
  const currentOrigin = getCurrentLmsOrigin();
  const originParam = currentOrigin ? `&lms_origin=${encodeURIComponent(currentOrigin)}` : "";
  const reasonParam = reason ? `&reason=${encodeURIComponent(reason)}` : "";
  const url = `${getMarketingUrl()}/login?signout=1${reasonParam}${originParam}`;
  window.location.href = url;
}
