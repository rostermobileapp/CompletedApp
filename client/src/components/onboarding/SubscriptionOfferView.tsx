import { ArrowLeft, Check, CircleCheck, LoaderCircle } from 'lucide-react';
import hockeyHero from './roster-hockey-hero.jpg';
import freePlayerArt from './free-player-art.jpg';
import './subscription-offer-view.css';

export type SubscriptionOfferTier = 'free' | 'player_pro' | 'commissioner';
export type SubscriptionOfferPeriod = 'yearly' | 'monthly';
export type SubscriptionOfferPriceKey =
  | 'player_pro_monthly'
  | 'player_pro_yearly'
  | 'commissioner_monthly'
  | 'commissioner_yearly';

export interface SubscriptionOfferViewProps {
  tier: SubscriptionOfferTier;
  period: SubscriptionOfferPeriod;
  appearance?: 'dark' | 'light';
  prices: Partial<Record<SubscriptionOfferPriceKey, string>>;
  savings: Partial<Record<'player_pro' | 'commissioner', number>>;
  busy: boolean;
  notice?: string;
  continueLabel?: string;
  onTierChange: (tier: SubscriptionOfferTier) => void;
  onPeriodChange: (period: SubscriptionOfferPeriod) => void;
  onContinue: () => void;
  onRestore: () => void;
  onBack: () => void;
}

const TIER_TABS: { id: SubscriptionOfferTier; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'player_pro', label: 'Player Pro' },
  { id: 'commissioner', label: 'Commissioner' },
];

const FEATURES: Record<SubscriptionOfferTier, string[]> = {
  free: [
    'View Schedule',
    'Personal Stats',
    'Team-Only Messaging',
    'Share and View Team/League Photos',
    'Join Teams/Leagues/Tournaments',
  ],
  player_pro: [
    'Everything in Free +',
    'Full Suite League Stats & Schedule',
    'Scorekeeping Tool',
    'Awards & Records',
    'Unlimited Player Messaging',
    'Collect Achievement Patches',
    'Playoff/Tournament Bracket Tool',
  ],
  commissioner: [
    'Everything in Free & Player Pro +',
    'League Scheduling',
    'League Announcements',
    'Schedule Team Events/Games & Private Skates',
  ],
};

const TIER_COPY: Record<SubscriptionOfferTier, { title: string }> = {
  free: { title: 'For Casual Players' },
  player_pro: { title: 'For Serious Hockey Players' },
  commissioner: { title: 'For League Managers' },
};

const PRICE_KEY: Record<Exclude<SubscriptionOfferTier, 'free'>, Record<SubscriptionOfferPeriod, SubscriptionOfferPriceKey>> = {
  player_pro: {
    monthly: 'player_pro_monthly',
    yearly: 'player_pro_yearly',
  },
  commissioner: {
    monthly: 'commissioner_monthly',
    yearly: 'commissioner_yearly',
  },
};

function openLegalLink(event: React.MouseEvent<HTMLAnchorElement>, url: string) {
  if (typeof (window as any).$agent !== 'undefined') {
    event.preventDefault();
    window.open(url, '_system');
  }
}

function getSavingsPercent(
  tier: Exclude<SubscriptionOfferTier, 'free'>,
  savings: SubscriptionOfferViewProps['savings'],
) {
  const supplied = savings[tier];
  return typeof supplied === 'number' && Number.isFinite(supplied) && supplied > 0
    ? Math.round(supplied)
    : null;
}

