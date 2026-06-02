import {
  Droplets,
  Cannabis,
  Layers,
  Scissors,
  Trash,
  Eye,
  Sprout,
  MoreHorizontal,
  type LucideIcon
} from 'lucide-react';

// Lucide icons for care activities, keyword-matched so new/renamed labels still
// resolve sensibly.
//   Watering → Droplets   Weeding → Cannabis   Mulching → Layers
//   Pruning  → Scissors   Trash    → Trash      Inspection → Eye
//   Planting → Sprout     Other    → MoreHorizontal
const RULES: Array<[RegExp, LucideIcon]> = [
  [/water/i, Droplets],
  [/weed/i, Cannabis],
  [/mulch/i, Layers],
  [/prun|trim/i, Scissors],
  [/trash|litter|clean|debris/i, Trash],
  [/inspect|check|monitor/i, Eye],
  [/plant/i, Sprout]
];

export function activityIcon(label: string): LucideIcon {
  for (const [re, Icon] of RULES) if (re.test(label)) return Icon;
  return MoreHorizontal;
}
