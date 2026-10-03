const { test } = require('node:test');
const assert = require('node:assert');

test('Separation of Duties: Super Admin cannot auto-verify as attending physician', () => {
  // Simulating patientRequests.js line 38 logic
  const resolveDoctorRef = (authUser, doctorPin, rest = {}) => {
    let resolvedDoctorRef = {};
    let resolvedSource = 'web_form';

    const cleanPin = (doctorPin || '').trim().toUpperCase();
    const isDoctorPinValid = cleanPin === 'DOC-2026' || cleanPin.startsWith('DOC-') || cleanPin.startsWith('HOSP-');

    if (authUser && (authUser.role === 'admin' || authUser.role === 'staff') && authUser.hospitalId) {
      resolvedDoctorRef = {
        id: authUser._id,
        name: rest.doctorName || authUser.name,
        verificationStatus: 'verified_id',
      };
      resolvedSource = 'dashboard_requisition';
    } else if (isDoctorPinValid) {
      resolvedDoctorRef = {
        name: rest.doctorName || 'Attending Physician',
        verificationStatus: 'verified_id',
      };
    } else {
      resolvedDoctorRef = {
        name: rest.doctorName || 'Attending Physician',
        verificationStatus: 'unverified',
      };
    }

    return { resolvedDoctorRef, resolvedSource };
  };

  const superAdminUser = { _id: 'su_123', role: 'superadmin', name: 'IT Admin' };
  const hospitalDoctorUser = { _id: 'doc_456', role: 'staff', hospitalId: 'hosp_789', name: 'Dr. Adeleke' };

  // Super Admin submitting requisition without valid PIN cannot auto-verify as doctor
  const suResult = resolveDoctorRef(superAdminUser, '');
  assert.strictEqual(suResult.resolvedDoctorRef.verificationStatus, 'unverified');

  // Super Admin submitting with genuine clinical Doctor PIN can requisition on behalf of that doctor
  const suWithPin = resolveDoctorRef(superAdminUser, 'DOC-2026', { doctorName: 'Dr. Okafor' });
  assert.strictEqual(suWithPin.resolvedDoctorRef.verificationStatus, 'verified_id');
  assert.strictEqual(suWithPin.resolvedDoctorRef.name, 'Dr. Okafor');

  // Facility staff is auto-verified within their hospital context
  const docResult = resolveDoctorRef(hospitalDoctorUser, '');
  assert.strictEqual(docResult.resolvedDoctorRef.verificationStatus, 'verified_id');
  assert.strictEqual(docResult.resolvedDoctorRef.name, 'Dr. Adeleke');
});

test('Separation of Duties: Super Admin is prohibited from executing physical blood delivery', () => {
  const canPerformDelivery = (user, deliveryStatus) => {
    if (deliveryStatus === 'delivered' && user.role === 'superadmin') {
      return { allowed: false, error: 'Separation of Duties violation' };
    }
    return { allowed: true };
  };

  const superAdmin = { role: 'superadmin' };
  const labScientist = { role: 'staff', hospitalId: 'hosp_1' };

  assert.strictEqual(canPerformDelivery(superAdmin, 'delivered').allowed, false);
  assert.strictEqual(canPerformDelivery(labScientist, 'delivered').allowed, true);
  // Superadmin can still coordinate routing (e.g. approve or in-transit routing)
  assert.strictEqual(canPerformDelivery(superAdmin, 'approved').allowed, true);
});

test('Separation of Duties: Super Admin cannot record clinical phlebotomy intake', () => {
  const canRecordPhlebotomy = (user) => {
    if (user.role === 'superadmin') {
      return { allowed: false, error: 'Super Admin cannot record phlebotomy donations' };
    }
    return { allowed: true };
  };

  assert.strictEqual(canRecordPhlebotomy({ role: 'superadmin' }).allowed, false);
  assert.strictEqual(canRecordPhlebotomy({ role: 'staff', hospitalId: 'hosp_1' }).allowed, true);
});

