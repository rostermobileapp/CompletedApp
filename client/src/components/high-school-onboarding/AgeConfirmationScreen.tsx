import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { HsyButton, ScreenFrame } from "./shared";
import "./age-confirmation.css";

type AgeConfirmationScreenProps = {
  value: boolean | null;
  onChange: (value: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
  busy?: boolean;
  error?: string;
};

export function AgeConfirmationScreen({
  value,
  onChange,
  onBack,
  onContinue,
  busy = false,
  error,
}: AgeConfirmationScreenProps) {
  return (
    <ScreenFrame
      header={
        <header className="age-confirmation-header">
          <HsyButton
            className="age-confirmation-back"
            type="button"
            aria-label="Back"
            disabled={busy}
            onClick={onBack}
          >
            <ChevronLeft aria-hidden="true" size={22} />
          </HsyButton>
        </header>
      }
      error={error}
      action={
        <HsyButton
          className="age-confirmation-continue"
          type="button"
          disabled={value === null || busy}
          onClick={onContinue}
        >
          {busy ? "Continuing…" : "Continue"}
        </HsyButton>
      }
    >
      <section className="age-confirmation-content" aria-labelledby="age-confirmation-title">
        <h1 id="age-confirmation-title">Are you 18 or older?</h1>
        <p className="age-confirmation-subtitle">
          Players under 18 join Roster through a parent&apos;s account.
        </p>

        <div className="age-confirmation-choices" role="group" aria-label="Age confirmation">
          <HsyButton
            className={`age-confirmation-choice${value === true ? " is-selected" : ""}`}
            type="button"
            aria-pressed={value === true}
            disabled={busy}
            onClick={() => onChange(true)}
          >
            <span>Yes, I&apos;m 18 or older</span>
            {value === true ? (
              <Check className="age-confirmation-choice-icon" aria-hidden="true" size={20} strokeWidth={2.4} />
            ) : (
              <ChevronRight className="age-confirmation-choice-icon" aria-hidden="true" size={20} />
            )}
          </HsyButton>

          <HsyButton
            className={`age-confirmation-choice${value === false ? " is-selected" : ""}`}
            type="button"
            aria-pressed={value === false}
            disabled={busy}
            onClick={() => onChange(false)}
          >
            <span>No, I&apos;m under 18</span>
            {value === false ? (
              <Check className="age-confirmation-choice-icon" aria-hidden="true" size={20} strokeWidth={2.4} />
            ) : (
              <ChevronRight className="age-confirmation-choice-icon" aria-hidden="true" size={20} />
            )}
          </HsyButton>
        </div>
      </section>
    </ScreenFrame>
  );
}
