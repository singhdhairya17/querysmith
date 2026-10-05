/** Parses GraphQL Variables JSON (`query`/`mutation` companion map). Empty input → `{}`. */
export function parseGraphqlVariablesJson(
  raw: string,
): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(
      'Variables must be valid JSON (object), e.g. {"code":"US","input":{"title":"Hi"}}',
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'Variables JSON must be an object (not an array or primitive).',
    );
  }

  return parsed as Record<string, unknown>;
}
