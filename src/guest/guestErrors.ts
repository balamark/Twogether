import { GUEST_BLOCKED_CODE, guestBlockedMessage } from './guestMode';

/** Throw from a guest route handler to answer with an error status; error_code is kept end-to-end. */
export class GuestError extends Error {
  status: number;
  error_code?: string;
  constructor(status: number, message: string, error_code?: string) {
    super(message);
    this.status = status;
    this.error_code = error_code;
  }
}

/** Actions a guest truly can't do (payments, emailing real people, real counselors, uploads). */
export function blocked(): never {
  throw new GuestError(403, guestBlockedMessage(), GUEST_BLOCKED_CODE);
}
