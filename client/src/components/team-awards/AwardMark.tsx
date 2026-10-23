import { useState } from 'react';
import type { AwardPreset } from '@shared/teamAwards';
import { awardIcons } from './icons';

export function AwardMark({ imageUrl, presetIcon, className = 'h-full w-full object-contain', iconClassName = 'h-5 w-5' }: {
  imageUrl?: string | null;
  presetIcon: AwardPreset;
  className?: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = awardIcons[presetIcon];
  return imageUrl && !failed
    ? <img src={imageUrl} alt="" className={className} onError={() => setFailed(true)} />
    : <Icon aria-hidden="true" className={iconClassName} />;
}
