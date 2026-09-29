/**
 * Thrown by data services when an operation requires a signed-in user but no
 * auth token is available. Screens can catch this to show a "sign in" gate
 * instead of a generic error or a misleading empty state.
 */
export class AuthRequiredError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}
