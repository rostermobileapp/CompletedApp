import { useState } from "react";

interface AdultSignupConfirmationProps {
  value: boolean | null;
  onChange: (value: boolean) => void;
  onParentSetup?: () => void;
}

export function AdultSignupConfirmation({
  value,
  onChange,
  onParentSetup,
}: AdultSignupConfirmationProps) {
  const [share, setShare] = useState(false);

  const choiceClass = (selected: boolean) =>
    `min-h-11 w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2
    ${selected
      ? "border-blue-700 bg-blue-600 text-white hover:bg-blue-700"
      : "border-gray-400 bg-white text-gray-900 hover:bg-gray-100"}`;

  return (
    <fieldset className="space-y-3 rounded-xl border border-gray-300 bg-white p-4 text-gray-900">
      <legend className="bg-white px-1 text-sm font-semibold text-gray-900">
        I am 18 or older
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          className={choiceClass(value === true)}
          aria-pressed={value === true}
          onClick={() => onChange(true)}
        >
          Yes, I am 18+
        </button>
        <button
          type="button"
          className={choiceClass(value === false)}
          aria-pressed={value === false}
          onClick={() => onChange(false)}
        >
          No, I am under 18
        </button>
      </div>
      {value === false && (
        <div role="status" className="space-y-2 text-sm">
          <p>Ask a parent to set up your account</p>
          {onParentSetup ? (
            <button
              type="button"
              className="block rounded-lg border border-gray-400 px-4 py-2 text-gray-900 hover:bg-gray-100"
              onClick={onParentSetup}
            >
              My parent is here — enter parent info and setup code
            </button>
          ) : (
            <a className="block underline" href="/login?signup=1">
              Have a parent continue setup here
            </a>
          )}
          <button type="button" className="underline" onClick={() => setShare(true)}>
            Get a parent setup link
          </button>
          {share && (
            <label className="block">
              Share this link with your parent
              <input
                aria-label="Parent setup link"
                className="w-full rounded border border-gray-400 p-2 text-gray-900"
                readOnly
                value={`${window.location.origin}/login?signup=1`}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          )}
          <p>No account has been created.</p>
        </div>
      )}
    </fieldset>
  );
}
