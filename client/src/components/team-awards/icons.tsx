import { Flame, Shield, Star, Trophy, CircleDot, PersonStanding, type LucideIcon } from 'lucide-react';
import type { AwardPreset } from '@shared/teamAwards';

export const awardIcons: Record<AwardPreset, LucideIcon> = {
  trophy: Trophy, puck: CircleDot, star: Star, skate: PersonStanding, shield: Shield, flame: Flame,
};

export const awardPresets: AwardPreset[] = ['trophy', 'puck', 'star', 'skate', 'shield', 'flame'];

