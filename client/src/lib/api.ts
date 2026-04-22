// Décode toujours la forme { data: ... } des routes Express
export async function apiGet<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `HTTP ${resp.status}`);
  }
  const json = await resp.json();
  return (json && typeof json === "object" && "data" in json) ? (json.data as T) : (json as T);
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `HTTP ${resp.status}`);
  }
  const json = await resp.json();
  return (json && typeof json === "object" && "data" in json) ? (json.data as T) : (json as T);
}

export async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `HTTP ${resp.status}`);
  }
  const json = await resp.json();
  return (json && typeof json === "object" && "data" in json) ? (json.data as T) : (json as T);
}

export async function apiDelete<T>(url: string): Promise<T> {
  const resp = await fetch(url, { method: "DELETE" });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `HTTP ${resp.status}`);
  }
  const json = await resp.json();
  return (json && typeof json === "object" && "data" in json) ? (json.data as T) : (json as T);
}
