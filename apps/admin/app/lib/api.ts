export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")
    ? "https://what-bout-me-com.vercel.app"
    : "http://localhost:4000");

/** The API wraps errors as { error: { code, message } }. */
export async function errorMessage(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  const raw = data?.error?.message ?? data?.message;
  return (Array.isArray(raw) ? raw.join(", ") : raw) || `${fallback} (error ${res.status}).`;
}

/** Uploads an image or PDF and returns its public address. */
export async function uploadFile(file: File): Promise<string> {
  const res = await fetch(`${API_URL}/uploads`, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Could not upload the file"));
  return (await res.json()).url;
}
