export type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiRequest<T = unknown> {
  method: ApiMethod;
  query?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: T;
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

export function json<T>(status: number, body: T): ApiResponse<T> {
  return {
    status,
    body,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  };
}

export function badRequest(message: string) {
  return json(400, { error: message });
}

export function notFound(message: string) {
  return json(404, { error: message });
}

export function methodNotAllowed(allowed: ApiMethod[]) {
  return {
    status: 405,
    body: { error: "Method not allowed" },
    headers: {
      allow: allowed.join(", "),
      "content-type": "application/json; charset=utf-8",
    },
  };
}

export async function withErrorBoundary<T>(fn: () => Promise<ApiResponse<T>>): Promise<ApiResponse<T | { error: string }>> {
  try {
    return await fn();
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
}
