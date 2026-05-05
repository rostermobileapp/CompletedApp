/**
 * Referral Program Routes
 * Public: /api/referral/*
 * Partner portal: /api/referral/portal/* (magic-link session auth)
 * Admin: /api/admin/referrals/* (password session auth)
 * Webhook: /api/webhooks/revenuecat-referral
 */
import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { eq, and, desc, sql, ilike, or, gte, lte, inArray, count, sum } from "drizzle-orm";
import {
  referralPartners,
  referralConversions,
  referralPayouts,
  referralMagicLinks,
  referralSettings,
  type ReferralPartner,
} from "@shared/schema";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import multer from "multer";
import {
  sendNewApplicationAdminEmail,
  sendPartnerApprovalEmail,
  sendPartnerRejectionEmail,
  sendMagicLinkEmail,
  sendPartnerCustomEmail,
} from "./referralEmails";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAppUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return process.env.APP_URL || "https://rosters.replit.app";
}

function getSupabase() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getDefaultSetting(key: string, fallback: string): Promise<string> {
  const [row] = await db
    .select()
    .from(referralSettings)
    .where(eq(referralSettings.key, key))
    .limit(1);
  return row?.value ?? fallback;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(referralSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: referralSettings.key, set: { value, updatedAt: new Date() } });
}

async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(referralSettings);
  const defaults: Record<string, string> = {
    default_payout_rate: "0.10",
    platform_fee_percent: "15",
    admin_notification_email: "roster.mobile.app@gmail.com",
    approval_email_template: "",
    rejection_email_template: "",
  };
  const result = { ...defaults };
  for (const r of rows) result[r.key] = r.value;
  return result;
}

/** Generate a unique referral code: first 4 letters of org name + 4 random digits */
function generateReferralCode(orgName: string): string {
  const letters = orgName.replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase().padEnd(4, "X");
  const digits = Math.floor(1000 + Math.random() * 9000).toString();
  return `${letters}${digits}`;
}

/** Ensure the generated code is unique (retry up to 10 times) */
async function generateUniqueReferralCode(orgName: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateReferralCode(orgName);
    const [existing] = await db
      .select({ id: referralPartners.id })
      .from(referralPartners)
      .where(eq(referralPartners.referralCode, code))
      .limit(1);
    if (!existing) return code;
  }
  throw new Error("Could not generate unique referral code");
}

/** Get current quarter string e.g. "2025-Q2" */
function currentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

/** Get quarter boundaries (UTC) */
function quarterBounds(quarter: string): { start: Date; end: Date } {
  const [year, qStr] = quarter.split("-Q");
  const q = parseInt(qStr, 10);
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(parseInt(year), startMonth, 1));
  const end = new Date(Date.UTC(parseInt(year), startMonth + 3, 1));
  return { start, end };
}

/** Calculate payout estimate for a partner */
function calcPayoutEstimate(
  grossCents: number,
  platformFeePercent: number,
  payoutRate: number
): number {
  const net = grossCents * (1 - platformFeePercent / 100);
  return Math.round(net * payoutRate);
}

// ─── Multer for application file uploads ─────────────────────────────────────

const referralUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file type. Allowed: JPEG, PNG, GIF, WebP, PDF"));
  },
});

// ─── Session middleware ───────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      adminAuthenticated?: boolean;
      referralPartnerId?: string;
    }
  }
}

/** Simple in-memory session store using signed tokens stored in cookies */
const adminSessions = new Set<string>();
const partnerSessions = new Map<string, string>(); // token -> partnerId

function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.roster_admin_session;
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ message: "Admin authentication required" });
  }
  req.adminAuthenticated = true;
  next();
}

function requirePartnerAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.roster_partner_session;
  if (!token || !partnerSessions.has(token)) {
    return res.status(401).json({ message: "Partner authentication required" });
  }
  req.referralPartnerId = partnerSessions.get(token);
  next();
}

// ─── Supabase Storage helpers ─────────────────────────────────────────────────

async function uploadReferralDocument(
  fileBuffer: Buffer,
  mimetype: string,
  originalName: string
): Promise<string> {
  const supabase = getSupabase();
  const ext = originalName.split(".").pop() || "bin";
  const objectId = randomBytes(16).toString("hex");
  const filePath = `referral-documents/${objectId}.${ext}`;

  // Ensure bucket exists (idempotent)
  await supabase.storage.createBucket("referral-documents", { public: false }).catch(() => {});

  const { error } = await supabase.storage
    .from("referral-documents")
    .upload(filePath, fileBuffer, { contentType: mimetype, upsert: false });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  return filePath;
}

