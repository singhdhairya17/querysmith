export interface GraphqlQueryPayload {
  query: string;
  variables: Record<string, unknown>;
  operationName?: string;
  /** Extra HTTP headers sent with the request (e.g. Authorization). */
  httpHeaders?: Record<string, string>;
}
export interface GraphqlTestResult {
  ok: boolean;
  errors?: GraphqlValidationError[];
  data?: unknown;
}

export interface GraphqlValidationError {
  message: string;
  line?: number;
  column?: number;
  path?: (string | number)[];
}
