import { useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowRight, Check, CheckCircle2, FileText, Minus, Plus, Upload, X } from "lucide-react";
import { RosterPageFooter, RosterPageNav } from "./RosterPageNav";
import "./PartnersPage.css";

const orgTypes = ["Hockey Association / Club", "Arena / Ice Facility", "Recreation League", "Youth Sports Organization", "Sports Media / Podcast", "Other"];

export function PartnersPage() {
  const [referrals, setReferrals] = useState(300);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ orgName: "", contactName: "", email: "", orgType: "", hockeyAffiliation: "" });
  const donation = Math.round(referrals * 5.51 * 3 * 0.1);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
      setFileError("Please upload a JPEG, PNG, or PDF file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError("File must be under 10 MB.");
      return;
    }
    setFileError("");
    setFileName(file.name);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("Preview only — this application stays in your browser and has not been submitted.");
  };

  return (
    <main className="rp-page partner-page">
      <RosterPageNav active="partners" />
      <section className="partner-hero">
        <div className="partner-container">
          <span className="rp-kicker">The Roster community partner program</span>
          <h1 className="rp-title">We give back<br /><em>to the hockey community.</em></h1>
          <p>Refer players to our platform and Roster will donate 10% of our net subscription proceeds every quarter for every active subscription tied to your organization.</p>
          <strong>Choose a good cause and track your referrals.</strong>
          <div className="partner-hero-actions"><a className="partner-button" href="#apply">Apply to become a partner <ArrowRight size={16} /></a><button className="partner-login-link" type="button" onClick={() => setNotice("Partner login is available on the live Roster site. This preview doesn’t sign in.")}>Partner login</button></div>
          <div className="partner-trustline"><Check size={15} /> Paid quarterly&nbsp; · &nbsp;10% of net subscription revenue&nbsp; · &nbsp;Built for the hockey community</div>
        </div>
      </section>

      <section className="partner-how">
        <div className="partner-container">
          <div className="partner-section-heading"><span className="rp-kicker">A clear path, all season long</span><h2 className="rp-title rp-title-sm">How it works.</h2><p>Three simple steps to start earning for your organization or chosen cause.</p></div>
          <div className="partner-steps">
            <article><span>01</span><h3>Apply</h3><p>Fill out a short application telling us about your organization. We review within two weeks.</p></article>
            <article><span>02</span><h3>In-app referral</h3><p>Once approved, your organization becomes a referral option for each user.</p></article>
            <article><span>03</span><h3>Earn</h3><p>Every paid-tier user who selects you as the referral source earns 10% of net revenue for you or your chosen cause—paid quarterly.</p></article>
          </div>
        </div>
      </section>

      <section className="partner-community">
        <div className="partner-container partner-community-layout">
          <div className="partner-community-image"><img src="/__mockup/images/roster-partners-community.png" alt="Hockey community members supporting one another" /></div>
          <div><span className="rp-kicker">Why we do this</span><h2 className="rp-title rp-title-sm">Hockey takes<br />care of its own.</h2><p>We look within when we need help. We look within when we hire. We leave our fights on the ice so we can be family in the locker room. When someone falls, we pick them up. When someone steps up, we follow.</p><p>Roster was built by a player, for players — and now we want to give back to the organizations holding this community together.</p><strong>Every paying subscriber you refer puts 10% of net revenue back into your cause. That’s our way of saying thanks to the people who spread the passion for our beautiful game.</strong></div>
        </div>
      </section>

      <section className="partner-current">
        <div className="partner-container">
          <span className="rp-kicker">Already in the Roster community</span>
          <h2 className="rp-title rp-title-sm">Current partners.</h2>
          <div className="partner-mark"><img src="/__mockup/images/roster-partners-hpib.png" alt="Hockey Players in Business" /><span>Hockey Players in Business</span></div>
        </div>
      </section>

      <section className="partner-calculator" id="payouts">
        <div className="partner-container partner-calc-layout">
          <div><span className="rp-kicker">A transparent estimate</span><h2 className="rp-title rp-title-sm">See your<br />community impact.</h2><p>Our donation in your name is a percentage of net subscription revenue — the subscription price after app store fees are deducted.</p><div className="partner-formula"><div><strong>~85%</strong><span>Net revenue after app store fee</span></div><b>×</b><div><strong>10%</strong><span>Goes back to the community</span></div></div></div>
          <div className="partner-calculator-card">
            <label htmlFor="referral-count">Estimated active referrals <strong>{referrals.toLocaleString()} players</strong></label>
            <input id="referral-count" type="range" min="100" max="5000" step="10" value={referrals} onChange={event => setReferrals(Number(event.target.value))} aria-valuetext={`${referrals.toLocaleString()} players`} />
            <div className="partner-range-labels"><span>100</span><span>5,000</span></div>
            <div className="partner-estimate"><span>Estimated quarterly donation</span><strong>${donation.toLocaleString("en-US")}</strong><small>Back to your community every quarter</small></div>
            <p>Illustration based on $6.49/mo Player Pro · $5.51 net after store fees · paid quarterly.</p>
          </div>
        </div>
      </section>

      <section className="partner-faq">
        <div className="partner-container"><span className="rp-kicker">A few useful details</span><h2 className="rp-title rp-title-sm">Before you apply.</h2>
          <details><summary>What organizations can apply?<Plus size={17} /><Minus size={17} /></summary><p>Hockey associations and clubs, arenas, recreation leagues, youth sports organizations, sports media, podcasts, and other hockey community groups are welcome to apply.</p></details>
          <details><summary>How are donations calculated?<Plus size={17} /><Minus size={17} /></summary><p>The donation is 10% of net subscription revenue after app store fees for each active paid subscription attributed to your organization. Donations are paid quarterly.</p></details>
          <details><summary>When will my organization hear back?<Plus size={17} /><Minus size={17} /></summary><p>The source application says reviews typically begin within two weeks. Approved partners become a referral option in the app.</p></details>
        </div>
      </section>

      <section className="partner-apply" id="apply">
        <div className="partner-container partner-apply-layout">
          <div><span className="rp-kicker">Make the next season count</span><h2 className="rp-title rp-title-sm">Apply to become<br />a partner.</h2><p>Takes about three minutes. The live program reviews every application personally.</p><div className="partner-apply-note"><CheckCircle2 size={17} /> Preview mode: form entries stay local and aren’t sent.</div></div>
          <form className="partner-form" onSubmit={handleSubmit}>
            <label>Organization name<input required value={form.orgName} placeholder="Greater Cleveland Hockey Association" onChange={event => setForm({ ...form, orgName: event.target.value })} /></label>
            <div className="partner-form-row"><label>Contact name<input required value={form.contactName} placeholder="Your name" onChange={event => setForm({ ...form, contactName: event.target.value })} /></label><label>Email address<input required type="email" value={form.email} placeholder="you@yourorganization.org" onChange={event => setForm({ ...form, email: event.target.value })} /></label></div>
            <label>Organization type<select required value={form.orgType} onChange={event => setForm({ ...form, orgType: event.target.value })}><option value="">Select a type…</option>{orgTypes.map(type => <option key={type}>{type}</option>)}</select></label>
            <label>Tell us about your hockey involvement <span>(optional)</span><textarea rows={3} value={form.hockeyAffiliation} placeholder="e.g. We run 6 adult recreational leagues across northeast Ohio…" onChange={event => setForm({ ...form, hockeyAffiliation: event.target.value })} /></label>
            <div className="partner-upload"><label htmlFor="proof-doc"><FileText size={17} />{fileName || "Proof document (optional · JPEG, PNG, or PDF · max 10 MB)"}</label><input id="proof-doc" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleFile} />{fileName && <button type="button" aria-label="Remove uploaded proof document" onClick={() => { setFileName(""); setFileError(""); }}>Remove <X size={14} /></button>}</div>
            {fileError && <p className="partner-error" role="alert">{fileError}</p>}
            <button className="partner-submit" type="submit">Preview application <ArrowRight size={16} /></button>
            {notice && <p className="partner-notice" role="status">{notice}</p>}
            <p className="partner-terms">By applying you agree to the Terms of Service. This sandbox does not submit or store personal information.</p>
          </form>
        </div>
      </section>
      <RosterPageFooter />
      {notice && <div className="partner-toast" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={16} /></button></div>}
    </main>
  );
}