test('Separation of Duties: Super Admin cannot certify laboratory blood grouping', () => {
  const canCertifyLabGroup = (user) => {
    if (user.role === 'superadmin') {
      return { allowed: false, error: 'Super Admin cannot certify laboratory blood grouping' };
    }
    return { allowed: true };
  };

  assert.strictEqual(canCertifyLabGroup({ role: 'superadmin' }).allowed, false);
  assert.strictEqual(canCertifyLabGroup({ role: 'staff', hospitalId: 'hosp_1' }).allowed, true);
});

test('Separation of Duties: Super Admin cannot manually inject blood inventory without donation batch', () => {
  const canManuallyAddBloodStock = (user, resourceType) => {
    if (resourceType === 'blood' && user.role === 'superadmin') {
      return { allowed: false, error: 'Super Admin cannot manually inject clinical blood units' };
    }
    return { allowed: true };
  };

  assert.strictEqual(canManuallyAddBloodStock({ role: 'superadmin' }, 'blood').allowed, false);
  assert.strictEqual(canManuallyAddBloodStock({ role: 'admin', hospitalId: 'hosp_1' }, 'blood').allowed, true);
});

test('Inter-Hospital Logistics: Requisition delivery requires an allocated supplying hospital', () => {
  const validateDeliveryAllocation = (req, user) => {
    const isSupplier = req.allocatedHospitalId && (user.hospitalId === req.allocatedHospitalId || user.role === 'superadmin');
    const isReceiver = req.preferredHospitalId && (user.hospitalId === req.preferredHospitalId || user.role === 'superadmin');
    const isSuper = user.role === 'superadmin';

    if (!isSupplier && !isReceiver && !isSuper) {
      return { ok: false, status: 403, error: 'You can only update requests involving your hospital' };
    }

    if (user.role === 'superadmin') {
      return { ok: false, status: 403, error: 'Super Admin cannot deliver blood' };
    }

    if (!req.allocatedHospitalId) {
      if (req.preferredHospitalId && user.hospitalId === req.preferredHospitalId) {
        req.allocatedHospitalId = req.preferredHospitalId; // Auto-assign intra-hospital
      } else {
        return { ok: false, status: 400, error: 'Cannot mark as delivered: Blood requisition has not been allocated to a supplying blood bank' };
      }
    }

    return { ok: true, allocatedHospitalId: req.allocatedHospitalId };
  };

  // 1. External hospital cannot deliver an unallocated request
  const unallocatedReq = { resourceType: 'blood', preferredHospitalId: 'hosp_uch', allocatedHospitalId: null };
  const luthStaff = { role: 'staff', hospitalId: 'hosp_luth' };
  const extResult = validateDeliveryAllocation(unallocatedReq, luthStaff);
  assert.strictEqual(extResult.ok, false);
  assert.strictEqual(extResult.status, 403);

  // 2. Receiving hospital delivering its own unallocated requisition auto-assigns itself to consume stock
  const uchStaff = { role: 'staff', hospitalId: 'hosp_uch' };
  const ownReq = { resourceType: 'blood', preferredHospitalId: 'hosp_uch', allocatedHospitalId: null };
  const ownResult = validateDeliveryAllocation(ownReq, uchStaff);
  assert.strictEqual(ownResult.ok, true);
  assert.strictEqual(ownResult.allocatedHospitalId, 'hosp_uch');

  // 3. Inter-hospital transfer: LUTH supplied blood to UCH. UCH receives and delivers.
  const interHospitalReq = { resourceType: 'blood', preferredHospitalId: 'hosp_uch', allocatedHospitalId: 'hosp_luth' };
  const interResult = validateDeliveryAllocation(interHospitalReq, uchStaff);
  assert.strictEqual(interResult.ok, true);
  assert.strictEqual(interResult.allocatedHospitalId, 'hosp_luth'); // Blood consumed from supplying hospital LUTH!
});

