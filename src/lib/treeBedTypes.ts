import type { TreeBedType } from './types';

// ============================================================================
// Bed-type semantics
// ----------------------------------------------------------------------------
// Bed "types" are a free-form, community-editable lookup, but a few behaviors
// hinge on the *kind* of type a bed carries — does it hold a tree, a NYC city
// tree, a pollinator planting. We infer that from the label, but ONLY here, so
// the (admittedly fragile) substring matching isn't copy-pasted across screens.
//
// If labels ever gain a structured category/boolean column, this is the single
// file to change — every caller goes through these helpers.
// ============================================================================

const labelHas = (label: string, needle: string) => label.toLowerCase().includes(needle);

export const isTreeType = (label: string) => labelHas(label, 'tree');
export const isCityTreeType = (label: string) => labelHas(label, 'city');
export const isPollinatorType = (label: string) => labelHas(label, 'pollinator');

/**
 * Given the full type list and the currently-selected ids, report which kinds
 * are selected. Drives whether the species / NYC-tree-id fields are shown.
 */
export function selectedTypeFlags(types: TreeBedType[], selectedIds: number[]) {
  const selected = types.filter((t) => selectedIds.includes(t.id));
  return {
    hasTree: selected.some((t) => isTreeType(t.label)),
    hasCityTree: selected.some((t) => isCityTreeType(t.label))
  };
}
