/**
 * Commas in amounts, the same on every phone (not left to the device's
 * locale, which on some Android phones adds none). Rupees use Indian
 * grouping, like the offers: ₹1,00,000. Everything else: $100,000.
 */
export function groupDigits(value, currency) {
  const negative = String(value).trim().startsWith('-');
  const [whole, fraction] = String(value).replace(/[^\d.]/g, '').split('.');
  const digits = whole.replace(/^0+(?=\d)/, '') || '0';
  const indian = !currency || currency === '₹';
  let grouped;
  if (indian && digits.length > 3) {
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${digits.slice(-3)}`;
  } else {
    grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return `${negative ? '-' : ''}${grouped}${fraction !== undefined ? `.${fraction}` : ''}`;
}

/**
 * "₹8,400", "$120", "AED 1,200": a whole amount with the trip's currency
 * symbol. Codes (two or more capitals) read better with a space before the number.
 */
export function formatMoney(amount, currency) {
  const cur = currency || '₹';
  const n = groupDigits(Math.round(Number(amount) || 0), cur);
  return /^[A-Z]{2,}/.test(cur) ? `${cur} ${n}` : `${cur}${n}`;
}

/**
 * An amount field as you type: "125000" → "1,25,000". With `decimals`, up
 * to two digits after a point are kept ("1,250.5").
 */
export function formatAmountInput(text, currency, decimals = false) {
  let clean = String(text).replace(decimals ? /[^\d.]/g : /\D/g, '');
  if (decimals) {
    const point = clean.indexOf('.');
    if (point >= 0) clean = `${clean.slice(0, point + 1)}${clean.slice(point + 1).replace(/\./g, '').slice(0, 2)}`;
  }
  if (!clean) return '';
  if (clean.startsWith('.')) clean = `0${clean}`;
  return groupDigits(clean, currency);
}
