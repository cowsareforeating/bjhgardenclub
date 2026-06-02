import {
  CloudRain,
  Shovel,
  Layers,
  Scissors,
  Sparkles,
  Eye,
  Shrub,
  MoreHorizontal,
  type LucideIcon
} from 'lucide-react';

// Lucide icons for care activities. Chosen to NOT collide with icons already in
// use elsewhere (Leaf, Sprout, Map, Pencil, Camera, Trash2, Crosshair, Check…)
// or the water-source droplet — so each glyph reads unambiguously.
//   Watering → CloudRain   Weeding → Shovel     Mulching → Layers
//   Pruning  → Scissors    Trash    → Sparkles   Inspection → Eye
//   Planting → Shrub       Other    → MoreHorizontal
// Keyword-matched so new/renamed activity labels still resolve sensibly.
const RULES: Array<[RegExp, LucideIcon]> = [
  [/water/i, CloudRain],
  [/weed/i, Shovel],
  [/mulch/i, Layers],
  [/prun|trim/i, Scissors],
  [/trash|litter|clean|debris/i, Sparkles],
  [/inspect|check|monitor/i, Eye],
  [/plant/i, Shrub]
];

export function activityIcon(label: string): LucideIcon {
  for (const [re, Icon] of RULES) if (re.test(label)) return Icon;
  return MoreHorizontal;
}
