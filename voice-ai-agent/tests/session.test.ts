import { test } from 'node:test';
import assert from 'node:assert';
import {
  createSession,
  getSession,
  appendMessage,
  updateBookingState,
} from '../src/services/session';

test('session: createSession returns a session with empty history', () => {
  const session = createSession('+15551234567');
  assert.ok(session.sessionId);
  assert.strictEqual(session.callerPhone, '+15551234567');
  assert.deepStrictEqual(session.messages, []);
});

test('session: getSession retrieves a previously created session', () => {
  const created = createSession();
  const fetched = getSession(created.sessionId);
  assert.ok(fetched);
  assert.strictEqual(fetched?.sessionId, created.sessionId);
});

test('session: getSession returns undefined for unknown id', () => {
  const fetched = getSession('nonexistent-id');
  assert.strictEqual(fetched, undefined);
});

test('session: appendMessage adds to history and updates timestamp', () => {
  const session = createSession();
  const before = session.updatedAt;
  appendMessage(session.sessionId, {
    role: 'user',
    content: 'Hi, I need an AC repair.',
    timestamp: Date.now(),
  });
  const fetched = getSession(session.sessionId);
  assert.strictEqual(fetched?.messages.length, 1);
  assert.ok((fetched?.updatedAt || 0) >= before);
});

test('session: updateBookingState merges partial booking details', () => {
  const session = createSession();
  updateBookingState(session.sessionId, { clientName: 'Jane Doe' });
  updateBookingState(session.sessionId, { date: '2026-09-10' });
  const fetched = getSession(session.sessionId);
  assert.strictEqual(fetched?.bookingState.clientName, 'Jane Doe');
  assert.strictEqual(fetched?.bookingState.date, '2026-09-10');
});
