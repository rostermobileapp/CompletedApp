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
  teams,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

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
    const result = await db
      .select({
        // Get participant fields
        id: conversationParticipants.id,
        conversationId: conversationParticipants.conversationId, 
        userId: conversationParticipants.userId,
        joinedAt: conversationParticipants.joinedAt,
        // Get user fields and create user object
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          displayName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`.as('displayName')
        }
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
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
    const [message] = await db
      .insert(messages)
      .values(data)
      .returning();
    return message;
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
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.conversationId, conversationId))
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
          leagueId ? eq(conversations.leagueId, leagueId) : sql`true`
        )
      )
      .orderBy(desc(conversations.updatedAt));

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

  // Group conversation operations
  async createTeamGroupChat(teamId: string, leagueId: string, createdBy: string): Promise<Conversation> {
    // Get all approved team members first (needed for both existing and new chats)
    const teamMembers = await db
      .select({ userId: teamMemberships.userId })
      .from(teamMemberships)
      .where(and(
        eq(teamMemberships.teamId, teamId),
        eq(teamMemberships.status, 'approved')
      ));

    console.log(`[DEBUG] Team group chat: Found ${teamMembers.length} team members for team ${teamId}:`, teamMembers.map(m => m.userId));

    // Helper function to ensure participants are added (idempotent with conflict resolution)
    const ensureParticipants = async (conversationId: string) => {
      if (teamMembers.length === 0) {
        console.log(`[DEBUG] No team members to add for conversation ${conversationId}`);
        return;
      }
      
      try {
        console.log(`[DEBUG] Adding ${teamMembers.length} participants to conversation ${conversationId}`);
        await db.insert(conversationParticipants)
          .values(teamMembers.map(member => ({
            conversationId,
            userId: member.userId,
          })))
          .onConflictDoNothing({
            target: [conversationParticipants.conversationId, conversationParticipants.userId]
          });
        console.log(`[DEBUG] Successfully added participants to conversation ${conversationId}`);
      } catch (error) {
        console.error(`[DEBUG] Failed to add participants to conversation ${conversationId}:`, error);
        throw error;
      }
    };

    // Check if team group chat already exists
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

    if (existingChat) {
      console.log(`[DEBUG] Found existing team group conversation ${existingChat.id}, checking participants`);
      
      // Check if existing conversation has participants
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, existingChat.id));
      
      console.log(`[DEBUG] Existing conversation ${existingChat.id} has ${count} participants`);
      
      if (count === 0) {
        console.log(`[DEBUG] Repairing existing conversation ${existingChat.id} by adding missing participants`);
        await ensureParticipants(existingChat.id);
      }
      
      return existingChat;
    }

    // Get team name for the conversation title
    const [team] = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    const teamName = team?.name || 'Team';

    // Create team group conversation
    const conversation = await this.createConversation({
      type: "team_group",
      title: `${teamName} Team Chat`,
      leagueId,
      teamId,
      createdBy,
    });

    console.log(`[DEBUG] Created new team group conversation ${conversation.id}, adding participants`);

    // Add all team members as participants using bulk insert
    await ensureParticipants(conversation.id);

    return conversation;
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
}

export const messagingService = new MessagingService();