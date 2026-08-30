import { storage } from './storage';
import { db } from './db';
import { teams, teamMemberships, scrimmages as scrimmagesTable } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { addDays, subDays, isBefore, isAfter, startOfDay, setHours, setMinutes, format } from 'date-fns';
import { sendScrimmageInvitePushNotification, resolveTeamLogoUrl } from './oneSignalNotifications';
import { formatScrimmageDateTime, formatDayAndTime, parseLeagueLocalDateTime } from './dateUtils';
import { sendBulkScrimmageInvites } from './emails';
import { isDemoLeague } from './demo';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

const getInviteGroupIds = (scrimmage: { inviteGroupIds?: string[] | null; inviteGroupId?: string | null }) =>
  Array.from(new Set([
    ...(scrimmage.inviteGroupIds || []),
    ...(scrimmage.inviteGroupId ? [scrimmage.inviteGroupId] : []),
  ].filter(Boolean)));

export async function startScrimmageInviteJob() {
  console.log('🔔 Starting scrimmage invitation job (checking every 5 minutes)');
  
  const runCheck = async () => {
    try {
      await checkAndSendInvitations();
    } catch (error) {
      console.error('Error in scrimmage invitation job:', error);
    }
  };

  // Run immediately on startup
  await runCheck();
  
  // Then run periodically
  setInterval(runCheck, CHECK_INTERVAL_MS);
}

async function generateMissingOccurrences() {
  try {
    // Get all recurring parent scrimmages that are still active
    const parentScrimmages = await storage.getRecurringParentScrimmages();
    
    for (const parent of parentScrimmages) {
      if (await isDemoLeague(parent.leagueId)) continue;
      await generateAndPersistRecurringOccurrences(parent, 12);
    }
  } catch (error) {
    console.error('Error generating recurring occurrences:', error);
  }
}

