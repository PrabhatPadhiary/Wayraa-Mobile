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

/**
 * Thrown when the user is signed in but isn't allowed to do something, for
 * example a trip viewer trying to add a place. Distinct from AuthRequiredError
 * so screens can say "you can't edit this trip" instead of "sign in".
 */
export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