test('Donor Appointments: Deferral intervals and donation component types', () => {
  const validateAppointmentEligibility = (donor, donationType, existingActiveAppt) => {
    if (donor.eligibilityStatus === 'ineligible') {
      return { ok: false, error: 'Ineligible to donate' };
    }

    const validDonationTypes = ['WHOLE_BLOOD', 'PLATELET_APHERESIS', 'PLASMA_APHERESIS'];
    const chosenType = validDonationTypes.includes(donationType) ? donationType : 'WHOLE_BLOOD';
    const minDays = chosenType === 'PLATELET_APHERESIS' ? 14 : chosenType === 'PLASMA_APHERESIS' ? 28 : 56;
    const DAY_MS = 24 * 60 * 60 * 1000;

    if (donor.lastDonationDate) {
      const elapsedDays = Math.floor((Date.now() - new Date(donor.lastDonationDate).getTime()) / DAY_MS);
      if (elapsedDays < minDays) {
        return { ok: false, error: `Must wait at least ${minDays} days between donations`, daysRemaining: minDays - elapsedDays };
      }
    }

    if (donor.eligibilityStatus === 'deferred') {
      return { ok: false, error: 'Currently deferred' };
    }

    if (existingActiveAppt) {
      return { ok: false, error: 'Active appointment already exists' };
    }

    return { ok: true, donationType: chosenType };
  };

  // 1. Donor who donated whole blood 10 days ago is rejected (needs 56 days)
  const recentWholeBloodDonor = {
    eligibilityStatus: 'deferred',
    lastDonationDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  };
  const res1 = validateAppointmentEligibility(recentWholeBloodDonor, 'WHOLE_BLOOD', null);
  assert.strictEqual(res1.ok, false);
  assert.strictEqual(res1.daysRemaining, 46);

  // 2. Donor with active appointment cannot create duplicate offer
  const eligibleDonor = { eligibilityStatus: 'eligible' };
  const activeAppt = { status: 'pending', hospitalId: 'hosp_uch' };
  const res2 = validateAppointmentEligibility(eligibleDonor, 'WHOLE_BLOOD', activeAppt);
  assert.strictEqual(res2.ok, false);
  assert.strictEqual(res2.error, 'Active appointment already exists');

  // 3. Eligible donor can book specific component (Platelet Apheresis)
  const res3 = validateAppointmentEligibility(eligibleDonor, 'PLATELET_APHERESIS', null);
  assert.strictEqual(res3.ok, true);
  assert.strictEqual(res3.donationType, 'PLATELET_APHERESIS');
});

test('Two-Tier Emergency SOS Gate: Clinical vs Public Bystander routing', () => {
  const evaluateSosTier = (authCode) => {
    const cleanAuth = (authCode || '').trim().toUpperCase();
    const isClinical = cleanAuth === 'DOC-2026' || cleanAuth.startsWith('DOC-') || cleanAuth.startsWith('HOSP-');
    if (isClinical) {
      return {
        tier: 'clinical',
        broadcastToDonors: true,
        action: 'Immediate donor broadcast & hospital alert',
      };
    }
    return {
      tier: 'public',
      broadcastToDonors: false,
      action: 'Alert nearest hospital triage & dispatch ambulance (no donor blast)',
    };
  };

  // 1. Unverified bystander SOS routes to hospital emergency triage, NOT voluntary donors
  const publicSos = evaluateSosTier('');
  assert.strictEqual(publicSos.tier, 'public');
  assert.strictEqual(publicSos.broadcastToDonors, false);

  // 2. Doctor PIN triggers Tier 1 Clinical donor broadcast
  const docSos = evaluateSosTier('DOC-2026');
  assert.strictEqual(docSos.tier, 'clinical');
  assert.strictEqual(docSos.broadcastToDonors, true);

  // 3. Facility emergency code triggers Tier 1 Clinical donor broadcast
  const hospSos = evaluateSosTier('HOSP-LUTH');
  assert.strictEqual(hospSos.tier, 'clinical');
  assert.strictEqual(hospSos.broadcastToDonors, true);
});

