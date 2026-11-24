import { Field, HsyLabel, ScreenFrame, StepHeader } from "./shared";

export type SchoolRequest = { name: string; town: string; leagueId: string };

export function StaffSchoolRequestScreen({ value, update, leagues, busy, onBack, onSubmit }: {
  value: SchoolRequest;
  update: (patch: Partial<SchoolRequest>) => void;
  leagues: Array<{ id: string; name: string }>;
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return <ScreenFrame header={<StepHeader step={2} total={4} onBack={onBack}/>}
    action={<button className="hsy-primary" disabled={busy || !value.name.trim() || !value.town.trim() || !value.leagueId} onClick={onSubmit}>
      Request school review
    </button>}>
    <section className="hsy-content">
      <h1>Add your school</h1>
      <p className="hsy-subtitle">Head coaches and athletic directors can request a school or co-op. A league review is required.</p>
      <Field label="School or co-op name" value={value.name} maxLength={80} onChange={name => update({ name })}/>
      <Field label="City" value={value.town} maxLength={80} onChange={town => update({ town })}/>
      <HsyLabel>School league
        <select className="hsy-field" value={value.leagueId} onChange={event => update({ leagueId: event.target.value })}>
          <option value="">Choose a league</option>
          {leagues.map(league => <option key={league.id} value={league.id}>{league.name}</option>)}
        </select>
      </HsyLabel>
      {!leagues.length && <p className="hsy-alert">No eligible DEV leagues are available. Ask the test organiser to provide an approved school-league fixture.</p>}
      <p className="hsy-note">This submits a request only. It does not approve the school, create team access, send invitations or grant staff permissions.</p>
    </section>
  </ScreenFrame>;
}
