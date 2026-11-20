import "./_group.css";

const sections = [
  {
    title: "Create an account",
    description: "Sign up and confirm adult age before creating an account.",
    screens: [
      { title: "Signup + age confirmation", image: "signup.jpg" },
    ],
  },
  {
    title: "Role questionnaire",
    description: "The nine-screen getting-started questionnaire.",
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
    description: "The three-step player profile onboarding.",
    screens: [
      { title: "Basic information", image: "profile-step-1.jpg" },
      { title: "Additional information", image: "profile-step-2.jpg" },
      { title: "About RosterHockey", image: "profile-step-3.jpg" },
    ],
  },
  {
    title: "High School family onboarding",
    description: "DEV-only synthetic onboarding and parent verification entry.",
    screens: [
      { title: "Choose a path", image: "high-school.jpg" },
      { title: "Parent verification · signed out", image: "parent-verification.jpg" },
    ],
  },
];

export function Current() {
  return (
    <main className="onboarding-gallery min-h-screen bg-slate-100 px-6 py-8 text-slate-950">
      <header className="mx-auto mb-8 max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
          RosterHockey · onboarding review
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Onboarding screens
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Current screens captured from the development preview routes. These
          are visual references only; forms and account actions are not active.
        </p>
      </header>

      <div className="mx-auto max-w-7xl space-y-10">
        {sections.map((section) => (
          <section key={section.title} aria-labelledby={section.title.replaceAll(" ", "-")}>
            <div className="mb-4 border-b border-slate-300 pb-3">
              <h2
                id={section.title.replaceAll(" ", "-")}
                className="text-xl font-semibold"
              >
                {section.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{section.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {section.screens.map((screen) => (
                <figure
                  key={screen.image}
                  className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm"
                >
                  <figcaption className="min-h-12 px-3 py-3 text-sm font-medium">
                    {screen.title}
                  </figcaption>
                  <img
                    src={`/__mockup/images/onboarding/${screen.image}`}
                    alt={`${screen.title} onboarding screen`}
                    loading="lazy"
                  />
                </figure>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