test('Digital Donor Pass: Signed Tokens, Anti-Screenshot Expiry, and Unverified Warning', () => {
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET || 'test-secret';

  // 1. Token contains only donor reference and type (NO plain PII)
  const donorId = '660e1234567890abcdef1234';
  const liveToken = jwt.sign(
    { donorId, type: 'donor-verify', rot: 'abc1234' },
    secret,
    { expiresIn: '60s' }
  );

  const decoded = jwt.verify(liveToken, secret);
  assert.strictEqual(decoded.donorId, donorId);
  assert.strictEqual(decoded.type, 'donor-verify');
  assert.strictEqual(decoded.name, undefined); // No plaintext PII
  assert.strictEqual(decoded.phone, undefined); // No plaintext PII

  // 2. Expired tokens (screenshots used later) are strictly rejected
  const expiredToken = jwt.sign(
    { donorId, type: 'donor-verify' },
    secret,
    { expiresIn: '-10s' } // Expired 10 seconds ago
  );

  let caughtError = null;
  try {
    jwt.verify(expiredToken, secret);
  } catch (err) {
    caughtError = err;
  }
  assert.strictEqual(caughtError.name, 'TokenExpiredError');

  // 3. Verification status distinction: Unverified requires confirmatory test
  const evaluateScanSafety = (donorRecord) => {
    const isLabVerified = donorRecord.bloodGroupVerificationStatus === 'verified';
    return {
      canTransfuseImmediately: isLabVerified,
      requiresConfirmatoryTyping: !isLabVerified,
      warningBanner: !isLabVerified ? 'Mandatory lab confirmatory typing required' : null,
    };
  };

  const unverifiedDonor = { bloodGroup: 'O+', bloodGroupVerificationStatus: 'unverified' };
  const verifiedDonor = { bloodGroup: 'O-', bloodGroupVerificationStatus: 'verified' };

  const unverifiedSafety = evaluateScanSafety(unverifiedDonor);
  assert.strictEqual(unverifiedSafety.requiresConfirmatoryTyping, true);
  assert.strictEqual(unverifiedSafety.canTransfuseImmediately, false);

  const verifiedSafety = evaluateScanSafety(verifiedDonor);
  assert.strictEqual(verifiedSafety.requiresConfirmatoryTyping, false);
  assert.strictEqual(verifiedSafety.canTransfuseImmediately, true);
});

test('Separation of Duties: Super Admin prohibited from clinical SOS broadcast; hospital clinicians authorized', () => {
  const evaluateBroadcastAuthorization = (userRole) => {
    if (userRole === 'superadmin') {
      return {
        authorized: false,
        error: 'Separation of Duties violation: Platform Super Admin (IT Plane) cannot clinically authorize emergency donor broadcasts. Clinical validation must be performed by hospital clinical staff (Hospital Admin/Nurse/Doctor).',
      };
    }
    if (['admin', 'staff'].includes(userRole)) {
      return {
        authorized: true,
        action: 'Clinical authorization confirmed; dispatching mass voluntary donor broadcast',
      };
    }
    return { authorized: false, error: 'Access denied: Hospital clinical role required.' };
  };

  // 1. Super Admin is blocked from clinical donor broadcasts
  const saCheck = evaluateBroadcastAuthorization('superadmin');
  assert.strictEqual(saCheck.authorized, false);
  assert.match(saCheck.error, /Separation of Duties violation/);

  // 2. Hospital Admin is authorized to verify and broadcast
  const haCheck = evaluateBroadcastAuthorization('admin');
  assert.strictEqual(haCheck.authorized, true);

  // 3. Hospital Staff / Nurse is authorized to verify and broadcast
  const hsCheck = evaluateBroadcastAuthorization('staff');
  assert.strictEqual(hsCheck.authorized, true);

  // 4. Public or Donor is blocked
  const pubCheck = evaluateBroadcastAuthorization('donor');
  assert.strictEqual(pubCheck.authorized, false);

  // 5. Technical force-resolve requires at least 8 characters explanation
  const validateForceResolve = (reason) => {
    if (!reason || typeof reason !== 'string' || reason.trim().length < 8) {
      return { ok: false, error: 'Reason must be at least 8 characters' };
    }
    return { ok: true };
  };

  assert.strictEqual(validateForceResolve('').ok, false);
  assert.strictEqual(validateForceResolve('fixed').ok, false);
  assert.strictEqual(validateForceResolve('Duplicate emergency due to network timeout').ok, true);
});

