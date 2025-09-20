import {
  conversations,
  conversationParticipants,
  messages,
  messageAttachments,
  messageReadReceipts,
  typingIndicators,
  userOnlineStatus,
  users,
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
import { eq, and, desc, sql } from "drizzle-orm";

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

  async getConversationMessages(conversationId: string, limit: number = 50): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(limit);
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
          sql`${messages.conversationId} = ANY(${conversationIds})`,
          sql`${messages.senderId} != ${userId}`, // Don't count user's own messages
          sql`${messageReadReceipts.id} IS NULL` // Messages without read receipts
        )
      );

    return result?.count ?? 0;
  }
}

export const messagingService = new MessagingService();