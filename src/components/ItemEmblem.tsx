import {
  Box,
  Coins,
  Compass,
  Crown,
  Flame,
  Gem,
  Package,
  Shield,
  Shirt,
  Sparkles,
  Swords,
  Trophy,
  Utensils,
} from 'lucide-react';
import { RARITY_META } from '../data/aaCatalog.ts';
import type { Rarity } from '../types.ts';

interface ItemEmblemProps {
  kind: 'unit' | 'item' | 'currency';
  group?: string;
  rarity: Rarity;
  name: string;
  shiny?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ItemEmblem({
  kind,
  group = 'Other',
  rarity,
  name,
  shiny = false,
  size = 'md',
}: ItemEmblemProps) {
  const meta = RARITY_META[rarity];

  const sizeClasses =
    size === 'sm'
      ? 'w-8 h-8 rounded-md'
      : size === 'lg'
        ? 'w-12 h-12 rounded-lg'
        : 'w-10 h-10 rounded-lg';

  const iconSize = size === 'sm' ? 15 : size === 'lg' ? 21 : 18;

  const renderGlyph = () => {
    if (kind === 'currency') {
      const lower = name.toLowerCase();
      if (lower.includes('gem')) return <Gem size={iconSize} strokeWidth={1.9} />;
      if (lower.includes('gold')) return <Coins size={iconSize} strokeWidth={1.9} />;
      if (lower.includes('trophy')) return <Trophy size={iconSize} strokeWidth={1.9} />;
      return <Sparkles size={iconSize} strokeWidth={1.9} />;
    }
    if (kind === 'unit') {
      if (rarity === 'Secret') return <Crown size={iconSize} strokeWidth={1.9} />;
      if (rarity === 'Exclusive') return <Sparkles size={iconSize} strokeWidth={1.9} />;
      return <Swords size={iconSize} strokeWidth={1.9} />;
    }
    const g = group.toLowerCase();
    if (g.includes('portal')) return <Compass size={iconSize} strokeWidth={1.9} />;
    if (g.includes('evo') || g.includes('star')) return <Flame size={iconSize} strokeWidth={1.9} />;
    if (g.includes('relic') || g.includes('equip')) return <Shield size={iconSize} strokeWidth={1.9} />;
    if (g.includes('capsule') || g.includes('crate')) return <Box size={iconSize} strokeWidth={1.9} />;
    if (g.includes('skin') || g.includes('cosmetic')) return <Shirt size={iconSize} strokeWidth={1.9} />;
    if (g.includes('food')) return <Utensils size={iconSize} strokeWidth={1.9} />;
    if (g.includes('consum') || g.includes('reroll') || g.includes('cube')) {
      return <Gem size={iconSize} strokeWidth={1.9} />;
    }
    return <Package size={iconSize} strokeWidth={1.9} />;
  };

  return (
    <div
      className={`relative shrink-0 flex items-center justify-center select-none ${sizeClasses}`}
      style={{
        backgroundColor: meta.softBg,
        border: `1px solid ${meta.border}`,
        color: meta.text,
      }}
      title={`${name} (${rarity})`}
    >
      {renderGlyph()}
      {shiny && (
        <span
          className="absolute -top-1 -right-1 text-[10px] leading-none font-bold text-amber-300 drop-shadow"
          aria-label="Shiny"
          title="Shiny Unit"
        >
          ✦
        </span>
      )}
    </div>
  );
}
