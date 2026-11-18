import { useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, FileText, X } from "lucide-react";
import { useSeo } from "@/hooks/useSeo";
import "./PartnerApplication.css";

const orgTypes = ["Hockey Association / Club", "Arena / Ice Facility", "Recreation League", "Youth Sports Organization", "Sports Media / Podcast", "Other"];

/** APP-owned public form; marketing and navigation live in the separate WEBSITE. */
export default function PartnerApplication() {
  useSeo({ title: "Partner Application | RosterHockey", description: "Partner with RosterHockey to support your hockey community through our referral program. Apply online and help teams stay connected.", canonical: "/referral-program/apply" });
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fileError, setFileError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ orgName: "", contactName: "", email: "", orgType: "", hockeyAffiliation: "" });
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
      setFile(null); setFileName(""); setFileError("Please upload a JPEG, PNG, or PDF file."); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFile(null); setFileName(""); setFileError("File must be under 10 MB."); return;
    }
    setFileError(""); setFileName(file.name); setFile(file);
  };
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || fileError) return;
    setSubmitting(true); setNotice("");
    const data = new FormData();
    data.append("orgName", form.orgName.trim());
    data.append("contactName", form.contactName.trim());
    data.append("email", form.email.trim().toLowerCase());
    data.append("orgType", form.orgType);
    if (form.hockeyAffiliation.trim()) data.append("hockeyAffiliation", form.hockeyAffiliation.trim());
    if (file) data.append("proofDocument", file);
    try {
      const response = await fetch("/api/referral/apply", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to submit your application. Please try again.");
      setSubmitted(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Network error. Please try again.");
    } finally { setSubmitting(false); }
  };
  return (
    <main className="rp-page partner-page">
      <section className="partner-apply" id="apply">
        <div className="partner-container partner-apply-layout">
          <div><span className="rp-kicker">Make the next season count</span><h2 className="rp-title rp-title-sm">Apply to become<br />a partner.</h2><p>Takes about three minutes. We review every application personally.</p><div className="partner-apply-note"><CheckCircle2 size={17} /> Confirm your email to submit your application for review.</div></div>
          {submitted ? <div className="partner-form" role="status"><CheckCircle2 size={32} /><h3>Check your email</h3><p>We sent a confirmation link to <strong>{form.email}</strong>. Click it to submit your application for review.</p></div> :
          <form className="partner-form" onSubmit={handleSubmit}>
            <label>Organization name<input required value={form.orgName} placeholder="Greater Cleveland Hockey Association" onChange={event => setForm({ ...form, orgName: event.target.value })} /></label>
            <div className="partner-form-row"><label>Contact name<input required value={form.contactName} placeholder="Your name" onChange={event => setForm({ ...form, contactName: event.target.value })} /></label><label>Email address<input required type="email" value={form.email} placeholder="you@yourorganization.org" onChange={event => setForm({ ...form, email: event.target.value })} /></label></div>
            <label>Organization type<select required value={form.orgType} onChange={event => setForm({ ...form, orgType: event.target.value })}><option value="">Select a type…</option>{orgTypes.map(type => <option key={type}>{type}</option>)}</select></label>
            <label>Tell us about your hockey involvement <span>(optional)</span><textarea rows={3} value={form.hockeyAffiliation} placeholder="e.g. We run 6 adult recreational leagues across northeast Ohio…" onChange={event => setForm({ ...form, hockeyAffiliation: event.target.value })} /></label>
            <div className="partner-upload"><label htmlFor="proof-doc"><FileText size={17} />{fileName || "Proof document (optional · JPEG, PNG, or PDF · max 10 MB)"}</label><input id="proof-doc" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleFile} />{(fileName || fileError) && <button type="button" aria-label="Remove uploaded proof document" onClick={() => { setFile(null); setFileName(""); setFileError(""); const input = document.getElementById("proof-doc") as HTMLInputElement | null; if (input) input.value = ""; }}>Remove <X size={14} /></button>}</div>
            {fileError && <p className="partner-error" role="alert">{fileError}</p>}
            <button className="partner-submit" type="submit" disabled={submitting || !!fileError}>{submitting ? "Submitting…" : "Submit application"} <ArrowRight size={16} /></button>
            {notice && <p className="partner-error" role="alert">{notice}</p>}
            <p className="partner-terms">By applying you agree to the <a href="/terms-of-service">Terms of Service</a>. We'll never share your information.</p>
          </form>}
        </div>
      </section>
      {notice && <div className="partner-toast" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={16} /></button></div>}
    </main>
  );
}
