const { test } = require('node:test');
const assert = require('node:assert');

test('Chain of Custody State Machine: Lifecycle & Ledger Invariant', () => {
  // Simulate hospital inventory ledgers
  const lasuthInventory = {
    hospital: 'LASUTH',
    bloodGroup: 'B-',
    units: 6, // physical units in building
    reservedUnits: 0,
    get available() {
      return Math.max(0, this.units - this.reservedUnits);
    },
  };

  const luthInventory = {
    hospital: 'LUTH',
    bloodGroup: 'B-',
    units: 0,
    reservedUnits: 0,
    get available() {
      return Math.max(0, this.units - this.reservedUnits);
    },
  };

  // State 1: PENDING
  // LUTH requests 1 unit of B- from LASUTH
  const request = {
    id: 'REQ-B-001',
    requestingHospital: 'LUTH',
    supplyingHospital: 'LASUTH',
    bloodGroup: 'B-',
    units: 1,
    status: 'pending',
    requestedAt: new Date(),
  };

  assert.strictEqual(request.status, 'pending');
  assert.strictEqual(lasuthInventory.units, 6);
  assert.strictEqual(lasuthInventory.available, 6);
  assert.strictEqual(lasuthInventory.reservedUnits, 0);
  assert.strictEqual(luthInventory.units, 0);

  // State 2: APPROVED
  // LASUTH admin clicks "Approve". 1 unit moves to Reserved.
  // Invariant: Physical units at LASUTH MUST NOT be deducted yet (blood is still in building).
  const approveRequest = (req, supplierInv) => {
    assert.strictEqual(req.status, 'pending');
    assert.ok(supplierInv.available >= req.units, 'Must have sufficient available units');
    supplierInv.reservedUnits += req.units;
    req.status = 'approved';
    req.approvedAt = new Date();
  };

  approveRequest(request, lasuthInventory);

  assert.strictEqual(request.status, 'approved');
  assert.strictEqual(lasuthInventory.units, 6, 'Physical inventory must remain 6 (still in building)');
  assert.strictEqual(lasuthInventory.available, 5, 'Available inventory is now 5');
  assert.strictEqual(lasuthInventory.reservedUnits, 1, 'Reserved inventory is now 1');

  // State 3: PACKED / DISPATCHED
  // Lab tech scans unit, packages in cold box, and hands to courier.
  // Invariant: Units move from Reserved to In-Transit, and NOW physically deduct from LASUTH ledger.
  const dispatchRequest = (req, supplierInv, courierInfo) => {
    assert.strictEqual(req.status, 'approved');
    supplierInv.reservedUnits = Math.max(0, supplierInv.reservedUnits - req.units);
    supplierInv.units = Math.max(0, supplierInv.units - req.units); // Officially leaves building!
    req.status = 'dispatched';
    req.dispatchedAt = new Date();
    req.courierName = courierInfo.courierName;
    req.coldBoxSealNumber = courierInfo.coldBoxSealNumber;
  };

  dispatchRequest(request, lasuthInventory, {
    courierName: 'MedEx Cold Chain Logistics',
    coldBoxSealNumber: 'SEAL-4921',
  });

  assert.strictEqual(request.status, 'dispatched');
  assert.strictEqual(lasuthInventory.units, 5, 'LASUTH physical inventory is now officially 5');
  assert.strictEqual(lasuthInventory.available, 5, 'LASUTH available inventory is 5');
  assert.strictEqual(lasuthInventory.reservedUnits, 0, 'Reservation released as it enters transit');
  assert.strictEqual(luthInventory.units, 0, 'Recipient has not received units yet');

  // State 4: DELIVERED / COMPLETED
  // LUTH receives unit, verifies seal and cold chain temperature, and confirms intake.
  // Invariant: Units added to LUTH's ledger.
  const completeRequest = (req, recipientInv, intakeInfo) => {
    assert.strictEqual(req.status, 'dispatched');
    assert.ok(intakeInfo.temperatureOnArrival >= 2.0 && intakeInfo.temperatureOnArrival <= 10.0, 'Cold chain intact');
    recipientInv.units += req.units;
    req.status = 'completed';
    req.completedAt = new Date();
    req.temperatureOnArrival = intakeInfo.temperatureOnArrival;
  };

  completeRequest(request, luthInventory, {
    temperatureOnArrival: 4.2,
  });

  assert.strictEqual(request.status, 'completed');
  assert.strictEqual(lasuthInventory.units, 5, 'LASUTH ledger permanently 5');
  assert.strictEqual(luthInventory.units, 1, 'LUTH ledger increased to 1');
  assert.strictEqual(luthInventory.available, 1, 'LUTH available is 1');
});

test('Chain of Custody: Cancellation Releases Reservation Before Dispatch', () => {
  const lasuthInventory = {
    units: 6,
    reservedUnits: 0,
    get available() {
      return Math.max(0, this.units - this.reservedUnits);
    },
  };

  const req = { status: 'pending', units: 2 };

  // Approve -> reserve 2 units
  lasuthInventory.reservedUnits += req.units;
  req.status = 'approved';
  assert.strictEqual(lasuthInventory.available, 4);
  assert.strictEqual(lasuthInventory.units, 6);

  // Cancel while approved -> reservation released, physical stock never touched
  lasuthInventory.reservedUnits = Math.max(0, lasuthInventory.reservedUnits - req.units);
  req.status = 'cancelled';

  assert.strictEqual(lasuthInventory.units, 6, 'Physical inventory unchanged');
  assert.strictEqual(lasuthInventory.reservedUnits, 0, 'Reservation released');
  assert.strictEqual(lasuthInventory.available, 6, 'All units available again');
});

test('Chain of Custody: Cannot Cancel Request After Physical Dispatch', () => {
  const req = { status: 'dispatched' };
  const canCancel = (status) => status === 'pending' || status === 'approved';

  assert.strictEqual(canCancel(req.status), false, 'Cannot cancel after units physically leave');
});