async function getReferralDocumentSignedUrl(filePath: string, expiresIn = 3600): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from("referral-documents")
    .createSignedUrl(filePath, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerReferralRoutes(app: Express) {

  // ── Public: validate referral code ────────────────────────────────────────
  app.get("/api/referral/validate-code", async (req, res) => {
    const code = (req.query.code as string || "").toUpperCase().trim();
    if (!code) return res.status(400).json({ message: "code is required" });
    try {
      const [partner] = await db
        .select({ id: referralPartners.id, orgName: referralPartners.orgName })
        .from(referralPartners)
        .where(and(
          eq(referralPartners.referralCode, code),
          eq(referralPartners.status, "approved"),
        ))
        .limit(1);
      if (!partner) return res.status(404).json({ message: "Code not recognized" });
      res.json({ valid: true, orgName: partner.orgName });
    } catch (err) {
      console.error("[Referral] validate-code error:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ── Public: submit application ────────────────────────────────────────────
  app.post(
    "/api/referral/apply",
    (req: any, res: any, next: any) => {
      referralUpload.single("proofDocument")(req, res, (err: any) => {
        if (err instanceof multer.MulterError) {
          return res.status(400).json({ message: err.message });
        }
        if (err) return res.status(400).json({ message: err.message || "Upload error" });
        next();
      });
    },
    async (req: any, res) => {
      try {
        const { orgName, contactName, email, orgType, hockeyAffiliation } = req.body;
        if (!orgName || !contactName || !email) {
          return res.status(400).json({ message: "orgName, contactName, and email are required" });
        }

        // Check if email already applied
        const [existing] = await db
          .select({ id: referralPartners.id, status: referralPartners.status })
          .from(referralPartners)
          .where(eq(referralPartners.email, email))
          .limit(1);
        if (existing) {
          const msg =
            existing.status === "pending"
              ? "An application with this email is already pending review"
              : existing.status === "approved"
              ? "This email is already an approved partner"
              : "This email has previously been rejected. Contact us to appeal.";
          return res.status(409).json({ message: msg });
        }

        // Upload proof document if provided
        let proofDocumentPath: string | null = null;
        if (req.file) {
          proofDocumentPath = await uploadReferralDocument(
            req.file.buffer,
            req.file.mimetype,
            req.file.originalname
          );
        }

        const [partner] = await db
          .insert(referralPartners)
          .values({
            orgName,
            contactName,
            email,
            orgType: orgType || null,
            hockeyAffiliation: hockeyAffiliation || null,
            proofDocumentPath,
            status: "pending",
          })
          .returning();

        // Notify admin
        const adminEmail = await getDefaultSetting(
          "admin_notification_email",
          "roster.mobile.app@gmail.com"
        );
        await sendNewApplicationAdminEmail(adminEmail, { orgName, contactName, email, orgType });

        res.status(201).json({ message: "Application submitted successfully", id: partner.id });
      } catch (err) {
        console.error("[Referral] apply error:", err);
        res.status(500).json({ message: "Failed to submit application" });
      }
    }
  );

  // ── Partner portal: request magic link ────────────────────────────────────
  app.post("/api/referral/portal/request-link", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "email is required" });
    try {
      const [partner] = await db
        .select()
        .from(referralPartners)
        .where(eq(referralPartners.email, email.toLowerCase().trim()))
        .limit(1);

      if (!partner) {
        // Don't reveal whether email exists
        return res.json({ message: "If this email is registered, a login link has been sent." });
      }
      if (partner.status !== "approved") {
        return res.status(403).json({
          message:
            partner.status === "pending"
              ? "Your application is still pending review."
              : "Your partner account is not active.",
        });
      }

      // Generate token
      const token = randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.insert(referralMagicLinks).values({
        partnerId: partner.id,
        token,
        expiresAt,
      });

      const appUrl = getAppUrl();
      const magicLink = `${appUrl}/referral-program/portal/auth?token=${token}`;
      await sendMagicLinkEmail(email, { contactName: partner.contactName, magicLink });

      res.json({ message: "If this email is registered, a login link has been sent." });
    } catch (err) {
      console.error("[Referral] request-link error:", err);
      res.status(500).json({ message: "Failed to send login link" });
    }
  });

  // ── Partner portal: validate magic link token ─────────────────────────────
  app.get("/api/referral/portal/auth", async (req, res) => {
    const token = (req.query.token as string || "").trim();
    if (!token) return res.status(400).json({ message: "token is required" });
    try {
      const [link] = await db
        .select()
        .from(referralMagicLinks)
        .where(eq(referralMagicLinks.token, token))
        .limit(1);

      if (!link) return res.status(401).json({ message: "Invalid or expired link" });
      if (link.usedAt) return res.status(401).json({ message: "Link already used" });
      if (new Date() > link.expiresAt) return res.status(401).json({ message: "Link has expired" });

      // Verify partner is still approved
      const [partner] = await db
        .select()
        .from(referralPartners)
        .where(and(eq(referralPartners.id, link.partnerId), eq(referralPartners.status, "approved")))
        .limit(1);
      if (!partner) return res.status(403).json({ message: "Partner account is not active" });

      // Mark token used
      await db
        .update(referralMagicLinks)
        .set({ usedAt: new Date() })
        .where(eq(referralMagicLinks.id, link.id));

      // Issue session cookie
      const sessionToken = generateSessionToken();
      partnerSessions.set(sessionToken, partner.id);
      res.cookie("roster_partner_session", sessionToken, SESSION_COOKIE_OPTIONS);

      res.json({ success: true, partnerId: partner.id });
    } catch (err) {
      console.error("[Referral] portal/auth error:", err);
      res.status(500).json({ message: "Authentication failed" });
    }
  });

  // ── Partner portal: logout ────────────────────────────────────────────────
  app.post("/api/referral/portal/logout", (req, res) => {
    const token = req.cookies?.roster_partner_session;
    if (token) partnerSessions.delete(token);
    res.clearCookie("roster_partner_session");
    res.json({ success: true });
  });

  // ── Partner portal: me ────────────────────────────────────────────────────
  app.get("/api/referral/portal/me", requirePartnerAuth, async (req: any, res) => {
    try {
      const partnerId = req.referralPartnerId!;
      const [partner] = await db
        .select()
        .from(referralPartners)
        .where(eq(referralPartners.id, partnerId))
        .limit(1);
      if (!partner) return res.status(404).json({ message: "Partner not found" });

      const settings = await getSettings();
      const platformFeePercent = parseFloat(settings.platform_fee_percent || "15");
      const payoutRate = parseFloat(partner.payoutRate as string);

      // All conversions
      const conversions = await db
        .select()
        .from(referralConversions)
        .where(eq(referralConversions.partnerId, partnerId))
        .orderBy(desc(referralConversions.convertedAt));

      // Quarter conversions
      const q = currentQuarter();
      const { start, end } = quarterBounds(q);
      const quarterConversions = conversions.filter(
        (c) => c.status === "active" && new Date(c.convertedAt) >= start && new Date(c.convertedAt) < end
      );
      const quarterGrossCents = quarterConversions.reduce((s, c) => s + (c.grossPriceCents || 0), 0);
      const estimatedPayoutCents = calcPayoutEstimate(quarterGrossCents, platformFeePercent, payoutRate);

      // Tier/platform breakdown
      const tierBreakdown: Record<string, number> = {};
      const platformBreakdown: Record<string, number> = {};
      for (const c of conversions.filter((c) => c.status === "active")) {
        if (c.tier) tierBreakdown[c.tier] = (tierBreakdown[c.tier] || 0) + 1;
        if (c.platform) platformBreakdown[c.platform] = (platformBreakdown[c.platform] || 0) + 1;
      }

      // Payouts
      const payouts = await db
        .select()
        .from(referralPayouts)
        .where(eq(referralPayouts.partnerId, partnerId))
        .orderBy(desc(referralPayouts.paidAt));

      res.json({
        partner: {
          id: partner.id,
          orgName: partner.orgName,
          contactName: partner.contactName,
          email: partner.email,
          referralCode: partner.referralCode,
          payoutRate,
          approvedAt: partner.approvedAt,
        },
        stats: {
          totalConversions: conversions.filter((c) => c.status === "active").length,
          tierBreakdown,
          platformBreakdown,
        },
        quarterEstimate: {
          quarter: q,
          conversions: quarterConversions.length,
          grossCents: quarterGrossCents,
          platformFeePercent,
          payoutRate,
          estimatedPayoutCents,
        },
        conversions: conversions.map((c) => ({
          ...c,
          netContributionCents: Math.round((c.grossPriceCents || 0) * (1 - platformFeePercent / 100)),
          estimatedEarningsCents: Math.round(
            (c.grossPriceCents || 0) * (1 - platformFeePercent / 100) * payoutRate
          ),
        })),
        payouts,
      });
    } catch (err) {
      console.error("[Referral] portal/me error:", err);
      res.status(500).json({ message: "Failed to load partner data" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Admin routes — all require password session
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Admin: login ──────────────────────────────────────────────────────────
  app.post("/api/admin/referrals/auth", (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) return res.status(503).json({ message: "Admin auth not configured" });
    if (!password || password !== adminPassword) {
      return res.status(401).json({ message: "Invalid password" });
    }
    const token = generateSessionToken();
    adminSessions.add(token);
    res.cookie("roster_admin_session", token, SESSION_COOKIE_OPTIONS);
    res.json({ success: true });
  });

  app.post("/api/admin/referrals/logout", (req, res) => {
    const token = req.cookies?.roster_admin_session;
    if (token) adminSessions.delete(token);
    res.clearCookie("roster_admin_session");
    res.json({ success: true });
  });

  app.get("/api/admin/referrals/check-auth", requireAdminAuth, (_req, res) => {
    res.json({ authenticated: true });
  });

  // ── Admin: dashboard stats ────────────────────────────────────────────────
  app.get("/api/admin/referrals/dashboard", requireAdminAuth, async (_req, res) => {
    try {
      const settings = await getSettings();
      const platformFeePercent = parseFloat(settings.platform_fee_percent || "15");

      const q = currentQuarter();
      const { start: qStart, end: qEnd } = quarterBounds(q);
      const startOfYear = new Date(Date.UTC(new Date().getFullYear(), 0, 1));

      const [approvedCount] = await db
        .select({ count: count() })
        .from(referralPartners)
        .where(eq(referralPartners.status, "approved"));

      const [pendingCount] = await db
        .select({ count: count() })
        .from(referralPartners)
        .where(eq(referralPartners.status, "pending"));

      const [totalConversions] = await db
        .select({ count: count() })
        .from(referralConversions)
        .where(eq(referralConversions.status, "active"));

      const allQConversions = await db
        .select()
        .from(referralConversions)
        .where(and(
          eq(referralConversions.status, "active"),
          gte(referralConversions.convertedAt, qStart),
          lte(referralConversions.convertedAt, qEnd),
        ));

      const quarterGross = allQConversions.reduce((s, c) => s + (c.grossPriceCents || 0), 0);

      // Estimated payouts owed this quarter (per partner)
      const partners = await db
        .select()
        .from(referralPartners)
        .where(eq(referralPartners.status, "approved"));

      let totalOwedCents = 0;
      for (const p of partners) {
        const pGross = allQConversions
          .filter((c) => c.partnerId === p.id)
          .reduce((s, c) => s + (c.grossPriceCents || 0), 0);
        totalOwedCents += calcPayoutEstimate(pGross, platformFeePercent, parseFloat(p.payoutRate as string));
      }

      // Payouts YTD
      const [ytdPayouts] = await db
        .select({ total: sum(referralPayouts.amountCents) })
        .from(referralPayouts)
        .where(gte(referralPayouts.paidAt, startOfYear));

      // Top 5 partners by quarter conversions
      const convByPartner: Record<string, number> = {};
      for (const c of allQConversions) {
        convByPartner[c.partnerId] = (convByPartner[c.partnerId] || 0) + 1;
      }
      const top5 = Object.entries(convByPartner)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      const top5Partners = await Promise.all(
        top5.map(async ([partnerId, qConversions]) => {
          const [p] = await db
            .select({ id: referralPartners.id, orgName: referralPartners.orgName, referralCode: referralPartners.referralCode })
            .from(referralPartners)
            .where(eq(referralPartners.id, partnerId))
            .limit(1);
          return { ...p, quarterConversions: qConversions };
        })
      );

      // Recent activity: last 10 applications + conversions combined
      const recentPartners = await db
        .select({ id: referralPartners.id, orgName: referralPartners.orgName, status: referralPartners.status, createdAt: referralPartners.createdAt, approvedAt: referralPartners.approvedAt })
        .from(referralPartners)
        .orderBy(desc(referralPartners.createdAt))
        .limit(10);

      const recentConversions = await db
        .select({ id: referralConversions.id, referralCode: referralConversions.referralCode, tier: referralConversions.tier, convertedAt: referralConversions.convertedAt })
        .from(referralConversions)
        .orderBy(desc(referralConversions.convertedAt))
        .limit(10);

      const recentActivity = [
        ...recentPartners.map((p) => ({
          type: p.status === "approved" ? "approval" : "application",
          label: `${p.orgName} ${p.status === "approved" ? "approved" : "applied"}`,
          at: p.status === "approved" ? p.approvedAt : p.createdAt,
        })),
        ...recentConversions.map((c) => ({
          type: "conversion",
          label: `New subscriber via ${c.referralCode}${c.tier ? ` (${c.tier})` : ""}`,
          at: c.convertedAt,
        })),
      ]
        .sort((a, b) => new Date(b.at!).getTime() - new Date(a.at!).getTime())
        .slice(0, 10);

      res.json({
        activePartners: approvedCount.count,
        pendingApplications: pendingCount.count,
        totalConversionsAllTime: totalConversions.count,
        quarterConversions: allQConversions.length,
        quarterGrossRevenueCents: quarterGross,
        quarterEstimatedPayoutsOwedCents: totalOwedCents,
        ytdPayoutsIssuedCents: Number(ytdPayouts?.total || 0),
        top5Partners,
        recentActivity,
      });
    } catch (err) {
      console.error("[Referral] admin/dashboard error:", err);
      res.status(500).json({ message: "Failed to load dashboard" });
    }
  });

  // ── Admin: applications list ──────────────────────────────────────────────
  app.get("/api/admin/referrals/applications", requireAdminAuth, async (req, res) => {
    try {
      const { status, search } = req.query as Record<string, string>;
      const conditions = [];
      if (status && status !== "all") {
        conditions.push(eq(referralPartners.status, status as any));
      }
      if (search) {
        conditions.push(
          or(
            ilike(referralPartners.orgName, `%${search}%`),
            ilike(referralPartners.email, `%${search}%`),
          )
        );
      }
      const rows = await db
        .select()
        .from(referralPartners)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(referralPartners.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[Referral] admin/applications error:", err);
      res.status(500).json({ message: "Failed to load applications" });
    }
  });

  // ── Admin: view document signed URL ──────────────────────────────────────
  app.get("/api/admin/referrals/applications/:id/document", requireAdminAuth, async (req, res) => {
    try {
      const [partner] = await db
        .select({ proofDocumentPath: referralPartners.proofDocumentPath })
        .from(referralPartners)
        .where(eq(referralPartners.id, req.params.id))
        .limit(1);
      if (!partner || !partner.proofDocumentPath) {
        return res.status(404).json({ message: "No document found" });
      }
      const url = await getReferralDocumentSignedUrl(partner.proofDocumentPath, 3600);
      if (!url) return res.status(500).json({ message: "Could not generate signed URL" });
      res.json({ url });
    } catch (err) {
      console.error("[Referral] admin/document error:", err);
      res.status(500).json({ message: "Failed to get document URL" });
    }
  });

  // ── Admin: approve application ────────────────────────────────────────────
  app.post("/api/admin/referrals/applications/:id/approve", requireAdminAuth, async (req, res) => {
    try {
      const [partner] = await db
        .select()
        .from(referralPartners)
        .where(eq(referralPartners.id, req.params.id))
        .limit(1);
      if (!partner) return res.status(404).json({ message: "Application not found" });
      if (partner.status === "approved") {
        return res.status(400).json({ message: "Already approved", referralCode: partner.referralCode });
      }

      const referralCode = await generateUniqueReferralCode(partner.orgName);
      const [updated] = await db
        .update(referralPartners)
        .set({ status: "approved", referralCode, approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(referralPartners.id, req.params.id))
        .returning();

      await sendPartnerApprovalEmail(partner.email, {
        orgName: partner.orgName,
        contactName: partner.contactName,
        referralCode,
      });

      res.json({ success: true, referralCode, partner: updated });
    } catch (err) {
      console.error("[Referral] admin/approve error:", err);
      res.status(500).json({ message: "Failed to approve application" });
    }
  });

  // ── Admin: reject application ─────────────────────────────────────────────
  app.post("/api/admin/referrals/applications/:id/reject", requireAdminAuth, async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ message: "reason is required" });

      const [partner] = await db
        .select()
        .from(referralPartners)
        .where(eq(referralPartners.id, req.params.id))
        .limit(1);
      if (!partner) return res.status(404).json({ message: "Application not found" });

      const [updated] = await db
        .update(referralPartners)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(eq(referralPartners.id, req.params.id))
        .returning();

      await sendPartnerRejectionEmail(partner.email, {
        orgName: partner.orgName,
        contactName: partner.contactName,
        reason,
      });

      res.json({ success: true, partner: updated });
    } catch (err) {
      console.error("[Referral] admin/reject error:", err);
      res.status(500).json({ message: "Failed to reject application" });
    }
  });

  // ── Admin: revoke access ──────────────────────────────────────────────────
  app.post("/api/admin/referrals/partners/:id/revoke", requireAdminAuth, async (req, res) => {
    try {
      const [updated] = await db
        .update(referralPartners)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(eq(referralPartners.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Partner not found" });
      res.json({ success: true, partner: updated });
    } catch (err) {
      console.error("[Referral] admin/revoke error:", err);
      res.status(500).json({ message: "Failed to revoke access" });
    }
  });

  // ── Admin: update partner notes ───────────────────────────────────────────
  app.patch("/api/admin/referrals/partners/:id/notes", requireAdminAuth, async (req, res) => {
    try {
      const { adminNotes } = req.body;
      const [updated] = await db
        .update(referralPartners)
        .set({ adminNotes: adminNotes ?? null, updatedAt: new Date() })
        .where(eq(referralPartners.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Partner not found" });
      res.json({ success: true, partner: updated });
    } catch (err) {
      res.status(500).json({ message: "Failed to update notes" });
    }
  });

  // ── Admin: update payout rate ─────────────────────────────────────────────
  app.patch("/api/admin/referrals/partners/:id/payout-rate", requireAdminAuth, async (req, res) => {
    try {
      const { payoutRate } = req.body;
      if (payoutRate === undefined) return res.status(400).json({ message: "payoutRate required" });
      const rate = parseFloat(payoutRate);
      if (isNaN(rate) || rate < 0 || rate > 1) {
        return res.status(400).json({ message: "payoutRate must be a decimal between 0 and 1" });
      }
      const [updated] = await db
        .update(referralPartners)
        .set({ payoutRate: rate.toString(), updatedAt: new Date() })
        .where(eq(referralPartners.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Partner not found" });
      res.json({ success: true, partner: updated });
    } catch (err) {
      res.status(500).json({ message: "Failed to update payout rate" });
    }
  });

  // ── Admin: all partners ───────────────────────────────────────────────────
  app.get("/api/admin/referrals/partners", requireAdminAuth, async (req, res) => {
    try {
      const { search } = req.query as Record<string, string>;
      const conditions = [eq(referralPartners.status, "approved")];
      if (search) {
        conditions.push(
          or(
            ilike(referralPartners.orgName, `%${search}%`),
            ilike(referralPartners.referralCode, `%${search}%`),
          ) as any
        );
      }
      const partners = await db
        .select()
        .from(referralPartners)
        .where(and(...conditions))
        .orderBy(desc(referralPartners.approvedAt));

      const settings = await getSettings();
      const platformFeePercent = parseFloat(settings.platform_fee_percent || "15");
      const q = currentQuarter();
      const { start: qStart, end: qEnd } = quarterBounds(q);

      const enriched = await Promise.all(
        partners.map(async (p) => {
          const conversions = await db
            .select()
            .from(referralConversions)
            .where(and(eq(referralConversions.partnerId, p.id), eq(referralConversions.status, "active")));

          const qConversions = conversions.filter(
            (c) => new Date(c.convertedAt) >= qStart && new Date(c.convertedAt) < qEnd
          );
          const qGross = qConversions.reduce((s, c) => s + (c.grossPriceCents || 0), 0);
          const [lastConversion] = conversions.sort(
            (a, b) => new Date(b.convertedAt).getTime() - new Date(a.convertedAt).getTime()
          );

          return {
            ...p,
            activeConversions: conversions.length,
            quarterConversions: qConversions.length,
            quarterGrossRevenueCents: qGross,
            quarterNetRevenueCents: Math.round(qGross * (1 - platformFeePercent / 100)),
            estimatedQuarterPayoutCents: calcPayoutEstimate(
              qGross,
              platformFeePercent,
              parseFloat(p.payoutRate as string)
            ),
            lastConversionDate: lastConversion?.convertedAt || null,
          };
        })
      );

      res.json(enriched);
    } catch (err) {
      console.error("[Referral] admin/partners error:", err);
      res.status(500).json({ message: "Failed to load partners" });
    }
  });

  // ── Admin: partner detail ─────────────────────────────────────────────────
  app.get("/api/admin/referrals/partners/:id", requireAdminAuth, async (req, res) => {
    try {
      const [partner] = await db
        .select()
        .from(referralPartners)
        .where(eq(referralPartners.id, req.params.id))
        .limit(1);
      if (!partner) return res.status(404).json({ message: "Partner not found" });

      const settings = await getSettings();
      const platformFeePercent = parseFloat(settings.platform_fee_percent || "15");
      const payoutRate = parseFloat(partner.payoutRate as string);

      const allConversions = await db
        .select()
        .from(referralConversions)
        .where(eq(referralConversions.partnerId, partner.id))
        .orderBy(desc(referralConversions.convertedAt));

      const payouts = await db
        .select()
        .from(referralPayouts)
        .where(eq(referralPayouts.partnerId, partner.id))
        .orderBy(desc(referralPayouts.paidAt));

      const activeConversions = allConversions.filter((c) => c.status === "active");
      const q = currentQuarter();
      const { start: qStart, end: qEnd } = quarterBounds(q);
      const lastQStr = (() => {
        const now = new Date();
        const m = now.getMonth();
        const y = now.getFullYear();
        const lastQ = Math.ceil(m / 3) || 4;
        const lastQYear = lastQ === 4 ? y - 1 : y;
        return `${lastQYear}-Q${lastQ === 0 ? 4 : lastQ}`;
      })();
      const { start: lqStart, end: lqEnd } = quarterBounds(lastQStr);

      const qConversions = activeConversions.filter(
        (c) => new Date(c.convertedAt) >= qStart && new Date(c.convertedAt) < qEnd
      );
      const lqConversions = activeConversions.filter(
        (c) => new Date(c.convertedAt) >= lqStart && new Date(c.convertedAt) < lqEnd
      );

      const lifetimeGross = activeConversions.reduce((s, c) => s + (c.grossPriceCents || 0), 0);
      const lifetimeEstimatedPayout = calcPayoutEstimate(lifetimeGross, platformFeePercent, payoutRate);
      const qGross = qConversions.reduce((s, c) => s + (c.grossPriceCents || 0), 0);

      res.json({
        partner,
        metrics: {
          totalConversions: activeConversions.length,
          quarterConversions: qConversions.length,
          lastQuarterConversions: lqConversions.length,
          lifetimeGrossCents: lifetimeGross,
          lifetimeEstimatedPayoutCents: lifetimeEstimatedPayout,
          quarterGrossCents: qGross,
          quarterEstimatedPayoutCents: calcPayoutEstimate(qGross, platformFeePercent, payoutRate),
        },
        conversions: allConversions,
        payouts,
      });
    } catch (err) {
      console.error("[Referral] admin/partner/:id error:", err);
      res.status(500).json({ message: "Failed to load partner detail" });
    }
  });

  // ── Admin: record payout ──────────────────────────────────────────────────
  app.post("/api/admin/referrals/partners/:id/payouts", requireAdminAuth, async (req, res) => {
    try {
      const { quarter, amountCents, method, reference, notes, paidAt } = req.body;
      if (!quarter || !amountCents) {
        return res.status(400).json({ message: "quarter and amountCents are required" });
      }
      const [payout] = await db
        .insert(referralPayouts)
        .values({
          partnerId: req.params.id,
          quarter,
          amountCents: parseInt(amountCents),
          method: method || null,
          reference: reference || null,
          notes: notes || null,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
        })
        .returning();
      res.status(201).json(payout);
    } catch (err) {
      console.error("[Referral] admin/record-payout error:", err);
      res.status(500).json({ message: "Failed to record payout" });
    }
  });

  // ── Admin: send message to partner ────────────────────────────────────────
  app.post("/api/admin/referrals/partners/:id/message", requireAdminAuth, async (req, res) => {
    try {
      const { subject, body } = req.body;
      if (!subject || !body) return res.status(400).json({ message: "subject and body are required" });
      const [partner] = await db
        .select({ email: referralPartners.email })
        .from(referralPartners)
        .where(eq(referralPartners.id, req.params.id))
        .limit(1);
      if (!partner) return res.status(404).json({ message: "Partner not found" });
      await sendPartnerCustomEmail(partner.email, subject, body);
      res.json({ success: true });
    } catch (err) {
      console.error("[Referral] admin/message error:", err);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ── Admin: all conversions ────────────────────────────────────────────────
  app.get("/api/admin/referrals/conversions", requireAdminAuth, async (req, res) => {
    try {
      const { partnerId, platform, status, from, to, exportCsv } = req.query as Record<string, string>;

      const conditions = [];
      if (partnerId) conditions.push(eq(referralConversions.partnerId, partnerId));
      if (platform) conditions.push(eq(referralConversions.platform, platform as any));
      if (status) conditions.push(eq(referralConversions.status, status as any));
      if (from) conditions.push(gte(referralConversions.convertedAt, new Date(from)));
      if (to) conditions.push(lte(referralConversions.convertedAt, new Date(to)));

      const conversions = await db
        .select()
        .from(referralConversions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(referralConversions.convertedAt));

      const settings = await getSettings();
      const platformFeePercent = parseFloat(settings.platform_fee_percent || "15");

      // Enrich with partner names
      const partnerIds = [...new Set(conversions.map((c) => c.partnerId))];
      const partnersMap: Record<string, string> = {};
      if (partnerIds.length > 0) {
        const ps = await db
          .select({ id: referralPartners.id, orgName: referralPartners.orgName })
          .from(referralPartners)
          .where(inArray(referralPartners.id, partnerIds));
        for (const p of ps) partnersMap[p.id] = p.orgName;
      }

      const enriched = conversions.map((c) => ({
        ...c,
        partnerOrgName: partnersMap[c.partnerId] || "Unknown",
        netCents: Math.round((c.grossPriceCents || 0) * (1 - platformFeePercent / 100)),
        estimatedPayoutCents: 0, // per-partner rate needed — handled by frontend
      }));

      if (exportCsv === "true") {
        const headers = "Date,Partner,Code,User ID,Tier,Platform,Gross ($),Net ($),Status\n";
        const rows = enriched
          .map((c) =>
            [
              new Date(c.convertedAt).toISOString().slice(0, 10),
              `"${c.partnerOrgName}"`,
              c.referralCode,
              c.userId || "",
              c.tier || "",
              c.platform || "",
              ((c.grossPriceCents || 0) / 100).toFixed(2),
              (c.netCents / 100).toFixed(2),
              c.status,
            ].join(",")
          )
          .join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=referral-conversions.csv");
        return res.send(headers + rows);
      }

      res.json(enriched);
    } catch (err) {
      console.error("[Referral] admin/conversions error:", err);
      res.status(500).json({ message: "Failed to load conversions" });
    }
  });

  // ── Admin: payouts (owed + history) ──────────────────────────────────────
  app.get("/api/admin/referrals/payouts/owed", requireAdminAuth, async (req, res) => {
    try {
      const { quarter = currentQuarter() } = req.query as Record<string, string>;
      const { start, end } = quarterBounds(quarter);
      const settings = await getSettings();
      const platformFeePercent = parseFloat(settings.platform_fee_percent || "15");

      const partners = await db
        .select()
        .from(referralPartners)
        .where(eq(referralPartners.status, "approved"));

      const result = await Promise.all(
        partners.map(async (p) => {
          const qConversions = await db
            .select()
            .from(referralConversions)
            .where(and(
              eq(referralConversions.partnerId, p.id),
              eq(referralConversions.status, "active"),
              gte(referralConversions.convertedAt, start),
              lte(referralConversions.convertedAt, end),
            ));

          const grossCents = qConversions.reduce((s, c) => s + (c.grossPriceCents || 0), 0);
          const [lastPayout] = await db
            .select({ paidAt: referralPayouts.paidAt })
            .from(referralPayouts)
            .where(eq(referralPayouts.partnerId, p.id))
            .orderBy(desc(referralPayouts.paidAt))
            .limit(1);

          return {
            partner: { id: p.id, orgName: p.orgName, referralCode: p.referralCode, payoutRate: p.payoutRate },
            quarterConversions: qConversions.length,
            grossRevenueCents: grossCents,
            netRevenueCents: Math.round(grossCents * (1 - platformFeePercent / 100)),
            payoutRate: parseFloat(p.payoutRate as string),
            amountOwedCents: calcPayoutEstimate(grossCents, platformFeePercent, parseFloat(p.payoutRate as string)),
            lastPayoutDate: lastPayout?.paidAt || null,
          };
        })
      );

      res.json({ quarter, rows: result });
    } catch (err) {
      console.error("[Referral] admin/payouts/owed error:", err);
      res.status(500).json({ message: "Failed to load payout obligations" });
    }
  });

  app.get("/api/admin/referrals/payouts/history", requireAdminAuth, async (req, res) => {
    try {
      const { exportCsv } = req.query as Record<string, string>;
      const payouts = await db
        .select()
        .from(referralPayouts)
        .orderBy(desc(referralPayouts.paidAt));

      const partnerIds = [...new Set(payouts.map((p) => p.partnerId))];
      const partnersMap: Record<string, string> = {};
      if (partnerIds.length > 0) {
        const ps = await db
          .select({ id: referralPartners.id, orgName: referralPartners.orgName })
          .from(referralPartners)
          .where(inArray(referralPartners.id, partnerIds));
        for (const p of ps) partnersMap[p.id] = p.orgName;
      }

      const enriched = payouts.map((p) => ({ ...p, partnerOrgName: partnersMap[p.partnerId] || "Unknown" }));

      if (exportCsv === "true") {
        const headers = "Date Paid,Partner,Quarter,Amount ($),Method,Reference\n";
        const rows = enriched
          .map((p) =>
            [
              new Date(p.paidAt).toISOString().slice(0, 10),
              `"${p.partnerOrgName}"`,
              p.quarter,
              (p.amountCents / 100).toFixed(2),
              p.method || "",
              p.reference || "",
            ].join(",")
          )
          .join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=referral-payouts.csv");
        return res.send(headers + rows);
      }

      res.json(enriched);
    } catch (err) {
      console.error("[Referral] admin/payouts/history error:", err);
      res.status(500).json({ message: "Failed to load payout history" });
    }
  });

  // ── Admin: settings ───────────────────────────────────────────────────────
  app.get("/api/admin/referrals/settings", requireAdminAuth, async (_req, res) => {
    try {
      res.json(await getSettings());
    } catch (err) {
      res.status(500).json({ message: "Failed to load settings" });
    }
  });

  app.patch("/api/admin/referrals/settings", requireAdminAuth, async (req, res) => {
    try {
      const allowed = [
        "default_payout_rate",
        "platform_fee_percent",
        "admin_notification_email",
        "approval_email_template",
        "rejection_email_template",
      ];
      for (const key of Object.keys(req.body)) {
        if (!allowed.includes(key)) continue;
        await setSetting(key, String(req.body[key]));
      }
      res.json(await getSettings());
    } catch (err) {
      console.error("[Referral] admin/settings PATCH error:", err);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RevenueCat webhook
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/api/webhooks/revenuecat-referral", async (req, res) => {
    // Validate secret
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (secret) {
      const auth = req.headers["authorization"];
      if (auth !== secret) {
        console.warn("[RCWebhook] Invalid authorization header");
        return res.status(401).json({ message: "Unauthorized" });
      }
    }

    try {
      const event = req.body?.event;
      if (!event) return res.status(400).json({ message: "Missing event" });

      const eventType = event.type as string;
      const eventId = event.id as string;
      const appUserId = event.app_user_id as string;
      const productId = event.product_id as string;
      const store = (event.store as string || "").toLowerCase();
      const priceCents = Math.round((event.price || 0) * 100);
      const subscriberAttributes = event.subscriber_attributes || {};
      const referralCode = (
        subscriberAttributes.referral_code?.value ||
        subscriberAttributes.$referral_code?.value ||
        ""
      ).toUpperCase().trim() as string;

      const platformMap: Record<string, string> = { apple: "ios", google: "android", stripe: "web" };
      const platform = (platformMap[store] || "web") as "ios" | "android" | "web";

      if (eventType === "INITIAL_PURCHASE") {
        if (!referralCode) {
          console.log("[RCWebhook] INITIAL_PURCHASE with no referral code — skipping");
          return res.json({ processed: false, reason: "no_referral_code" });
        }

        // Look up partner
        const [partner] = await db
          .select()
          .from(referralPartners)
          .where(and(eq(referralPartners.referralCode, referralCode), eq(referralPartners.status, "approved")))
          .limit(1);

        if (!partner) {
          console.log(`[RCWebhook] INITIAL_PURCHASE — invalid/inactive code ${referralCode}`);
          return res.json({ processed: false, reason: "invalid_code" });
        }

        // Deduplicate on event_id
        if (eventId) {
          const [existing] = await db
            .select({ id: referralConversions.id })
            .from(referralConversions)
            .where(eq(referralConversions.revenuecatEventId, eventId))
            .limit(1);
          if (existing) {
            console.log(`[RCWebhook] INITIAL_PURCHASE already processed (${eventId})`);
            return res.json({ processed: false, reason: "duplicate" });
          }
        }

        await db.insert(referralConversions).values({
          partnerId: partner.id,
          referralCode,
          userId: appUserId || null,
          revenuecatEventId: eventId || null,
          tier: productId || null,
          platform,
          grossPriceCents: priceCents,
          status: "active",
        });

        console.log(`[RCWebhook] Recorded conversion for ${referralCode} — ${productId} $${(priceCents / 100).toFixed(2)}`);
        return res.json({ processed: true });
      }

      if (eventType === "CANCELLATION" || eventType === "REFUND") {
        const newStatus = eventType === "REFUND" ? "refunded" : "cancelled";

        // Try to find by event_id first, then fallback to userId + code
        let updated = false;
        if (eventId) {
          const [existing] = await db
            .select({ id: referralConversions.id })
            .from(referralConversions)
            .where(eq(referralConversions.revenuecatEventId, eventId))
            .limit(1);
          if (existing) {
            await db
              .update(referralConversions)
              .set({ status: newStatus as any, updatedAt: new Date() })
              .where(eq(referralConversions.id, existing.id));
            updated = true;
          }
        }

        if (!updated && appUserId && referralCode) {
          const [partner] = await db
            .select({ id: referralPartners.id })
            .from(referralPartners)
            .where(eq(referralPartners.referralCode, referralCode))
            .limit(1);
          if (partner) {
            await db
              .update(referralConversions)
              .set({ status: newStatus as any, updatedAt: new Date() })
              .where(and(
                eq(referralConversions.userId, appUserId),
                eq(referralConversions.partnerId, partner.id),
                eq(referralConversions.status, "active"),
              ));
            updated = true;
          }
        }

        console.log(`[RCWebhook] ${eventType} — updated=${updated}`);
        return res.json({ processed: true, updated });
      }

      // Other event types — acknowledge but don't process
      return res.json({ processed: false, reason: "unhandled_event_type" });
    } catch (err) {
      console.error("[RCWebhook] error:", err);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });
}
