import {
  conversations,
  conversationParticipants,
  messages,
  messageAttachments,
  messageReadReceipts,
  typingIndicators,
  userOnlineStatus,
  users,
  teamMemberships,
  leagueMemberships,
  teams,
  tournamentTeams,
  tournamentParticipants,
  chatPolls,
  chatPollVotes,
  paymentRequests,
  type Conversation,
  type InsertConversation,
  type ConversationParticipant,
  type InsertConversationParticipant,
  type Message,
  type InsertMessage,
  type MessageAttachment,
  type InsertMessageAttachment,
  type MessageReadReceipt,
  type InsertMessageReadReceipt,
  type TypingIndicator,
  type InsertTypingIndicator,
  type UserOnlineStatus,
  type InsertUserOnlineStatus,
  type ChatPoll,
  type InsertChatPoll,
  type ChatPollVote,
  type InsertChatPollVote,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, inArray, isNull } from "drizzle-orm";

export class MessagingService {
  // Conversation operations
  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    return conversation;
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values(data)
      .returning();
    return conversation;
  }

  async getConversationParticipants(conversationId: string): Promise<ConversationParticipant[]> {
    // First get the conversation to find its leagueId
    const [conversation] = await db
      .select({ leagueId: conversations.leagueId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    
    const leagueId = conversation?.leagueId;
    
    const result = await db
      .select({
        // Get participant fields
        id: conversationParticipants.id,
        conversationId: conversationParticipants.conversationId, 
        userId: conversationParticipants.userId,
        joinedAt: conversationParticipants.joinedAt,
        // Get user fields and create user object
        // Use league membership display names if available, otherwise fall back to user names
        user: {
          id: users.id,
          email: users.email,
          firstName: leagueId 
            ? sql<string>`COALESCE(${leagueMemberships.displayFirstName}, ${users.firstName})`.as('firstName')
            : users.firstName,
          lastName: leagueId
            ? sql<string>`COALESCE(${leagueMemberships.displayLastName}, ${users.lastName})`.as('lastName')
            : users.lastName,
          profileImageUrl: users.profileImageUrl,
          displayName: leagueId
            ? sql<string>`COALESCE(
                COALESCE(${leagueMemberships.displayFirstName}, ${users.firstName}) || ' ' || COALESCE(${leagueMemberships.displayLastName}, ${users.lastName}),
                ${users.email}
              )`.as('displayName')
            : sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`.as('displayName')
        }
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .leftJoin(
        leagueMemberships,
        leagueId 
          ? and(
              eq(leagueMemberships.userId, users.id),
              eq(leagueMemberships.leagueId, leagueId)
            )
          : sql`false`
      )
      .where(eq(conversationParticipants.conversationId, conversationId));
    
    return result as any[] as ConversationParticipant[];
  }

  async isUserInConversation(userId: string, conversationId: string): Promise<boolean> {
    const [participant] = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.userId, userId),
          eq(conversationParticipants.conversationId, conversationId)
        )
      )
      .limit(1);
    return !!participant;
  }

  async addParticipantToConversation(data: InsertConversationParticipant): Promise<ConversationParticipant> {
    const [participant] = await db
      .insert(conversationParticipants)
      .values(data)
      .returning();
    return participant;
  }

  // Message operations
  async createMessage(data: InsertMessage): Promise<Message> {
    return await db.transaction(async (tx) => {
      // Insert the message
      const [message] = await tx
        .insert(messages)
        .values(data)
        .returning();

      // Update conversation's last message timestamp
      await tx
        .update(conversations)
        .set({ 
          lastMessageAt: new Date(),
          updatedAt: new Date() 
        })
        .where(eq(conversations.id, data.conversationId));

      // Resurface hidden conversations for all participants (except sender gets special handling)
      await tx
        .update(conversationParticipants)
        .set({ hiddenAt: null })
        .where(eq(conversationParticipants.conversationId, data.conversationId));

      return message;
    });
  }

  // SMS-style leave conversation - hide it from user's view and clear history
  async leaveConversationSMSStyle(conversationId: string, userId: string): Promise<void> {
    const now = new Date();
    await db
      .update(conversationParticipants)
      .set({ 
        hiddenAt: now,
        historyClearedAt: now 
      })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId)
        )
      );
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);
    return message;
  }

  async getConversationMessages(conversationId: string, limit: number = 50): Promise<any[]> {
    // First get the conversation to find its leagueId
    const [conversation] = await db
      .select({ leagueId: conversations.leagueId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    
    const leagueId = conversation?.leagueId;
    
    const result = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        content: messages.content,
        messageType: messages.messageType,
        status: messages.status,
        sentAt: messages.createdAt,
        editedAt: messages.editedAt,
        replyToId: messages.replyToId,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        sender: {
          id: users.id,
          firstName: leagueId 
            ? sql<string>`COALESCE(${leagueMemberships.displayFirstName}, ${users.firstName})`.as('firstName')
            : users.firstName,
          lastName: leagueId
            ? sql<string>`COALESCE(${leagueMemberships.displayLastName}, ${users.lastName})`.as('lastName')
            : users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .leftJoin(
        leagueMemberships,
        leagueId 
          ? and(
              eq(leagueMemberships.userId, users.id),
              eq(leagueMemberships.leagueId, leagueId)
            )
          : sql`false`
      )
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(limit);
    
    return result;
  }

  // User-aware version that respects history clearing and hiding
  async getConversationMessagesForUser(conversationId: string, userId: string, limit: number = 50): Promise<any[]> {
    // Get user's participant info to check for hiddenAt and historyClearedAt
    const [participant] = await db
      .select({
        hiddenAt: conversationParticipants.hiddenAt,
        historyClearedAt: conversationParticipants.historyClearedAt
      })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId)
        )
      )
      .limit(1);

    if (!participant) {
      return []; // User not in conversation
    }

    // Get the conversation to find its leagueId
    const [conversation] = await db
      .select({ leagueId: conversations.leagueId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    
    const leagueId = conversation?.leagueId;

    // Build where conditions based on user's history
    const whereConditions = [eq(messages.conversationId, conversationId)];
    
    // If user cleared history, only show messages after that time
    if (participant.historyClearedAt) {
      whereConditions.push(sql`${messages.createdAt} > ${participant.historyClearedAt}`);
    }
    
    // If conversation was hidden but resurfaced, only show messages after hiddenAt
    if (participant.hiddenAt) {
      whereConditions.push(sql`${messages.createdAt} > ${participant.hiddenAt}`);
    }

    const result = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        content: messages.content,
        messageType: messages.messageType,
        status: messages.status,
        sentAt: messages.createdAt,
        editedAt: messages.editedAt,
        replyToId: messages.replyToId,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        sender: {
          id: users.id,
          firstName: leagueId 
            ? sql<string>`COALESCE(${leagueMemberships.displayFirstName}, ${users.firstName})`.as('firstName')
            : users.firstName,
          lastName: leagueId
            ? sql<string>`COALESCE(${leagueMemberships.displayLastName}, ${users.lastName})`.as('lastName')
            : users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .leftJoin(
        leagueMemberships,
        leagueId 
          ? and(
              eq(leagueMemberships.userId, users.id),
              eq(leagueMemberships.leagueId, leagueId)
            )
          : sql`false`
      )
      .where(and(...whereConditions))
      .orderBy(messages.createdAt)
      .limit(limit);
    
    return result;
  }

  // Message attachment operations
  async createMessageAttachment(data: InsertMessageAttachment): Promise<MessageAttachment> {
    const [attachment] = await db
      .insert(messageAttachments)
      .values(data)
      .returning();
    return attachment;
  }

  async getMessageAttachments(messageId: string): Promise<MessageAttachment[]> {
    return await db
      .select()
      .from(messageAttachments)
      .where(eq(messageAttachments.messageId, messageId));
  }

  // Get message attachment by file path (for authorization checks)
  async getMessageAttachmentByPath(filePath: string): Promise<MessageAttachment | undefined> {
    const [attachment] = await db
      .select()
      .from(messageAttachments)
      .where(eq(messageAttachments.url, filePath))
      .limit(1);
    return attachment;
  }

  // Read receipt operations
  async markMessageAsRead(messageId: string, userId: string): Promise<MessageReadReceipt> {
    // Check if read receipt already exists
    const [existing] = await db
      .select()
      .from(messageReadReceipts)
      .where(
        and(
          eq(messageReadReceipts.messageId, messageId),
          eq(messageReadReceipts.userId, userId)
        )
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const [receipt] = await db
      .insert(messageReadReceipts)
      .values({
        messageId,
        userId,
        readAt: new Date()
      })
      .returning();
    return receipt;
  }

  async getMessageReadReceipts(messageId: string): Promise<MessageReadReceipt[]> {
    return await db
      .select()
      .from(messageReadReceipts)
      .where(eq(messageReadReceipts.messageId, messageId));
  }

  // Typing indicator operations
  async setTypingIndicator(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
    if (isTyping) {
      // Add/update typing indicator with 5 second expiry
      const expiresAt = new Date(Date.now() + 5000); // 5 seconds from now
      await db
        .insert(typingIndicators)
        .values({
          conversationId,
          userId,
          expiresAt
        })
        .onConflictDoUpdate({
          target: [typingIndicators.conversationId, typingIndicators.userId],
          set: {
            startedAt: new Date(),
            expiresAt
          }
        });
    } else {
      // Remove typing indicator
      await db
        .delete(typingIndicators)
        .where(
          and(
            eq(typingIndicators.conversationId, conversationId),
            eq(typingIndicators.userId, userId)
          )
        );
    }
  }

  async clearUserTypingIndicators(userId: string): Promise<void> {
    await db
      .delete(typingIndicators)
      .where(eq(typingIndicators.userId, userId));
  }

  async getTypingIndicators(conversationId: string): Promise<TypingIndicator[]> {
    return await db
      .select()
      .from(typingIndicators)
      .where(eq(typingIndicators.conversationId, conversationId));
  }

  // Online status operations
  async updateUserOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    await db
      .insert(userOnlineStatus)
      .values({
        userId,
        status: isOnline ? 'online' : 'offline',
        lastSeenAt: new Date()
      })
      .onConflictDoUpdate({
        target: userOnlineStatus.userId,
        set: {
          status: isOnline ? 'online' : 'offline',
          lastSeenAt: new Date(),
          updatedAt: new Date()
        }
      });
  }

  async getUserOnlineStatus(userId: string): Promise<UserOnlineStatus | undefined> {
    const [status] = await db
      .select()
      .from(userOnlineStatus)
      .where(eq(userOnlineStatus.userId, userId))
      .limit(1);
    return status;
  }

  // Conversation management operations
  async findDirectConversation(user1Id: string, user2Id: string, leagueId?: string): Promise<Conversation | undefined> {
    // Find existing direct conversation between two users
    const conversations_result = await db
      .select()
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversations.id, conversationParticipants.conversationId)
      )
      .where(
        and(
          eq(conversations.type, 'direct'),
          leagueId ? eq(conversations.leagueId, leagueId) : sql`true`
        )
      );

    // Group by conversation ID and check if both users are participants
    const conversationMap = new Map<string, { conversation: Conversation, participants: string[] }>();
    
    for (const row of conversations_result) {
      const convId = row.conversations.id;
      if (!conversationMap.has(convId)) {
        conversationMap.set(convId, {
          conversation: row.conversations,
          participants: []
        });
      }
      conversationMap.get(convId)!.participants.push(row.conversation_participants.userId);
    }

    // Find conversation with exactly these two participants
    const conversationEntries = Array.from(conversationMap.values());
    for (const { conversation, participants } of conversationEntries) {
      if (participants.length === 2 && 
          participants.includes(user1Id) && 
          participants.includes(user2Id)) {
        return conversation;
      }
    }

    return undefined;
  }

  async createDirectConversation(user1Id: string, user2Id: string, leagueId: string): Promise<Conversation> {
    return await db.transaction(async (tx) => {
      // Create conversation
      const [conversation] = await tx
        .insert(conversations)
        .values({
          type: 'direct',
          leagueId: leagueId,
          createdBy: user1Id
        })
        .returning();

      // Add both participants
      await tx.insert(conversationParticipants).values([
        { conversationId: conversation.id, userId: user1Id, joinedAt: new Date() },
        { conversationId: conversation.id, userId: user2Id, joinedAt: new Date() }
      ]);

      return conversation;
    });
  }

  async getUserConversations(userId: string, leagueId?: string): Promise<Conversation[]> {
    const result = await db
      .select()
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversations.id, conversationParticipants.conversationId)
      )
      .where(
        and(
          eq(conversationParticipants.userId, userId),
          leagueId ? eq(conversations.leagueId, leagueId) : sql`true`,
          // Only show conversations that are not hidden OR have new messages after hiddenAt
          sql`(${conversationParticipants.hiddenAt} IS NULL OR ${conversations.lastMessageAt} > ${conversationParticipants.hiddenAt})`
        )
      )
      .orderBy(sql`COALESCE(${conversations.lastMessageAt}, ${conversations.createdAt}) DESC`);

    return result.map(row => row.conversations);
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    // Get all conversations the user is part of
    const userConversations = await db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversations.id, conversationParticipants.conversationId)
      )
      .where(eq(conversationParticipants.userId, userId));

    if (userConversations.length === 0) {
      return 0;
    }

    const conversationIds = userConversations.map(c => c.id);

    // Count messages in user's conversations that they haven't read
    const [result] = await db
      .select({ 
        count: sql<number>`count(*)::int` 
      })
      .from(messages)
      .leftJoin(
        messageReadReceipts,
        and(
          eq(messages.id, messageReadReceipts.messageId),
          eq(messageReadReceipts.userId, userId)
        )
      )
      .where(
        and(
          inArray(messages.conversationId, conversationIds),
          sql`${messages.senderId} != ${userId}`, // Don't count user's own messages
          sql`${messageReadReceipts.id} IS NULL` // Messages without read receipts
        )
      );

    return result?.count ?? 0;
  }

  async getUnreadMessageCountPerConversation(userId: string): Promise<Array<{ conversationId: string; unreadCount: number }>> {
    // Get all conversations the user is part of
    const userConversations = await db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversations.id, conversationParticipants.conversationId)
      )
      .where(eq(conversationParticipants.userId, userId));

    if (userConversations.length === 0) {
      return [];
    }

    const conversationIds = userConversations.map(c => c.id);

    // Count unread messages per conversation
    const results = await db
      .select({ 
        conversationId: messages.conversationId,
        count: sql<number>`count(*)::int` 
      })
      .from(messages)
      .leftJoin(
        messageReadReceipts,
        and(
          eq(messages.id, messageReadReceipts.messageId),
          eq(messageReadReceipts.userId, userId)
        )
      )
      .where(
        and(
          inArray(messages.conversationId, conversationIds),
          sql`${messages.senderId} != ${userId}`, // Don't count user's own messages
          sql`${messageReadReceipts.id} IS NULL` // Messages without read receipts
        )
      )
      .groupBy(messages.conversationId);

    return results.map(result => ({
      conversationId: result.conversationId,
      unreadCount: result.count
    }));
  }

  async markAllMessagesInConversationAsRead(userId: string, conversationId: string): Promise<{ messageId: string; senderId: string }[]> {
    // First verify the user is a participant in this conversation
    const isParticipant = await this.isUserInConversation(userId, conversationId);
    if (!isParticipant) {
      throw new Error('User is not a participant in this conversation');
    }

    // Get all unread messages in the conversation for this user (including sender ID)
    const unreadMessages = await db
      .select({ id: messages.id, senderId: messages.senderId })
      .from(messages)
      .leftJoin(
        messageReadReceipts,
        and(
          eq(messages.id, messageReadReceipts.messageId),
          eq(messageReadReceipts.userId, userId)
        )
      )
      .where(
        and(
          eq(messages.conversationId, conversationId),
          sql`${messages.senderId} != ${userId}`, // Don't mark own messages
          sql`${messageReadReceipts.id} IS NULL` // Messages without read receipts
        )
      );

    // If no unread messages, nothing to do
    if (unreadMessages.length === 0) {
      return [];
    }

    // Create read receipts for all unread messages atomically
    const readReceiptData = unreadMessages.map(message => ({
      messageId: message.id,
      userId: userId,
      readAt: new Date()
    }));

    await db.insert(messageReadReceipts).values(readReceiptData);
    
    // Return the marked messages with their sender IDs for WebSocket notifications
    return unreadMessages.map(m => ({ messageId: m.id, senderId: m.senderId }));
  }

  // Group conversation operations
  async createTeamGroupChat(teamId: string, leagueId: string, createdBy: string): Promise<Conversation> {
    // Check if this is a tournament team first
    const [tournamentTeam] = await db
      .select()
      .from(tournamentTeams)
      .where(eq(tournamentTeams.id, teamId))
      .limit(1);

    // If it's a tournament team, use tournamentId; otherwise, get regular team info
    let tournamentId: string | undefined;
    let team: any;
    
    if (tournamentTeam) {
      tournamentId = tournamentTeam.tournamentId;
      // For tournament teams, we might have a linked regular team or standalone
      if (tournamentTeam.teamId) {
        const [linkedTeam] = await db
          .select()
          .from(teams)
          .where(eq(teams.id, tournamentTeam.teamId))
          .limit(1);
        team = linkedTeam;
      }
    } else {
      // Regular team
      const [regularTeam] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);
      
      if (!regularTeam) {
        throw new Error(`Team ${teamId} not found`);
      }
      team = regularTeam;
    }

    let participantIds: Set<string>;
    
    if (tournamentTeam && !tournamentTeam.teamId) {
      // Standalone tournament team - get participants from tournamentParticipants table (joined with users to filter deleted)
      const tournamentParticipantsData = await db
        .select({ userId: tournamentParticipants.userId, firstName: users.firstName })
        .from(tournamentParticipants)
        .innerJoin(users, eq(tournamentParticipants.userId, users.id))
        .where(and(
          eq(tournamentParticipants.tournamentTeamId, teamId),
          eq(tournamentParticipants.status, 'approved')
        ));
      
      // Filter out soft-deleted users
      participantIds = new Set(
        tournamentParticipantsData
          .filter(p => p.firstName !== '[Deleted]')
          .map(p => p.userId)
      );
    } else {
      // Regular team or tournament team with linked regular team
      const actualTeamId = team?.id || teamId;
      
      // Get all approved team members from team_memberships (joined with users to filter deleted)
      const teamMembershipsData = await db
        .select({ userId: teamMemberships.userId, firstName: users.firstName })
        .from(teamMemberships)
        .innerJoin(users, eq(teamMemberships.userId, users.id))
        .where(and(
          eq(teamMemberships.teamId, actualTeamId),
          eq(teamMemberships.status, 'approved')
        ));

      // Also get league members who are assigned to this team (joined with users to filter deleted)
      const leagueMembershipsData = await db
        .select({ userId: leagueMemberships.userId, firstName: users.firstName })
        .from(leagueMemberships)
        .innerJoin(users, eq(leagueMemberships.userId, users.id))
        .where(and(
          eq(leagueMemberships.assignedTeamId, actualTeamId),
          eq(leagueMemberships.status, 'approved')
        ));

      // Create a set of all unique team participants (members + captain + league-assigned members)
      // Exclude soft-deleted users (firstName = '[Deleted]')
      participantIds = new Set<string>([
        ...teamMembershipsData
          .filter(m => m.firstName !== '[Deleted]')
          .map(m => m.userId),
        ...leagueMembershipsData
          .filter(m => m.firstName !== '[Deleted]')
          .map(m => m.userId)
      ]);
      
      // Always add the captain if they exist and are not deleted
      if (team?.captainId) {
        const [captain] = await db
          .select({ firstName: users.firstName })
          .from(users)
          .where(eq(users.id, team.captainId))
          .limit(1);
        if (captain && captain.firstName !== '[Deleted]') {
          participantIds.add(team.captainId);
        }
      }
    }

    // Convert set back to array of objects for consistency with rest of code
    const teamMembers = Array.from(participantIds).map(userId => ({ userId }));

    // Helper function to ensure participants are added (idempotent with conflict resolution)
    const ensureParticipants = async (conversationId: string) => {
      if (teamMembers.length === 0) {
        return;
      }
      
      try {
        await db.insert(conversationParticipants)
          .values(teamMembers.map(member => ({
            conversationId,
            userId: member.userId,
          })))
          .onConflictDoNothing({
            target: [conversationParticipants.conversationId, conversationParticipants.userId]
          });
      } catch (error) {
        throw error;
      }
    };

    // Check if team group chat already exists
    // For tournament teams, check by tournamentId; for regular teams, check by teamId
    const [existingChat] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.type, "team_group"),
          tournamentId 
            ? eq(conversations.tournamentId, tournamentId)
            : eq(conversations.teamId, teamId)
        )
      )
      .limit(1);

    if (existingChat) {
      // Check if existing conversation has participants
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, existingChat.id));
      
      if (count === 0) {
        await ensureParticipants(existingChat.id);
      }
      
      return existingChat;
    }

    const teamName = team?.name || tournamentTeam?.teamName || 'Team';

    // Create team group conversation
    // For tournament teams: use tournamentId and linked team ID (if exists)
    // For regular teams: use leagueId and teamId
    const conversation = await this.createConversation({
      type: "team_group",
      title: `${teamName} Team Chat`,
      leagueId: tournamentId ? undefined : leagueId,
      tournamentId: tournamentId,
      teamId: tournamentTeam ? (tournamentTeam.teamId || undefined) : teamId,
      createdBy,
    });

    // Add all team members as participants using bulk insert
    await ensureParticipants(conversation.id);

    return conversation;
  }

  // Sync team chat participants with current team roster
  async syncTeamChatParticipants(teamId: string, leagueId: string): Promise<void> {
    // Get the team to access the captain
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    // Get all approved team members from team_memberships (joined with users to check for deleted)
    const teamMembershipsData = await db
      .select({ userId: teamMemberships.userId, firstName: users.firstName })
      .from(teamMemberships)
      .innerJoin(users, eq(teamMemberships.userId, users.id))
      .where(and(
        eq(teamMemberships.teamId, teamId),
        eq(teamMemberships.status, 'approved')
      ));

    // Also get league members who are assigned to this team (joined with users to check for deleted)
    const leagueMembershipsData = await db
      .select({ userId: leagueMemberships.userId, firstName: users.firstName })
      .from(leagueMemberships)
      .innerJoin(users, eq(leagueMemberships.userId, users.id))
      .where(and(
        eq(leagueMemberships.assignedTeamId, teamId),
        eq(leagueMemberships.status, 'approved')
      ));

    // Create a set of all unique team participants (members + captain + league-assigned members)
    // Exclude soft-deleted users (firstName = '[Deleted]')
    const currentMemberIds = new Set<string>([
      ...teamMembershipsData
        .filter(m => m.firstName !== '[Deleted]')
        .map(m => m.userId),
      ...leagueMembershipsData
        .filter(m => m.firstName !== '[Deleted]')
        .map(m => m.userId)
    ]);
    
    // Always add the captain if they exist and are not deleted
    if (team.captainId) {
      const [captain] = await db
        .select({ firstName: users.firstName })
        .from(users)
        .where(eq(users.id, team.captainId))
        .limit(1);
      if (captain && captain.firstName !== '[Deleted]') {
        currentMemberIds.add(team.captainId);
      }
    }

    // Find existing team group chat
    const [existingChat] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.type, "team_group"),
          eq(conversations.teamId, teamId)
        )
      )
      .limit(1);

    // If no chat exists yet, create it
    if (!existingChat) {
      await this.createTeamGroupChat(teamId, leagueId, team.captainId || team.creatorId || '');
      return;
    }

    // Get current active participants (those who haven't left) along with user info
    const currentParticipantsWithUsers = await db
      .select({
        id: conversationParticipants.id,
        userId: conversationParticipants.userId,
        firstName: users.firstName
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(
        and(
          eq(conversationParticipants.conversationId, existingChat.id),
          isNull(conversationParticipants.leftAt)
        )
      );

    const currentParticipantIds = new Set(currentParticipantsWithUsers.map(p => p.userId));

    // Find members who need to be added (are on roster but not in chat)
    const membersToAdd = Array.from(currentMemberIds).filter(
      userId => !currentParticipantIds.has(userId)
    );

    // Find participants who need to be removed:
    // 1. No longer on team roster
    // 2. OR are soft-deleted users ([Deleted] User)
    const participantsToRemove = currentParticipantsWithUsers.filter(
      p => !currentMemberIds.has(p.userId) || p.firstName === '[Deleted]'
    );

    // Add new members
    if (membersToAdd.length > 0) {
      await db.insert(conversationParticipants)
        .values(membersToAdd.map(userId => ({
          conversationId: existingChat.id,
          userId,
        })))
        .onConflictDoNothing({
          target: [conversationParticipants.conversationId, conversationParticipants.userId]
        });
    }

    // Remove members who are no longer on the team or are deleted
    if (participantsToRemove.length > 0) {
      await db
        .update(conversationParticipants)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, existingChat.id),
            inArray(conversationParticipants.userId, participantsToRemove.map(p => p.userId))
          )
        );
    }
  }

  async createCustomGroupChat(
    title: string, 
    leagueId: string, 
    createdBy: string, 
    participantIds: string[]
  ): Promise<Conversation> {
    // Create custom group conversation
    const conversation = await this.createConversation({
      type: "custom_group",
      title,
      leagueId,
      createdBy,
    });

    // Add creator as participant
    await this.addParticipantToConversation({
      conversationId: conversation.id,
      userId: createdBy,
    });

    // Add all specified participants
    const participantPromises = participantIds
      .filter(id => id !== createdBy) // Don't duplicate creator
      .map(userId => 
        this.addParticipantToConversation({
          conversationId: conversation.id,
          userId,
        })
      );

    await Promise.all(participantPromises);

    return conversation;
  }

  async addUserToGroupConversation(conversationId: string, userId: string): Promise<ConversationParticipant> {
    // Check if conversation is a group conversation
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type === "direct") {
      throw new Error("Can only add users to group conversations");
    }

    // Check if user is already in conversation
    const existingParticipant = await this.isUserInConversation(userId, conversationId);
    if (existingParticipant) {
      throw new Error("User is already in this conversation");
    }

    return this.addParticipantToConversation({
      conversationId,
      userId,
    });
  }

  async removeUserFromGroupConversation(conversationId: string, userId: string): Promise<void> {
    // Check if conversation is a group conversation
    const conversation = await this.getConversation(conversationId);
    if (!conversation || conversation.type === "direct") {
      throw new Error("Can only remove users from group conversations");
    }

    // Update participant to mark as left
    await db
      .update(conversationParticipants)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId)
        )
      );
  }

  // Enhanced permission checks and captain-only chat functionality
  async isUserCaptain(userId: string, leagueId: string): Promise<boolean> {
    const [captain] = await db
      .select()
      .from(teams)
      .where(and(
        eq(teams.captainId, userId),
        eq(teams.leagueId, leagueId)
      ))
      .limit(1);
    return !!captain;
  }

  async canUserManageConversation(userId: string, conversationId: string): Promise<boolean> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) return false;

    // Creator can always manage
    if (conversation.createdBy === userId) return true;

    // For team group chats, team captain can manage
    if (conversation.type === "team_group" && conversation.teamId) {
      const team = await db
        .select()
        .from(teams)
        .where(eq(teams.id, conversation.teamId))
        .limit(1);
      
      if (team[0] && team[0].captainId === userId) return true;
    }

    // For captain-only chats, any captain in the league can manage
    if (conversation.type === "captain_only") {
      return await this.isUserCaptain(userId, conversation.leagueId);
    }

    return false;
  }

  async createCaptainOnlyChat(leagueId: string, createdBy: string): Promise<Conversation> {
    // Check if captain-only chat already exists for this league
    const [existingChat] = await db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.type, "captain_only"),
        eq(conversations.leagueId, leagueId)
      ))
      .limit(1);

    if (existingChat) {
      return existingChat;
    }

    // Create captain-only conversation
    const conversation = await this.createConversation({
      type: "captain_only",
      title: "Captains Only",
      leagueId,
      createdBy,
    });

    // Add all captains from this league as participants
    const captains = await db
      .select({
        captainId: teams.captainId
      })
      .from(teams)
      .where(eq(teams.leagueId, leagueId))
      .groupBy(teams.captainId);

    const participantPromises = captains
      .filter(captain => captain.captainId) // Filter out null captain IDs
      .map(captain => 
        this.addParticipantToConversation({
          conversationId: conversation.id,
          userId: captain.captainId!,
        })
      );

    await Promise.all(participantPromises);

    return conversation;
  }

  // Automatically sync captain chat membership to reflect current captain status
  async ensureCaptainChatMembership(leagueId: string): Promise<void> {
    // Get or create captain-only chat for this league
    const [existingChat] = await db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.type, "captain_only"),
        eq(conversations.leagueId, leagueId)
      ))
      .limit(1);

    let captainChat: Conversation;
    if (existingChat) {
      captainChat = existingChat;
    } else {
      // Create captain chat if it doesn't exist
      // Use system user or first available captain as creator
      const captains = await db
        .select({ captainId: teams.captainId })
        .from(teams)
        .where(eq(teams.leagueId, leagueId))
        .groupBy(teams.captainId);

      const firstCaptain = captains.find(c => c.captainId);
      if (!firstCaptain?.captainId) {
        // No captains yet, skip creating chat
        return;
      }

      captainChat = await this.createCaptainOnlyChat(leagueId, firstCaptain.captainId);
      return; // createCaptainOnlyChat already adds all captains
    }

    // Get current captains in the league
    const currentCaptains = await db
      .select({ captainId: teams.captainId })
      .from(teams)
      .where(eq(teams.leagueId, leagueId))
      .groupBy(teams.captainId);

    const currentCaptainIds = currentCaptains
      .filter(captain => captain.captainId)
      .map(captain => captain.captainId!);

    // Get current participants in the captain chat
    const currentParticipants = await db
      .select()
      .from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, captainChat.id),
        isNull(conversationParticipants.leftAt)
      ));

    const participantUserIds = currentParticipants.map(p => p.userId);

    // Add new captains to the chat
    const captainsToAdd = currentCaptainIds.filter(captainId => 
      !participantUserIds.includes(captainId)
    );

    for (const captainId of captainsToAdd) {
      await this.addParticipantToConversation({
        conversationId: captainChat.id,
        userId: captainId,
      });
    }

    // Remove users who are no longer captains
    const participantsToRemove = participantUserIds.filter(userId => 
      !currentCaptainIds.includes(userId)
    );

    for (const userId of participantsToRemove) {
      await this.removeUserFromGroupConversation(captainChat.id, userId);
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    // Delete all related data in correct order
    // First, nullify payment requests that reference this conversation
    await db.update(paymentRequests)
      .set({ relatedConversationId: null })
      .where(eq(paymentRequests.relatedConversationId, conversationId));
    
    // Delete chat poll votes (references chat_polls)
    await db.delete(chatPollVotes)
      .where(sql`poll_id IN (SELECT id FROM chat_polls WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ${conversationId}))`);
    
    // Then delete chat polls (references messages)
    await db.delete(chatPolls)
      .where(sql`message_id IN (SELECT id FROM messages WHERE conversation_id = ${conversationId})`);
    
    await db.delete(messageReadReceipts)
      .where(sql`message_id IN (SELECT id FROM messages WHERE conversation_id = ${conversationId})`);
    
    await db.delete(messageAttachments)
      .where(sql`message_id IN (SELECT id FROM messages WHERE conversation_id = ${conversationId})`);
    
    await db.delete(messages)
      .where(eq(messages.conversationId, conversationId));
    
    await db.delete(typingIndicators)
      .where(eq(typingIndicators.conversationId, conversationId));
    
    await db.delete(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));
    
    await db.delete(conversations)
      .where(eq(conversations.id, conversationId));
  }

  async getConversationMemberCount(conversationId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        sql`left_at IS NULL`
      ));
    
    return result?.count || 0;
  }

  async getConversationMembersWithStatus(conversationId: string): Promise<any[]> {
    // First get the conversation to find its leagueId
    const [conversation] = await db
      .select({ leagueId: conversations.leagueId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    
    const leagueId = conversation?.leagueId;
    
    const result = await db
      .select({
        userId: conversationParticipants.userId,
        joinedAt: conversationParticipants.joinedAt,
        user: {
          id: users.id,
          email: users.email,
          firstName: leagueId 
            ? sql<string>`COALESCE(${leagueMemberships.displayFirstName}, ${users.firstName})`.as('firstName')
            : users.firstName,
          lastName: leagueId
            ? sql<string>`COALESCE(${leagueMemberships.displayLastName}, ${users.lastName})`.as('lastName')
            : users.lastName,
          displayName: leagueId
            ? sql<string>`COALESCE(
                COALESCE(${leagueMemberships.displayFirstName}, ${users.firstName}) || ' ' || COALESCE(${leagueMemberships.displayLastName}, ${users.lastName}),
                ${users.email}
              )`.as('displayName')
            : sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`.as('displayName')
        },
        onlineStatus: userOnlineStatus.status,
        lastSeenAt: userOnlineStatus.lastSeenAt
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .leftJoin(userOnlineStatus, eq(users.id, userOnlineStatus.userId))
      .leftJoin(
        leagueMemberships,
        leagueId 
          ? and(
              eq(leagueMemberships.userId, users.id),
              eq(leagueMemberships.leagueId, leagueId)
            )
          : sql`false`
      )
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        sql`conversation_participants.left_at IS NULL`
      ));
    
    return result;
  }

  // Message retrieval
  async getMessageById(messageId: string): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    return message;
  }

  // Chat Poll operations
  async createChatPoll(poll: InsertChatPoll): Promise<ChatPoll> {
    const [newPoll] = await db.insert(chatPolls).values(poll).returning();
    return newPoll;
  }

  async getChatPoll(pollId: string): Promise<ChatPoll | undefined> {
    const [poll] = await db
      .select()
      .from(chatPolls)
      .where(eq(chatPolls.id, pollId))
      .limit(1);
    return poll;
  }

  async getChatPollsByMessage(messageId: string): Promise<ChatPoll[]> {
    return await db
      .select()
      .from(chatPolls)
      .where(eq(chatPolls.messageId, messageId));
  }

  async voteOnChatPoll(vote: InsertChatPollVote): Promise<ChatPollVote> {
    const [newVote] = await db.insert(chatPollVotes).values(vote).returning();
    return newVote;
  }

  async getChatPollResults(pollId: string): Promise<(ChatPollVote & { user: any })[]> {
    // Get the leagueId through poll -> message -> conversation
    const [pollInfo] = await db
      .select({ leagueId: conversations.leagueId })
      .from(chatPolls)
      .innerJoin(messages, eq(chatPolls.messageId, messages.id))
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(eq(chatPolls.id, pollId))
      .limit(1);
    
    const leagueId = pollInfo?.leagueId;
    
    const results = await db
      .select({
        id: chatPollVotes.id,
        pollId: chatPollVotes.pollId,
        userId: chatPollVotes.userId,
        optionIndex: chatPollVotes.optionIndex,
        createdAt: chatPollVotes.createdAt,
        user: {
          id: users.id,
          email: users.email,
          firstName: leagueId 
            ? sql<string>`COALESCE(${leagueMemberships.displayFirstName}, ${users.firstName})`.as('firstName')
            : users.firstName,
          lastName: leagueId
            ? sql<string>`COALESCE(${leagueMemberships.displayLastName}, ${users.lastName})`.as('lastName')
            : users.lastName,
          displayName: leagueId
            ? sql<string>`COALESCE(
                COALESCE(${leagueMemberships.displayFirstName}, ${users.firstName}) || ' ' || COALESCE(${leagueMemberships.displayLastName}, ${users.lastName}),
                ${users.email}
              )`.as('displayName')
            : sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`.as('displayName')
        }
      })
      .from(chatPollVotes)
      .innerJoin(users, eq(chatPollVotes.userId, users.id))
      .leftJoin(
        leagueMemberships,
        leagueId 
          ? and(
              eq(leagueMemberships.userId, users.id),
              eq(leagueMemberships.leagueId, leagueId)
            )
          : sql`false`
      )
      .where(eq(chatPollVotes.pollId, pollId));
    
    return results as (ChatPollVote & { user: any })[];
  }

  async closeChatPoll(pollId: string): Promise<ChatPoll> {
    const [closedPoll] = await db
      .update(chatPolls)
      .set({ status: "closed" })
      .where(eq(chatPolls.id, pollId))
      .returning();
    return closedPoll;
  }

  async getUserVoteOnPoll(pollId: string, userId: string): Promise<ChatPollVote | undefined> {
    const [vote] = await db
      .select()
      .from(chatPollVotes)
      .where(and(
        eq(chatPollVotes.pollId, pollId),
        eq(chatPollVotes.userId, userId)
      ))
      .limit(1);
    return vote;
  }
}

export const messagingService = new MessagingService();