import { API_URL } from '../config';
import { getAuthToken } from './authService';
import { AuthRequiredError, ForbiddenError } from './errors';

/**
 * Trip budget + expenses API (Firebase auth).
 *
 * Expenses: /api/trips/{tripId}/expenses. Everyone on the trip can read;
 * owners can change any expense, editors only the ones they paid.
 * Expense shape: { id, title, amount, category, date, paidByMemberId,
 *   paidByName, notes, createdAt, updatedAt }
 * `category` is one of: stay | food | activity | transport | other.
 *
 * Budget: PUT /api/Trips/{id}/budget (owner only).
 */

function expensesUrl(tripId) {
  return `${API_URL}/trips/${encodeURIComponent(tripId)}/expenses`;
}

async function authHeaders(json = false) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  return json
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { Authorization: `Bearer ${token}` };
}

async function toError(response, fallback) {
  if (response.status === 401) return new AuthRequiredError();
  if (response.status === 403) return new ForbiddenError("You don't have permission to change this.");
  if (response.status === 404) return new Error('That trip or expense no longer exists.');
  if (response.status === 400) {
    const message = await response.text().catch(() => '');
    return new Error(message || fallback);
  }
  return new Error(`${fallback} (${response.status})`);
}

function expenseBody(expense) {
  return JSON.stringify({
    title: expense.title,
    amount: expense.amount,
    category: expense.category,
    date: expense.date,
    paidByMemberId: expense.paidByMemberId,
    paidByName: expense.paidByName,
    notes: expense.notes || null,
  });
}

/** All expenses for a trip, oldest first. */
export async function getExpenses(tripId) {
  const response = await fetch(expensesUrl(tripId), { headers: await authHeaders() });
  if (!response.ok) throw await toError(response, 'Could not load expenses.');
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * @param {{ title, amount, category, date, paidByMemberId, paidByName, notes? }} expense
 */
export async function createExpense(tripId, expense) {
  const response = await fetch(expensesUrl(tripId), {
    method: 'POST',
    headers: await authHeaders(true),
    body: expenseBody(expense),
  });
  if (!response.ok) throw await toError(response, 'Could not add that expense.');
  return response.json();
}

export async function updateExpense(tripId, expenseId, expense) {
  const response = await fetch(`${expensesUrl(tripId)}/${encodeURIComponent(expenseId)}`, {
    method: 'PUT',
    headers: await authHeaders(true),
    body: expenseBody(expense),
  });
  if (!response.ok) throw await toError(response, 'Could not save that expense.');
  return response.json();
}

/** Resolves to true when it's gone (including if it was already gone). */
export async function deleteExpense(tripId, expenseId) {
  const response = await fetch(`${expensesUrl(tripId)}/${encodeURIComponent(expenseId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (response.status === 404) return true;
  if (!response.ok) throw await toError(response, 'Could not delete that expense.');
  return true;
}

/** Set the trip's total budget and currency (owner only). Returns { totalBudget, currency }. */
export async function setTripBudget(tripId, { totalBudget, currency }) {
  const response = await fetch(`${API_URL}/Trips/${encodeURIComponent(tripId)}/budget`, {
    method: 'PUT',
    headers: await authHeaders(true),
    body: JSON.stringify({ totalBudget, currency }),
  });
  if (!response.ok) throw await toError(response, 'Could not save the budget.');
  return response.json();
}
