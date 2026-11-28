/**
 * A ticket's outline as an SVG path: a rounded rectangle with half-circle
 * notches bitten out of its edges. Drawn as the card's white background, so
 * the notches are real see-through cut-outs (not circles painted in the
 * page's colour over the card, which showed as circles and lines wherever
 * the card's shadow or anything behind it didn't match).
 *
 * @param {number} w
 * @param {number} h
 * @param {object} shape
 * @param {number} shape.radius        corner radius
 * @param {boolean} [shape.flatBottom] square bottom corners
 * @param {Array<{ side: 'top'|'bottom'|'left'|'right', at: number, fromEnd?: boolean, r: number }>} [shape.notches]
 *   each notch's centre, `at` px along its edge from the start (left / top),
 *   or from the end with `fromEnd`, and its radius
 */
export function ticketPath(w, h, { radius, flatBottom = false, notches = [] }) {
  const r = Math.min(radius, w / 2, h / 2);
  const rb = flatBottom ? 0 : r;
  const bites = { top: [], bottom: [], left: [], right: [] };
  notches.forEach((n) => {
    const len = n.side === 'top' || n.side === 'bottom' ? w : h;
    bites[n.side].push({ c: n.fromEnd ? len - n.at : n.at, nr: n.r });
  });
  const asc = (a, b) => a.c - b.c;
  const desc = (a, b) => b.c - a.c;
  // Clockwise from the top-left corner. Each bite is a half circle into the
  // card (sweep 0: the short way round, inwards).
  const d = [`M${r} 0`];
  bites.top.sort(asc).forEach(({ c, nr }) => d.push(`H${c - nr}A${nr} ${nr} 0 0 0 ${c + nr} 0`));
  d.push(`H${w - r}A${r} ${r} 0 0 1 ${w} ${r}`);
  bites.right.sort(asc).forEach(({ c, nr }) => d.push(`V${c - nr}A${nr} ${nr} 0 0 0 ${w} ${c + nr}`));
  d.push(rb ? `V${h - rb}A${rb} ${rb} 0 0 1 ${w - rb} ${h}` : `V${h}`);
  bites.bottom.sort(desc).forEach(({ c, nr }) => d.push(`H${c + nr}A${nr} ${nr} 0 0 0 ${c - nr} ${h}`));
  d.push(rb ? `H${rb}A${rb} ${rb} 0 0 1 0 ${h - rb}` : 'H0');
  bites.left.sort(desc).forEach(({ c, nr }) => d.push(`V${c + nr}A${nr} ${nr} 0 0 0 0 ${c - nr}`));
  d.push(`V${r}A${r} ${r} 0 0 1 ${r} 0Z`);
  return d.join('');
}
