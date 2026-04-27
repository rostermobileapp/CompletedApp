import type { CSSProperties } from 'react';

export const PAGE_BG = '#f5f4ee';

export const cardClass =
  'bg-white rounded-xl px-5 py-4 text-[#212121]';

export const cardStyle: CSSProperties = {
  borderWidth: '0.5px',
  borderStyle: 'solid',
  borderColor: 'rgba(0,0,0,0.15)',
};

export const sectionTitleClass =
  'text-[15px] font-medium text-[#212121] tracking-tight';

export type EventColor = {
  bg: string;
  text: string;
  borderTint: string;
};

export const EVENT_COLORS: Record<
  'game' | 'practice' | 'social' | 'tournament',
  EventColor
> = {
  game: { bg: '#EEEDFE', text: '#3C3489', borderTint: '#3C3489' },
  practice: { bg: '#E1F5EE', text: '#085041', borderTint: '#085041' },
  social: { bg: '#FAEEDA', text: '#633806', borderTint: '#633806' },
  tournament: { bg: '#F09595', text: '#3a0a0a', borderTint: '#3a0a0a' },
};
