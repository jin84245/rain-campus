import type { PlacementPreview } from '../core/placement';
/** Pure presentation mapping: conflict must stay red even when core returns []. */
export function getPreviewOverlayColor(status: PlacementPreview['status'], isNew: boolean): number {
  if (status === 'conflict') return 0xd94845;
  if (status === 'over-budget') return 0xe76e63;
  if (status === 'no-change') return 0x9bb2ab;
  return isNew ? 0x39df8c : 0x9bb2ab;
}
