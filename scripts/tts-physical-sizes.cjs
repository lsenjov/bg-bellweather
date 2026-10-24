// Physical print dimensions are independent of exported image resolution.
function physicalSize(item) {
  if (item.category) return item.category === 'policies'
    ? { width: 63, height: 88 } : { width: 40, height: 61 };
  const id = item.id;
  if (id === 'district-map') return { width: 420, height: 297 };
  if (id.startsWith('party-board-')) return { width: 287, height: 100 };
  if (id.startsWith('firm-reference-')) return { width: 210, height: 148 };
  if (id.startsWith('shared-reference-')) return { width: 148, height: 210 };
  if (id.startsWith('player-folio-')) return { width: 100, height: 90 };
  if (id.startsWith('opening-marker-')) return { width: 40, height: 61 };
  if (id.startsWith('agent-')) return item.kind === 'figurine'
    ? { width: 25.4 } : { width: 25.4, height: 25.4 };
  const size = id === 'early-bird' ? 24 : id === 'year' ? 12
    : id.startsWith('small-token-') || id.startsWith('reminder-') ? 16 : null;
  if (size) return { width: size, height: size };
  throw Error(`Missing physical dimensions: ${id}`);
}
module.exports = { physicalSize };