async function checkAndSendInvitations() {
  const now = new Date();
  
  // First, generate any missing recurring occurrences for parent scrimmages
  await generateMissingOccurrences();
  
  // Get all scrimmages (parent and child) that have invitation scheduling configured
  // and haven't had their invitations sent yet
  const scrimmages = await storage.getScrimmagesNeedingInvites();
  
  for (const scrimmage of scrimmages) {
    try {
      if (await isDemoLeague(scrimmage.leagueId)) continue;
      // Check if this scrimmage has invitation scheduling configured
      if (!scrimmage.inviteDaysBefore || scrimmage.inviteSentAt || scrimmage.timeTbd) {
        continue;
      }

      // Calculate when the invite should be sent
      // Get league timezone for proper date conversion
      const league = await storage.getLeague(scrimmage.leagueId);
      const timezone = league?.timezone || 'America/New_York';
      const scrimmageDate = parseLeagueLocalDateTime(scrimmage.dateTime, timezone);
      const inviteSendDate = subDays(scrimmageDate, scrimmage.inviteDaysBefore);
      
      // If inviteTimeOfDay is specified, use that time
      let inviteSendDateTime = startOfDay(inviteSendDate);
      if (scrimmage.inviteTimeOfDay) {
        const [hours, minutes] = scrimmage.inviteTimeOfDay.split(':').map(Number);
        inviteSendDateTime = setMinutes(setHours(inviteSendDate, hours), minutes);
      } else {
        // Default to 9 AM
        inviteSendDateTime = setHours(inviteSendDate, 9);
      }

      // Check if it's time to send the invite
      if (isAfter(now, inviteSendDateTime)) {
        console.log(`📬 Sending invitations for scrimmage: ${scrimmage.title} (${scrimmage.id})`);
        
        // Get the parent scrimmage to find the invited members
        const parentId = scrimmage.parentScrimmageId || scrimmage.id;
        const parentScrimmage = await storage.getScrimmage(parentId);
        
        if (!parentScrimmage) {
          console.error(`Parent scrimmage not found: ${parentId}`);
          continue;
        }

        // Determine who to invite for this recurring occurrence.
        //
        // Design: Linked invite groups act as the live invitation list —
        // membership is fetched fresh at send-time
        // so additions/removals to the group are reflected in future occurrences
        // without recreating the scrimmage.  Individual members selected at
        // creation time receive their invite immediately when the scrimmage is
        // created (synchronous path in POST /api/scrimmages); the job only handles
        // future occurrences.  When no group is attached the job falls back to
        // all currently-approved league members (original behaviour).
        //
        // Placeholder players (id prefix "placeholder:") never have accounts so
        // they cannot receive push / in-app notifications, but their selection is
        // preserved in inviteUserIds and must not be silently discarded.  We
        // collect them separately so they are acknowledged in logs and kept in
        // the invite record even though no notification is sent.
        const allInviteUserIds: string[] = parentScrimmage.inviteUserIds || [];
        const placeholderInviteIds = allInviteUserIds.filter(id => id.startsWith('placeholder:'));
        const inviteEmails = new Set<string>(
          (scrimmage.inviteEmails || parentScrimmage.inviteEmails || [])
            .map((email: string) => email.toLowerCase().trim())
            .filter((email: string) => email.includes('@')),
        );

        let approvedMembers;
        const inviteGroupIds = getInviteGroupIds(parentScrimmage);
        if (inviteGroupIds.length > 0) {
          const leagueMembers = await storage.getLeagueMembers(scrimmage.leagueId);
          const leagueMemberMap = new Map(leagueMembers.map(m => [m.userId, m]));

          // Live group members (re-fetched at send-time)
          const groupMembers = (await Promise.all(
            inviteGroupIds.map((groupId) => storage.getInviteGroupMembers(groupId)),
          )).flat();
          groupMembers.forEach((member) => {
            if (member.email) {
              const normalizedEmail = member.email.toLowerCase().trim();
              if (normalizedEmail.includes('@')) inviteEmails.add(normalizedEmail);
            }
          });

          // Real user recipients from the group
          const recipientIds = new Set(groupMembers.filter(gm => gm.userId).map(gm => gm.userId!));

          // Placeholder members from the group — synthesise their IDs and merge into
          // placeholderInviteIds so they are acknowledged alongside direct selections.
          const groupPlaceholderIds = groupMembers
            .filter(gm => (gm as any).placeholderPlayerId)
            .map(gm => `placeholder:${(gm as any).placeholderPlayerId}`);
          groupPlaceholderIds.forEach(pid => {
            if (!placeholderInviteIds.includes(pid)) placeholderInviteIds.push(pid);
          });

          // Union: add directly-selected real users who are still approved league members.
          // Placeholder IDs are handled separately via placeholderInviteIds.
          const directInvitees = allInviteUserIds.filter(uid => !uid.startsWith('placeholder:'));
          directInvitees.forEach(uid => { if (leagueMemberMap.has(uid)) recipientIds.add(uid); });

          approvedMembers = Array.from(recipientIds).map(uid => leagueMemberMap.get(uid)!).filter(Boolean);
          console.log(`📋 ${inviteGroupIds.length} live invite group(s) + ${directInvitees.length} direct invitees + ${placeholderInviteIds.length} placeholders (${groupPlaceholderIds.length} from groups) → ${approvedMembers.length} real recipients`);
        } else {
          approvedMembers = await storage.getLeagueMembers(scrimmage.leagueId);
        }

        if (placeholderInviteIds.length > 0) {
          console.log(`📋 ${placeholderInviteIds.length} placeholder invitee(s) on this scrimmage — no notifications sent (no account)`);
        }
        
        // Get the creator's name for the push notification
        const creator = await storage.getUser(scrimmage.creatorId);
        const organizerName = creator 
          ? `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || 'Organizer'
          : 'Organizer';
        
        // Get league timezone for proper date formatting
        const league = await storage.getLeague(scrimmage.leagueId);
        const timezone = league?.timezone || 'America/New_York';
        
        const scrimmageDateTime = formatScrimmageDateTime(scrimmage.dateTime, timezone);
        const { date: formattedDate, time: formattedTime } = formatDayAndTime(scrimmage.dateTime, timezone);
        
        // Resolve creator's team logo once — used as the notification icon for all invites
        let jobInviteTeamLogoUrl: string | undefined;
        if (scrimmage.creatorId && scrimmage.leagueId) {
          try {
            const creatorTeamRows = await db
              .select({ logoUrl: teams.logoUrl })
              .from(teamMemberships)
              .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
              .where(and(
                eq(teamMemberships.userId, scrimmage.creatorId),
                eq(teams.leagueId, scrimmage.leagueId),
                eq(teamMemberships.status, 'approved')
              ))
              .limit(1);
            jobInviteTeamLogoUrl = resolveTeamLogoUrl(creatorTeamRows[0]?.logoUrl);
          } catch (e) { /* keep undefined */ }
        }
        
        // Send in-app notifications to all approved league members (with idempotency check)
        let sentCount = 0;
        for (const member of approvedMembers) {
          if (member.userId === scrimmage.creatorId) continue; // Skip the creator
          
          const notification = await storage.createNotificationIfNotExists({
            userId: member.userId,
            type: 'scrimmage_invite',
            title: `You're Invited: ${scrimmage.title}`,
            message: `Join us on ${formattedDate} at ${formattedTime} at ${scrimmage.location}`,
            actionUrl: `/scrimmage/${scrimmage.id}`,
            actionText: 'View & RSVP',
            scrimmageId: scrimmage.id,
          });
          
          if (notification) {
            sentCount++;
            // Send push notification to device
            sendScrimmageInvitePushNotification(
              member.userId,
              organizerName,
              scrimmage.title,
              scrimmageDateTime,
              scrimmage.location || 'TBD',
              scrimmage.id,
              jobInviteTeamLogoUrl
            ).catch(console.error);
          }
        }

        // Claim and send each email address only once per occurrence, even when
        // it appears in several linked groups or in the direct email list.
        const existingEmailInvites = await storage.getScrimmageInvites(scrimmage.id);
        const existingInviteEmails = new Set(existingEmailInvites.map((invite) => invite.email.toLowerCase()));
        const newInviteEmails = Array.from(inviteEmails).filter((email) => !existingInviteEmails.has(email));
        if (newInviteEmails.length > 0) {
          await storage.createScrimmageInvites(scrimmage.id, newInviteEmails);
          await sendBulkScrimmageInvites(newInviteEmails, {
            scrimmageId: scrimmage.id,
            title: scrimmage.title,
            dateTime: new Date(scrimmage.dateTime),
            location: scrimmage.location,
            creatorName: organizerName,
            skillLevel: scrimmage.skillLevel || undefined,
            costPerPlayer: scrimmage.costPerPlayer || undefined,
            notes: scrimmage.notes || undefined,
            maxPlayers: scrimmage.maxPlayers,
          });
        }

        // Persist placeholder invite IDs back to the occurrence's invite_user_ids so they
        // appear as proper invite records on the occurrence view (they have no account so
        // no notification is sent, but their selection must be visible to the organiser).
        if (placeholderInviteIds.length > 0) {
          const existingIds: string[] = scrimmage.inviteUserIds || [];
          const merged = Array.from(new Set([...existingIds, ...placeholderInviteIds]));
          await db.update(scrimmagesTable).set({ inviteUserIds: merged } as any).where(eq(scrimmagesTable.id, scrimmage.id));
          console.log(`📋 Persisted ${placeholderInviteIds.length} placeholder ID(s) to occurrence invite_user_ids`);
        }

        // Mark the invite as sent
        await storage.updateScrimmageInviteSent(scrimmage.id);
        
        console.log(`✅ Sent ${sentCount} invitations for scrimmage ${scrimmage.id}`);
      }
    } catch (error) {
      console.error(`Error sending invitations for scrimmage ${scrimmage.id}:`, error);
    }
  }
}

