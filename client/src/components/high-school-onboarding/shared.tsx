import { ArrowLeft, Check, ChevronRight, House, ShieldCheck, UserRound, UsersRound, Trophy } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./onboarding.css";

export type RequestFn = (method: string, path: string, body?: unknown) => Promise<any>;

export function HsyButton({className="",type="button",...props}:ComponentProps<typeof Button>){
  return <Button variant="ghost" type={type} className={className} {...props}/>;
}
export function HsyInput({className="",...props}:ComponentProps<typeof Input>){
  return <Input className={`hsy-field ${className}`} {...props}/>;
}
export function HsyLabel({className="",...props}:ComponentProps<typeof Label>){
  return <Label className={`hsy-label ${className}`} {...props}/>;
}

export function StepHeader({ step, total, onBack }: { step: number; total: number; onBack: () => void }) {
  return <header className="hsy-head">
    <HsyButton className="hsy-back" type="button" aria-label="Go back" onClick={onBack}><ArrowLeft size={22}/></HsyButton>
    <div className="hsy-progress" aria-label={`Step ${step} of ${total}`}><span style={{ width: `${Math.min(100, step / total * 100)}%` }}/></div>
    <span className="hsy-count">{step}/{total}</span>
  </header>;
}

export function ScreenFrame({ children, header, action, error, message }: {
  children: ReactNode; header?: ReactNode; action?: ReactNode; error?: string; message?: string;
}) {
  return <main className="hsy"><div className="hsy-frame">{header}{error && <div className="hsy-content" role="alert"><div className="hsy-error">{error}</div></div>}
    {message && <div className="hsy-content" role="status"><div className="hsy-success">{message}</div></div>}
    {children}{action && <div className="hsy-actions">{action}</div>}</div></main>;
}

export function ChoiceCard({ title, description, selected, icon, onClick }: {
  title: string; description: string; selected?: boolean; icon?: ReactNode; onClick: () => void;
}) {
  return <HsyButton className={`hsy-choice${selected ? " selected" : ""}`} type="button" aria-pressed={!!selected} onClick={onClick}>
    <span className="hsy-choice-icon">{icon}</span><span className="hsy-choice-copy"><strong>{title}</strong><small>{description}</small></span>
    {selected ? <Check className="hsy-check" size={20}/> : <ChevronRight size={20} color="#64748b"/>}
  </HsyButton>;
}

export function Field({ label, value, onChange, type = "text", placeholder, required, options, maxLength, min, name }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string;
  required?: boolean; options?: string[]; maxLength?: number; min?: string; name?: string;
}) {
  return <HsyLabel>{label}{options
    ? <select className="hsy-field" aria-label={label} name={name} value={value} required={required} onChange={e => onChange(e.target.value)}><option value="">Choose…</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select>
    : <HsyInput name={name} type={type} value={value} placeholder={placeholder} required={required} maxLength={maxLength} min={min} onChange={e => onChange(e.target.value)}/>}
  </HsyLabel>;
}

export function ProgressChoiceIcon({ kind }: { kind: "adult" | "hs" | "parent" | "staff" | "league" }) {
  const icons = { adult: <Trophy size={27}/>, hs: <House size={27}/>, parent: <UsersRound size={27}/>, staff: <UserRound size={27}/>, league: <ShieldCheck size={27}/> };
  return icons[kind];
}
