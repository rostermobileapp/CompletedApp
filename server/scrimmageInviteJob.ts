import { storage } from './storage';
import { addDays, subDays, isBefore, isAfter, startOfDay, setHours, setMinutes } from 'date-fns';
import { sendScrimmageInvitePushNotification } from './oneSignalNotifications';
import { formatScrimmageDateTime, formatDayAndTime } from './dateUtils';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

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
      // Check if this scrimmage has invitation scheduling configured
      if (!scrimmage.inviteDaysBefore || scrimmage.inviteSentAt) {
        continue;
      }

      // Calculate when the invite should be sent
      const inviteSendDate = subDays(new Date(scrimmage.dateTime), scrimmage.inviteDaysBefore);
      
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

        // Get all league members to invite (based on the original scrimmage settings)
        const leagueMembers = await storage.getLeagueMembers(scrimmage.leagueId);
        const approvedMembers = leagueMembers.filter(m => m.status === 'approved');
        
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
              scrimmage.id
            ).catch(console.error);
          }
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
  const startDate = new Date(parentScrimmage.dateTime);
  
  // Determine recurrence end date
  let endDate = horizonDate;
  if (parentScrimmage.recurrenceEndDate) {
    endDate = new Date(parentScrimmage.recurrenceEndDate);
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
        // Persist the occurrence to the database
        const newOccurrence = await storage.createRecurringScrimmageOccurrence(
          parentScrimmage,
          currentDate
        );
        createdOccurrences.push(newOccurrence);
        console.log(`📅 Created recurring occurrence for ${parentScrimmage.title} on ${format(currentDate, 'yyyy-MM-dd')}`);
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
        // Persist the occurrence to the database
        const newOccurrence = await storage.createRecurringScrimmageOccurrence(
          parentScrimmage,
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