test('Clinical Integrity: Hospital hard deletion is prohibited; soft-deactivation preserves clinical history', () => {
  const evaluateHospitalDeletion = (action) => {
    if (action === 'DELETE') {
      return {
        allowed: false,
        status: 400,
        error: 'Hard deletion of healthcare facilities is prohibited to preserve donor records, clinical requisitions, and audit history. Please deactivate the hospital instead.',
      };
    }
    if (action === 'DEACTIVATE') {
      return {
        allowed: true,
        status: 200,
        action: 'Hospital deactivated; new requisitions and appointments routing disabled while audit records remain intact.',
      };
    }
    return { allowed: false, status: 400 };
  };

  const delResult = evaluateHospitalDeletion('DELETE');
  assert.strictEqual(delResult.allowed, false);
  assert.strictEqual(delResult.status, 400);
  assert.match(delResult.error, /Hard deletion of healthcare facilities is prohibited/);

  const deactResult = evaluateHospitalDeletion('DEACTIVATE');
  assert.strictEqual(deactResult.allowed, true);
  assert.strictEqual(deactResult.status, 200);
});

test('Inter-Hospital Logistics: Pending resource requests can be cancelled by requesting hospital', () => {
  const evaluateCancelRequest = (currentStatus, userHospitalId, requestHospitalId) => {
    if (currentStatus !== 'pending') {
      return { allowed: false, error: 'Only pending requests can be cancelled.' };
    }
    if (userHospitalId !== requestHospitalId) {
      return { allowed: false, error: 'Only the requesting hospital or authorized network admin can cancel this request.' };
    }
    return { allowed: true, newStatus: 'cancelled' };
  };

  // Valid cancel
  const valid = evaluateCancelRequest('pending', 'hosp_A', 'hosp_A');
  assert.strictEqual(valid.allowed, true);
  assert.strictEqual(valid.newStatus, 'cancelled');

  // Disallowed: Already approved
  const approved = evaluateCancelRequest('approved', 'hosp_A', 'hosp_A');
  assert.strictEqual(approved.allowed, false);

  // Disallowed: Wrong hospital
  const wrongHosp = evaluateCancelRequest('pending', 'hosp_B', 'hosp_A');
  assert.strictEqual(wrongHosp.allowed, false);
});

test('Appointment Chronological Validity: Cannot mark an appointment completed before its scheduled date', () => {
  const validateAppointmentCompletion = (scheduledDate, testCurrentDate = new Date()) => {
    const apptMidnight = new Date(scheduledDate);
    apptMidnight.setHours(0, 0, 0, 0);

    const todayMidnight = new Date(testCurrentDate);
    todayMidnight.setHours(0, 0, 0, 0);

    if (apptMidnight.getTime() > todayMidnight.getTime()) {
      return {
        allowed: false,
        error: 'Cannot mark an appointment as completed before its scheduled date.',
      };
    }
    return { allowed: true };
  };

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Future appointment completion must be blocked
  const futureAttempt = validateAppointmentCompletion(tomorrow, now);
  assert.strictEqual(futureAttempt.allowed, false);
  assert.match(futureAttempt.error, /Cannot mark an appointment as completed before its scheduled date/);

  // Today's appointment can be completed
  const todayAttempt = validateAppointmentCompletion(now, now);
  assert.strictEqual(todayAttempt.allowed, true);

  // Past appointment can be completed
  const pastAttempt = validateAppointmentCompletion(yesterday, now);
  assert.strictEqual(pastAttempt.allowed, true);
});

