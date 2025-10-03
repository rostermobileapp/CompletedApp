import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { messagingService } from "./messagingService";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { 
  loadUserPermissions, 
  requireRole, 
  requireLeagueManagement, 
  requireStatsManagement, 
  requireUserManagement,
  requirePremiumFeatures 
} from "./permissionMiddleware";
import { db } from "./db";
import { leagueMemberships, importedPlayers, teams, announcementPolls, createChatPollRequestSchema } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { format } from "date-fns";
import {
  insertLeagueSchema,
  insertTeamSchema,
  insertLeagueMembershipSchema,
  insertTeamMembershipSchema,
  insertGameSchema,
  insertGameRsvpSchema,
  insertSubstituteRequestSchema,
  insertMessageSchema,
  insertAnnouncementSchema,
  insertAnnouncementAttachmentSchema,
  insertAnnouncementReactionSchema,
  insertAnnouncementPollSchema,
  insertAnnouncementPollVoteSchema,
  createAnnouncementRequestSchema,
  updateAnnouncementRequestSchema,
  createAnnouncementReactionRequestSchema,
  createAnnouncementPollRequestSchema,
  createAnnouncementPollVoteRequestSchema,
  insertScrimmageSchema,
  insertScrimmageRequestSchema,
  updateScrimmageRequestSchema,
  createSubstituteRequestSchema,
  getSubstituteRequestsQuerySchema,
  approveSubstituteRequestSchema,
  getPendingApprovalsQuerySchema,
  updateSubstituteRequestSchema,
  insertPlayerStatsSchema,
  insertLineCombinationSchema,
  insertLineCombinationAssignmentSchema,
  createLineCombinationRequestSchema,
  createLineCombinationAssignmentRequestSchema,
  updateLineCombinationRequestSchema,
  createFeedbackSubmissionSchema,
  createPaymentRequestSchema,
  updatePaymentRequestRecipientSchema,
} from "@shared/schema";
import { z, ZodError } from "zod";
import multer from "multer";
import Papa from "papaparse";
import * as fs from 'fs';
import * as path from 'path';
import Stripe from "stripe";


