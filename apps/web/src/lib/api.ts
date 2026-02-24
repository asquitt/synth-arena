const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `API error: ${res.status}` }));
    const message = typeof body.error === "string"
      ? body.error
      : body.error?.message ?? `API error: ${res.status}`;
    throw new Error(message);
  }

  const json = await res.json();
  return json.data ?? json;
}