export default function SubscriptionOfferView({
  tier,
  period,
  appearance = 'dark',
  prices,
  savings,
  busy,
  notice,
  continueLabel = 'Continue',
  onTierChange,
  onPeriodChange,
  onContinue,
  onRestore,
  onBack,
}: SubscriptionOfferViewProps) {
  const isPaidTier = tier !== 'free';
  const title = TIER_COPY[tier].title;
  const discount = isPaidTier ? getSavingsPercent(tier, savings) : null;

  return (
    <div className={`subscription-offer${appearance === 'light' ? ' is-light' : ''}`}>
      <div className="subscription-offer__shell">
        <main className="subscription-offer__scroll">
          <section className="subscription-offer__hero" aria-label="Roster hockey">
            <img src={hockeyHero} alt="Roster hockey — less admin, more hockey" />
            <button
              className="subscription-offer__back"
              type="button"
              onClick={onBack}
              disabled={busy}
              aria-label="Go back"
            >
              <ArrowLeft aria-hidden="true" size={20} />
            </button>
          </section>

          <section className="subscription-offer__content">
            <h1 className="subscription-offer__title">{title}</h1>

            <div className="subscription-offer__tabs" role="tablist" aria-label="Choose your Roster plan">
              {TIER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={tier === tab.id}
                  className={`subscription-offer__tab${tier === tab.id ? ' is-selected' : ''}`}
                  onClick={() => onTierChange(tab.id)}
                  disabled={busy}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {tier === 'commissioner' && (
              <div className="subscription-offer__commissioner-note">
                <span className="subscription-offer__popular">Most popular tier</span>
                <span className="subscription-offer__league-note">Only 1 needed per league</span>
              </div>
            )}

            <ul className="subscription-offer__features" aria-label={`${title} features`}>
              {FEATURES[tier].map((feature, index) => {
                const isIntro = index === 0 && tier !== 'free';
                return (
                  <li key={feature} className={isIntro ? 'is-intro' : undefined}>
                    <span className="subscription-offer__check" aria-hidden="true">
                      <Check size={12} strokeWidth={3.2} />
                    </span>
                    <span>{feature}</span>
                  </li>
                );
              })}
            </ul>

            {tier === 'free' && (
              <div className="subscription-offer__free-art-wrap">
                <img
                  className="subscription-offer__free-art"
                  src={freePlayerArt}
                  alt="Hockey player giving a thumbs-down"
                  loading="lazy"
                />
              </div>
            )}

            {isPaidTier && (
              <div className="subscription-offer__packages" role="radiogroup" aria-label="Billing period">
                {(['yearly', 'monthly'] as const).map((option) => {
                  const selected = period === option;
                  const price = prices[PRICE_KEY[tier][option]];
                  return (
                    <button
                      className={`subscription-offer__package${selected ? ' is-selected' : ''}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      key={option}
                      onClick={() => onPeriodChange(option)}
                       disabled={busy}
                    >
                      {option === 'yearly' && discount !== null && (
                        <span className="subscription-offer__save">Save {discount}%</span>
                      )}
                      <span className="subscription-offer__package-title">
                        {option === 'yearly' ? 'Yearly' : 'Monthly'}
                      </span>
                      <span className="subscription-offer__price">
                        {price || '—'}
                        <span className="subscription-offer__price-period"> / {option === 'yearly' ? 'year' : 'month'}</span>
                      </span>
                      <span className="subscription-offer__radio" aria-hidden="true">
                        {selected && <CircleCheck size={27} fill="currentColor" strokeWidth={2} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </main>

        <footer className="subscription-offer__footer">
          {notice && <p className="subscription-offer__notice" role="status">{notice}</p>}
          <button
            className="subscription-offer__continue"
            type="button"
            onClick={onContinue}
            disabled={busy}
          >
            {busy && <LoaderCircle className="subscription-offer__spinner" size={18} aria-hidden="true" />}
            {continueLabel}
          </button>
          <button
            className="subscription-offer__restore"
            type="button"
            onClick={onRestore}
            disabled={busy}
          >
            Restore Purchases
          </button>
          <nav className="subscription-offer__legal" aria-label="Legal">
            <a href="https://www.roster-app.com/terms-of-service" target="_blank" rel="noreferrer"
              onClick={(event) => openLegalLink(event, 'https://www.roster-app.com/terms-of-service')}>
              Terms of Service
            </a>
            <span aria-hidden="true">·</span>
            <a href="https://www.roster-app.com/privacy-policy" target="_blank" rel="noreferrer"
              onClick={(event) => openLegalLink(event, 'https://www.roster-app.com/privacy-policy')}>
              Privacy Policy
            </a>
          </nav>
        </footer>
      </div>
    </div>
  );
}