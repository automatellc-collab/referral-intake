/**
 * Parses a fetch Response as JSON, with a readable fallback when the body
 * isn't JSON at all — e.g. Vercel returns a plain-text "Request Entity Too
 * Large" body (HTTP 413) before a request ever reaches our route handler,
 * which a bare `response.json()` call surfaces as a cryptic parse error.
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    if (response.status === 413) {
      throw new Error(
        "The request was too large — attachments must total under 3MB combined. Try fewer or smaller files.",
      );
    }
    throw new Error(`The server returned an unexpected response (HTTP ${response.status}). Please try again.`);
  }
}
