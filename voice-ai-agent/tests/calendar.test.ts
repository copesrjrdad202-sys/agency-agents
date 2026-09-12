import { test } from 'node:test';
import assert from 'node:assert';
import {
  checkAvailability,
  bookAppointment,
  resetMockCalendar,
} from '../src/services/calendar';

test('calendar: checkAvailability returns all business-hour slots for a date', async () => {
  resetMockCalendar();
  const slots = await checkAvailability('2026-09-10');
  assert.ok(slots.length > 0, 'should return at least one slot');
  assert.ok(slots.every((s) => s.date === '2026-09-10'));
  assert.ok(slots.every((s) => s.available === true));
});

test('calendar: checkAvailability with a specific time returns one slot', async () => {
  resetMockCalendar();
  const slots = await checkAvailability('2026-09-10', '9:00');
  assert.strictEqual(slots.length, 1);
  assert.strictEqual(slots[0].time, '09:00');
});

test('calendar: bookAppointment marks the slot unavailable afterward', async () => {
  resetMockCalendar();
  const booking = await bookAppointment({
    clientName: 'Jane Doe',
    phoneNumber: '+15551234567',
    date: '2026-09-10',
    time: '9:00',
    serviceType: 'AC repair',
  });
  assert.strictEqual(booking.confirmed, true);
  assert.ok(booking.confirmationId.startsWith('MOCK-'));

  const slots = await checkAvailability('2026-09-10', '9:00');
  assert.strictEqual(slots[0].available, false);
});

test('calendar: bookAppointment rejects double-booking the same slot', async () => {
  resetMockCalendar();
  await bookAppointment({
    clientName: 'Jane Doe',
    phoneNumber: '+15551234567',
    date: '2026-09-10',
    time: '10:00',
    serviceType: 'AC repair',
  });

  await assert.rejects(
    bookAppointment({
      clientName: 'John Smith',
      phoneNumber: '+15559876543',
      date: '2026-09-10',
      time: '10:00',
      serviceType: 'Plumbing',
    }),
    /already booked/
  );
});

test('calendar: normalizes am/pm time formats consistently', async () => {
  resetMockCalendar();
  await bookAppointment({
    clientName: 'Jane Doe',
    phoneNumber: '+15551234567',
    date: '2026-09-11',
    time: '2:00 pm',
    serviceType: 'AC repair',
  });
  const slots = await checkAvailability('2026-09-11', '14:00');
  assert.strictEqual(slots[0].available, false);
});
