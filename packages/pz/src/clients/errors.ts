export type ClientErrorCode = "not_configured" | "http_error" | "network_error" | "bad_response" | "budget_exceeded";

// Messages are built only from fixed strings and status codes, so a key echoed by a server or socket cannot reach one.
export class ClientError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number | null;
  readonly timedOut: boolean;

  constructor(code: ClientErrorCode, message: string, opts: { status?: number; timedOut?: boolean } = {}) {
    super(message);
    this.name = "ClientError";
    this.code = code;
    this.status = opts.status ?? null;
    this.timedOut = opts.timedOut ?? false;
  }
}
