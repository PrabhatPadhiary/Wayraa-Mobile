/**
 * "₹8,400", "$120", "AED 1,200": a whole amount with the trip's currency
 * symbol. Codes (two or more capitals) read better with a space before the number.
 */
export function formatMoney(amount, currency) {
  const n = Math.round(Number(amount) || 0).toLocaleString();
  const cur = currency || '₹';
  return /^[A-Z]{2,}/.test(cur) ? `${cur} ${n}` : `${cur}${n}`;
}