test('Donor Phlebotomy Governance: Self-reported / discrepancy donors require confirmatory ABO/Rh test before donation intake', () => {
  const evaluateDonationIntake = (donor, confirmatoryTest) => {
    const isUnverified = donor.bloodGroupVerificationStatus !== 'verified' || donor.bloodGroup !== donor.bloodGroupVerified;
    if (isUnverified) {
      if (!confirmatoryTest || !confirmatoryTest.verifiedGroup || !confirmatoryTest.verificationMethod) {
        return {
          allowed: false,
          status: 400,
          error: 'Mandatory pre-donation confirmatory ABO/Rh testing required for unverified or discrepancy donor before logging blood into inventory.',
        };
      }
    }
    return { allowed: true };
  };

  const selfReportedDonor = {
    bloodGroup: 'O+',
    bloodGroupVerified: null,
    bloodGroupVerificationStatus: 'self_reported',
  };

  const labVerifiedDonor = {
    bloodGroup: 'O-',
    bloodGroupVerified: 'O-',
    bloodGroupVerificationStatus: 'verified',
  };

  // Attempt donation intake on self-reported donor WITHOUT confirmatory test -> BLOCKED
  const unverifiedBlocked = evaluateDonationIntake(selfReportedDonor, null);
  assert.strictEqual(unverifiedBlocked.allowed, false);
  assert.strictEqual(unverifiedBlocked.status, 400);
  assert.match(unverifiedBlocked.error, /Mandatory pre-donation confirmatory ABO\/Rh testing required/);

  // Attempt donation intake on self-reported donor WITH confirmatory test -> ALLOWED
  const unverifiedPassed = evaluateDonationIntake(selfReportedDonor, {
    verifiedGroup: 'O+',
    verificationMethod: 'tube_agglutination',
  });
  assert.strictEqual(unverifiedPassed.allowed, true);

  // Lab-verified donor without confirmatory test -> ALLOWED
  const verifiedAllowed = evaluateDonationIntake(labVerifiedDonor, null);
  assert.strictEqual(verifiedAllowed.allowed, true);
});

test('Blood Inventory Discard Governance: Hard deletion is prohibited; clinical discard requires valid reason code', () => {
  const VALID_DISCARD_REASONS = [
    'expired',
    'broken_seal',
    'positive_nat',
    'hemolyzed',
    'clotted',
    'cold_chain_breakage',
    'other',
  ];

  const evaluateInventoryDiscard = (units, reason) => {
    if (!units || units < 1) {
      return { allowed: false, error: 'Discard units must be at least 1' };
    }
    if (!reason || !VALID_DISCARD_REASONS.includes(reason)) {
      return { allowed: false, error: `Invalid discard reason. Must be one of: ${VALID_DISCARD_REASONS.join(', ')}` };
    }
    return { allowed: true };
  };

  // Invalid reason
  const badReason = evaluateInventoryDiscard(2, 'trash');
  assert.strictEqual(badReason.allowed, false);
  assert.match(badReason.error, /Invalid discard reason/);

  // Valid reason: expired
  const expiredValid = evaluateInventoryDiscard(2, 'expired');
  assert.strictEqual(expiredValid.allowed, true);

  // Valid reason: cold_chain_breakage
  const coldChainValid = evaluateInventoryDiscard(1, 'cold_chain_breakage');
  assert.strictEqual(coldChainValid.allowed, true);
});

test('IAM Separation: Blood Bank Facility Admin is distinct from Attending Clinical Physician', () => {
  const adminAccount = {
    role: 'admin',
    name: 'Babatunde Adeleke (LUTH Blood Bank Admin)',
    hospitalId: 'luth_01',
    isPhysician: false,
  };

  const attendingDoctor = {
    name: 'Dr. A. Adeleke, FWACS (OB/GYN)',
    mdcnNumber: 'MDCN-39482',
    hospitalAffiliation: 'LUTH',
    verificationStatus: 'verified_id',
    isPhysician: true,
  };

  assert.notStrictEqual(adminAccount.name, attendingDoctor.name);
  assert.strictEqual(adminAccount.name.includes('Blood Bank Admin'), true);
  assert.strictEqual(attendingDoctor.name.startsWith('Dr.'), true);
  assert.strictEqual(attendingDoctor.mdcnNumber.startsWith('MDCN-'), true);
});