export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.patch('/api/auth/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { firstName, lastName, city, age, phoneNumber, dateOfBirth, playerType, email } = req.body;
      
      const profileData: any = {};
      if (firstName !== undefined) profileData.firstName = firstName;
      if (lastName !== undefined) profileData.lastName = lastName;
      if (city !== undefined) profileData.city = city;
      if (age !== undefined) profileData.age = parseInt(age);
      if (phoneNumber !== undefined) profileData.phoneNumber = phoneNumber;
      if (dateOfBirth !== undefined) profileData.dateOfBirth = dateOfBirth;
      if (playerType !== undefined) profileData.playerType = playerType;
      if (email !== undefined) profileData.email = email;

      const user = await storage.updateUserProfile(userId, profileData);
      res.json(user);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.patch('/api/auth/user/image', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { profileImageUrl } = req.body;

      if (!profileImageUrl) {
        return res.status(400).json({ message: "Profile image URL is required" });
      }

      const user = await storage.updateUserImage(userId, profileImageUrl);
      res.json(user);
    } catch (error) {
      console.error("Error updating user image:", error);
      res.status(500).json({ message: "Failed to update profile image" });
    }
  });

  app.delete('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.deleteUser(userId);
      // Destroy the session after deleting the user
      req.logout(() => {
        res.json({ message: "Profile deleted successfully" });
      });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(400).json({ message: error.message || "Failed to delete profile" });
    }
  });

  // Stripe webhook routes only - subscription management handled via Stripe billing portal
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-09-30.clover",
  });

  // Create checkout session for new subscriptions
  app.post('/api/stripe/create-checkout-session', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { priceId } = req.body;

      if (!priceId) {
        return res.status(400).json({ message: 'Price ID is required' });
      }

      // Allowlist of valid price IDs - reject anything else for security
      const ALLOWED_PRICES = [
        process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY,
        process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY,
        process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY,
        process.env.STRIPE_PRICE_COMMISSIONER_YEARLY,
      ].filter(Boolean);

      if (!ALLOWED_PRICES.includes(priceId)) {
        console.warn('[Stripe] Rejected invalid price ID:', priceId);
        return res.status(400).json({ message: 'Invalid price ID' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      let customerId = user.stripeCustomerId;

      // Create Stripe customer if they don't have one
      if (!customerId) {
        console.log('[Stripe] Creating new customer for checkout:', userId);
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
          metadata: {
            userId: userId,
          },
        });
        
        customerId = customer.id;
        await storage.updateUserStripeInfo(userId, customerId, user.stripeSubscriptionId || '');
        console.log('[Stripe] Created customer:', customerId);
      }

      // Build URL from request for reliability
      const protocol = req.protocol || 'https';
      const host = req.get('host') || (process.env.REPLIT_DOMAINS 
        ? `${process.env.REPLIT_DOMAINS}` 
        : 'localhost:5000');
      const appUrl = `${protocol}://${host}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        allow_promotion_codes: true,
        success_url: `${appUrl}/subscription?success=true`,
        cancel_url: `${appUrl}/subscription`,
        client_reference_id: userId,
        metadata: {
          userId: userId,
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('[Stripe] Error creating checkout session:', error);
      res.status(500).json({ message: 'Failed to create checkout session' });
    }
  });

  // Create billing portal session - creates customer in Stripe if needed
  app.post('/api/stripe/create-portal-session', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      let customerId = user.stripeCustomerId;

      // Create Stripe customer if they don't have one or if the saved one doesn't exist
      if (!customerId) {
        console.log('[Stripe] Creating new customer for user:', userId);
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
          metadata: {
            userId: userId,
          },
        });
        
        customerId = customer.id;
        
        // Save customer ID to database
        await storage.updateUserStripeInfo(userId, customerId, user.stripeSubscriptionId || '');
        console.log('[Stripe] Created customer:', customerId);
      }

      // Create billing portal session
      let portalSession;
      try {
        // Use REPLIT_DOMAINS for the return URL (not REPL_HOME which is a file path)
        const appUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS}` 
          : 'http://localhost:5000';
        
        portalSession = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${appUrl}/subscription`,
        });
      } catch (error: any) {
        // If customer doesn't exist in Stripe, create a new one
        if (error.code === 'resource_missing') {
          console.log('[Stripe] Saved customer ID not found in Stripe, creating new customer for user:', userId);
          const customer = await stripe.customers.create({
            email: user.email || undefined,
            name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
            metadata: {
              userId: userId,
            },
          });
          
          customerId = customer.id;
          
          // Update database with new customer ID
          await storage.updateUserStripeInfo(userId, customerId, user.stripeSubscriptionId || '');
          console.log('[Stripe] Created new customer:', customerId);
          
          // Retry creating portal session with new customer
          const appUrl = process.env.REPLIT_DOMAINS 
            ? `https://${process.env.REPLIT_DOMAINS}` 
            : 'http://localhost:5000';
          
          portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${appUrl}/subscription`,
          });
        } else {
          throw error;
        }
      }

      res.json({ url: portalSession.url });
    } catch (error: any) {
      console.error('[Stripe] Error creating portal session:', error);
      res.status(500).json({ message: 'Failed to create billing portal session' });
    }
  });

  // Stripe webhook handler - Note: This endpoint needs raw body, configured in server/index.ts
  app.post('/api/stripe-webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      return res.status(400).send('Missing stripe-signature header');
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature for security
      if (process.env.STRIPE_WEBHOOK_SECRET) {
        // req.body is a Buffer when using express.raw() - convert to string for signature verification
        const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : 
                        typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log('[Webhook] Signature verified successfully');
      } else {
        // Development mode without signature verification (not recommended for production)
        console.warn('[Webhook] WARNING: No STRIPE_WEBHOOK_SECRET configured - skipping signature verification');
        console.warn('[Webhook] Set STRIPE_WEBHOOK_SECRET environment variable for production use');
        const bodyStr = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : 
                       typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        event = JSON.parse(bodyStr);
      }
    } catch (err: any) {
      console.error('[Webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      // Map Stripe price IDs to user roles
      const PRICE_TO_ROLE: Record<string, 'player_pro' | 'commissioner'> = {
        // Monthly prices
        [process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY || '']: 'player_pro',
        [process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY || '']: 'commissioner',
        // Yearly prices
        [process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY || '']: 'player_pro',
        [process.env.STRIPE_PRICE_COMMISSIONER_YEARLY || '']: 'commissioner',
      };

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          console.log('[Webhook] Checkout session completed:', session.id);
          
          if (session.subscription && session.customer) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            const users = await storage.getAllUsers();
            let user = users.find(u => u.stripeCustomerId === session.customer);
            
            if (user) {
              // Update customer ID and subscription ID
              await storage.updateUserStripeInfo(user.id, session.customer as string, subscription.id);
              
              // Determine tier from price ID
              const priceId = subscription.items.data[0]?.price?.id;
              const tier = priceId ? PRICE_TO_ROLE[priceId] : null;
              
              if (tier) {
                console.log('[Webhook] Checkout completed - updating user', user.id, 'to tier:', tier);
                await storage.updateUserRole(user.id, tier);
              } else {
                console.warn('[Webhook] Unknown price ID:', priceId);
              }
            } else {
              console.log('[Webhook] User not found for customer:', session.customer);
            }
          }
          break;
        }

        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
        case 'customer.subscription.created': {
          const subscription = event.data.object as Stripe.Subscription;
          
          // Find user by Stripe customer ID or subscription ID
          const users = await storage.getAllUsers();
          let user = users.find(u => u.stripeSubscriptionId === subscription.id);
          
          // If not found by subscription ID, try to find by customer ID
          if (!user) {
            user = users.find(u => u.stripeCustomerId === subscription.customer);
          }
          
          if (user) {
            if (subscription.status === 'active' || subscription.status === 'trialing') {
              // Get the price ID to determine tier
              const priceId = subscription.items.data[0]?.price?.id;
              const tier = priceId ? PRICE_TO_ROLE[priceId] : null;
              
              if (tier) {
                console.log('[Webhook] Subscription active - updating user', user.id, 'to tier:', tier);
                await storage.updateUserRole(user.id, tier);
                
                // Update subscription ID if it changed
                if (user.stripeSubscriptionId !== subscription.id) {
                  await storage.updateUserStripeInfo(user.id, user.stripeCustomerId || '', subscription.id);
                }
              } else {
                console.warn('[Webhook] Unknown price ID in subscription:', priceId);
              }
            } else if (subscription.status === 'canceled' || subscription.status === 'unpaid' || event.type === 'customer.subscription.deleted') {
              console.log('[Webhook] Downgrading user', user.id, 'to free_tier due to status:', subscription.status || 'deleted');
              await storage.updateUserRole(user.id, 'free_tier');
              
              // Clear subscription ID when downgrading to free tier
              await storage.updateUserStripeInfo(user.id, user.stripeCustomerId || '', '');
            }
          } else {
            console.log('[Webhook] User not found for subscription:', subscription.id);
          }
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          console.log('[Webhook] Payment succeeded for invoice:', invoice.id);
          
          // If this invoice has a subscription, update the user's role
          const subscriptionId = (invoice as any).subscription;
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId as string);
            const users = await storage.getAllUsers();
            const user = users.find(u => u.stripeSubscriptionId === subscription.id);
            
            if (user && subscription.status === 'active') {
              // Get the price ID to determine tier
              const priceId = subscription.items.data[0]?.price?.id;
              const tier = priceId ? PRICE_TO_ROLE[priceId] : null;
              
              if (tier) {
                console.log('[Webhook] Payment success - updating user', user.id, 'to tier:', tier);
                await storage.updateUserRole(user.id, tier);
              } else {
                console.warn('[Webhook] Unknown price ID in invoice:', priceId);
              }
            }
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          console.log('Payment failed for invoice:', invoice.id);
          break;
        }

        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ message: 'Webhook processing error' });
    }
  });

  // Object storage routes for profile images  
  app.post("/api/profile-images/upload", isAuthenticated, async (req: any, res) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getProfileImageUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting profile image upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve profile images
  app.get("/profile-images/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const fullPath = `/profile-images/${req.params.objectPath}`;
      const objectFile = await objectStorageService.getProfileImageFile(fullPath);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving profile image:", error);
      if ((error as Error).name === 'ObjectNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Team logo upload and serving routes
  app.post("/api/team-logos/upload", isAuthenticated, async (req: any, res) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getTeamLogoUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting team logo upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve team logos
  app.get("/team-logos/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const fullPath = `/team-logos/${req.params.objectPath}`;
      const objectFile = await objectStorageService.getTeamLogoFile(fullPath);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving team logo:", error);
      if ((error as Error).name === 'ObjectNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Announcement media upload URL
  app.post("/api/announcement-media/upload", isAuthenticated, async (req: any, res) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getAnnouncementMediaUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting announcement media upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve announcement media
  app.get("/announcement-media/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const fullPath = `/announcement-media/${req.params.objectPath}`;
      const objectFile = await objectStorageService.getAnnouncementMediaFile(fullPath);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving announcement media:", error);
      if ((error as Error).name === 'ObjectNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Message attachment upload URL
  app.post("/api/message-attachments/upload", isAuthenticated, async (req: any, res) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getMessageAttachmentUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting message attachment upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve message attachments (authenticated and authorized)
  app.get("/message-attachments/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { ObjectStorageService, ObjectNotFoundError } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const fullPath = `/message-attachments/${req.params.objectPath}`;
      
      // Find the message attachment to verify access
      const attachment = await messagingService.getMessageAttachmentByPath(fullPath);
      if (!attachment) {
        return res.sendStatus(404);
      }
      
      // Get the message to check conversation access
      const message = await messagingService.getMessage(attachment.messageId);
      if (!message) {
        return res.sendStatus(404);
      }
      
      // Verify user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.sendStatus(403);
      }
      
      const objectFile = await objectStorageService.getMessageAttachmentFile(fullPath);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving message attachment:", error);
      if ((error as Error).name === 'ObjectNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // League routes
  app.get("/api/leagues", async (req, res) => {
    try {
      const { sport, search } = req.query;
      const leagues = await storage.getLeagues(
        sport as string,
        search as string
      );
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching leagues:", error);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  app.get("/api/leagues/commissioner", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const leagues = await storage.getLeaguesByCommissioner(userId);
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching commissioner leagues:", error);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  app.post("/api/leagues", isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const leagueData = insertLeagueSchema.parse({
        ...req.body,
        commissionerId: userId
      });
      
      // Generate unique league ID if not provided
      if (!leagueData.uniqueLeagueId) {
        leagueData.uniqueLeagueId = `${leagueData.name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).substring(2, 8)}`;
      }
      
      // Check if unique league ID already exists
      const existingLeague = await storage.getLeagueByUniqueId(leagueData.uniqueLeagueId);
      if (existingLeague) {
        return res.status(400).json({ message: "League ID already exists, please choose a different name" });
      }
      
      const league = await storage.createLeague({
        ...leagueData,
        commissionerId: userId,
      });
      res.json(league);
    } catch (error) {
      console.error("Error creating league:", error);
      res.status(500).json({ message: "Failed to create league" });
    }
  });

  app.patch("/api/leagues/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const leagueId = req.params.id;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify that the user owns the league
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: "You can only edit your own leagues" });
      }
      
      const result = await storage.updateLeague(leagueId, req.body);
      res.json(result);
    } catch (error) {
      console.error("Error updating league:", error);
      res.status(500).json({ message: "Failed to update league" });
    }
  });

  app.get("/api/leagues/:id", async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      res.json(league);
    } catch (error) {
      console.error("Error fetching league:", error);
      res.status(500).json({ message: "Failed to fetch league" });
    }
  });

  app.delete("/api/leagues/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const leagueId = req.params.id;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify that the user owns the league
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: "You can only delete your own leagues" });
      }
      
      await storage.deleteLeague(leagueId);
      res.json({ message: "League deleted successfully" });
    } catch (error) {
      console.error("Error deleting league:", error);
      res.status(500).json({ message: "Failed to delete league" });
    }
  });

  // Co-commissioner management routes
  app.post("/api/leagues/:leagueId/co-commissioner", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = req.params.leagueId;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Verify that the user is the commissioner of this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only the commissioner can add co-commissioners" });
      }

      // Find the user by email
      const targetUser = await storage.getUserByEmail(email);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found with that email" });
      }

      // Check if user is already a member
      const existingMembership = await storage.getUserLeagueMembership(targetUser.id, leagueId);
      
      if (existingMembership) {
        // If already a member, update their role to secondary_commissioner
        const updatedMembership = await storage.updateLeagueMember(existingMembership.id, {
          leagueRole: 'secondary_commissioner',
          status: 'approved'
        });
        return res.json(updatedMembership);
      } else {
        // Create new membership with secondary_commissioner role
        const membership = await storage.requestLeagueMembership({
          userId: targetUser.id,
          leagueId: leagueId,
        });
        
        // Update the membership to secondary_commissioner and approved
        const updatedMembership = await storage.updateLeagueMember(membership.id, {
          leagueRole: 'secondary_commissioner',
          status: 'approved'
        });
        return res.json(updatedMembership);
      }
    } catch (error) {
      console.error("Error adding co-commissioner:", error);
      res.status(500).json({ message: "Failed to add co-commissioner" });
    }
  });

  app.delete("/api/leagues/:leagueId/co-commissioner/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId, memberId } = req.params;

      // Verify that the user is the commissioner of this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only the commissioner can remove co-commissioners" });
      }

      // Fetch the membership to verify it belongs to this league
      const members = await storage.getLeagueMembers(leagueId);
      const membership = members.find(m => m.id === memberId);
      
      if (!membership) {
        return res.status(404).json({ message: "Membership not found in this league" });
      }

      // Verify the membership belongs to the specified league
      if (membership.leagueId !== leagueId) {
        return res.status(403).json({ message: "Cannot modify memberships from other leagues" });
      }

      // Update the member's role back to free_tier
      const updatedMembership = await storage.updateLeagueMember(memberId, {
        leagueRole: 'free_tier'
      });

      res.json(updatedMembership);
    } catch (error) {
      console.error("Error removing co-commissioner:", error);
      res.status(500).json({ message: "Failed to remove co-commissioner" });
    }
  });

  // Season routes
  app.get("/api/leagues/:leagueId/seasons", async (req, res) => {
    try {
      const seasons = await storage.getSeasonsByLeague(req.params.leagueId);
      res.json(seasons);
    } catch (error) {
      console.error("Error fetching seasons:", error);
      res.status(500).json({ message: "Failed to fetch seasons" });
    }
  });

  app.post("/api/leagues/:leagueId/seasons", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const leagueId = req.params.leagueId;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify that the user owns the league
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: "You can only manage your own leagues" });
      }
      
      // Validate required fields
      if (!req.body.name || req.body.name.trim() === '') {
        return res.status(400).json({ message: "Season name is required" });
      }
      
      // Prepare season data
      const seasonData = {
        name: req.body.name,
        leagueId: leagueId,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        isActive: req.body.isActive === true || req.body.isActive === 'true'
      };
      
      const season = await storage.createSeason(seasonData);
      res.json(season);
    } catch (error) {
      console.error("Error creating season:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : error);
      res.status(500).json({ message: "Failed to create season" });
    }
  });

  // League membership routes
  app.post("/api/leagues/:id/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = req.params.id;
      
      // Check if already a member
      const existingMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (existingMembership) {
        // If user has pending or approved status, prevent duplicate request
        if (existingMembership.status === 'pending' || existingMembership.status === 'approved') {
          return res.status(400).json({ message: "Already requested or member" });
        }
        
        // If user was rejected or inactive, allow them to re-request by updating status to pending
        if (existingMembership.status === 'rejected' || existingMembership.status === 'inactive') {
          const updatedMembership = await storage.updateLeagueMembershipStatus(existingMembership.id, 'pending');
          return res.json(updatedMembership);
        }
      }

      // Create new membership request
      const membership = await storage.requestLeagueMembership({
        userId,
        leagueId,
      });
      res.json(membership);
    } catch (error) {
      console.error("Error joining league:", error);
      res.status(500).json({ message: "Failed to join league" });
    }
  });

  app.get("/api/user/leagues", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagues = await storage.getUserLeagues(userId);
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching user leagues:", error);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  app.get("/api/user/league-memberships", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const memberships = await storage.getUserLeagueMemberships(userId);
      res.json(memberships);
    } catch (error) {
      console.error("Error fetching user league memberships:", error);
      res.status(500).json({ message: "Failed to fetch league memberships" });
    }
  });

  // Get leagues where user is commissioner
  app.get("/api/user/commissioner-leagues", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagues = await storage.getCommissionerLeagues(userId);
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching commissioner leagues:", error);
      res.status(500).json({ message: "Failed to fetch commissioner leagues" });
    }
  });

  // Update league member details (team assignment, captain role, position, etc.)
  app.patch("/api/leagues/:leagueId/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId, memberId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Check if user is the commissioner of this league
      if (!league || !user) {
        return res.status(404).json({ message: "League or user not found" });
      }
      
      const updates = req.body;
      const updatedMember = await storage.updateLeagueMember(memberId, updates);
      res.json(updatedMember);
    } catch (error) {
      console.error("Error updating league member:", error);
      res.status(500).json({ message: "Failed to update league member" });
    }
  });

  // League Management Routes for Commissioners
  app.get("/api/leagues/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Check if user is the commissioner of this league
      if (!league || !user) {
        return res.status(404).json({ message: "League or user not found" });
      }
      
      const members = await storage.getLeagueMembers(leagueId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching league members:", error);
      res.status(500).json({ message: "Failed to fetch league members" });
    }
  });

  // Get league players for stats management
  app.get('/api/leagues/:leagueId/players', isAuthenticated, loadUserPermissions, requireStatsManagement, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;
      
      // Verify user has access to this league
      const userMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!userMembership || userMembership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied - not an approved league member' });
      }
      
      // Get all league members and format them for stats management
      const members = await storage.getLeagueMembers(leagueId);
      const players = members.map(member => ({
        id: member.user.id,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
        email: member.user.email,
        teamName: member.assignedTeamId ? null : null // Will be populated if we have team info
      }));
      
      res.json(players);
    } catch (error) {
      console.error('Error fetching league players:', error);
      res.status(500).json({ message: 'Failed to fetch league players' });
    }
  });

  // League members for scrimmage creation - accessible by Player Pro+ users who are members of the league
  app.get("/api/leagues/:id/members-for-scrimmage", isAuthenticated, loadUserPermissions, requirePremiumFeatures, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Check if user has Player Plus+ access and is a member of this league
      if (!league || !user) {
        return res.status(404).json({ message: "League or user not found" });
      }
      
      // Check if user is a member of this league
      const userMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!userMembership || userMembership.status !== 'approved') {
        return res.status(403).json({ message: "You must be an approved member of this league" });
      }
      
      const members = await storage.getLeagueMembers(leagueId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching league members for scrimmage:", error);
      res.status(500).json({ message: "Failed to fetch league members" });
    }
  });

  app.get("/api/leagues/:id/pending-members", isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Check if user is the commissioner of this league
      if (!league || !user) {
        return res.status(404).json({ message: "League or user not found" });
      }
      
      const pendingMembers = await storage.getPendingLeagueMembers(leagueId);
      res.json(pendingMembers);
    } catch (error) {
      console.error("Error fetching pending league members:", error);
      res.status(500).json({ message: "Failed to fetch pending members" });
    }
  });

  app.post("/api/league-memberships/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const membershipId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const membership = await storage.approveLeagueMembership(membershipId, userId);
      res.json(membership);
    } catch (error) {
      console.error("Error approving membership:", error);
      res.status(500).json({ message: "Failed to approve membership" });
    }
  });

  app.post("/api/league-memberships/:id/reject", isAuthenticated, async (req: any, res) => {
    try {
      const membershipId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const membership = await storage.rejectLeagueMembership(membershipId, userId);
      res.json(membership);
    } catch (error) {
      console.error("Error rejecting membership:", error);
      res.status(500).json({ message: "Failed to reject membership" });
    }
  });

  app.patch("/api/league-memberships/:id/skill-level", isAuthenticated, async (req: any, res) => {
    try {
      const membershipId = req.params.id;
      const { skillLevel } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Validate skill level - can be text, number, or null
      const trimmedSkillLevel = skillLevel?.toString()?.trim() || null;
      
      const membership = await storage.updatePlayerSkillLevel(membershipId, trimmedSkillLevel);
      res.json(membership);
    } catch (error) {
      console.error("Error updating skill level:", error);
      res.status(500).json({ message: "Failed to update skill level" });
    }
  });

  app.delete("/api/league-memberships/:id", isAuthenticated, async (req: any, res) => {
    try {
      const membershipId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await storage.deleteLeagueMembership(membershipId);
      res.json({ message: "Player removed from league successfully" });
    } catch (error) {
      console.error("Error removing player from league:", error);
      res.status(500).json({ message: "Failed to remove player from league" });
    }
  });

  app.get("/api/leagues/:id/teams", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const teams = await storage.getTeamsByLeague(leagueId);
      res.json(teams);
    } catch (error) {
      console.error("Error fetching league teams:", error);
      res.status(500).json({ message: "Failed to fetch league teams" });
    }
  });

  app.get("/api/leagues/:id/games", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const games = await storage.getGamesByLeague(leagueId);
      res.json(games);
    } catch (error) {
      console.error("Error fetching league games:", error);
      res.status(500).json({ message: "Failed to fetch league games" });
    }
  });

  app.get("/api/leagues/:id/standings", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const standings = await storage.getLeagueStandings(leagueId);
      res.json(standings);
    } catch (error) {
      console.error("Error fetching league standings:", error);
      res.status(500).json({ message: "Failed to fetch league standings" });
    }
  });

  // Team routes
  app.post("/api/teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teamData = insertTeamSchema.parse(req.body);
      const team = await storage.createTeam({
        ...teamData,
        captainId: userId,
      });
      res.json(team);
    } catch (error) {
      console.error("Error creating team:", error);
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  app.patch("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teamId = req.params.id;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Team name is required" });
      }

      // Check if user is the team captain or commissioner
      const team = await storage.getTeam(teamId);
      const user = await storage.getUser(userId);
      const isTeamCaptain = team && team.captainId === userId;
      const isCommissioner = user && (user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin'));
      
      if (!team || (!isTeamCaptain && !isCommissioner)) {
        return res.status(403).json({ message: "Only team captains and commissioners can update team name" });
      }

      const updatedTeam = await storage.updateTeam(teamId, { name: name.trim() });
      res.json(updatedTeam);
    } catch (error) {
      console.error("Error updating team name:", error);
      res.status(500).json({ message: "Failed to update team name" });
    }
  });

  app.patch("/api/teams/:id/logo", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teamId = req.params.id;
      const { logoUrl } = req.body;

      if (!logoUrl) {
        return res.status(400).json({ message: "Logo URL is required" });
      }

      // Check if user is the team captain, league member captain, or commissioner
      const team = await storage.getTeam(teamId);
      const user = await storage.getUser(userId);
      const isTeamCaptain = team && team.captainId === userId;
      const isCommissioner = user && (user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin'));
      
      // Also check if user is a league member captain for this team's league
      let isLeagueMemberCaptain = false;
      if (team) {
        const leagueMemberships = await storage.getUserLeagueMemberships(userId);
        // Check if user is captain of the team through teams.captainId
        isLeagueMemberCaptain = team.captainId === userId;
      }
      
      if (!team || (!isTeamCaptain && !isLeagueMemberCaptain && !isCommissioner)) {
        return res.status(403).json({ message: "Only team captains and commissioners can update team logos" });
      }

      const updatedTeam = await storage.updateTeamLogo(teamId, logoUrl);
      res.json(updatedTeam);
    } catch (error) {
      console.error("Error updating team logo:", error);
      res.status(500).json({ message: "Failed to update team logo" });
    }
  });

  app.get("/api/teams/:id/members", async (req, res) => {
    try {
      const members = await storage.getTeamMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.get("/api/user/teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teams = await storage.getUserTeams(userId);
      res.json(teams);
    } catch (error) {
      console.error("Error fetching user teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  app.patch("/api/teams/:id/captain", isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teamId = req.params.id;
      const { captainId } = req.body;

      // Get team and user info
      const team = await storage.getTeam(teamId);
      const user = await storage.getUser(userId);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Check authorization - only commissioner of the league can set team captain
      const league = await storage.getLeague(team.leagueId);
      const isCommissioner = league && league.commissionerId === userId;

      if (!isCommissioner) {
        return res.status(403).json({ message: "Only league commissioners can assign team captains" });
      }

      // Validate captainId if provided
      if (captainId) {
        const captainUser = await storage.getUser(captainId);
        if (!captainUser) {
          return res.status(400).json({ message: "Captain user not found" });
        }

        // Verify the captain user is a member of this team (either through team membership or league assignment)
        const teamMembers = await storage.getTeamMembers(teamId);
        const hasDirectMembership = teamMembers.some(member => member.userId === captainId);
        
        const leagueMembership = await storage.getUserLeagueMembership(captainId, team.leagueId);
        const hasLeagueAssignment = leagueMembership && leagueMembership.assignedTeamId === teamId;

        if (!hasDirectMembership && !hasLeagueAssignment) {
          return res.status(400).json({ message: "User must be a member of this team to be assigned as captain" });
        }
      }

      // Update team captain
      const updatedTeam = await storage.setTeamCaptain(teamId, captainId || null);
      res.json(updatedTeam);
    } catch (error) {
      console.error("Error setting team captain:", error);
      res.status(500).json({ message: "Failed to set team captain" });
    }
  });

  // Game routes
  app.get("/api/user/games/upcoming", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const games = await storage.getUpcomingGames(userId);
      res.json(games);
    } catch (error) {
      console.error("Error fetching upcoming games:", error);
      res.status(500).json({ message: "Failed to fetch upcoming games" });
    }
  });

  // Get all games for user (past and future) with scores
  app.get("/api/user/games/all", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const games = await storage.getAllUserGames(userId);
      res.json(games);
    } catch (error) {
      console.error("Error fetching all user games:", error);
      res.status(500).json({ message: "Failed to fetch all user games" });
    }
  });

  // Get team record (wins, losses, ties) based on game scores
  app.get("/api/teams/:teamId/record", isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      const record = await storage.getTeamRecord(teamId);
      res.json(record);
    } catch (error) {
      console.error("Error fetching team record:", error);
      res.status(500).json({ message: "Failed to fetch team record" });
    }
  });

  // Line combinations routes
  app.get("/api/teams/:teamId/line-combinations", isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      const { gameId } = req.query;
      
      // Check if user has access to this team's line combinations (team member or captain)
      const userId = req.user.claims.sub;
      const teamMembers = await storage.getTeamMembers(teamId);
      const isTeamMember = teamMembers.some(member => member.user.id === userId);
      const team = await storage.getTeam(teamId);
      const isTeamCaptain = team?.captainId === userId;
      
      if (!isTeamMember && !isTeamCaptain) {
        return res.status(403).json({ message: "Access denied. You must be a team member or captain." });
      }
      
      const lineCombinations = await storage.getTeamLineCombinations(teamId, gameId as string);
      res.json(lineCombinations);
    } catch (error) {
      console.error("Error fetching line combinations:", error);
      res.status(500).json({ message: "Failed to fetch line combinations" });
    }
  });

  app.post("/api/teams/:teamId/line-combinations", isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      const userId = req.user.claims.sub;
      
      // Check if user is team captain
      const team = await storage.getTeam(teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can create line combinations" });
      }
      
      const lineCombinationData = createLineCombinationRequestSchema.parse(req.body);
      
      // Validate gameId belongs to this team if provided
      if (lineCombinationData.gameId) {
        const game = await storage.getGameById(lineCombinationData.gameId);
        if (!game || (game.homeTeamId !== teamId && game.awayTeamId !== teamId)) {
          return res.status(400).json({ message: "Game does not involve this team" });
        }
      }
      
      const lineCombination = await storage.createLineCombination({
        ...lineCombinationData,
        teamId,
      });
      res.json(lineCombination);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error creating line combination:", error);
      res.status(500).json({ message: "Failed to create line combination" });
    }
  });

  app.get("/api/line-combinations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const lineCombination = await storage.getLineCombination(id);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user has access to this line combination (team member or captain)
      const teamMembers = await storage.getTeamMembers(lineCombination.teamId);
      const isTeamMember = teamMembers.some(member => member.user.id === userId);
      const team = await storage.getTeam(lineCombination.teamId);
      const isTeamCaptain = team?.captainId === userId;
      
      if (!isTeamMember && !isTeamCaptain) {
        return res.status(403).json({ message: "Access denied. You must be a team member or captain." });
      }
      
      res.json(lineCombination);
    } catch (error) {
      console.error("Error fetching line combination:", error);
      res.status(500).json({ message: "Failed to fetch line combination" });
    }
  });

  app.patch("/api/line-combinations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const lineCombination = await storage.getLineCombination(id);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can update line combinations" });
      }
      
      const updates = updateLineCombinationRequestSchema.parse(req.body);
      
      // Validate gameId belongs to this team if provided
      if (updates.gameId) {
        const game = await storage.getGameById(updates.gameId);
        if (!game || (game.homeTeamId !== lineCombination.teamId && game.awayTeamId !== lineCombination.teamId)) {
          return res.status(400).json({ message: "Game does not involve this team" });
        }
      }
      
      const updatedLineCombination = await storage.updateLineCombination(id, updates);
      res.json(updatedLineCombination);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating line combination:", error);
      res.status(500).json({ message: "Failed to update line combination" });
    }
  });

  app.delete("/api/line-combinations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const lineCombination = await storage.getLineCombination(id);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can delete line combinations" });
      }
      
      await storage.deleteLineCombination(id);
      res.json({ message: "Line combination deleted successfully" });
    } catch (error) {
      console.error("Error deleting line combination:", error);
      res.status(500).json({ message: "Failed to delete line combination" });
    }
  });

  // Line combination assignment routes
  app.post("/api/line-combinations/:lineId/assignments", isAuthenticated, async (req: any, res) => {
    try {
      const { lineId } = req.params;
      const userId = req.user.claims.sub;
      
      const lineCombination = await storage.getLineCombination(lineId);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can assign players to line combinations" });
      }
      
      const assignmentData = createLineCombinationAssignmentRequestSchema.parse(req.body);
      
      // Validate that the player is a member of this team
      const teamMembers = await storage.getTeamMembers(lineCombination.teamId);
      const isPlayerTeamMember = teamMembers.some(member => member.user.id === assignmentData.playerId);
      if (!isPlayerTeamMember) {
        return res.status(400).json({ message: "Player must be a member of this team" });
      }
      
      const assignment = await storage.createLineCombinationAssignment({
        ...assignmentData,
        lineCombinationId: lineId,
      });
      res.json(assignment);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error creating line assignment:", error);
      res.status(500).json({ message: "Failed to create line assignment" });
    }
  });

  app.patch("/api/line-assignments/:assignmentId", isAuthenticated, async (req: any, res) => {
    try {
      const { assignmentId } = req.params;
      const { playerId } = req.body;
      const userId = req.user.claims.sub;
      
      // Get the assignment to find the line combination
      const assignments = await storage.getLineCombinationAssignments("");
      const assignment = assignments.find(a => a.id === assignmentId);
      if (!assignment) {
        return res.status(404).json({ message: "Line assignment not found" });
      }
      
      const lineCombination = await storage.getLineCombination(assignment.lineCombinationId);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can update line assignments" });
      }
      
      const updatedAssignment = await storage.updateLineCombinationAssignment(assignmentId, playerId);
      res.json(updatedAssignment);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating line assignment:", error);
      res.status(500).json({ message: "Failed to update line assignment" });
    }
  });

  // Update assignment position (for drag & drop)
  app.patch("/api/line-assignments/:assignmentId/position", isAuthenticated, async (req: any, res) => {
    try {
      const { assignmentId } = req.params;
      const { position } = req.body;
      const userId = req.user.claims.sub;
      
      if (!position) {
        return res.status(400).json({ message: "Position is required" });
      }
      
      // Get the assignment to find the line combination
      const assignments = await storage.getLineCombinationAssignments("");
      const assignment = assignments.find(a => a.id === assignmentId);
      if (!assignment) {
        return res.status(404).json({ message: "Line assignment not found" });
      }
      
      const lineCombination = await storage.getLineCombination(assignment.lineCombinationId);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can update line assignments" });
      }
      
      const updatedAssignment = await storage.updateLineCombinationAssignmentPosition(assignmentId, position);
      res.json(updatedAssignment);
    } catch (error) {
      console.error("Error updating line assignment position:", error);
      res.status(500).json({ message: "Failed to update line assignment position" });
    }
  });

  // Bulk update assignments (for efficient drag & drop reordering)
  app.patch("/api/line-combinations/:lineId/assignments/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const { lineId } = req.params;
      const { updates } = req.body;
      const userId = req.user.claims.sub;
      
      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "Updates must be an array" });
      }
      
      const lineCombination = await storage.getLineCombination(lineId);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can update line assignments" });
      }
      
      // Validate all player IDs if provided
      if (updates.some((u: any) => u.playerId)) {
        const teamMembers = await storage.getTeamMembers(lineCombination.teamId);
        const teamMemberIds = new Set(teamMembers.map(member => member.user.id));
        
        for (const update of updates) {
          if (update.playerId && !teamMemberIds.has(update.playerId)) {
            return res.status(400).json({ message: `Player ${update.playerId} is not a member of this team` });
          }
        }
      }
      
      const updatedAssignments = await storage.bulkUpdateLineCombinationAssignments(updates);
      res.json(updatedAssignments);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error bulk updating line assignments:", error);
      res.status(500).json({ message: "Failed to bulk update line assignments" });
    }
  });

  app.delete("/api/line-assignments/:assignmentId", isAuthenticated, async (req: any, res) => {
    try {
      const { assignmentId } = req.params;
      const userId = req.user.claims.sub;
      
      // Get the assignment to find the line combination  
      const assignment = await storage.getLineCombinationAssignment(assignmentId);
      if (!assignment) {
        return res.status(404).json({ message: "Line assignment not found" });
      }
      
      const lineCombination = await storage.getLineCombination(assignment.lineCombinationId);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can delete line assignments" });
      }
      
      await storage.deleteLineCombinationAssignment(assignmentId);
      res.json({ message: "Line assignment deleted successfully" });
    } catch (error) {
      console.error("Error deleting line assignment:", error);
      res.status(500).json({ message: "Failed to delete line assignment" });
    }
  });

  app.post("/api/games", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const gameData = insertGameSchema.parse(req.body);
      const game = await storage.createGame(gameData);
      res.json(game);
    } catch (error) {
      console.error("Error creating game:", error);
      res.status(500).json({ message: "Failed to create game" });
    }
  });

  app.patch("/api/games/:gameId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const gameId = req.params.gameId;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify that the game exists and the user has permission to edit it
      const existingGame = await storage.getGameById(gameId);
      if (!existingGame) {
        return res.status(404).json({ message: "Game not found" });
      }

      const updates = req.body;
      
      // Convert scheduledAt string to Date object if present
      if (updates.scheduledAt) {
        updates.scheduledAt = new Date(updates.scheduledAt);
      }
      
      const updatedGame = await storage.updateGame(gameId, updates);
      res.json(updatedGame);
    } catch (error) {
      console.error("Error updating game:", error);
      res.status(500).json({ message: "Failed to update game" });
    }
  });

  app.delete("/api/games/:gameId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const gameId = req.params.gameId;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify that the game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      await storage.deleteGame(gameId);
      res.json({ message: "Game deleted successfully" });
    } catch (error) {
      console.error("Error deleting game:", error);
      res.status(500).json({ message: "Failed to delete game" });
    }
  });

  // Game Score Submission Routes
  app.post("/api/games/:gameId/submit-score", isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const { homeScore, awayScore } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get the game to validate it exists and get team info
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Check if the game started more than 1 hour ago
      const gameStartTime = new Date(game.scheduledAt).getTime();
      const oneHourAfterStart = gameStartTime + (60 * 60 * 1000); // 1 hour in milliseconds
      const now = Date.now();
      
      if (now < oneHourAfterStart) {
        return res.status(400).json({ message: "Score submission not available until 1 hour after game start" });
      }

      // Determine the user's role in this game
      let submitterRole = '';
      
      // Check if user is commissioner
      const league = await storage.getLeague(game.leagueId);
      if (league && league.commissionerId === userId) {
        submitterRole = 'commissioner';
      } else {
        // Check if user is captain of home team
        const homeTeam = await storage.getTeam(game.homeTeamId);
        const homeTeamCaptain = homeTeam && homeTeam.captainId === userId;
        
        if (homeTeamCaptain) {
          submitterRole = 'home_captain';
        } else {
          // Check if user is captain of away team
          const awayTeam = await storage.getTeam(game.awayTeamId);
          const awayTeamCaptain = awayTeam && awayTeam.captainId === userId;
          
          if (awayTeamCaptain) {
            submitterRole = 'away_captain';
          }
        }
      }

      // Only captains and commissioners can submit scores
      if (!submitterRole) {
        return res.status(403).json({ 
          message: "Access denied. Only team captains and commissioners can submit scores." 
        });
      }

      // Create the score submission
      const submission = await storage.submitGameScore({
        gameId,
        submittedBy: userId,
        submitterRole,
        homeScore: parseInt(homeScore),
        awayScore: parseInt(awayScore),
        isCommissionerOverride: submitterRole === 'commissioner'
      });

      // If it's a commissioner submission, update the game score immediately
      if (submitterRole === 'commissioner') {
        await storage.updateGameScore(gameId, parseInt(homeScore), parseInt(awayScore));
        res.json({ 
          submission, 
          gameUpdated: true, 
          message: "Commissioner score submitted and game updated" 
        });
      } else {
        // Check if both captains have submitted matching scores
        const matchResult = await storage.checkForMatchingCaptainScores(gameId);
        
        if (matchResult.isMatch && matchResult.homeScore !== undefined && matchResult.awayScore !== undefined) {
          // Update the game score automatically
          await storage.updateGameScore(gameId, matchResult.homeScore, matchResult.awayScore);
          res.json({ 
            submission, 
            gameUpdated: true, 
            message: "Captain scores match - game score updated automatically" 
          });
        } else {
          res.json({ 
            submission, 
            gameUpdated: false, 
            message: "Score submitted - waiting for other captain or commissioner" 
          });
        }
      }
    } catch (error) {
      console.error("Error submitting game score:", error);
      res.status(500).json({ message: "Failed to submit score" });
    }
  });

  app.get("/api/games/:gameId/score-submissions", isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get the game to validate access
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Check if user has permission to view submissions (captain or commissioner)
      const league = await storage.getLeague(game.leagueId);
      const isCommissioner = league && league.commissionerId === userId;
      
      // Check if user is captain of either team
      const homeTeam = await storage.getTeam(game.homeTeamId);
      const awayTeam = await storage.getTeam(game.awayTeamId);
      const isHomeCaptain = homeTeam && homeTeam.captainId === userId;
      const isAwayCaptain = awayTeam && awayTeam.captainId === userId;
      
      const hasAccess = isCommissioner || isHomeCaptain || isAwayCaptain;

      if (!hasAccess) {
        return res.status(403).json({ 
          message: "Access denied. Only team captains and commissioners can view score submissions." 
        });
      }

      const submissions = await storage.getGameScoreSubmissions(gameId);
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching score submissions:", error);
      res.status(500).json({ message: "Failed to fetch score submissions" });
    }
  });

  // Delete team
  app.delete("/api/teams/:teamId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const teamId = req.params.teamId;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify that the team exists
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      await storage.deleteTeam(teamId);
      res.json({ message: "Team deleted successfully" });
    } catch (error) {
      console.error("Error deleting team:", error);
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  // Beverage duty routes
  app.post('/api/games/:gameId/beverage-duty', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { teamId } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!teamId) {
        return res.status(400).json({ message: 'Team ID is required' });
      }

      const updatedGame = await storage.claimBeverageDuty(gameId, userId, teamId);
      res.json(updatedGame);
    } catch (error) {
      console.error('Error claiming beverage duty:', error);
      res.status(500).json({ message: 'Failed to claim beverage duty' });
    }
  });


  // Get specific game details
  app.get('/api/games/:gameId', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      res.json(game);
    } catch (error) {
      console.error('Error fetching game details:', error);
      res.status(500).json({ message: 'Failed to fetch game details' });
    }
  });

  // Get game participants (all players from home and away teams)
  app.get('/api/games/:gameId/participants', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      
      // Get game details first
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Verify user has access to this game's league
      const userMembership = await storage.getUserLeagueMembership(userId, game.leagueId);
      if (!userMembership || userMembership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied - not an approved league member' });
      }
      
      // Get members from both home and away teams
      const homeTeamMembers = await storage.getTeamMembers(game.homeTeamId);
      const awayTeamMembers = await storage.getTeamMembers(game.awayTeamId);
      
      // Combine all participants and format for stats management
      const participants = [...homeTeamMembers, ...awayTeamMembers].map(member => ({
        id: member.user.id,
        userId: member.user.id,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
        email: member.user.email,
        teamName: member.teamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name
      }));

      res.json(participants);
    } catch (error) {
      console.error('Error fetching game participants:', error);
      res.status(500).json({ message: 'Failed to fetch game participants' });
    }
  });

  // Release beverage duty
  app.post('/api/games/:gameId/release-beverage-duty', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { teamId } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!teamId) {
        return res.status(400).json({ message: 'Team ID is required' });
      }

      const updatedGame = await storage.releaseBeverageDuty(gameId, userId, teamId);
      res.json(updatedGame);
    } catch (error) {
      console.error('Error releasing beverage duty:', error);
      res.status(500).json({ message: 'Failed to release beverage duty' });
    }
  });

  // Save notes for game
  app.post('/api/games/:gameId/notes', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { teamId, notes } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!teamId) {
        return res.status(400).json({ message: 'Team ID is required' });
      }

      const savedNotes = await storage.saveGameNotes(gameId, userId, teamId, notes);
      res.json(savedNotes);
    } catch (error) {
      console.error('Error saving game notes:', error);
      res.status(500).json({ message: 'Failed to save notes' });
    }
  });

  // RSVP routes
  app.post('/api/games/:gameId/rsvp', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { status, teamId } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!status || !['attending', 'not_attending'].includes(status)) {
        return res.status(400).json({ message: 'Valid status (attending/not_attending) is required' });
      }

      if (!teamId) {
        return res.status(400).json({ message: 'Team ID is required' });
      }

      // Verify the game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Verify the team is playing in this game
      if (game.homeTeamId !== teamId && game.awayTeamId !== teamId) {
        return res.status(403).json({ message: 'Team is not playing in this game' });
      }

      // Verify user is on the specified team
      // Check both direct team membership AND league membership with assigned team
      const teamMembers = await storage.getTeamMembers(teamId);
      const hasDirectTeamMembership = teamMembers.some(member => member.userId === userId);
      
      // Also check if user has league membership with this team assigned
      const leagueMembership = await storage.getUserLeagueMembership(userId, game.leagueId);
      const hasLeagueTeamAssignment = leagueMembership && leagueMembership.assignedTeamId === teamId;
      
      if (!hasDirectTeamMembership && !hasLeagueTeamAssignment) {
        return res.status(403).json({ message: 'You must be on this team to RSVP' });
      }

      const rsvpData = insertGameRsvpSchema.parse({
        gameId,
        userId,
        teamId,
        status,
      });

      const rsvp = await storage.createOrUpdateRsvp(rsvpData);
      res.json(rsvp);
    } catch (error) {
      console.error('Error updating RSVP:', error);
      res.status(500).json({ message: 'Failed to update RSVP' });
    }
  });

  app.get('/api/games/:gameId/rsvp-summary', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { teamId } = req.query;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // Verify the game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Check if user is captain or commissioner
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(game.leagueId);
      const isCommissioner = league && league.commissionerId === userId;
      
      // Check if user is captain of either team
      const homeTeam = await storage.getTeam(game.homeTeamId);
      const awayTeam = await storage.getTeam(game.awayTeamId);
      const isHomeCaptain = homeTeam && homeTeam.captainId === userId;
      const isAwayCaptain = awayTeam && awayTeam.captainId === userId;
      
      // For team-specific access
      if (teamId) {
        // Verify user is captain of the requested team or commissioner
        const requestedTeam = await storage.getTeam(teamId as string);
        const isCaptainOfRequestedTeam = requestedTeam && requestedTeam.captainId === userId;
        
        if (!isCommissioner && !isCaptainOfRequestedTeam) {
          return res.status(403).json({ message: 'Captain or Commissioner access required for this team' });
        }
        
        const summary = await storage.getTeamRsvpSummary(gameId, teamId as string);
        res.json(summary);
      } else {
        // General access - require captain of either team or commissioner
        if (!isCommissioner && !isHomeCaptain && !isAwayCaptain) {
          return res.status(403).json({ message: 'Captain or Commissioner access required' });
        }

        const summary = await storage.getGameRsvpSummaryByTeams(gameId);
        
        // Merge both teams' data into a flat structure for the frontend
        const mergedSummary = {
          attending: [...summary.homeTeam.attending, ...summary.awayTeam.attending],
          notAttending: [...summary.homeTeam.notAttending, ...summary.awayTeam.notAttending],
          noResponse: [...summary.homeTeam.noResponse, ...summary.awayTeam.noResponse]
        };
        
        res.json(mergedSummary);
      }
    } catch (error) {
      console.error('Error fetching RSVP summary:', error);
      res.status(500).json({ message: 'Failed to fetch RSVP summary' });
    }
  });

  app.get('/api/games/:gameId/rsvp', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { teamId } = req.query;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (teamId) {
        // Get RSVP for specific team
        const rsvp = await storage.getUserTeamRsvp(gameId, userId, teamId as string);
        if (!rsvp) {
          return res.status(404).json({ message: 'RSVP not found' });
        }
        res.json(rsvp);
      } else {
        // Get all RSVPs for user in this game (they might be on multiple teams)
        const rsvps = await storage.getUserGameRsvps(gameId, userId);
        res.json(rsvps);
      }
    } catch (error) {
      console.error('Error fetching user RSVP:', error);
      res.status(500).json({ message: 'Failed to fetch RSVP' });
    }
  });

  app.get('/api/players/available/:date', isAuthenticated, async (req: any, res) => {
    try {
      const { date } = req.params;
      const { leagueId } = req.query;
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!leagueId) {
        return res.status(400).json({ message: 'League ID is required' });
      }

      // Check if user is captain or commissioner
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId as string);
      const isCommissioner = league && league.commissionerId === userId;
      
      // For captain check, we need to verify they're captain of a team in this league
      const userTeams = await storage.getUserTeams(userId);
      const userTeamsInLeague = userTeams.filter(team => team.leagueId === leagueId);
      const isTeamCaptain = userTeamsInLeague.some(team => team.captainId === userId);
      
      if (!isCommissioner && !isTeamCaptain) {
        return res.status(403).json({ message: 'Captain or Commissioner access required' });
      }

      const availablePlayers = await storage.getAvailablePlayers(new Date(date), leagueId as string);
      res.json(availablePlayers);
    } catch (error) {
      console.error('Error fetching available players:', error);
      res.status(500).json({ message: 'Failed to fetch available players' });
    }
  });

  app.get('/api/players/all-with-availability/:date', isAuthenticated, async (req: any, res) => {
    try {
      const { date } = req.params;
      const { leagueId } = req.query;
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!leagueId) {
        return res.status(400).json({ message: 'League ID is required' });
      }

      // Check if user is captain or commissioner
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId as string);
      const isCommissioner = league && league.commissionerId === userId;
      
      // For captain check, we need to verify they're captain of a team in this league
      const userTeams = await storage.getUserTeams(userId);
      const userTeamsInLeague = userTeams.filter(team => team.leagueId === leagueId);
      const isTeamCaptain = userTeamsInLeague.some(team => team.captainId === userId);
      
      if (!isCommissioner && !isTeamCaptain) {
        return res.status(403).json({ message: 'Captain or Commissioner access required' });
      }

      const allPlayers = await storage.getAllLeaguePlayersWithAvailability(new Date(date), leagueId as string);
      res.json(allPlayers);
    } catch (error) {
      console.error('Error fetching all players with availability:', error);
      res.status(500).json({ message: 'Failed to fetch players' });
    }
  });

  // Substitute request routes (Multi-level approval workflow)
  app.post('/api/substitute-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // Validate input with Zod schema
      const validatedData = createSubstituteRequestSchema.parse(req.body);
      const { gameId, originalPlayerId, substitutePlayerId, reason, expiresAt } = validatedData;
      
      // Verify the game exists and get league info
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      
      // Get league to verify commissioner ownership if needed
      const league = await storage.getLeague(game.leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      // CRITICAL: Validate game hasn't started yet
      const now = new Date();
      if (game.scheduledAt && game.scheduledAt <= now) {
        return res.status(409).json({ message: 'Cannot create substitute request for games that have already started or finished' });
      }

      // Check if user is captain of either team
      const homeTeam = await storage.getTeam(game.homeTeamId);
      const awayTeam = await storage.getTeam(game.awayTeamId);
      const isHomeCaptain = homeTeam && homeTeam.captainId === userId;
      const isAwayCaptain = awayTeam && awayTeam.captainId === userId;
      
      if (!isHomeCaptain && !isAwayCaptain) {
        return res.status(403).json({ message: 'Captain access required' });
      }

      // Determine requesting team
      const requestingTeamId = isHomeCaptain ? game.homeTeamId : game.awayTeamId;
      
      // VALIDATION: Check for duplicate active substitute requests for the same original player
      const existingRequests = await storage.getSubstituteRequests({ gameId });
      const duplicateRequest = existingRequests.find(req => 
        ['pending_opponent_approval', 'pending_commissioner_approval', 'pending_substitute_approval'].includes(req.status) &&
        req.originalPlayerId === originalPlayerId && 
        req.requestingTeamId === requestingTeamId
      );
      if (duplicateRequest) {
        return res.status(409).json({ message: 'An active substitute request already exists for this player in this game' });
      }

      // SECURITY: Validate that originalPlayer belongs to requesting team
      const requestingTeamMembers = await storage.getTeamMembers(requestingTeamId);
      const requestingLeagueMembers = await storage.getLeagueMembers(game.leagueId);
      const originalPlayerOnTeam = requestingTeamMembers.some(m => m.userId === originalPlayerId) ||
        requestingLeagueMembers.some(m => m.userId === originalPlayerId && m.assignedTeamId === requestingTeamId);
      
      if (!originalPlayerOnTeam) {
        return res.status(403).json({ message: 'Original player must be on your team' });
      }
      
      // SECURITY: If substitute player specified, validate they exist and are league members
      if (substitutePlayerId) {
        const substitutePlayer = await storage.getUser(substitutePlayerId);
        if (!substitutePlayer) {
          return res.status(400).json({ message: 'Substitute player not found' });
        }
        
        const substituteInLeague = requestingLeagueMembers.some(m => m.userId === substitutePlayerId);
        if (!substituteInLeague) {
          return res.status(403).json({ message: 'Substitute player must be a league member' });
        }

        // VALIDATION: Prevent substitute player from being the same as original player
        if (substitutePlayerId === originalPlayerId) {
          return res.status(400).json({ message: 'Substitute player cannot be the same as original player' });
        }

        // VALIDATION: Check if substitute player is already on either team for this game
        const homeTeamMembers = await storage.getTeamMembers(game.homeTeamId);
        const awayTeamMembers = await storage.getTeamMembers(game.awayTeamId);
        const substituteOnHomeTeam = homeTeamMembers.some(m => m.userId === substitutePlayerId);
        const substituteOnAwayTeam = awayTeamMembers.some(m => m.userId === substitutePlayerId);
        
        if (substituteOnHomeTeam || substituteOnAwayTeam) {
          return res.status(400).json({ message: 'Substitute player is already on one of the teams for this game' });
        }
      }

      const requestData = insertSubstituteRequestSchema.parse({
        gameId,
        originalPlayerId,
        substitutePlayerId,
        requestedBy: userId,
        requestingTeamId,
        reason,
        status: 'pending_opponent_approval',
        expiresAt: expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
      });

      const request = await storage.createSubstituteRequest(requestData);
      res.json(request);
    } catch (error) {
      console.error('Error creating substitute request:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create substitute request' });
    }
  });

  app.get('/api/substitute-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // Validate query parameters with Zod
      const queryData = getSubstituteRequestsQuerySchema.parse(req.query);
      const { status, gameId, requestingTeamId } = queryData;
      
      // Get user to check permissions
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      const isCommissioner = user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin');
      
      let options: any;
      
      if (isCommissioner) {
        // CRITICAL SECURITY FIX: Commissioners can only see requests from leagues they own
        const commissionerLeagues = await storage.getLeaguesByCommissioner(userId);
        const ownedLeagueIds = commissionerLeagues.map(league => league.id);
        
        if (ownedLeagueIds.length === 0) {
          return res.json([]); // No leagues owned, no requests to see
        }
        
        options = {
          status,
          gameId,
          requestingTeamId,
          leagueIds: ownedLeagueIds, // Restrict to owned leagues only
        };
      } else {
        // Non-commissioners can only see requests they're involved with
        options = {
          status,
          gameId,
          userId, // This will filter for requests where user is involved
        };
      }

      const requests = await storage.getSubstituteRequests(options);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching substitute requests:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid query parameters', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to fetch substitute requests' });
    }
  });

  // Get pending substitute approvals - supports both league-specific (Dashboard) and user-wide (other components) requests
  app.get('/api/substitute-requests/pending-approvals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId, approverType } = req.query;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // If leagueId is provided, use league-specific method (Dashboard needs attention system)
      if (leagueId) {
        // Verify user has access to this league (either as member or commissioner)
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(401).json({ message: 'User not found' });
        }

        const league = await storage.getLeague(leagueId as string);
        if (!league) {
          return res.status(404).json({ message: 'League not found' });
        }

        // Check if user is league member or commissioner
        const leagueMembers = await storage.getLeagueMembers(leagueId as string);
        const isMember = leagueMembers.some(m => m.userId === userId);
        const isCommissioner = league.commissionerId === userId;

        if (!isMember && !isCommissioner) {
          return res.status(403).json({ message: 'Access denied - not a league member or commissioner' });
        }

        const pendingApprovals = await storage.getPendingSubstituteApprovalsForUser(userId, leagueId as string);
        res.json(pendingApprovals);
      } else {
        // If no leagueId, use user-wide method (other components)
        const validApproverTypes = ['opposing_captain', 'commissioner', 'substitute_player'];
        const approverTypeParam = approverType && validApproverTypes.includes(approverType) ? approverType as any : undefined;
        
        const pendingApprovals = await storage.getUserPendingApprovals(userId, approverTypeParam);
        res.json(pendingApprovals);
      }
    } catch (error) {
      console.error('Error fetching pending substitute approvals:', error);
      res.status(500).json({ message: 'Failed to fetch pending approvals' });
    }
  });

  // Get single substitute request with full details
  app.get('/api/substitute-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestId = req.params.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      const request = await storage.getSubstituteRequest(requestId);
      if (!request) {
        return res.status(404).json({ message: 'Substitute request not found' });
      }

      // Check if user has permission to view this request
      const user = await storage.getUser(userId);
      const isInvolved = request.requestedBy === userId ||
                       request.originalPlayerId === userId ||
                       request.substitutePlayerId === userId;
      
      // Check if user is captain of involved teams
      const homeTeam = await storage.getTeam(request.game.homeTeamId);
      const awayTeam = await storage.getTeam(request.game.awayTeamId);
      const isCaptain = (homeTeam && homeTeam.captainId === userId) ||
                       (awayTeam && awayTeam.captainId === userId);
      
      // CRITICAL SECURITY FIX: Only the league's commissioner can access, not any commissioner
      const league = await storage.getLeague(request.game.leagueId);
      const isLeagueCommissioner = league && league.commissionerId === userId;

      if (!isLeagueCommissioner && !isInvolved && !isCaptain) {
        return res.status(403).json({ message: 'Access denied' });
      }

      res.json(request);
    } catch (error) {
      console.error('Error fetching substitute request:', error);
      res.status(500).json({ message: 'Failed to fetch substitute request' });
    }
  });

  // Process approval (opposing captain → commissioner → substitute player workflow)
  app.post('/api/substitute-requests/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestId = req.params.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // Validate input with Zod schema
      const validatedData = approveSubstituteRequestSchema.parse(req.body);
      const { approverType, status, comments } = validatedData;

      const result = await storage.processApproval(
        requestId,
        userId,
        approverType,
        status,
        comments
      );
      
      res.json(result);
    } catch (error) {
      console.error('Error processing approval:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
      }
      res.status(500).json({ 
        message: 'Failed to process approval',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });


  // Update non-status fields (reason, expiry, substitute player)
  app.patch('/api/substitute-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestId = req.params.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // Validate input with Zod schema
      const validatedUpdates = updateSubstituteRequestSchema.parse(req.body);
      
      if (Object.keys(validatedUpdates).length === 0) {
        return res.status(400).json({ message: 'No valid updates provided' });
      }

      // Get the request to check permissions
      const request = await storage.getSubstituteRequest(requestId);
      if (!request) {
        return res.status(404).json({ message: 'Substitute request not found' });
      }

      // CRITICAL SECURITY FIX: Only the requester or the league's commissioner can update
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(request.game.leagueId);
      const isLeagueCommissioner = league && league.commissionerId === userId;
      const isRequester = request.requestedBy === userId;

      if (!isLeagueCommissioner && !isRequester) {
        return res.status(403).json({ message: 'Permission denied' });
      }
      
      // SECURITY: If substitute player is being updated, validate they exist and are league members
      if (validatedUpdates.substitutePlayerId) {
        const substitutePlayer = await storage.getUser(validatedUpdates.substitutePlayerId);
        if (!substitutePlayer) {
          return res.status(400).json({ message: 'Substitute player not found' });
        }
        
        const leagueMembers = await storage.getLeagueMembers(request.game.leagueId);
        const substituteInLeague = leagueMembers.some(m => m.userId === validatedUpdates.substitutePlayerId);
        if (!substituteInLeague) {
          return res.status(403).json({ message: 'Substitute player must be a league member' });
        }
      }

      const updatedRequest = await storage.updateSubstituteRequestNonStatusFields(requestId, validatedUpdates);
      res.json(updatedRequest);
    } catch (error) {
      console.error('Error updating substitute request:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid update data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to update substitute request' });
    }
  });


  // Expire old substitute requests
  app.post('/api/substitute-requests/expire', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // Only commissioners can manually trigger expiration
      const user = await storage.getUser(userId);
      if (!user || !(user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin'))) {
        return res.status(403).json({ message: 'Commissioner access required' });
      }

      // CRITICAL SECURITY FIX: Commissioners can only expire requests from leagues they own
      const commissionerLeagues = await storage.getLeaguesByCommissioner(userId);
      const ownedLeagueIds = commissionerLeagues.map(league => league.id);
      
      if (ownedLeagueIds.length === 0) {
        return res.json({ 
          message: 'No requests to expire - no leagues owned',
          expiredRequests: [] 
        });
      }

      const expiredRequests = await storage.expireSubstituteRequests(ownedLeagueIds);
      res.json({ 
        message: `Expired ${expiredRequests.length} requests from your leagues`,
        expiredRequests 
      });
    } catch (error) {
      console.error('Error expiring substitute requests:', error);
      res.status(500).json({ message: 'Failed to expire substitute requests' });
    }
  });

  // Message routes (Player Plus feature)
  app.get("/api/teams/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const messages = await storage.getTeamMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching team messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/teams/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const messageData = insertMessageSchema.parse(req.body);
      const message = await storage.sendMessage({
        ...messageData,
        senderId: req.user.claims.sub,
      });
      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });



  // Configure multer for file uploads
  const upload = multer({ 
    dest: 'temp/', 
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      if (allowedMimeTypes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
      }
    },
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB limit
    }
  });

  // Bulk Player Import Routes
  app.post('/api/leagues/:leagueId/players/import', isAuthenticated, upload.single('playerFile'), async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Check if user has commissioner access to this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can import players' });
      }

      // Read and parse the CSV file
      const fileContent = fs.readFileSync(file.path, 'utf8');
      const parseResults = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => {
          // Normalize header names for simplified format
          const normalized = header.toLowerCase().trim();
          const mapping: Record<string, string> = {
            'name': 'name',
            'player': 'name', // Accept "Player" as a name column
            'player name': 'name', // Accept "Player Name" as a name column
            'team name': 'teamName',
            'team': 'teamName',
            // Legacy support for old format
            'first name': 'firstName',
            'firstname': 'firstName',
            'last name': 'lastName', 
            'lastname': 'lastName',
            'email': 'email',
            'phone': 'phoneNumber',
            'phone number': 'phoneNumber',
            'position': 'position',
            'jersey number': 'jerseyNumber',
            'jersey': 'jerseyNumber',
            'skill rating': 'skillLevel',
            'skill level': 'skillLevel',
            'rating': 'skillLevel',
            'notes': 'notes'
          };
          return mapping[normalized] || header;
        }
      });

      if (parseResults.errors.length > 0) {
        return res.status(400).json({ 
          message: 'Error parsing CSV file', 
          errors: parseResults.errors 
        });
      }

      // Get existing teams in the league for team matching
      const existingTeams = await storage.getTeamsByLeague(leagueId);
      const teamLookup = new Map<string, string>(); // teamName -> teamId
      
      existingTeams.forEach(team => {
        // Create case-insensitive lookup
        teamLookup.set(team.name.toLowerCase().trim(), team.id);
      });

      // Process the parsed data
      const validPlayers: any[] = [];
      const errors: string[] = [];
      const teamsToCreate: Set<string> = new Set();

      // Log what headers we received to help with debugging
      const receivedHeaders = parseResults.meta?.fields || Object.keys(parseResults.data[0] || {});
      console.log(`CSV Import: Received headers: ${receivedHeaders.join(', ')}`);
      console.log(`CSV Import: Total rows to process: ${parseResults.data.length}`);
      
      // Log first row for debugging
      if (parseResults.data.length > 0) {
        console.log(`CSV Import: First row data:`, JSON.stringify(parseResults.data[0]));
      }

      parseResults.data.forEach((row: any, index: number) => {
        // Handle both new simplified format (Name, Team Name) and legacy format
        let firstName = '';
        let lastName = '';
        
        if (row.name) {
          // New simplified format: split "Name" field
          const nameParts = row.name.trim().split(' ');
          firstName = nameParts[0] || '';
          lastName = nameParts.slice(1).join(' ') || '';
        } else if (row.firstName && row.lastName) {
          // Legacy format
          firstName = row.firstName.trim();
          lastName = row.lastName.trim();
        }
        
        if (!firstName) {
          errors.push(`Row ${index + 1}: Name is required (expected 'Name', 'Player', or 'First Name' column)`);
          return;
        }

        const player = {
          firstName: firstName,
          lastName: lastName,
          email: row.email?.trim() || null,
          phoneNumber: row.phoneNumber?.trim() || null,
          position: row.position?.trim() || null,
          jerseyNumber: row.jerseyNumber ? parseInt(row.jerseyNumber) : null,
          skillLevel: row.skillLevel?.trim() || null,
          teamName: row.teamName?.trim() || null,
          teamId: null as string | null,
          notes: row.notes?.trim() || null
        };

        // Keep skill level as provided (no validation since it can be text)

        // Try to match team name to existing team
        if (player.teamName) {
          const matchedTeamId = teamLookup.get(player.teamName.toLowerCase());
          if (matchedTeamId) {
            player.teamId = matchedTeamId;
          } else {
            // Track teams that don't exist yet
            teamsToCreate.add(player.teamName);
          }
        }

        validPlayers.push(player);
      });

      // Auto-create missing teams if they were referenced in the import
      const createdTeams = new Map<string, string>(); // teamName -> teamId
      for (const teamName of Array.from(teamsToCreate)) {
        try {
          const newTeam = await storage.createTeam({
            name: teamName,
            leagueId: leagueId,
            captainId: null, // Will be assigned later when players join
          });
          createdTeams.set(teamName, newTeam.id);
        } catch (error) {
          console.error(`Failed to create team ${teamName}:`, error);
          errors.push(`Failed to create team: ${teamName}`);
        }
      }

      // Update player records with newly created team IDs
      validPlayers.forEach(player => {
        if (player.teamName && !player.teamId) {
          const createdTeamId = createdTeams.get(player.teamName);
          if (createdTeamId) {
            player.teamId = createdTeamId;
          }
        }
      });

      // Track actual successes and failures during user creation
      let actualSuccessCount = 0;
      const createdPlayerIds: string[] = [];

      // Create imported player records with team assignments and user accounts
      if (validPlayers.length > 0) {
        // First, create the imported player records
        const importRecord = await storage.createPlayerImport({
          leagueId,
          importedBy: userId,
          fileName: file.originalname,
          totalRecords: parseResults.data.length,
          successfulRecords: 0, // Will update after actual creation
          failedRecords: errors.length
        });

        await storage.createImportedPlayersWithTeams(importRecord.id, leagueId, validPlayers);
        
        // Create placeholder user accounts and league memberships for imported players
        for (const player of validPlayers) {
          try {
            // Create a placeholder user account - let DB generate ID
            const uniqueEmail = player.email || `${player.firstName.toLowerCase()}.${player.lastName.toLowerCase()}.${Date.now()}@placeholder.roster`;
            const placeholderUser = await storage.upsertUser({
              email: uniqueEmail,
              firstName: player.firstName,
              lastName: player.lastName,
              profileImageUrl: null,
            });
            
            // Create league membership for this user
            await db.insert(leagueMemberships).values({
              userId: placeholderUser.id,
              leagueId: leagueId,
              assignedTeamId: player.teamId,
              status: 'approved',
              skillLevel: player.skillLevel,
              position: player.position,
              jerseyNumber: player.jerseyNumber,
              notes: player.notes,
              approvedAt: new Date(),
            });
            
            actualSuccessCount++;
            createdPlayerIds.push(placeholderUser.id);
            
          } catch (error) {
            console.error(`Failed to create user and membership for ${player.firstName} ${player.lastName}:`, error);
            // Add error to response so we can debug
            errors.push(`Failed to create user for ${player.firstName} ${player.lastName}: ${(error as Error).message}`);
          }
        }

        // Update the import record with actual success count
        await storage.updatePlayerImport(importRecord.id, {
          successfulRecords: actualSuccessCount,
          failedRecords: parseResults.data.length - actualSuccessCount
        });

        // Clean up uploaded file
        fs.unlinkSync(file.path);

        // Return helpful format information if all failed
        const formatHelp = errors.length === parseResults.data.length && errors.length > 0
          ? {
              expectedFormat: "CSV should have a 'Name' or 'Player' column (or 'First Name' and 'Last Name' columns). Optional: 'Team Name', 'Email', 'Phone Number', 'Position', 'Jersey Number', 'Skill Level', 'Notes'",
              receivedHeaders: receivedHeaders.join(', ')
            }
          : null;

        res.json({
          importId: importRecord.id,
          totalRecords: parseResults.data.length,
          successfulRecords: actualSuccessCount,
          failedRecords: parseResults.data.length - actualSuccessCount,
          teamsCreated: createdTeams.size,
          errors: errors.slice(0, 10), // Limit errors to first 10 to avoid huge response
          totalErrors: errors.length,
          formatHelp
        });
      } else {
        // No valid players found - create import record with all failed
        const importRecord = await storage.createPlayerImport({
          leagueId,
          importedBy: userId,
          fileName: file.originalname,
          totalRecords: parseResults.data.length,
          successfulRecords: 0,
          failedRecords: parseResults.data.length
        });

        // Clean up uploaded file
        fs.unlinkSync(file.path);

        res.json({
          importId: importRecord.id,
          totalRecords: parseResults.data.length,
          successfulRecords: 0,
          failedRecords: parseResults.data.length,
          teamsCreated: 0,
          errors: errors.slice(0, 10), // Limit errors to first 10
          totalErrors: errors.length,
          formatHelp: {
            expectedFormat: "CSV should have a 'Name' column (or 'First Name' and 'Last Name' columns). Optional: 'Team Name', 'Email', 'Phone Number', 'Position', 'Jersey Number', 'Skill Level', 'Notes'",
            receivedHeaders: receivedHeaders.join(', ')
          }
        });
      }

    } catch (error) {
      console.error('Error importing players:', error);
      
      // Clean up file if it exists
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      }
      
      res.status(500).json({ message: 'Failed to import players' });
    }
  });

  // Get import history for a league
  app.get('/api/leagues/:leagueId/players/imports', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user has commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const imports = await storage.getPlayerImports(leagueId);
      res.json(imports);
    } catch (error) {
      console.error('Error fetching import history:', error);
      res.status(500).json({ message: 'Failed to fetch import history' });
    }
  });

  // Get merge requests for a league
  app.get('/api/leagues/:leagueId/players/merge-requests', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user has commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const mergeRequests = await storage.getPlayerMergeRequests(leagueId);
      res.json(mergeRequests);
    } catch (error) {
      console.error('Error fetching merge requests:', error);
      res.status(500).json({ message: 'Failed to fetch merge requests' });
    }
  });

  // Approve/reject merge requests
  app.patch('/api/leagues/:leagueId/merge-requests/:requestId', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId, requestId } = req.params;
      const { status } = req.body; // 'approved' or 'rejected'
      const userId = req.user.claims.sub;

      // Check if user has commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const mergeRequest = await storage.updateMergeRequestStatus(requestId, status, userId);
      
      if (status === 'approved') {
        // TODO: Implement actual account merging logic
        // This would involve linking the imported player to the real user account
        // and potentially creating a league membership for the user
      }

      res.json(mergeRequest);
    } catch (error) {
      console.error('Error updating merge request:', error);
      res.status(500).json({ message: 'Failed to update merge request' });
    }
  });

  // Bulk schedule upload
  app.post('/api/leagues/:leagueId/schedules/import', isAuthenticated, upload.single('scheduleFile'), async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Check if user has commissioner access to this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can import schedules' });
      }

      // Read and parse the CSV file
      const fileContent = fs.readFileSync(file.path, 'utf8');
      const parseResults = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => {
          // Normalize header names
          const normalized = header.toLowerCase().trim();
          const mapping: Record<string, string> = {
            'date': 'date',
            'time': 'time',
            'home team': 'homeTeam',
            'home': 'homeTeam',
            'away team': 'awayTeam',
            'away': 'awayTeam',
            'home team locker room': 'homeTeamLockerRoom',
            'home locker room': 'homeTeamLockerRoom',
            'away team locker room': 'awayTeamLockerRoom',
            'away locker room': 'awayTeamLockerRoom',
            'locker room': 'lockerRoom',
            'venue': 'venue'
          };
          return mapping[normalized] || header;
        }
      });

      if (parseResults.errors.length > 0) {
        return res.status(400).json({ 
          message: 'Error parsing CSV file', 
          errors: parseResults.errors 
        });
      }

      // Get existing teams in the league for team matching
      const existingTeams = await storage.getTeamsByLeague(leagueId);
      const teamLookup = new Map<string, string>(); // teamName -> teamId
      
      existingTeams.forEach(team => {
        // Create case-insensitive lookup
        teamLookup.set(team.name.toLowerCase().trim(), team.id);
      });

      // Process the parsed data
      const validSchedules: any[] = [];
      const errors: string[] = [];
      const teamsToCreate: Set<string> = new Set();

      parseResults.data.forEach((row: any, index: number) => {
        // Required fields validation
        if (!row.date) {
          errors.push(`Row ${index + 1}: Date is required`);
          return;
        }
        if (!row.time) {
          errors.push(`Row ${index + 1}: Time is required`);
          return;
        }
        if (!row.homeTeam) {
          errors.push(`Row ${index + 1}: Home Team is required`);
          return;
        }
        if (!row.awayTeam) {
          errors.push(`Row ${index + 1}: Away Team is required`);
          return;
        }

        // Parse date and time
        let gameDate: Date;
        try {
          const dateStr = row.date.trim();
          gameDate = new Date(dateStr);
          if (isNaN(gameDate.getTime())) {
            // Try different date formats
            const dateFormats = [
              dateStr,
              `${dateStr} 00:00:00`,
              new Date(Date.parse(dateStr))
            ];
            
            for (const format of dateFormats) {
              const testDate = new Date(format);
              if (!isNaN(testDate.getTime())) {
                gameDate = testDate;
                break;
              }
            }
            
            if (isNaN(gameDate.getTime())) {
              errors.push(`Row ${index + 1}: Invalid date format: ${dateStr}`);
              return;
            }
          }
        } catch {
          errors.push(`Row ${index + 1}: Invalid date format`);
          return;
        }

        const schedule = {
          gameDate: gameDate,
          gameTime: row.time?.trim() || null,
          homeTeamName: row.homeTeam?.trim() || null,
          awayTeamName: row.awayTeam?.trim() || null,
          homeTeamId: null as string | null,
          awayTeamId: null as string | null,
          homeTeamLockerRoom: row.homeTeamLockerRoom?.trim() || null,
          awayTeamLockerRoom: row.awayTeamLockerRoom?.trim() || null,
        };

        // Try to match team names to existing teams
        if (schedule.homeTeamName) {
          const matchedHomeTeamId = teamLookup.get(schedule.homeTeamName.toLowerCase());
          if (matchedHomeTeamId) {
            schedule.homeTeamId = matchedHomeTeamId;
          } else {
            teamsToCreate.add(schedule.homeTeamName);
          }
        }

        if (schedule.awayTeamName) {
          const matchedAwayTeamId = teamLookup.get(schedule.awayTeamName.toLowerCase());
          if (matchedAwayTeamId) {
            schedule.awayTeamId = matchedAwayTeamId;
          } else {
            teamsToCreate.add(schedule.awayTeamName);
          }
        }

        validSchedules.push(schedule);
      });

      // Create missing teams
      const createdTeams = new Map<string, string>();
      for (const teamName of Array.from(teamsToCreate)) {
        try {
          const newTeam = await storage.createTeam({
            name: teamName,
            leagueId: leagueId,
            captainId: null, // Will be assigned later when players join
          });
          createdTeams.set(teamName, newTeam.id);
        } catch (error) {
          console.error(`Failed to create team ${teamName}:`, error);
          errors.push(`Failed to create team: ${teamName}`);
        }
      }

      // Update schedule team IDs with newly created teams
      validSchedules.forEach(schedule => {
        if (schedule.homeTeamName && !schedule.homeTeamId) {
          const createdTeamId = createdTeams.get(schedule.homeTeamName);
          if (createdTeamId) {
            schedule.homeTeamId = createdTeamId;
          }
        }
        if (schedule.awayTeamName && !schedule.awayTeamId) {
          const createdTeamId = createdTeams.get(schedule.awayTeamName);
          if (createdTeamId) {
            schedule.awayTeamId = createdTeamId;
          }
        }
      });

      // Create import record and imported schedules
      const importRecord = await storage.createScheduleImport({
        leagueId,
        importedBy: userId,
        fileName: file.originalname,
        totalRecords: parseResults.data.length,
        successfulRecords: validSchedules.length,
        failedRecords: errors.length
      });

      // Create imported schedule records
      let gamesCreated = 0;
      let gamesSkipped = 0;
      
      if (validSchedules.length > 0) {
        await storage.createImportedSchedules(importRecord.id, leagueId, validSchedules);
        
        // Create actual game records for valid schedules, but skip duplicates
        
        for (const schedule of validSchedules) {
          try {
            if (schedule.homeTeamId && schedule.awayTeamId) {
              // Ensure we have a valid Date object
              let scheduledAt: Date;
              if (schedule.gameDate instanceof Date) {
                scheduledAt = new Date(schedule.gameDate.getTime());
              } else {
                scheduledAt = new Date(schedule.gameDate);
              }
              
              // Validate the date
              if (isNaN(scheduledAt.getTime())) {
                console.error(`Invalid date for game ${schedule.homeTeamName} vs ${schedule.awayTeamName}:`, schedule.gameDate);
                errors.push(`Invalid date for game: ${schedule.homeTeamName} vs ${schedule.awayTeamName}`);
                continue;
              }
              
              // Parse and add time if provided
              if (schedule.gameTime) {
                const timeMatch = schedule.gameTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
                if (timeMatch) {
                  let hours = parseInt(timeMatch[1], 10);
                  const minutes = parseInt(timeMatch[2], 10);
                  const ampm = timeMatch[4];
                  
                  // Handle 12-hour format
                  if (ampm) {
                    if (ampm.toUpperCase() === 'PM' && hours !== 12) {
                      hours += 12;
                    } else if (ampm.toUpperCase() === 'AM' && hours === 12) {
                      hours = 0;
                    }
                  }
                  
                  if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                    scheduledAt.setHours(hours, minutes, 0, 0);
                  }
                }
              }

              // Check for existing game before creating
              const existingGame = await storage.findExistingGame(
                leagueId,
                schedule.homeTeamId,
                schedule.awayTeamId,
                scheduledAt
              );

              if (existingGame) {
                console.log(`Skipping duplicate game: ${schedule.homeTeamName} vs ${schedule.awayTeamName} on ${scheduledAt}`);
                gamesSkipped++;
                continue;
              }

              await storage.createGame({
                leagueId: leagueId,
                homeTeamId: schedule.homeTeamId,
                awayTeamId: schedule.awayTeamId,
                scheduledAt: scheduledAt,
                venue: null,
                homeTeamLockerRoom: schedule.homeTeamLockerRoom,
                awayTeamLockerRoom: schedule.awayTeamLockerRoom,
              });
              
              gamesCreated++;
            }
          } catch (error) {
            console.error(`Failed to create game for ${schedule.homeTeamName} vs ${schedule.awayTeamName}:`, error);
            errors.push(`Failed to create game: ${schedule.homeTeamName} vs ${schedule.awayTeamName}`);
          }
        }
      }

      // Clean up uploaded file
      fs.unlinkSync(file.path);

      res.json({
        importId: importRecord.id,
        totalRecords: parseResults.data.length,
        successfulRecords: validSchedules.length,
        failedRecords: errors.length,
        teamsCreated: createdTeams.size,
        gamesCreated: gamesCreated || 0,
        gamesSkipped: gamesSkipped || 0,
        errors
      });

    } catch (error) {
      console.error('Error importing schedules:', error);
      
      // Clean up file if it exists
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      }
      
      res.status(500).json({ message: 'Failed to import schedules' });
    }
  });

  // Get schedule import history for a league
  app.get('/api/leagues/:leagueId/schedules/imports', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user has commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const imports = await storage.getScheduleImports(leagueId);
      res.json(imports);
    } catch (error) {
      console.error('Error fetching schedule import history:', error);
      res.status(500).json({ message: 'Failed to fetch schedule import history' });
    }
  });

  // Find potential merge matches for a player
  app.get('/api/leagues/:leagueId/imported-players/matches', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const { firstName, lastName } = req.query;
      
      if (!firstName || !lastName) {
        return res.json([]);
      }
      
      const matches = await storage.findPotentialMatches(leagueId, firstName as string, lastName as string);
      res.json(matches);
    } catch (error) {
      console.error('Error finding potential matches:', error);
      res.status(500).json({ message: 'Failed to find matches' });
    }
  });

  // Merge two user accounts in a league (e.g., placeholder with real user)
  app.post('/api/leagues/:leagueId/merge-player', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const { fromUserId, toUserId, preserveName = true } = req.body;
      const userId = req.user.claims.sub;

      // Validate request body
      const mergeRequestSchema = z.object({
        fromUserId: z.string().min(1, 'From user ID is required'),
        toUserId: z.string().min(1, 'To user ID is required'),
        preserveName: z.boolean().optional().default(true),
      });

      const validatedData = mergeRequestSchema.parse({ fromUserId, toUserId, preserveName });

      if (validatedData.fromUserId === validatedData.toUserId) {
        return res.status(400).json({ message: 'Cannot merge user with themselves' });
      }

      // Check commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Commissioner access required' });
      }

      // Verify both users exist and are in the league
      const [fromUser, toUser] = await Promise.all([
        storage.getUser(validatedData.fromUserId),
        storage.getUser(validatedData.toUserId)
      ]);

      if (!fromUser) {
        return res.status(404).json({ message: 'Source user not found' });
      }

      if (!toUser) {
        return res.status(404).json({ message: 'Target user not found' });
      }

      const [fromMembership, toMembership] = await Promise.all([
        storage.getUserLeagueMembership(validatedData.fromUserId, leagueId),
        storage.getUserLeagueMembership(validatedData.toUserId, leagueId)
      ]);

      if (!fromMembership) {
        return res.status(404).json({ message: 'Source user is not a member of this league' });
      }

      // Perform the merge
      const mergedMembership = await storage.mergeUsersInLeague(
        leagueId,
        validatedData.fromUserId,
        validatedData.toUserId,
        validatedData.preserveName
      );

      res.json({
        message: 'Users merged successfully',
        membership: mergedMembership,
        preservedName: validatedData.preserveName
      });

    } catch (error) {
      console.error('Failed to merge users:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: 'Invalid request data', 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: 'Failed to merge users' });
    }
  });

  // Merge an imported player with a real user account
  app.post('/api/leagues/:leagueId/players/merge', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const { membershipId, importedPlayerId } = req.body;
      const userId = req.user.claims.sub;

      // Check commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Get the imported player details
      const importedPlayer = await db.select()
        .from(importedPlayers)
        .where(eq(importedPlayers.id, importedPlayerId))
        .limit(1);

      if (!importedPlayer.length) {
        return res.status(404).json({ message: 'Imported player not found' });
      }

      const player = importedPlayer[0];

      // Approve the membership and assign to team if available
      await storage.approveLeagueMembership(membershipId, userId);

      // If imported player has team info, assign the user to that team
      if (player.teamName) {
        // Find or create the team
        let team = await db.select()
          .from(teams)
          .where(and(eq(teams.leagueId, leagueId), eq(teams.name, player.teamName)))
          .limit(1);

        if (!team.length) {
          // Create team if it doesn't exist
          const newTeam = await storage.createTeam({
            name: player.teamName,
            leagueId: leagueId,
          });
          team = [newTeam];
        }

        // Assign the user to the team
        await db.update(leagueMemberships)
          .set({ assignedTeamId: team[0].id })
          .where(eq(leagueMemberships.id, membershipId));
      }

      // Mark the imported player as merged
      await db.update(importedPlayers)
        .set({ 
          mergedWithUserId: (await db.select().from(leagueMemberships).where(eq(leagueMemberships.id, membershipId)).limit(1))[0].userId,
          mergedAt: new Date()
        })
        .where(eq(importedPlayers.id, importedPlayerId));

      res.json({ success: true });
    } catch (error) {
      console.error('Error merging player:', error);
      res.status(500).json({ message: 'Failed to merge player' });
    }
  });

  // Leave a league (reverse of player merge)
  app.post('/api/leagues/:leagueId/leave', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.user.claims.sub;

      // Check if user is actually a member of this league
      const membership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!membership) {
        return res.status(404).json({ message: 'You are not a member of this league' });
      }

      // Check if user is the commissioner - prevent them from leaving their own league
      const league = await storage.getLeague(leagueId);
      if (league && league.commissionerId === userId) {
        return res.status(403).json({ message: 'Commissioners cannot leave their own league. Please transfer commissioner role first.' });
      }

      // Leave the league (this will detach from imported player and clean up memberships)
      await storage.leaveLeague(userId, leagueId);

      res.json({ success: true, message: 'Successfully left the league' });
    } catch (error: any) {
      console.error('Error leaving league:', error);
      
      // Map internal error codes to user-friendly messages
      if (error.message === 'MEMBERSHIP_NOT_FOUND') {
        return res.status(404).json({ message: 'You are not a member of this league' });
      }
      
      // Generic error for unexpected issues
      res.status(500).json({ message: 'Unable to leave league. Please try again.' });
    }
  });


  // Announcement routes

  // Get unread announcements count for a league
  app.get('/api/leagues/:leagueId/announcements/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user is member of the league
      const membership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Get actual unread count using proper read tracking
      const unreadCount = await storage.getUnreadAnnouncementCount(leagueId, userId);
      
      res.json({ count: unreadCount });
    } catch (error) {
      console.error('Error getting unread announcement count:', error);
      res.status(500).json({ message: 'Failed to get unread count' });
    }
  });

  // Mark announcements as read for a league
  app.post('/api/leagues/:leagueId/announcements/mark-read', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user is member of the league
      const membership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Mark ALL visible announcements in the league as read for this user using bulk insert
      // Only mark announcements that the user can actually see (respecting visibility rules)
      const result = await db.execute(sql`
        INSERT INTO announcement_read_status (id, announcement_id, user_id, read_at)
        SELECT gen_random_uuid(), a.id, ${userId}, NOW()
        FROM announcements a 
        WHERE a.league_id = ${leagueId}
        AND (
          NOT EXISTS (
            SELECT 1 FROM announcement_visibility av 
            WHERE av.announcement_id = a.id
          )
          OR 
          EXISTS (
            SELECT 1 FROM announcement_visibility av 
            WHERE av.announcement_id = a.id AND av.user_id = ${userId}
          )
        )
        ON CONFLICT (announcement_id, user_id) DO NOTHING
      `);

      console.log(`📖 Bulk marked announcements as read for user ${userId} in league ${leagueId}`);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking announcements as read:', error);
      res.status(500).json({ message: 'Failed to mark as read' });
    }
  });
  
  // Get announcements for a league
  app.get('/api/leagues/:leagueId/announcements', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user is member of the league
      const membership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Parse and validate query parameters
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20)); // Default 20, max 50
      const orderBy = req.query.orderBy === 'createdAt' ? 'createdAt' : 'createdAt'; // Only support createdAt for now
      const orderDirection = req.query.orderDirection === 'asc' ? 'asc' : 'desc'; // Default desc (newest first)
      const offset = (page - 1) * limit;

      // Get announcements with visibility filtering handled at SQL level
      const result = await storage.getLeagueAnnouncements(leagueId, {
        limit,
        offset,
        orderBy,
        orderDirection,
      }, userId);

      // Pagination is now accurate since visibility filtering happens in SQL
      res.json({
        announcements: result.announcements,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
          hasNext: page * limit < result.total,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error('Error fetching announcements:', error);
      res.status(500).json({ message: 'Failed to fetch announcements' });
    }
  });

  // Create announcement (commissioner or team captain)
  app.post('/api/leagues/:leagueId/announcements', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user is commissioner or team captain
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const isCommissioner = league.commissionerId === userId;
      
      // Check if user is a team captain in this league
      const teams = await storage.getTeamsByLeague(leagueId);
      const captainTeam = teams.find(team => team.captainId === userId);
      const isTeamCaptain = !!captainTeam;

      if (!isCommissioner && !isTeamCaptain) {
        return res.status(403).json({ message: 'Only commissioners and team captains can create announcements' });
      }

      const requestBody = req.body;
      console.log('📝 Creating announcement with data:', JSON.stringify(requestBody, null, 2));
      
      const { targetUserIds, ...announcementData } = createAnnouncementRequestSchema.parse(requestBody);
      
      // Set teamId based on user role:
      // - Commissioner posts: teamId = null (visible to everyone in league)
      // - Team captain posts: teamId = their team's ID (visible only to their team)
      const teamId = isCommissioner ? null : (captainTeam?.id || null);
      
      let announcement;
      
      // Validate targetUserIds if provided - ensure they are league members
      if (targetUserIds && targetUserIds.length > 0) {
        console.log('🎯 Validating targeted announcement user IDs:', targetUserIds);
        const validUserIds = [];
        for (const targetUserId of targetUserIds) {
          const membership = await storage.getUserLeagueMembership(targetUserId, leagueId);
          if (membership && membership.status === 'approved') {
            validUserIds.push(targetUserId);
          } else {
            console.warn(`⚠️ User ${targetUserId} is not an approved member of league ${leagueId}, excluding from targets`);
          }
        }
        
        if (validUserIds.length === 0) {
          return res.status(400).json({ message: 'None of the specified users are valid league members' });
        }
        
        // Create announcement
        announcement = await storage.createAnnouncement({
          ...announcementData,
          leagueId,
          authorId: userId,
          teamId,
        });
        
        // Create visibility records for targeted users + author
        const visibilityUserIds = Array.from(new Set([...validUserIds, userId])); // Include author and remove duplicates
        console.log(`🔒 Creating visibility records for ${visibilityUserIds.length} users (including author)`);
        await storage.createAnnouncementVisibility(announcement.id, visibilityUserIds);
        
        console.log(`✅ Created targeted announcement ${announcement.id} for users: ${validUserIds.join(', ')}`);
      } else {
        // Create regular announcement
        // Commissioner: visible to all league members (teamId = null)
        // Team Captain: visible only to their team (teamId = team's ID)
        announcement = await storage.createAnnouncement({
          ...announcementData,
          leagueId,
          authorId: userId,
          teamId,
        });
        
        if (isCommissioner) {
          console.log(`📢 Created commissioner announcement ${announcement.id} (visible to all)`);
        } else {
          console.log(`👥 Created team captain announcement ${announcement.id} for team ${teamId} (visible to team only)`);
        }
      }

      // Handle attachments if provided
      if (requestBody.attachments && Array.isArray(requestBody.attachments)) {
        console.log('📎 Processing attachments:', requestBody.attachments);
        for (const attachment of requestBody.attachments) {
          await storage.createAnnouncementAttachment({
            announcementId: announcement.id,
            type: attachment.type,
            url: attachment.url,
            filename: attachment.fileName,
          });
        }
      }

      // Handle poll if provided
      if (requestBody.poll && requestBody.poll.question) {
        console.log('📊 Processing poll:', requestBody.poll);
        await storage.createAnnouncementPoll({
          announcementId: announcement.id,
          question: requestBody.poll.question,
          options: requestBody.poll.options,
          allowMultiple: requestBody.poll.allowMultiple || false,
        });
      }

      // Return the full announcement with attachments and polls
      const fullAnnouncement = await storage.getAnnouncement(announcement.id);
      res.json(fullAnnouncement);
    } catch (error) {
      console.error('Error creating announcement:', error);
      res.status(500).json({ message: 'Failed to create announcement' });
    }
  });

  // Update announcement (commissioner or author)
  app.patch('/api/announcements/:id', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;

      // Get announcement to check permissions
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Check if user is commissioner of the league or the author of the announcement
      const league = await storage.getLeague(announcement.leagueId);
      const isCommissioner = league && league.commissionerId === userId;
      const isAuthor = announcement.authorId === userId;

      if (!isCommissioner && !isAuthor) {
        return res.status(403).json({ message: 'Only commissioners and announcement authors can edit announcements' });
      }

      const updates = updateAnnouncementRequestSchema.parse(req.body);
      const updatedAnnouncement = await storage.updateAnnouncement(announcementId, updates);
      res.json(updatedAnnouncement);
    } catch (error) {
      console.error('Error updating announcement:', error);
      res.status(500).json({ message: 'Failed to update announcement' });
    }
  });

  // Delete announcement (commissioner or author)
  app.delete('/api/announcements/:id', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;

      // Get announcement to check permissions
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Check if user is commissioner of the league or the author of the announcement
      const league = await storage.getLeague(announcement.leagueId);
      const isCommissioner = league && league.commissionerId === userId;
      const isAuthor = announcement.authorId === userId;

      if (!isCommissioner && !isAuthor) {
        return res.status(403).json({ message: 'Only commissioners and announcement authors can delete announcements' });
      }

      await storage.deleteAnnouncement(announcementId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting announcement:', error);
      res.status(500).json({ message: 'Failed to delete announcement' });
    }
  });

  // Add reaction to announcement
  app.post('/api/announcements/:id/reactions', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;
      const { emoji } = req.body;

      if (!emoji) {
        return res.status(400).json({ message: 'Emoji is required' });
      }

      // Check if announcement exists
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Verify user is an approved member of the league
      const membership = await storage.getUserLeagueMembership(userId, announcement.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Check visibility for targeted announcements
      const isVisible = await storage.isAnnouncementVisibleToUser(announcementId, userId);
      if (!isVisible) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      const reaction = await storage.addAnnouncementReaction({
        announcementId,
        userId,
        emoji,
      });

      res.json(reaction);
    } catch (error) {
      console.error('Error adding reaction:', error);
      res.status(500).json({ message: 'Failed to add reaction' });
    }
  });

  // Remove reaction from announcement
  app.delete('/api/announcements/:id/reactions', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;
      const { emoji } = req.body;

      if (!emoji) {
        return res.status(400).json({ message: 'Emoji is required' });
      }

      // Check if announcement exists and user has access (visibility check)
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      const membership = await storage.getUserLeagueMembership(userId, announcement.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Check if announcement is visible to this user (targeted visibility)
      const isVisible = await storage.isAnnouncementVisibleToUser(announcementId, userId);
      if (!isVisible) {
        return res.status(404).json({ message: 'Announcement not found' }); // Return 404 to not reveal existence
      }

      await storage.removeAnnouncementReaction(announcementId, userId, emoji);
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing reaction:', error);
      res.status(500).json({ message: 'Failed to remove reaction' });
    }
  });

  // Create poll for announcement (commissioner only)
  app.post('/api/announcements/:id/polls', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;

      // Get announcement to check permissions
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Check if user is commissioner of the league
      const league = await storage.getLeague(announcement.leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can create polls' });
      }

      // Commissioners can create polls on all announcements in their leagues regardless of visibility

      const pollData = createAnnouncementPollRequestSchema.parse(req.body);
      const poll = await storage.createAnnouncementPoll({
        ...pollData,
        announcementId,
      });

      res.json(poll);
    } catch (error) {
      console.error('Error creating poll:', error);
      res.status(500).json({ message: 'Failed to create poll' });
    }
  });

  // Vote on poll
  app.post('/api/polls/:id/votes', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = req.params.id;
      const userId = req.user.claims.sub;
      const { optionIndex } = req.body;

      if (optionIndex === undefined || optionIndex < 0) {
        return res.status(400).json({ message: 'Valid option index is required' });
      }

      // First get the poll to find the announcement it belongs to
      try {
        const polls = await db.select().from(announcementPolls).where(eq(announcementPolls.id, pollId));
        if (polls.length === 0) {
          return res.status(404).json({ message: 'Poll not found' });
        }
        
        const announcement = await storage.getAnnouncement(polls[0].announcementId);
        if (!announcement) {
          return res.status(404).json({ message: 'Announcement not found' });
        }

        const membership = await storage.getUserLeagueMembership(userId, announcement.leagueId);
        if (!membership || membership.status !== 'approved') {
          return res.status(403).json({ message: 'Access denied' });
        }

        // Check if announcement is visible to this user (targeted visibility)
        const isVisible = await storage.isAnnouncementVisibleToUser(announcement.id, userId);
        if (!isVisible) {
          return res.status(404).json({ message: 'Poll not found' }); // Return 404 to not reveal existence
        }
      } catch (error) {
        console.error('Error checking poll visibility:', error);
        return res.status(404).json({ message: 'Poll not found' });
      }

      const voteData = insertAnnouncementPollVoteSchema.parse({
        pollId,
        userId,
        optionIndex,
      });

      const vote = await storage.voteOnPoll(voteData);
      res.json(vote);
    } catch (error) {
      console.error('Error voting on poll:', error);
      res.status(500).json({ message: 'Failed to vote on poll' });
    }
  });

  // Get poll results
  app.get('/api/polls/:id/results', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = req.params.id;
      const userId = req.user.claims.sub;

      // First get the poll to find the announcement it belongs to
      const polls = await db.select().from(announcementPolls).where(eq(announcementPolls.id, pollId));
      if (polls.length === 0) {
        return res.status(404).json({ message: 'Poll not found' });
      }
      
      const announcement = await storage.getAnnouncement(polls[0].announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      const membership = await storage.getUserLeagueMembership(userId, announcement.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Check if announcement is visible to this user (targeted visibility)
      const isVisible = await storage.isAnnouncementVisibleToUser(announcement.id, userId);
      if (!isVisible) {
        return res.status(404).json({ message: 'Poll not found' }); // Return 404 to not reveal existence
      }

      const results = await storage.getPollResults(pollId);
      res.json(results);
    } catch (error) {
      console.error('Error getting poll results:', error);
      res.status(500).json({ message: 'Failed to get poll results' });
    }
  });

  // Add attachment to announcement (commissioner only)
  app.post('/api/announcements/:id/attachments', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;

      // Get announcement to check permissions
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Check if user is commissioner of the league
      const league = await storage.getLeague(announcement.leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can add attachments' });
      }

      const attachmentData = insertAnnouncementAttachmentSchema.parse(req.body);
      const attachment = await storage.createAnnouncementAttachment({
        ...attachmentData,
        announcementId,
      });

      res.json(attachment);
    } catch (error) {
      console.error('Error adding attachment:', error);
      res.status(500).json({ message: 'Failed to add attachment' });
    }
  });

  // ========== SCRIMMAGE ROUTES ==========

  // Custom schema for API request that handles string-to-Date conversion
  const createScrimmageApiSchema = insertScrimmageSchema.extend({
    dateTime: z.preprocess((val) => {
      if (typeof val === 'string') {
        return new Date(val);
      }
      return val;
    }, z.date())
  });

  // Create scrimmage (Player Plus+ only)
  app.post('/api/scrimmages', isAuthenticated, loadUserPermissions, requirePremiumFeatures, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Validate input data with proper schema
      let scrimmageData;
      try {
        scrimmageData = createScrimmageApiSchema.parse({
          ...req.body,
          creatorId: userId,
        });
      } catch (validationError) {
        console.error('Validation error creating scrimmage:', validationError);
        return res.status(400).json({ message: "Invalid scrimmage data", errors: validationError instanceof Error ? validationError.message : 'Validation failed' });
      }

      // Business invariants validation
      if (scrimmageData.maxPlayers < 2) {
        return res.status(400).json({ message: "Maximum players must be at least 2" });
      }
      if (scrimmageData.maxPlayers > 50) {
        return res.status(400).json({ message: "Maximum players cannot exceed 50" });
      }
      
      // Ensure scrimmage is scheduled in the future
      const now = new Date();
      if (scrimmageData.dateTime <= now) {
        return res.status(400).json({ message: "Scrimmage must be scheduled for a future date" });
      }
      
      // Verify league exists and user is a member
      const league = await storage.getLeague(scrimmageData.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      const membership = await storage.getUserLeagueMembership(userId, scrimmageData.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: "Must be an approved league member to create scrimmages" });
      }

      // Create announcement first if there are selected members
      let announcementId = null;
      if (req.body.selectedMemberIds && req.body.selectedMemberIds.length > 0) {
        try {
          console.log(`📬 Creating scrimmage invitations for members:`, req.body.selectedMemberIds);
          
          const invitationContent = `🏒 You're Invited! "${scrimmageData.title}" on ${format(scrimmageData.dateTime, 'MMM d, yyyy \'at\' h:mm a')} at ${scrimmageData.location}. Click to RSVP!`;
          
          // Create announcement for the scrimmage invitation
          const announcement = await storage.createAnnouncement({
            content: invitationContent,
            leagueId: scrimmageData.leagueId,
            authorId: userId,
            isPinned: false,
          });
          
          announcementId = announcement.id;
          
          // Create visibility records for invited players
          await storage.createAnnouncementVisibility(announcement.id, req.body.selectedMemberIds);
          
          console.log(`✅ Created announcement ${announcement.id} and sent invitations to ${req.body.selectedMemberIds.length} players:`, req.body.selectedMemberIds);
        } catch (announcementError) {
          console.error('Error sending scrimmage invitations:', announcementError);
          // Continue with scrimmage creation even if announcement fails
        }
      }
      
      // Create scrimmage with the announcement ID if available
      const scrimmage = await storage.createScrimmage({
        ...scrimmageData,
        announcementId,
      });
      
      console.log(`✅ Created scrimmage ${scrimmage.id}${announcementId ? ` linked to announcement ${announcementId}` : ''}`);
      
      res.status(201).json(scrimmage);
    } catch (error) {
      console.error('Error creating scrimmage:', error);
      res.status(500).json({ message: 'Failed to create scrimmage' });
    }
  });

  // Get league scrimmages
  app.get('/api/leagues/:id/scrimmages', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      
      // Validate league exists
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      // Verify user is a member of the league
      const membership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: "Must be a league member to view scrimmages" });
      }
      
      const scrimmages = await storage.getLeagueScrimmages(leagueId);
      res.json(scrimmages);
    } catch (error) {
      console.error('Error fetching league scrimmages:', error);
      res.status(500).json({ message: 'Failed to fetch league scrimmages' });
    }
  });

  // Get user's created scrimmages
  app.get('/api/users/scrimmages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const scrimmages = await storage.getUserScrimmages(userId);
      res.json(scrimmages);
    } catch (error) {
      console.error('Error fetching user scrimmages:', error);
      res.status(500).json({ message: 'Failed to fetch user scrimmages' });
    }
  });

  // Get single scrimmage details
  app.get('/api/scrimmages/:id', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Verify user is a member of the league
      const membership = await storage.getUserLeagueMembership(userId, scrimmage.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: "Must be a league member to view scrimmage details" });
      }

      res.json(scrimmage);
    } catch (error) {
      console.error('Error fetching scrimmage:', error);
      res.status(500).json({ message: 'Failed to fetch scrimmage' });
    }
  });

  // Update scrimmage (Creator only)
  app.put('/api/scrimmages/:id', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;

      // Get scrimmage to check ownership and current state
      const existingScrimmage = await storage.getScrimmage(scrimmageId);
      if (!existingScrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }

      if (existingScrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can update this scrimmage' });
      }
      
      // Business invariant: Cannot edit scrimmage that has already started or ended
      const now = new Date();
      if (existingScrimmage.dateTime <= now) {
        return res.status(409).json({ message: 'Cannot update scrimmage that has already started or ended' });
      }
      
      // Business invariant: Cannot edit scrimmage that is cancelled
      if (existingScrimmage.status === 'cancelled') {
        return res.status(409).json({ message: 'Cannot update cancelled scrimmage' });
      }

      // Validate input data with proper Zod schema
      let updateData;
      try {
        updateData = updateScrimmageRequestSchema.parse(req.body);
      } catch (validationError) {
        console.error('Validation error updating scrimmage:', validationError);
        return res.status(400).json({ message: "Invalid update data", errors: validationError instanceof Error ? validationError.message : 'Validation failed' });
      }
      
      // Business invariants validation
      if (updateData.maxPlayers !== undefined) {
        if (updateData.maxPlayers < 2) {
          return res.status(400).json({ message: "Maximum players must be at least 2" });
        }
        if (updateData.maxPlayers > 50) {
          return res.status(400).json({ message: "Maximum players cannot exceed 50" });
        }
        
        // Get current accepted players count
        const acceptedRequests = await storage.getScrimmageRequests(scrimmageId);
        const acceptedCount = acceptedRequests.filter(req => req.status === 'approved').length;
        
        if (updateData.maxPlayers < acceptedCount) {
          return res.status(409).json({ 
            message: `Cannot reduce max players to ${updateData.maxPlayers}. There are already ${acceptedCount} accepted players.` 
          });
        }
      }
      
      // DateTime editing restrictions
      if (updateData.dateTime !== undefined) {
        if (updateData.dateTime <= now) {
          return res.status(400).json({ message: "Scrimmage must be scheduled for a future date" });
        }
        
        // Don't allow changing date if it's less than 24 hours away
        const hoursUntilExisting = (existingScrimmage.dateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursUntilExisting < 24) {
          return res.status(409).json({ message: "Cannot change scrimmage date less than 24 hours before scheduled time" });
        }
      }

      const updatedScrimmage = await storage.updateScrimmage(scrimmageId, updateData);
      res.json(updatedScrimmage);
    } catch (error) {
      console.error('Error updating scrimmage:', error);
      res.status(500).json({ message: 'Failed to update scrimmage' });
    }
  });

  // Delete scrimmage (Creator only)
  app.delete('/api/scrimmages/:id', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;

      // Get scrimmage to check ownership and status
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }

      if (scrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can delete this scrimmage' });
      }

      await storage.deleteScrimmage(scrimmageId);
      res.json({ message: 'Scrimmage deleted successfully' });
    } catch (error) {
      console.error('Error deleting scrimmage:', error);
      res.status(500).json({ message: 'Failed to delete scrimmage' });
    }
  });

  // Create scrimmage request (join request)
  app.post('/api/scrimmages/:id/requests', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if scrimmage exists and get details
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Business invariant: Cannot join scrimmage that has passed or is imminent
      const now = new Date();
      if (scrimmage.dateTime <= now) {
        return res.status(409).json({ message: 'Cannot join scrimmage that has already started or ended' });
      }
      
      // Cannot join cancelled scrimmage
      if (scrimmage.status === 'cancelled') {
        return res.status(409).json({ message: 'Cannot join cancelled scrimmage' });
      }
      
      // Verify user is a member of the league
      const membership = await storage.getUserLeagueMembership(userId, scrimmage.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: "Must be an approved league member to join scrimmages" });
      }

      // Check if user already has a request for this scrimmage
      const existingRequest = await storage.getScrimmageRequest(scrimmageId, userId);
      if (existingRequest) {
        return res.status(409).json({ message: 'Request already exists for this scrimmage' });
      }
      
      // Check if scrimmage is already at capacity
      const currentRequests = await storage.getScrimmageRequests(scrimmageId);
      const acceptedCount = currentRequests.filter(req => req.status === 'approved').length;
      
      if (acceptedCount >= scrimmage.maxPlayers) {
        return res.status(409).json({ message: 'Scrimmage is already at full capacity' });
      }

      // Validate request data
      // If creator is joining their own scrimmage, auto-approve them
      const isCreator = scrimmage.creatorId === userId;
      let requestData;
      try {
        requestData = insertScrimmageRequestSchema.parse({
          scrimmageId,
          playerId: userId,
          status: isCreator ? 'approved' : 'pending',
        });
      } catch (validationError) {
        console.error('Validation error creating scrimmage request:', validationError);
        return res.status(400).json({ message: "Invalid request data", errors: validationError instanceof Error ? validationError.message : 'Validation failed' });
      }

      const request = await storage.createScrimmageRequest(requestData);
      res.status(201).json(request);
    } catch (error) {
      console.error('Error creating scrimmage request:', error);
      res.status(500).json({ message: 'Failed to create scrimmage request' });
    }
  });

  // Get approved players for scrimmage (Any league member)
  app.get('/api/scrimmages/:id/approved-players', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Verify user is a member of the league
      const membership = await storage.getUserLeagueMembership(userId, scrimmage.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: "Must be a league member to view scrimmage details" });
      }

      // Get only approved requests
      const allRequests = await storage.getScrimmageRequests(scrimmageId);
      const approvedPlayers = allRequests.filter(request => request.status === 'approved');
      
      res.json({
        scrimmage,
        approvedPlayers
      });
    } catch (error) {
      console.error('Error fetching approved players:', error);
      res.status(500).json({ message: 'Failed to fetch approved players' });
    }
  });

  // Get scrimmage requests (Creator only)
  app.get('/api/scrimmages/:id/requests', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get scrimmage to check ownership
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }

      if (scrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can view requests' });
      }

      const requests = await storage.getScrimmageRequests(scrimmageId);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching scrimmage requests:', error);
      res.status(500).json({ message: 'Failed to fetch scrimmage requests' });
    }
  });

  // Update scrimmage request status (Creator only)
  app.put('/api/scrimmage-requests/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const requestId = req.params.id;
      const userId = req.user.claims.sub;
      const { status } = req.body;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Validate status input
      if (!status || !['approved', 'dismissed'].includes(status)) {
        return res.status(400).json({ message: 'Status must be "approved" or "dismissed"' });
      }

      // Get the request first
      const request = await storage.getScrimmageRequestById(requestId);
      
      if (!request) {
        return res.status(404).json({ message: 'Request not found' });
      }
      
      // Business invariant: Cannot modify already processed requests
      if (request.status !== 'pending') {
        return res.status(409).json({ message: `Request has already been ${request.status}` });
      }

      const scrimmage = await storage.getScrimmage(request.scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      if (scrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can update request status' });
      }
      
      // Business invariant: Cannot approve requests for scrimmages that have passed
      const now = new Date();
      if (scrimmage.dateTime <= now && status === 'approved') {
        return res.status(409).json({ message: 'Cannot approve requests for scrimmages that have already started' });
      }
      
      // Business invariant: Cannot approve if at capacity
      if (status === 'approved') {
        const currentRequests = await storage.getScrimmageRequests(scrimmage.id);
        const approvedCount = currentRequests.filter(req => req.status === 'approved').length;
        
        if (approvedCount >= scrimmage.maxPlayers) {
          return res.status(409).json({ message: 'Cannot approve request - scrimmage is at full capacity' });
        }
      }

      const updatedRequest = await storage.updateScrimmageRequestStatus(requestId, status);
      res.json(updatedRequest);
    } catch (error) {
      console.error('Error updating request status:', error);
      res.status(500).json({ message: 'Failed to update request status' });
    }
  });

  // Delete scrimmage request
  app.delete('/api/scrimmage-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const requestId = req.params.id;
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get all requests to find this one and check permissions
      const requests = await storage.getScrimmageRequests(requestId);
      const request = requests.find(r => r.id === requestId);
      
      if (!request) {
        return res.status(404).json({ message: 'Request not found' });
      }

      const scrimmage = await storage.getScrimmage(request.scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Allow deletion if user is the requester or the scrimmage creator
      if (request.playerId !== userId && scrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Unauthorized to delete this request' });
      }
      
      // Business invariant: Cannot delete approved request less than 24 hours before scrimmage
      if (request.status === 'approved' && request.playerId === userId) {
        const now = new Date();
        const hoursUntil = (scrimmage.dateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        if (hoursUntil < 24) {
          return res.status(409).json({ 
            message: 'Cannot withdraw from approved scrimmage less than 24 hours before scheduled time' 
          });
        }
      }

      await storage.deleteScrimmageRequest(requestId);
      res.json({ message: 'Request deleted successfully' });
    } catch (error) {
      console.error('Error deleting request:', error);
      res.status(500).json({ message: 'Failed to delete request' });
    }
  });


  // Get player's scrimmage requests
  app.get('/api/users/scrimmage-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const requests = await storage.getScrimmageRequestsByPlayer(userId);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching player requests:', error);
      res.status(500).json({ message: 'Failed to fetch player requests' });
    }
  });

  // Get user's scrimmage invites (scrimmages they were invited to but haven't responded)
  app.get('/api/users/scrimmage-invites', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const invites = await storage.getScrimmageInvitesForUser(userId);
      console.log(`📩 Scrimmage invites for user ${userId}:`, invites.length > 0 ? invites.map(i => ({ id: i.id, title: i.title, announcementId: i.announcementId })) : 'none');
      res.json(invites);
    } catch (error) {
      console.error('Error fetching user scrimmage invites:', error);
      res.status(500).json({ message: 'Failed to fetch scrimmage invites' });
    }
  });

  // Finalize scrimmage roster and send confirmation notifications
  app.put('/api/scrimmages/:id/finalize', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get the scrimmage
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Only creator can finalize
      if (scrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can finalize the scrimmage' });
      }
      
      // Check if already finalized
      if (scrimmage.status === 'roster_confirmed') {
        return res.status(409).json({ message: 'Scrimmage roster is already finalized' });
      }
      
      // Business rule: Cannot finalize if scrimmage has already started
      const now = new Date();
      if (scrimmage.dateTime <= now) {
        return res.status(409).json({ message: 'Cannot finalize a scrimmage that has already started' });
      }
      
      // Get approved players
      const requests = await storage.getScrimmageRequests(scrimmageId);
      const approvedRequests = requests.filter(req => req.status === 'approved');
      
      if (approvedRequests.length === 0) {
        return res.status(400).json({ message: 'Cannot finalize scrimmage with no approved players' });
      }
      
      // Update scrimmage status to finalized
      const updatedScrimmage = await storage.updateScrimmage(scrimmageId, { status: 'roster_confirmed' });
      
      // Send targeted announcement to approved players
      const approvedUserIds = approvedRequests.map(req => req.playerId);
      const approvedAnnouncementContent = `🏒 Scrimmage Confirmed! Your spot in "${scrimmage.title}" has been confirmed for ${format(scrimmage.dateTime, 'MMM d, yyyy \'at\' h:mm a')} at ${scrimmage.location}. See you on the ice!`;
      
      try {
        // Create announcement for approved players
        const approvedAnnouncement = await storage.createAnnouncement({
          content: approvedAnnouncementContent,
          leagueId: scrimmage.leagueId,
          authorId: userId,
          isPinned: false,
        });
        
        // Create visibility records for approved players
        await storage.createAnnouncementVisibility(approvedAnnouncement.id, approvedUserIds);
        
        console.log(`✅ Sent confirmation notifications to ${approvedUserIds.length} approved players`);
      } catch (announcementError) {
        console.error('Error sending confirmation notifications:', announcementError);
        // Don't fail the finalization if announcement fails
      }

      // Send targeted announcement to non-approved players
      const nonApprovedRequests = requests.filter(req => req.status !== 'approved');
      const nonApprovedUserIds = nonApprovedRequests.map(req => req.playerId);
      
      if (nonApprovedUserIds.length > 0) {
        const noticeAnnouncementContent = `NOTICE - The Skate for ${format(scrimmage.dateTime, 'MMM d')} is full at this time`;
        
        try {
          // Create announcement for non-approved players
          const noticeAnnouncement = await storage.createAnnouncement({
            content: noticeAnnouncementContent,
            leagueId: scrimmage.leagueId,
            authorId: userId,
            isPinned: false,
          });
          
          // Create visibility records for non-approved players
          await storage.createAnnouncementVisibility(noticeAnnouncement.id, nonApprovedUserIds);
          
          console.log(`✅ Sent notice notifications to ${nonApprovedUserIds.length} non-approved players`);
        } catch (announcementError) {
          console.error('Error sending notice notifications:', announcementError);
          // Don't fail the finalization if announcement fails
        }
      }
      
      res.json(updatedScrimmage);
    } catch (error) {
      console.error('Error finalizing scrimmage:', error);
      res.status(500).json({ message: 'Failed to finalize scrimmage' });
    }
  });

  // Delete scrimmage and notify confirmed players
  app.delete('/api/scrimmages/:id', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get the scrimmage
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Only creator can delete
      if (scrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can cancel the scrimmage' });
      }
      
      // Get approved players before deleting
      const requests = await storage.getScrimmageRequests(scrimmageId);
      const approvedRequests = requests.filter(req => req.status === 'approved');
      
      // Delete the scrimmage (this will cascade delete requests)
      await storage.deleteScrimmage(scrimmageId);
      
      // Send cancellation notification to approved players
      if (approvedRequests.length > 0) {
        const targetUserIds = approvedRequests.map(req => req.playerId);
        const announcementContent = `❌ Scrimmage Cancelled: "${scrimmage.title}" scheduled for ${format(scrimmage.dateTime, 'MMM d, yyyy \'at\' h:mm a')} at ${scrimmage.location} has been cancelled by the organizer.`;
        
        try {
          // Create announcement
          const announcement = await storage.createAnnouncement({
            content: announcementContent,
            leagueId: scrimmage.leagueId,
            authorId: userId,
            isPinned: false,
          });
          
          // Create visibility records for approved players
          await storage.createAnnouncementVisibility(announcement.id, targetUserIds);
          
          console.log(`✅ Cancelled scrimmage ${scrimmageId} and sent notifications to ${targetUserIds.length} players`);
        } catch (announcementError) {
          console.error('Error sending cancellation notifications:', announcementError);
          // Don't fail the deletion if announcement fails
        }
      }
      
      res.json({ message: 'Scrimmage cancelled successfully' });
    } catch (error) {
      console.error('Error deleting scrimmage:', error);
      res.status(500).json({ message: 'Failed to cancel scrimmage' });
    }
  });

  // Player Stats Routes
  
  // Get player stats for a league (with optional season filter)
  app.get('/api/leagues/:leagueId/stats', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const seasonId = Array.isArray(req.query.seasonId) ? req.query.seasonId[0] : req.query.seasonId;
      const playerType = Array.isArray(req.query.playerType) ? req.query.playerType[0] : req.query.playerType;
      const userId = req.user.claims.sub;
      
      // Verify user is a member of this league
      const userMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!userMembership || userMembership.status !== 'approved') {
        return res.status(403).json({ message: "Access denied - not an approved league member" });
      }
      
      // Validate season ownership if seasonId is provided
      if (seasonId) {
        const season = await storage.getSeason(seasonId);
        if (!season || season.leagueId !== leagueId) {
          return res.status(400).json({ message: "Season not found or does not belong to this league" });
        }
      }
      
      if (playerType === 'goalies') {
        // Get goalie statistics with discriminated union type
        const goalieStats = await storage.getGoalieStats(leagueId, seasonId);
        const response = goalieStats.map(stat => ({
          type: 'goalie' as const,
          userId: stat.userId,
          teamId: stat.teamId,
          gamesPlayed: stat.gamesPlayed,
          wins: stat.wins,
          losses: stat.losses,
          ties: stat.ties,
          shootoutLosses: stat.shootoutLosses,
          goalsAgainst: stat.goalsAgainst,
          goalsAgainstAverage: stat.goalsAgainstAverage,
          user: stat.user
        }));
        res.json(response);
      } else {
        // Get regular player statistics with discriminated union type
        const playerStats = await storage.getPlayerStats(leagueId, seasonId, playerType as 'non-goalies' | undefined);
        const response = playerStats.map(stat => ({
          type: 'skater' as const,
          id: stat.id,
          leagueId: stat.leagueId,
          seasonId: stat.seasonId,
          userId: stat.userId,
          gamesPlayed: stat.gamesPlayed,
          goals: stat.goals,
          assists: stat.assists,
          penaltyMinutes: stat.penaltyMinutes,
          points: stat.goals + stat.assists,
          isGoalie: stat.isGoalie,
          user: stat.user
        }));
        res.json(response);
      }
    } catch (error) {
      console.error('Error fetching player stats:', error);
      res.status(500).json({ message: 'Failed to fetch player stats' });
    }
  });
  
  // Get individual player's stats
  app.get('/api/leagues/:leagueId/stats/players/:playerId', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId, playerId } = req.params;
      const seasonId = Array.isArray(req.query.seasonId) ? req.query.seasonId[0] : req.query.seasonId;
      const userId = req.user.claims.sub;
      
      // Verify user is a member of this league
      const userMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!userMembership || userMembership.status !== 'approved') {
        return res.status(403).json({ message: "Access denied - not an approved league member" });
      }
      
      // Validate season ownership if seasonId is provided
      if (seasonId) {
        const season = await storage.getSeason(seasonId);
        if (!season || season.leagueId !== leagueId) {
          return res.status(400).json({ message: "Season not found or does not belong to this league" });
        }
      }
      
      const stats = await storage.getPlayerStatsByUser(playerId, leagueId, seasonId);
      if (!stats) {
        return res.status(404).json({ message: "Player stats not found" });
      }
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching individual player stats:', error);
      res.status(500).json({ message: 'Failed to fetch player stats' });
    }
  });
  
  // Create or update player stats (Commissioner only)
  app.post('/api/leagues/:leagueId/stats/players/:playerId', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId, playerId } = req.params;
      const seasonId = Array.isArray(req.query.seasonId) ? req.query.seasonId[0] : req.query.seasonId;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Verify user is commissioner of this league
      if (!league || !user || (league.commissionerId !== userId && !(user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin')))) {
        return res.status(403).json({ message: "Access denied - commissioner access required" });
      }
      
      // Validate season ownership if seasonId is provided
      if (seasonId) {
        const season = await storage.getSeason(seasonId);
        if (!season || season.leagueId !== leagueId) {
          return res.status(400).json({ message: "Season not found or does not belong to this league" });
        }
      }
      
      // Validate target player is in league
      const playerMembership = await storage.getUserLeagueMembership(playerId, leagueId);
      if (!playerMembership || playerMembership.status !== 'approved') {
        return res.status(404).json({ message: "Player not found in this league" });
      }
      
      // Validate request body - only allow stat fields with proper coercion
      const validatedData = insertPlayerStatsSchema.pick({
        gamesPlayed: true,
        goals: true,
        assists: true,
        penaltyMinutes: true,
      }).parse(req.body);
      
      const updatedStats = await storage.updatePlayerStats(
        playerId, 
        leagueId, 
        validatedData,
        seasonId
      );
      
      res.json(updatedStats);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error('Error updating player stats:', error);
      res.status(500).json({ message: 'Failed to update player stats' });
    }
  });
  
  // Bulk update player stats (Commissioner only) - useful for "by game" updates
  app.post('/api/leagues/:leagueId/stats/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Verify user is commissioner of this league
      if (!league || !user || (league.commissionerId !== userId && !(user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin')))) {
        return res.status(403).json({ message: "Access denied - commissioner access required" });
      }
      
      // Validate request body structure with proper coercion
      const bulkUpdateSchema = z.object({
        updates: z.array(z.object({
          userId: z.string(),
          stats: insertPlayerStatsSchema.pick({
            gamesPlayed: true,
            goals: true,
            assists: true,
            penaltyMinutes: true,
          }).partial()
        })),
        mode: z.enum(['increment', 'set']).optional().default('set'),
        seasonId: z.string().min(1, "Season ID is required for all stats updates")
      });
      
      const validatedData = bulkUpdateSchema.parse(req.body);
      const seasonId = validatedData.seasonId;
      
      // Validate season ownership if seasonId is provided
      if (seasonId) {
        const season = await storage.getSeason(seasonId);
        if (!season || season.leagueId !== leagueId) {
          return res.status(400).json({ message: "Season not found or does not belong to this league" });
        }
      }
      
      // Verify all target players are in the league
      for (const update of validatedData.updates) {
        const playerMembership = await storage.getUserLeagueMembership(update.userId, leagueId);
        if (!playerMembership || playerMembership.status !== 'approved') {
          return res.status(400).json({ 
            message: `Player ${update.userId} not found in this league` 
          });
        }
      }
      
      // Transform to storage format
      const statsUpdates = validatedData.updates.map(update => ({
        userId: update.userId,
        updates: update.stats
      }));
      
      await storage.bulkUpdatePlayerStats(leagueId, statsUpdates, validatedData.mode, seasonId);
      
      res.json({ message: 'Player stats updated successfully', updatedCount: statsUpdates.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error('Error bulk updating player stats:', error);
      res.status(500).json({ message: 'Failed to update player stats' });
    }
  });

  // Messaging API routes
  
  // Get league members for contact discovery (messaging)
  app.get('/api/leagues/:id/contacts', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      
      // Check if user is a member of this league
      const userMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!userMembership || userMembership.status !== 'approved') {
        return res.status(403).json({ message: "Access denied - not a league member" });
      }
      
      // Check if user has Player Plus subscription for messaging
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get all league members except the current user
      const allMembers = await storage.getLeagueMembers(leagueId);
      const contacts = allMembers
        .filter(member => member.userId !== userId)
        .map(member => ({
          id: member.user.id,
          firstName: member.user.firstName,
          lastName: member.user.lastName,
          email: member.user.email,
          profileImageUrl: member.user.profileImageUrl,
          displayFirstName: member.displayFirstName,
          displayLastName: member.displayLastName,
          position: member.position,
          jerseyNumber: member.jerseyNumber,
          skillLevel: member.skillLevel
        }));
      
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching league contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  // Get user's conversations
  app.get('/api/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId } = req.query;
      
      const conversations = await messagingService.getUserConversations(userId, leagueId);
      
      // Get participants for each conversation so frontend can display names
      const conversationsWithParticipants = await Promise.all(
        conversations.map(async (conversation) => {
          const participants = await messagingService.getConversationParticipants(conversation.id);
          return {
            ...conversation,
            participants
          };
        })
      );
      
      res.json(conversationsWithParticipants);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ message: 'Failed to fetch conversations' });
    }
  });

  // Get conversation details with participants
  app.get('/api/conversations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Verify user is participant
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const conversation = await messagingService.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      const participants = await messagingService.getConversationParticipants(id);
      
      res.json({
        ...conversation,
        participants
      });
    } catch (error) {
      console.error('Error fetching conversation details:', error);
      res.status(500).json({ message: 'Failed to fetch conversation details' });
    }
  });

  // Create a new direct conversation
  app.post('/api/conversations/direct', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestSchema = z.object({
        otherUserId: z.string().min(1),
        leagueId: z.string().min(1)
      });
      
      const { otherUserId, leagueId } = requestSchema.parse(req.body);
      
      // Check if conversation already exists
      const existingConversation = await messagingService.findDirectConversation(userId, otherUserId, leagueId);
      if (existingConversation) {
        const participants = await messagingService.getConversationParticipants(existingConversation.id);
        return res.json({
          ...existingConversation,
          participants
        });
      }
      
      // Create new conversation
      const conversation = await messagingService.createDirectConversation(userId, otherUserId, leagueId);
      const participants = await messagingService.getConversationParticipants(conversation.id);
      
      res.status(201).json({
        ...conversation,
        participants
      });
    } catch (error) {
      console.error('Error creating direct conversation:', error);
      res.status(500).json({ message: 'Failed to create conversation' });
    }
  });

  // Create a team group conversation
  app.post('/api/conversations/team-group', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestSchema = z.object({
        teamId: z.string().min(1),
        leagueId: z.string().min(1)
      });
      
      const { teamId, leagueId } = requestSchema.parse(req.body);
      
      // Check if team group conversation already exists
      const conversation = await messagingService.createTeamGroupChat(teamId, leagueId, userId);
      const participants = await messagingService.getConversationParticipants(conversation.id);
      
      res.status(201).json({
        ...conversation,
        participants
      });
    } catch (error) {
      console.error('Error creating team group conversation:', error);
      res.status(500).json({ message: 'Failed to create team group conversation' });
    }
  });

  // Create a custom group conversation
  app.post('/api/conversations/custom-group', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestSchema = z.object({
        title: z.string().min(1).max(100),
        leagueId: z.string().min(1),
        participantIds: z.array(z.string().min(1)).min(1).max(20)
      });
      
      const { title, leagueId, participantIds } = requestSchema.parse(req.body);
      
      // Create custom group conversation
      const conversation = await messagingService.createCustomGroupChat(title, leagueId, userId, participantIds);
      const participants = await messagingService.getConversationParticipants(conversation.id);
      
      res.status(201).json({
        ...conversation,
        participants
      });
    } catch (error) {
      console.error('Error creating custom group conversation:', error);
      res.status(500).json({ message: 'Failed to create custom group conversation' });
    }
  });

  // Add user to group conversation
  app.post('/api/conversations/:id/participants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      const requestSchema = z.object({
        userId: z.string().min(1)
      });
      
      const { userId: targetUserId } = requestSchema.parse(req.body);
      
      // Verify user has permission to add participants (participant in conversation)
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const participant = await messagingService.addUserToGroupConversation(id, targetUserId);
      res.status(201).json(participant);
    } catch (error) {
      console.error('Error adding user to conversation:', error);
      res.status(500).json({ message: 'Failed to add user to conversation' });
    }
  });

  // Remove user from group conversation
  app.delete('/api/conversations/:id/participants/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const { id, userId } = req.params;
      
      // Enhanced permission check - allow removal if user can manage conversation
      const conversation = await messagingService.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      const canManage = await messagingService.canUserManageConversation(currentUserId, id);
      if (currentUserId !== userId && !canManage) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      await messagingService.removeUserFromGroupConversation(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error('Error removing user from conversation:', error);
      res.status(500).json({ message: 'Failed to remove user from conversation' });
    }
  });

  // Create captain-only chat
  app.post('/api/conversations/captain-only', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestSchema = z.object({
        leagueId: z.string().min(1)
      });
      
      const { leagueId } = requestSchema.parse(req.body);
      
      // Verify user is a captain in this league
      const isCaptain = await messagingService.isUserCaptain(userId, leagueId);
      if (!isCaptain) {
        return res.status(403).json({ message: 'Only team captains can create captain-only chats' });
      }
      
      const conversation = await messagingService.createCaptainOnlyChat(leagueId, userId);
      const participants = await messagingService.getConversationParticipants(conversation.id);
      
      res.status(201).json({
        ...conversation,
        participants
      });
    } catch (error) {
      console.error('Error creating captain-only conversation:', error);
      res.status(500).json({ message: 'Failed to create captain-only conversation' });
    }
  });

  // Ensure captain chat membership is up-to-date for a league
  app.post('/api/leagues/:id/captain-chat/sync', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id: leagueId } = req.params;
      
      // Verify user is a captain in this league
      const isCaptain = await messagingService.isUserCaptain(userId, leagueId);
      if (!isCaptain) {
        return res.status(403).json({ message: 'Only team captains can manage captain chats' });
      }
      
      // Sync captain chat membership
      await messagingService.ensureCaptainChatMembership(leagueId);
      
      res.status(200).json({ message: 'Captain chat membership synced successfully' });
    } catch (error) {
      console.error('Error syncing captain chat membership:', error);
      res.status(500).json({ message: 'Failed to sync captain chat membership' });
    }
  });

  // Leave conversation (SMS-style for direct/captain, group removal for others)
  app.post('/api/conversations/:id/leave', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Check if conversation exists
      const conversation = await messagingService.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Check if user is actually in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(400).json({ message: 'You are not a participant in this conversation' });
      }
      
      // Handle different conversation types
      if (conversation.type === 'direct' || conversation.type === 'captain_only') {
        // SMS-style leave: hide conversation and clear history from user's view only
        await messagingService.leaveConversationSMSStyle(id, userId);
        res.status(200).json({ message: 'Successfully left conversation' });
      } else {
        // Group conversations: remove user from participants entirely  
        await messagingService.removeUserFromGroupConversation(id, userId);
        res.status(200).json({ message: 'Successfully left conversation' });
      }
    } catch (error) {
      console.error('Error leaving conversation:', error);
      res.status(500).json({ message: 'Failed to leave conversation' });
    }
  });

  // Delete conversation
  app.delete('/api/conversations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Check if conversation exists
      const conversation = await messagingService.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Captain-only chats cannot be deleted
      if (conversation.type === 'captain_only') {
        return res.status(403).json({ message: 'Captain-only chats cannot be deleted' });
      }
      
      // Check permissions
      const canManage = await messagingService.canUserManageConversation(userId, id);
      if (!canManage) {
        return res.status(403).json({ message: 'Only conversation creators and team captains can delete conversations' });
      }
      
      await messagingService.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting conversation:', error);
      res.status(500).json({ message: 'Failed to delete conversation' });
    }
  });

  // Get conversation members with status
  app.get('/api/conversations/:id/members', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Verify user is participant
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const members = await messagingService.getConversationMembersWithStatus(id);
      const memberCount = await messagingService.getConversationMemberCount(id);
      
      res.json({
        members,
        count: memberCount
      });
    } catch (error) {
      console.error('Error fetching conversation members:', error);
      res.status(500).json({ message: 'Failed to fetch conversation members' });
    }
  });

  // Get conversation messages
  app.get('/api/conversations/:id/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      const querySchema = z.object({
        limit: z.coerce.number().min(1).max(100).default(50),
        before: z.string().optional()
      });
      
      const { limit, before } = querySchema.parse(req.query);
      
      // Verify user is participant
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const messages = await messagingService.getConversationMessagesForUser(id, userId, limit);
      
      // Get attachments and read receipts for each message
      const messagesWithDetails = await Promise.all(
        messages.map(async (message) => {
          const attachments = await messagingService.getMessageAttachments(message.id);
          const readReceipts = await messagingService.getMessageReadReceipts(message.id);
          return {
            ...message,
            sentAt: message.createdAt, // Map createdAt to sentAt for frontend compatibility
            attachments,
            readReceipts
          };
        })
      );
      
      res.json(messagesWithDetails);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ message: 'Failed to fetch messages' });
    }
  });

  // Send a new message
  app.post('/api/conversations/:id/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id: conversationId } = req.params;
      const requestSchema = z.object({
        content: z.string().min(1).max(10000),
        messageType: z.enum(['text', 'image', 'gif', 'file', 'poll']).default('text'),
        replyToId: z.string().optional(),
        attachments: z.array(z.object({
          fileName: z.string(),
          fileUrl: z.string().url(),
          fileType: z.string(),
          fileSize: z.number().min(0)
        })).optional()
      });
      
      const { content, messageType, replyToId, attachments } = requestSchema.parse(req.body);
      
      // Verify user is participant
      const isParticipant = await messagingService.isUserInConversation(userId, conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      // Create message
      const message = await messagingService.createMessage({
        conversationId,
        senderId: userId,
        content,
        messageType,
        replyToId
      });
      
      // Add attachments if any
      let messageAttachments = [];
      if (attachments && attachments.length > 0) {
        const { ObjectStorageService } = await import('./objectStorage');
        const objectStorageService = new ObjectStorageService();
        
        for (const attachment of attachments) {
          // Validate file size (10MB limit)
          if (attachment.fileSize > 10 * 1024 * 1024) {
            return res.status(400).json({ message: 'File size exceeds 10MB limit' });
          }
          
          // Normalize the file URL to use app route
          const normalizedUrl = objectStorageService.normalizeMessageAttachmentPath(attachment.fileUrl);
          
          // Determine attachment type from MIME type
          let attachmentType = 'file';
          if (attachment.fileType.startsWith('image/')) {
            attachmentType = attachment.fileType === 'image/gif' ? 'gif' : 'image';
          }
          
          const messageAttachment = await messagingService.createMessageAttachment({
            messageId: message.id,
            type: attachmentType,
            url: normalizedUrl,
            filename: attachment.fileName,
            fileSize: attachment.fileSize,
            mimeType: attachment.fileType
          });
          messageAttachments.push(messageAttachment);
        }
      }
      
      // Broadcast message to all participants via WebSocket
      const participants = await messagingService.getConversationParticipants(conversationId);
      broadcastToParticipants(participants, {
        type: 'message',
        conversationId,
        message: {
          ...message,
          sentAt: message.createdAt, // Map for frontend compatibility
          attachments: messageAttachments,
          readReceipts: []
        }
      });

      res.status(201).json({
        ...message,
        sentAt: message.createdAt, // Map for frontend compatibility
        attachments: messageAttachments,
        readReceipts: []
      });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ message: 'Failed to send message' });
    }
  });

  // Mark message as read
  app.post('/api/messages/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id: messageId } = req.params;
      
      // Get message to verify access
      const message = await messagingService.getMessage(messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }
      
      // Verify user is participant in conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const readReceipt = await messagingService.markMessageAsRead(messageId, userId);
      res.json(readReceipt);
    } catch (error) {
      console.error('Error marking message as read:', error);
      res.status(500).json({ message: 'Failed to mark message as read' });
    }
  });

  // Get user's online status
  app.get('/api/users/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { id: targetUserId } = req.params;
      
      const status = await messagingService.getUserOnlineStatus(targetUserId);
      res.json(status || { userId: targetUserId, status: 'offline', lastSeenAt: null });
    } catch (error) {
      console.error('Error fetching user status:', error);
      res.status(500).json({ message: 'Failed to fetch user status' });
    }
  });

  // Get conversation typing indicators
  app.get('/api/conversations/:id/typing', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Verify user is participant
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const typingIndicators = await messagingService.getTypingIndicators(id);
      // Filter out expired indicators (older than 5 seconds)
      const now = new Date();
      const activeIndicators = typingIndicators.filter(indicator => 
        indicator.expiresAt && indicator.expiresAt > now
      );
      
      res.json(activeIndicators);
    } catch (error) {
      console.error('Error fetching typing indicators:', error);
      res.status(500).json({ message: 'Failed to fetch typing indicators' });
    }
  });

  // Get unread message count for current user
  app.get('/api/messages/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const unreadCount = await messagingService.getUnreadMessageCount(userId);
      res.json({ count: unreadCount });
    } catch (error) {
      console.error('Error fetching unread message count:', error);
      res.status(500).json({ message: 'Failed to fetch unread message count' });
    }
  });

  // Get unread message count per conversation for current user
  app.get('/api/messages/unread-count-per-conversation', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const unreadCounts = await messagingService.getUnreadMessageCountPerConversation(userId);
      res.json({ unreadCounts });
    } catch (error) {
      console.error('Error fetching unread message count per conversation:', error);
      res.status(500).json({ message: 'Failed to fetch unread message count per conversation' });
    }
  });

  // Mark all messages in a conversation as read
  app.post('/api/conversations/:id/mark-all-read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = req.params.id;
      
      await messagingService.markAllMessagesInConversationAsRead(userId, conversationId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking all messages as read:', error);
      if (error instanceof Error && error.message === 'User is not a participant in this conversation') {
        return res.status(403).json({ message: 'Access denied' });
      }
      res.status(500).json({ message: 'Failed to mark messages as read' });
    }
  });

  // ===== CHAT POLL ROUTES =====

  // Create a poll on a message
  app.post('/api/messages/:id/polls', isAuthenticated, async (req: any, res) => {
    try {
      const messageId = req.params.id;
      const userId = req.user.claims.sub;

      // Get message to check if user can create polls on it
      const message = await messagingService.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Check if user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Only the message sender can add polls to their message
      if (message.senderId !== userId) {
        return res.status(403).json({ message: 'Only message sender can add polls' });
      }

      const pollData = createChatPollRequestSchema.parse(req.body);
      const poll = await messagingService.createChatPoll({
        ...pollData,
        messageId,
      });

      // Broadcast poll creation to all conversation participants via WebSocket
      const participants = await messagingService.getConversationParticipants(message.conversationId);
      broadcastToParticipants(participants, {
        type: 'poll_created',
        conversationId: message.conversationId,
        messageId,
        poll,
        createdBy: userId
      });

      res.json(poll);
    } catch (error) {
      console.error('Error creating chat poll:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid poll data', details: error.errors });
      }
      res.status(500).json({ message: 'Failed to create poll' });
    }
  });

  // Vote on a chat poll
  app.post('/api/chat-polls/:id/votes', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = req.params.id;
      const userId = req.user.claims.sub;
      const { optionIndex } = req.body;

      if (optionIndex === undefined || optionIndex < 0) {
        return res.status(400).json({ message: 'Valid option index is required' });
      }

      // Get the poll to find the message it belongs to
      const poll = await messagingService.getChatPoll(pollId);
      if (!poll) {
        return res.status(404).json({ message: 'Poll not found' });
      }

      // Check if poll is still active
      if (poll.status === 'closed') {
        return res.status(400).json({ message: 'Poll is closed' });
      }

      // Chat polls don't have expiration - this check is only for announcement polls

      // Get message to check conversation access
      const message = await messagingService.getMessageById(poll.messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Check if user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Check if user has already voted
      const existingVote = await messagingService.getUserVoteOnPoll(pollId, userId);
      if (existingVote) {
        return res.status(400).json({ message: 'You have already voted on this poll' });
      }

      // Validate option index
      const options = poll.options as any[];
      if (optionIndex >= options.length) {
        return res.status(400).json({ message: 'Invalid option index' });
      }

      const vote = await messagingService.voteOnChatPoll({
        pollId,
        userId,
        optionIndex,
      });

      // Broadcast vote update to all conversation participants via WebSocket
      const participants = await messagingService.getConversationParticipants(message.conversationId);
      broadcastToParticipants(participants, {
        type: 'poll_vote',
        conversationId: message.conversationId,
        pollId,
        vote,
        votedBy: userId
      });

      res.json(vote);
    } catch (error) {
      console.error('Error voting on chat poll:', error);
      res.status(500).json({ message: 'Failed to vote on poll' });
    }
  });

  // Get poll results
  app.get('/api/chat-polls/:id/results', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = req.params.id;
      const userId = req.user.claims.sub;

      // Get the poll to find the message it belongs to
      const poll = await messagingService.getChatPoll(pollId);
      if (!poll) {
        return res.status(404).json({ message: 'Poll not found' });
      }

      // Get message to check conversation access
      const message = await messagingService.getMessageById(poll.messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Check if user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const results = await messagingService.getChatPollResults(pollId);
      res.json(results);
    } catch (error) {
      console.error('Error fetching poll results:', error);
      res.status(500).json({ message: 'Failed to fetch poll results' });
    }
  });

  // Close a chat poll
  app.post('/api/chat-polls/:id/close', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = req.params.id;
      const userId = req.user.claims.sub;

      // Get the poll to find the message it belongs to
      const poll = await messagingService.getChatPoll(pollId);
      if (!poll) {
        return res.status(404).json({ message: 'Poll not found' });
      }

      // Get message to check permissions
      const message = await messagingService.getMessageById(poll.messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Check if user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Only poll creator (message sender) can close the poll
      if (message.senderId !== userId) {
        return res.status(403).json({ message: 'Only poll creator can close the poll' });
      }

      const closedPoll = await messagingService.closeChatPoll(pollId);

      // Broadcast poll closure to all conversation participants via WebSocket
      const participants = await messagingService.getConversationParticipants(message.conversationId);
      broadcastToParticipants(participants, {
        type: 'poll_closed',
        conversationId: message.conversationId,
        pollId,
        poll: closedPoll,
        closedBy: userId
      });

      res.json(closedPoll);
    } catch (error) {
      console.error('Error closing chat poll:', error);
      res.status(500).json({ message: 'Failed to close poll' });
    }
  });

  // Get polls for a message
  app.get('/api/messages/:id/polls', isAuthenticated, async (req: any, res) => {
    try {
      const messageId = req.params.id;
      const userId = req.user.claims.sub;

      // Get message to check conversation access
      const message = await messagingService.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Check if user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const polls = await messagingService.getChatPollsByMessage(messageId);
      res.json(polls);
    } catch (error) {
      console.error('Error fetching message polls:', error);
      res.status(500).json({ message: 'Failed to fetch polls' });
    }
  });

  // ===== GIPHY API ROUTES =====
  
  // Import Giphy service
  const { giphyService } = await import('./giphyService');

  // Search GIFs
  app.get('/api/giphy/search', isAuthenticated, async (req: any, res) => {
    try {
      const { q: query, limit = 25, offset = 0 } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: 'Search query is required' });
      }

      const result = await giphyService.searchGifs(query, {
        limit: parseInt(limit as string) || 25,
        offset: parseInt(offset as string) || 0
      });

      res.json(result);
    } catch (error) {
      console.error('Error searching GIFs:', error);
      res.status(500).json({ message: 'Failed to search GIFs' });
    }
  });

  // Get trending GIFs
  app.get('/api/giphy/trending', isAuthenticated, async (req: any, res) => {
    try {
      const { limit = 25, offset = 0 } = req.query;

      const result = await giphyService.getTrendingGifs({
        limit: parseInt(limit as string) || 25,
        offset: parseInt(offset as string) || 0
      });

      res.json(result);
    } catch (error) {
      console.error('Error getting trending GIFs:', error);
      res.status(500).json({ message: 'Failed to get trending GIFs' });
    }
  });

  // Get category GIFs
  app.get('/api/giphy/category/:category', isAuthenticated, async (req: any, res) => {
    try {
      const { category } = req.params;
      const { limit = 25, offset = 0 } = req.query;

      const result = await giphyService.getCategoryGifs(category, {
        limit: parseInt(limit as string) || 25,
        offset: parseInt(offset as string) || 0
      });

      res.json(result);
    } catch (error) {
      console.error('Error getting category GIFs:', error);
      res.status(500).json({ message: 'Failed to get category GIFs' });
    }
  });

  // Get GIF by ID
  app.get('/api/giphy/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const gif = await giphyService.getGifById(id);
      if (!gif) {
        return res.status(404).json({ message: 'GIF not found' });
      }

      res.json(gif);
    } catch (error) {
      console.error('Error getting GIF by ID:', error);
      res.status(500).json({ message: 'Failed to get GIF' });
    }
  });

  // User Management API Routes - Admin Only
  
  // Get all users (for admin user management)
  app.get('/api/admin/users', isAuthenticated, loadUserPermissions, requireUserManagement, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error('Error fetching all users:', error);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  });
  
  // Update user role and permissions
  app.patch('/api/admin/users/:userId/permissions', isAuthenticated, loadUserPermissions, requireUserManagement, async (req: any, res) => {
    try {
      const targetUserId = req.params.userId;
      const updatedById = req.user.claims.sub;
      const { role, specialPermissions, isPrimaryCommissioner } = req.body;
      
      // Validate input
      if (!role) {
        return res.status(400).json({ message: 'Role is required' });
      }
      
      const permissionData: any = { role };
      if (specialPermissions !== undefined) permissionData.specialPermissions = specialPermissions;
      if (isPrimaryCommissioner !== undefined) permissionData.isPrimaryCommissioner = isPrimaryCommissioner;
      
      const updatedUser = await storage.updateUserPermissions(targetUserId, permissionData);
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user permissions:', error);
      res.status(500).json({ message: 'Failed to update user permissions' });
    }
  });
  
  // Get users by league (for league-specific user management)
  app.get('/api/leagues/:leagueId/users', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;
      const userPermissions = (req as any).userWithPermissions;
      
      // Check if user can manage this league (commissioner of this league, or admin/primary commissioner)
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }
      
      const canManageLeague = league.commissionerId === userId || 
                             userPermissions.specialPermissions?.includes('admin') ||
                             userPermissions.isPrimaryCommissioner;
                             
      if (!canManageLeague) {
        return res.status(403).json({ message: 'Access denied - insufficient permissions' });
      }
      
      const leagueUsers = await storage.getLeagueUsersWithPermissions(leagueId);
      res.json(leagueUsers);
    } catch (error) {
      console.error('Error fetching league users:', error);
      res.status(500).json({ message: 'Failed to fetch league users' });
    }
  });

  // Update league-specific user permissions
  app.patch('/api/leagues/:leagueId/users/:userId/permissions', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const targetUserId = req.params.userId;
      const updatingUserId = req.user.claims.sub;
      const { leagueRole, leagueSpecialPermissions } = req.body;
      
      // Check if user can manage this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }
      
      const userPermissions = (req as any).userWithPermissions;
      const canManageLeague = league.commissionerId === updatingUserId || 
                             userPermissions.specialPermissions?.includes('admin') ||
                             userPermissions.isPrimaryCommissioner;
                             
      if (!canManageLeague) {
        return res.status(403).json({ message: 'Access denied - insufficient permissions' });
      }
      
      const updates: any = {};
      if (leagueRole !== undefined) updates.leagueRole = leagueRole;
      if (leagueSpecialPermissions !== undefined) updates.leagueSpecialPermissions = leagueSpecialPermissions;
      
      const updatedMembership = await storage.updateLeagueUserPermissions(targetUserId, leagueId, updates);
      res.json(updatedMembership);
    } catch (error) {
      console.error('Error updating league user permissions:', error);
      res.status(500).json({ message: 'Failed to update league user permissions' });
    }
  });

  // Add league special permission
  app.post('/api/leagues/:leagueId/users/:userId/special-permissions/:permission', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const targetUserId = req.params.userId;
      const permission = req.params.permission as 'admin' | 'stat_manager';
      const updatingUserId = req.user.claims.sub;
      
      // Validate permission type
      if (!['admin', 'stat_manager'].includes(permission)) {
        return res.status(400).json({ message: 'Invalid permission type' });
      }
      
      // Check if user can manage this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }
      
      const userPermissions = (req as any).userWithPermissions;
      const canManageLeague = league.commissionerId === updatingUserId || 
                             userPermissions.specialPermissions?.includes('admin') ||
                             userPermissions.isPrimaryCommissioner;
                             
      if (!canManageLeague) {
        return res.status(403).json({ message: 'Access denied - insufficient permissions' });
      }
      
      const updatedMembership = await storage.addLeagueSpecialPermission(targetUserId, leagueId, permission);
      res.json(updatedMembership);
    } catch (error) {
      console.error('Error adding league special permission:', error);
      res.status(500).json({ message: 'Failed to add league special permission' });
    }
  });

  // Remove league special permission
  app.delete('/api/leagues/:leagueId/users/:userId/special-permissions/:permission', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const targetUserId = req.params.userId;
      const permission = req.params.permission as 'admin' | 'stat_manager';
      const updatingUserId = req.user.claims.sub;
      
      // Validate permission type
      if (!['admin', 'stat_manager'].includes(permission)) {
        return res.status(400).json({ message: 'Invalid permission type' });
      }
      
      // Check if user can manage this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }
      
      const userPermissions = (req as any).userWithPermissions;
      const canManageLeague = league.commissionerId === updatingUserId || 
                             userPermissions.specialPermissions?.includes('admin') ||
                             userPermissions.isPrimaryCommissioner;
                             
      if (!canManageLeague) {
        return res.status(403).json({ message: 'Access denied - insufficient permissions' });
      }
      
      const updatedMembership = await storage.removeLeagueSpecialPermission(targetUserId, leagueId, permission);
      res.json(updatedMembership);
    } catch (error) {
      console.error('Error removing league special permission:', error);
      res.status(500).json({ message: 'Failed to remove league special permission' });
    }
  });

  // Get user's league-specific permissions
  app.get('/api/leagues/:leagueId/users/:userId/permissions', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const targetUserId = req.params.userId;
      const requestingUserId = req.user.claims.sub;
      
      // Users can only view their own permissions unless they have management rights
      if (targetUserId !== requestingUserId) {
        const league = await storage.getLeague(leagueId);
        if (!league) {
          return res.status(404).json({ message: 'League not found' });
        }
        
        const userPermissions = await storage.getUserLeaguePermissions(requestingUserId, leagueId);
        const canViewPermissions = league.commissionerId === requestingUserId || 
                                 userPermissions?.leagueSpecialPermissions?.includes('admin');
                                 
        if (!canViewPermissions) {
          return res.status(403).json({ message: 'Access denied - insufficient permissions' });
        }
      }
      
      const permissions = await storage.getUserLeaguePermissions(targetUserId, leagueId);
      if (!permissions) {
        return res.status(404).json({ message: 'User not found in league' });
      }
      
      res.json(permissions);
    } catch (error) {
      console.error('Error fetching user league permissions:', error);
      res.status(500).json({ message: 'Failed to fetch user league permissions' });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server for real-time messaging
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Store active connections by user ID
  const activeConnections = new Map<string, WebSocket>();

  wss.on('connection', async (ws: WebSocket, req) => {
    let userId: string | null = null;
    
    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'authenticate':
            // Authenticate user and store connection
            userId = data.userId;
            if (userId) {
              activeConnections.set(userId, ws);
              
              // Update user online status
              await messagingService.updateUserOnlineStatus(userId, true);
              
              // Broadcast to contacts that user is online
              broadcastOnlineStatus(userId, true);
              
              ws.send(JSON.stringify({ type: 'authenticated', userId }));
            }
            break;

          case 'join_conversation':
            if (!userId) return;
            
            // Verify user is participant in conversation
            const conversation = await messagingService.getConversation(data.conversationId);
            const isParticipant = await messagingService.isUserInConversation(userId, data.conversationId);
            
            if (conversation && isParticipant) {
              // Join conversation room (store conversation ID on connection)
              (ws as any).conversationId = data.conversationId;
              ws.send(JSON.stringify({ 
                type: 'joined_conversation', 
                conversationId: data.conversationId 
              }));
            }
            break;

          case 'send_message':
            if (!userId) return;
            
            const { conversationId, content, messageType = 'text', replyToId, attachments } = data;
            
            // Create message in database
            const message = await messagingService.createMessage({
              conversationId,
              senderId: userId,
              content,
              messageType,
              replyToId
            });

            // Add attachments if any
            if (attachments && attachments.length > 0) {
              for (const attachment of attachments) {
                await messagingService.createMessageAttachment({
                  messageId: message.id,
                  type: attachment.fileType,
                  url: attachment.fileUrl,
                  filename: attachment.fileName,
                  fileSize: attachment.fileSize
                });
              }
            }

            // Broadcast message to all participants
            const participants = await messagingService.getConversationParticipants(conversationId);
            broadcastToParticipants(participants, {
              type: 'new_message',
              message: {
                ...message,
                attachments: attachments || []
              }
            });
            break;

          case 'typing_start':
            if (!userId) return;
            
            await messagingService.setTypingIndicator(data.conversationId, userId, true);
            
            // Broadcast typing indicator to other participants
            const typingParticipants = await messagingService.getConversationParticipants(data.conversationId);
            broadcastToParticipants(
              typingParticipants.filter(p => p.userId !== userId),
              {
                type: 'typing_indicator',
                conversationId: data.conversationId,
                userId,
                isTyping: true
              }
            );
            break;

          case 'typing_stop':
            if (!userId) return;
            
            await messagingService.setTypingIndicator(data.conversationId, userId, false);
            
            // Broadcast typing stopped to other participants
            const stoppedTypingParticipants = await messagingService.getConversationParticipants(data.conversationId);
            broadcastToParticipants(
              stoppedTypingParticipants.filter(p => p.userId !== userId),
              {
                type: 'typing_indicator',
                conversationId: data.conversationId,
                userId,
                isTyping: false
              }
            );
            break;

          case 'mark_read':
            if (!userId) return;
            
            // Create read receipt
            await messagingService.markMessageAsRead(data.messageId, userId);
            
            // Broadcast read receipt to message sender
            const readMessage = await messagingService.getMessage(data.messageId);
            if (readMessage) {
              const senderConnection = activeConnections.get(readMessage.senderId);
              if (senderConnection && senderConnection.readyState === WebSocket.OPEN) {
                senderConnection.send(JSON.stringify({
                  type: 'message_read',
                  messageId: data.messageId,
                  readBy: userId,
                  readAt: new Date().toISOString()
                }));
              }
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Failed to process message' 
        }));
      }
    });

    ws.on('close', async () => {
      if (userId) {
        // Remove connection
        activeConnections.delete(userId);
        
        // Update user offline status
        await messagingService.updateUserOnlineStatus(userId, false);
        
        // Clear any typing indicators
        await messagingService.clearUserTypingIndicators(userId);
        
        // Broadcast to contacts that user is offline
        broadcastOnlineStatus(userId, false);
      }
    });
  });

  // Helper function to broadcast online status to user contacts
  function broadcastOnlineStatus(userId: string, isOnline: boolean) {
    // This would need to get user's contacts and broadcast to them
    // For now, we'll implement a simple version
    const statusMessage = {
      type: 'user_status',
      userId,
      isOnline,
      lastSeen: new Date().toISOString()
    };

    for (const [contactId, connection] of Array.from(activeConnections)) {
      if (contactId !== userId && connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify(statusMessage));
      }
    }
  }

  // Helper function to broadcast to conversation participants
  function broadcastToParticipants(participants: Array<{userId: string}>, message: any) {
    participants.forEach(participant => {
      const connection = activeConnections.get(participant.userId);
      if (connection && connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify(message));
      }
    });
  }

  // Feedback submission route
  app.post('/api/feedback', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Validate request body
      const validatedData = createFeedbackSubmissionSchema.parse(req.body);

      // Store feedback in database
      const feedback = await storage.createFeedbackSubmission({
        userId,
        category: validatedData.category,
        message: validatedData.message,
      });

      // Send email using Resend
      try {
        const { getUncachableResendClient } = await import('./resend');
        const { client, fromEmail } = await getUncachableResendClient();
        
        const categoryLabel = validatedData.category === 'product_improvement' 
          ? 'Product Improvement' 
          : 'Report an Issue';

        // Override from email to use verified domain
        const verifiedFromEmail = 'contact@notifications.roster-app.com';
        const recipientEmail = process.env.FEEDBACK_EMAIL || verifiedFromEmail;

        await client.emails.send({
          from: verifiedFromEmail,
          to: recipientEmail,
          subject: `Rosters Feedback: ${categoryLabel}`,
          html: `
            <h2>New Feedback Submission</h2>
            <p><strong>Category:</strong> ${categoryLabel}</p>
            <p><strong>From:</strong> ${user.firstName} ${user.lastName} (${user.email})</p>
            <p><strong>User ID:</strong> ${userId}</p>
            <p><strong>Submitted:</strong> ${new Date().toISOString()}</p>
            <hr />
            <h3>Message:</h3>
            <p>${validatedData.message.replace(/\n/g, '<br />')}</p>
          `,
        });
      } catch (emailError) {
        console.error("Error sending feedback email:", emailError);
        // Don't fail the request if email fails - feedback is still saved
      }

      res.json({ 
        success: true, 
        message: "Feedback submitted successfully",
        id: feedback.id 
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid feedback data", 
          errors: error.errors 
        });
      }
      console.error("Error submitting feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  // Payment request routes
  // Create a new payment request
  app.post('/api/payment-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body using Zod schema
      const validatedData = createPaymentRequestSchema.parse(req.body);

      const paymentRequest = await storage.createPaymentRequest({
        creatorId: userId,
        title: validatedData.title,
        description: validatedData.description,
        amountPerPerson: validatedData.amountPerPerson,
        deadline: validatedData.deadline || null,
        relatedScrimmageId: validatedData.relatedScrimmageId || null,
        relatedConversationId: validatedData.relatedConversationId || null,
      }, validatedData.recipientUserIds);

      res.json(paymentRequest);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid payment request data", 
          errors: error.errors 
        });
      }
      console.error("Error creating payment request:", error);
      res.status(500).json({ message: "Failed to create payment request" });
    }
  });

  // Get payment requests created by the current user
  app.get('/api/payment-requests/created/by-me', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const paymentRequests = await storage.getPaymentRequestsByCreator(userId);
      res.json(paymentRequests);
    } catch (error) {
      console.error("Error fetching created payment requests:", error);
      res.status(500).json({ message: "Failed to fetch payment requests" });
    }
  });

  // Get payment requests where the current user is a recipient
  app.get('/api/payment-requests/received/by-me', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const paymentRequests = await storage.getPaymentRequestsByRecipient(userId);
      res.json(paymentRequests);
    } catch (error) {
      console.error("Error fetching received payment requests:", error);
      res.status(500).json({ message: "Failed to fetch payment requests" });
    }
  });

  // Get count of unpaid payment requests for current user
  app.get('/api/payment-requests/unpaid-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const count = await storage.getUnpaidPaymentRequestCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unpaid payment request count:", error);
      res.status(500).json({ message: "Failed to fetch unpaid count" });
    }
  });

  // Get a specific payment request with all details
  app.get('/api/payment-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const paymentRequest = await storage.getPaymentRequest(id);

      if (!paymentRequest) {
        return res.status(404).json({ message: "Payment request not found" });
      }

      // Check if user is creator or recipient
      const isCreator = paymentRequest.creatorId === userId;
      const isRecipient = paymentRequest.recipients.some(r => r.userId === userId);

      if (!isCreator && !isRecipient) {
        return res.status(403).json({ message: "You do not have access to this payment request" });
      }

      res.json(paymentRequest);
    } catch (error) {
      console.error("Error fetching payment request:", error);
      res.status(500).json({ message: "Failed to fetch payment request" });
    }
  });

  // Get payment requests for a specific scrimmage
  app.get('/api/scrimmages/:scrimmageId/payment-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { scrimmageId } = req.params;

      // Verify user has access to this scrimmage
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: "Scrimmage not found" });
      }

      // Check if user is the creator or a participant in the scrimmage
      const isCreator = scrimmage.creatorId === userId;
      const userRequest = await db.query.scrimmageRequests.findFirst({
        where: (requests, { eq, and }) => and(
          eq(requests.scrimmageId, scrimmageId),
          eq(requests.playerId, userId)
        ),
      });
      const isParticipant = !!userRequest;

      if (!isCreator && !isParticipant) {
        return res.status(403).json({ message: "You do not have access to this scrimmage" });
      }

      const paymentRequests = await storage.getPaymentRequestsByScrimmage(scrimmageId);
      res.json(paymentRequests);
    } catch (error) {
      console.error("Error fetching scrimmage payment requests:", error);
      res.status(500).json({ message: "Failed to fetch payment requests" });
    }
  });

  // Get payment requests for a specific conversation
  app.get('/api/conversations/:conversationId/payment-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId } = req.params;

      // Verify user is a participant in this conversation
      const isParticipant = await messagingService.isUserInConversation(userId, conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: "You are not a participant in this conversation" });
      }

      const paymentRequests = await storage.getPaymentRequestsByConversation(conversationId);
      res.json(paymentRequests);
    } catch (error) {
      console.error("Error fetching conversation payment requests:", error);
      res.status(500).json({ message: "Failed to fetch payment requests" });
    }
  });

  // Update a payment request recipient (mark as paid/unpaid, set payment method)
  app.patch('/api/payment-request-recipients/:recipientId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { recipientId } = req.params;
      
      // Validate request body using Zod schema
      const validatedData = updatePaymentRequestRecipientSchema.parse(req.body);

      // Get the payment request to verify permissions
      const recipient = await db.query.paymentRequestRecipients.findFirst({
        where: (recipients, { eq }) => eq(recipients.id, recipientId),
        with: {
          paymentRequest: true,
        },
      });

      if (!recipient) {
        return res.status(404).json({ message: "Payment recipient not found" });
      }

      // Only the creator or the recipient themselves can update the payment status
      const isCreator = recipient.paymentRequest.creatorId === userId;
      const isRecipient = recipient.userId === userId;

      if (!isCreator && !isRecipient) {
        return res.status(403).json({ message: "You do not have permission to update this payment" });
      }

      const updatedRecipient = await storage.updatePaymentRequestRecipient(recipientId, {
        isPaid: validatedData.isPaid,
        paymentMethod: validatedData.paymentMethod,
      });

      res.json(updatedRecipient);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid payment recipient update data", 
          errors: error.errors 
        });
      }
      console.error("Error updating payment recipient:", error);
      res.status(500).json({ message: "Failed to update payment recipient" });
    }
  });

  // Confirm a payment request recipient (creator only)
  app.patch('/api/payment-request-recipients/:recipientId/confirm', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { recipientId } = req.params;
      const { isConfirmed } = req.body;

      // Get the payment request to verify permissions
      const recipient = await db.query.paymentRequestRecipients.findFirst({
        where: (recipients, { eq }) => eq(recipients.id, recipientId),
        with: {
          paymentRequest: true,
        },
      });

      if (!recipient) {
        return res.status(404).json({ message: "Payment recipient not found" });
      }

      // Only the creator can confirm payments
      const isCreator = recipient.paymentRequest.creatorId === userId;

      if (!isCreator) {
        return res.status(403).json({ message: "Only the payment request creator can confirm payments" });
      }

      const updatedRecipient = await storage.confirmPaymentRequestRecipient(recipientId, isConfirmed);

      res.json(updatedRecipient);
    } catch (error) {
      console.error("Error confirming payment recipient:", error);
      res.status(500).json({ message: "Failed to confirm payment" });
    }
  });

  // Delete a payment request (only by creator)
  app.delete('/api/payment-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const paymentRequest = await storage.getPaymentRequest(id);

      if (!paymentRequest) {
        return res.status(404).json({ message: "Payment request not found" });
      }

      if (paymentRequest.creatorId !== userId) {
        return res.status(403).json({ message: "Only the creator can delete this payment request" });
      }

      await storage.deletePaymentRequest(id);
      res.json({ success: true, message: "Payment request deleted successfully" });
    } catch (error) {
      console.error("Error deleting payment request:", error);
      res.status(500).json({ message: "Failed to delete payment request" });
    }
  });

  // Update user payment methods (Venmo/CashApp)
  app.patch('/api/users/payment-methods', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { venmoUsername, cashappUsername } = req.body;

      const paymentMethods: any = {};
      if (venmoUsername !== undefined) paymentMethods.venmoUsername = venmoUsername;
      if (cashappUsername !== undefined) paymentMethods.cashappUsername = cashappUsername;

      const user = await storage.updateUserPaymentMethods(userId, paymentMethods);
      res.json(user);
    } catch (error) {
      console.error("Error updating payment methods:", error);
      res.status(500).json({ message: "Failed to update payment methods" });
    }
  });

  return httpServer;
}
