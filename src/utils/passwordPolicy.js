import { validatePassword } from 'firebase/auth';
import { auth } from '../config';

/**
 * Password rules for sign-up, checked against the Firebase project's own
 * password policy (Firebase console → Authentication → Settings → Password
 * policy). validatePassword downloads the policy once and caches it, so the
 * checklist always matches the console and calling it per keystroke is cheap.
 *
 * If the policy can't be fetched (offline, or no policy set), FALLBACK_POLICY
 * is used instead. Keep it in sync with the console: currently min 6
 * characters, a number and a special character.
 */
const FALLBACK_POLICY = {
  minPasswordLength: 6,
  containsNumericCharacter: true,
  containsNonAlphanumericCharacter: true,
};

/** Rule definitions, in display order: policy option → label + local check. */
const RULES = [
  {
    key: 'minPasswordLength',
    status: 'meetsMinPasswordLength',
    label: (policy) => `At least ${policy.minPasswordLength} characters`,
    test: (pw, policy) => pw.length >= policy.minPasswordLength,
  },
  {
    key: 'containsUppercaseLetter',
    status: 'containsUppercaseLetter',
    label: () => 'An uppercase letter',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    key: 'containsLowercaseLetter',
    status: 'containsLowercaseLetter',
    label: () => 'A lowercase letter',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    key: 'containsNumericCharacter',
    status: 'containsNumericCharacter',
    label: () => 'A number',
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    key: 'containsNonAlphanumericCharacter',
    status: 'containsNonAlphanumericCharacter',
    label: () => 'A special character (e.g. ! @ # $ %)',
    test: (pw) => /[^A-Za-z0-9]/.test(pw),
  },
];

/** Rules the policy turns on, each marked met / not met for `password`. */
function buildRules(policy, password, status) {
  return RULES
    .filter((rule) => policy[rule.key])
    .map((rule) => ({
      key: rule.key,
      label: rule.label(policy),
      met: status ? status[rule.status] !== false : rule.test(password, policy),
    }));
}

/**
 * Check a password against the project's password policy.
 *
 * @param {string} password
 * @returns {Promise<{ isValid: boolean, rules: Array<{ key, label, met }> }>}
 */
export async function checkPassword(password) {
  try {
    const status = await validatePassword(auth, password);
    const policy = status.passwordPolicy?.customStrengthOptions || {};
    const rules = buildRules(policy, password, status);
    return { isValid: status.isValid, rules };
  } catch (e) {
    // Policy unavailable: check the known rules locally. Firebase still
    // enforces the real policy on sign-up, and its error names what's missing.
    const rules = buildRules(FALLBACK_POLICY, password, null);
    return { isValid: rules.every((r) => r.met), rules };
  }
}

/** The rules before anything is typed (nothing met yet). */
export function initialPasswordRules() {
  return buildRules(FALLBACK_POLICY, '', null);
}