// Function to generate and persist future occurrences for a recurring scrimmage
export async function generateAndPersistRecurringOccurrences(parentScrimmage: any, horizonWeeks: number = 12) {
  if (!parentScrimmage.isRecurring || parentScrimmage.recurrenceType === 'none') {
    return [];
  }

  const createdOccurrences: any[] = [];
  const now = new Date();
  const horizonDate = addDays(now, horizonWeeks * 7);

  // If the parent scrimmage has a live invite group, pre-fetch its placeholder members
  // and merge their synthetic IDs into the occurrence's inviteUserIds immediately so
  // they are visible to organizers before the scheduled invite-send job fires.
  let effectiveParent = parentScrimmage;
  const inviteGroupIds = getInviteGroupIds(parentScrimmage);
  if (inviteGroupIds.length > 0) {
    try {
      const groupMembers = (await Promise.all(
        inviteGroupIds.map((groupId) => storage.getInviteGroupMembers(groupId)),
      )).flat();
      const groupPlaceholderIds = groupMembers
        .filter((gm: any) => (gm as any).placeholderPlayerId)
        .map((gm: any) => `placeholder:${(gm as any).placeholderPlayerId}`);
      if (groupPlaceholderIds.length > 0) {
        const baseIds: string[] = parentScrimmage.inviteUserIds || [];
        const merged = Array.from(new Set([...baseIds, ...groupPlaceholderIds]));
        effectiveParent = { ...parentScrimmage, inviteUserIds: merged };
        console.log(`📋 Merged ${groupPlaceholderIds.length} group placeholder(s) into occurrence inviteUserIds for recurring scrimmage ${parentScrimmage.id}`);
      }
    } catch (e) {
      console.error(`[RecurringOccurrence] Failed to pre-fetch placeholders for invite groups ${inviteGroupIds.join(',')}:`, e);
    }
  }

  // Get league timezone for proper date conversion
  const league = await storage.getLeague(parentScrimmage.leagueId);
  const timezone = league?.timezone || 'America/New_York';
  const startDate = parseLeagueLocalDateTime(parentScrimmage.dateTime, timezone);
  
  // Determine recurrence end date
  let endDate = horizonDate;
  if (parentScrimmage.recurrenceEndDate) {
    endDate = parseLeagueLocalDateTime(parentScrimmage.recurrenceEndDate, timezone);
    if (isAfter(endDate, horizonDate)) {
      endDate = horizonDate;
    }
  }

  // For weekly recurrence
  if (parentScrimmage.recurrenceType === 'weekly') {
    let currentDate = addDays(startDate, 7); // Start from next week
    let count = 1;
    const maxCount = parentScrimmage.recurrenceCount || Infinity;
    
    while (isBefore(currentDate, endDate) && count < maxCount) {
      // Check if this occurrence already exists
      const existingOccurrence = await storage.getScrimmageByParentAndDate(
        parentScrimmage.id,
        currentDate
      );
      
      if (!existingOccurrence && isAfter(currentDate, now)) {
        // Persist the occurrence to the database — use effectiveParent so placeholder IDs
        // from the live invite group are baked into the occurrence's inviteUserIds at creation.
        const newOccurrence = await storage.createRecurringScrimmageOccurrence(
          effectiveParent,
          currentDate
        );
        createdOccurrences.push(newOccurrence);
        console.log(`📅 Created recurring occurrence for ${effectiveParent.title} on ${format(currentDate, 'yyyy-MM-dd')}`);
      }
      
      currentDate = addDays(currentDate, 7);
      count++;
    }
  }

  // For daily recurrence
  if (parentScrimmage.recurrenceType === 'daily') {
    let currentDate = addDays(startDate, 1);
    let count = 1;
    const maxCount = parentScrimmage.recurrenceCount || Infinity;
    
    while (isBefore(currentDate, endDate) && count < maxCount) {
      const existingOccurrence = await storage.getScrimmageByParentAndDate(
        parentScrimmage.id,
        currentDate
      );
      
      if (!existingOccurrence && isAfter(currentDate, now)) {
        // Persist using effectiveParent for the same reason as the weekly branch above.
        const newOccurrence = await storage.createRecurringScrimmageOccurrence(
          effectiveParent,
          currentDate
        );
        createdOccurrences.push(newOccurrence);
        console.log(`📅 Created recurring occurrence for ${parentScrimmage.title} on ${format(currentDate, 'yyyy-MM-dd')}`);
      }
      
      currentDate = addDays(currentDate, 1);
      count++;
    }
  }

  return createdOccurrences;
}
