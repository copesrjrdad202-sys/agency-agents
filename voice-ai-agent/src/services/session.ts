import { ConversationSession, ConversationMessage } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Simple in-memory session store keyed by sessionId.
 * Swap this out for Redis/SQLite in production by implementing the same interface.
 */
const sessions = new Map<string, ConversationSession>();

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes of inactivity

export function createSession(callerPhone?: string): ConversationSession {
  const sessionId = uuidv4();
  const now = Date.now();
  const session: ConversationSession = {
    sessionId,
    callerPhone,
    messages: [],
    createdAt: now,
    updatedAt: now,
    bookingState: {},
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): ConversationSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return undefined;
  }
  return session;
}

export function getOrCreateSession(sessionId?: string, callerPhone?: string): ConversationSession {
  if (sessionId) {
    const existing = getSession(sessionId);
    if (existing) return existing;
  }
  return createSession(callerPhone);
}

export function appendMessage(sessionId: string, message: ConversationMessage): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.messages.push(message);
  session.updatedAt = Date.now();
}

export function updateBookingState(
  sessionId: string,
  partial: Partial<ConversationSession['bookingState']>
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.bookingState = { ...session.bookingState, ...partial };
  session.updatedAt = Date.now();
}

export function clearExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function getAllSessions(): ConversationSession[] {
  return Array.from(sessions.values());
}
