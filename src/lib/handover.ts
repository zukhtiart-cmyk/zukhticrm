export const DEFAULT_CARE_NOTES = `Laminates & veneer: wipe with a soft damp cloth; avoid harsh chemicals and standing water.
Kitchen: clean countertops with mild soap; don't place hot vessels directly on quartz or laminate; clean the chimney filter monthly.
Hardware: hinges and channels are soft-close — don't force them; call us if a shutter drops.
Painted walls: wait 30 days before washing; use a damp sponge, no scrubbing.
Wood polish: keep away from direct sunlight; dust with a dry cloth.
False ceiling: report any water marks immediately — they usually mean a leak above.
Electrical: don't overload sockets; MCB trips repeatedly → call an electrician.`;

/** Warranty end date. */
export function warrantyEnds(startsOn: Date | null, months: number) {
  if (!startsOn) return null;
  const d = new Date(startsOn);
  d.setMonth(d.getMonth() + months);
  return d;
}
