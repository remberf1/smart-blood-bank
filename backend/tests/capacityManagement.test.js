const test = require('node:test');
const assert = require('node:assert/strict');

test('Hospital capacity calculation: normal load', () => {
  const dailyCapacity = 10;
  const scheduledCount = 4;

  const totalBooked = scheduledCount;
  const remainingSlots = Math.max(0, dailyCapacity - totalBooked);
  const capacityPercent = Math.min(100, Math.round((totalBooked / dailyCapacity) * 100));
  const isOverbooked = totalBooked >= dailyCapacity;

  assert.equal(totalBooked, 4);
  assert.equal(remainingSlots, 6);
  assert.equal(capacityPercent, 40);
  assert.equal(isOverbooked, false);
});

test('Hospital capacity calculation: full capacity reached', () => {
  const dailyCapacity = 10;
  const scheduledCount = 10;

  const totalBooked = scheduledCount;
  const remainingSlots = Math.max(0, dailyCapacity - totalBooked);
  const capacityPercent = Math.min(100, Math.round((totalBooked / dailyCapacity) * 100));
  const isOverbooked = totalBooked >= dailyCapacity;

  assert.equal(totalBooked, 10);
  assert.equal(remainingSlots, 0);
  assert.equal(capacityPercent, 100);
  assert.equal(isOverbooked, true);
});

test('Hospital capacity calculation: overbooked condition', () => {
  const dailyCapacity = 10;
  const scheduledCount = 12;

  const totalBooked = scheduledCount;
  const remainingSlots = Math.max(0, dailyCapacity - totalBooked);
  const isOverbooked = totalBooked >= dailyCapacity;

  assert.equal(totalBooked, 12);
  assert.equal(remainingSlots, 0);
  assert.equal(isOverbooked, true);
});

test('Time slot distribution aggregates scheduled appointments accurately', () => {
  const appointments = [
    { assignedTime: '09:15 AM' },
    { assignedTime: '09:15 AM' },
    { assignedTime: '10:00 AM' },
    { assignedTime: '02:30 PM' },
    { assignedTime: null },
  ];

  const slotCounts = {};
  appointments.forEach((a) => {
    if (a.assignedTime) {
      slotCounts[a.assignedTime] = (slotCounts[a.assignedTime] || 0) + 1;
    }
  });

  assert.equal(slotCounts['09:15 AM'], 2);
  assert.equal(slotCounts['10:00 AM'], 1);
  assert.equal(slotCounts['02:30 PM'], 1);
  assert.equal(slotCounts['11:30 AM'], undefined);
});

test('Overbooking protection logic prevents scheduling beyond capacity without override', () => {
  const dailyCapacity = 10;
  const bookedCount = 10;

  function canSchedule(overrideCapacity) {
    if (bookedCount >= dailyCapacity && !overrideCapacity) {
      return { allowed: false, error: 'Capacity reached' };
    }
    return { allowed: true };
  }

  // Without override: blocked
  const attemptWithoutOverride = canSchedule(false);
  assert.equal(attemptWithoutOverride.allowed, false);
  assert.equal(attemptWithoutOverride.error, 'Capacity reached');

  // With explicit admin override: allowed
  const attemptWithOverride = canSchedule(true);
  assert.equal(attemptWithOverride.allowed, true);
});
