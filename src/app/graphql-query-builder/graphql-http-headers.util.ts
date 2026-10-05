import { HttpHeaders } from '@angular/common/http';

/** Builds headers for GraphQL JSON POSTs; caller extras (e.g. Authorization) are merged in, then JSON defaults are enforced last. */
export function graphqlJsonHttpHeaders(
  extra?: Record<string, string> | null,
): HttpHeaders {
  const merged: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      const key = k.trim();
      if (!key || v === undefined || v === null) {
        continue;
      }
      merged[key] = String(v).trim();
    }
  }
  merged['Accept'] = 'application/json';
  merged['Content-Type'] = 'application/json';
  return new HttpHeaders(merged);
}

/**
 * Parses a JSON object of header names → string values for outbound GraphQL HTTP requests.
 * Empty / whitespace-only input yields `{}`.
 */
export function parseHttpHeadersJson(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      'HTTP headers must be valid JSON (object), e.g. {"Authorization":"Bearer your-token"}',
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('HTTP headers JSON must be an object, not an array or primitive.');
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    const key = k.trim();
    if (!key) {
      continue;
    }
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      throw new Error(`Header "${key}" must be a string, number, or boolean.`);
    }
    out[key] = String(v);
  }
  return out;
}
