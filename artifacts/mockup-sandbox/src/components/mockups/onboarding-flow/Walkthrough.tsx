import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import "./_group.css";

const sections = [
  {
    title: "Create an account",
    screens: [{ title: "Signup + age confirmation", image: "signup.jpg" }],
  },
  {
    title: "Role questionnaire",
    screens: [
      { title: "Welcome", image: "questionnaire-welcome.jpg" },
      { title: "Social proof", image: "questionnaire-social-proof.jpg" },
      { title: "Role", image: "questionnaire-role.jpg" },
      { title: "Pain points", image: "questionnaire-pain.jpg" },
      { title: "Solution", image: "questionnaire-solution.jpg" },
      { title: "Features", image: "questionnaire-features.jpg" },
      { title: "Preferences", image: "questionnaire-preferences.jpg" },
      { title: "Processing", image: "questionnaire-processing.jpg" },
      { title: "Plan selection", image: "questionnaire-paywall.jpg" },
    ],
  },
  {
    title: "Profile setup",
    screens: [
      { title: "Basic information", image: "profile-step-1.jpg" },
      { title: "Additional information", image: "profile-step-2.jpg" },
      { title: "About RosterHockey", image: "profile-step-3.jpg" },
    ],
  },
  {
    title: "High School family onboarding",
    screens: [
      { title: "Choose a path", image: "high-school.jpg" },
      { title: "Parent verification · signed out", image: "parent-verification.jpg" },
    ],
  },
];

const steps = sections.flatMap((section, sectionIndex) =>
  section.screens.map((screen, sectionStep) => ({
    ...screen,
    section: section.title,
    sectionIndex,
    sectionStep,
    sectionLength: section.screens.length,
  })),
);

export function Walkthrough() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeStep = steps[activeIndex];
  const sectionStarts = useMemo(
    () => sections.map((_, sectionIndex) => steps.findIndex((step) => step.sectionIndex === sectionIndex)),
    [],
  );

  const goTo = (index: number) => {
    setActiveIndex(Math.max(0, Math.min(index, steps.length - 1)));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(0, index - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(steps.length - 1, index + 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const progress = ((activeIndex + 1) / steps.length) * 100;

  return (
    <main className="onboarding-gallery min-h-screen bg-slate-100 px-4 py-5 text-slate-950 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
              RosterHockey · onboarding review
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Interactive walkthrough
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Move through the existing onboarding screens in order.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
            Preview only · no data saved
          </span>
        </header>

        <section aria-label="Onboarding walkthrough" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">
                {activeStep.section}
              </p>
              <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">
                Screen {activeIndex + 1} of {steps.length}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="Overall walkthrough progress"
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-valuenow={activeIndex + 1}
            >
              <div
                className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <nav aria-label="Onboarding sections" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {sections.map((section, sectionIndex) => {
                const selected = sectionIndex === activeStep.sectionIndex;
                return (
                  <button
                    key={section.title}
                    type="button"
                    aria-current={selected ? "step" : undefined}
                    onClick={() => goTo(sectionStarts[sectionIndex])}
                    className={`min-h-10 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                      selected
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="block">{section.title}</span>
                    <span className="mt-0.5 block font-normal opacity-75">
                      {section.screens.length} {section.screens.length === 1 ? "screen" : "screens"}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="bg-slate-50 px-4 py-4 sm:px-6 sm:py-5">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {activeStep.section} · {activeStep.sectionStep + 1} of {activeStep.sectionLength}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">
                  {activeStep.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => goTo(0)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 hover:bg-white hover:text-slate-950"
                aria-label="Restart walkthrough"
              >
                <RotateCcw size={14} aria-hidden="true" />
                Restart
              </button>
            </div>

            <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-slate-200 bg-white p-3 sm:min-h-[420px] sm:p-5">
              <img
                key={activeStep.image}
                src={`/__mockup/images/onboarding/${activeStep.image}`}
                alt={`${activeStep.title} onboarding screen`}
                className="max-h-[420px] w-auto max-w-full rounded-md object-contain"
              />
            </div>

            <p className="mt-3 text-center text-xs text-slate-500">
              Screens are static captures. Buttons and forms inside them are not active.
            </p>
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => goTo(activeIndex - 1)}
              disabled={activeIndex === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Previous
            </button>
            <span className="text-xs text-slate-500">Tip: use ← and → keys</span>
            <button
              type="button"
              onClick={() => goTo(activeIndex + 1)}
              disabled={activeIndex === steps.length - 1}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
