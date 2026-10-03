/**
 * Master Realistic Database Seed & Reset Script for Smart Blood Bank
 *
 * This script:
 * 1. Resets and clears all collections across the database.
 * 2. Populates realistic Nigerian hospitals with genuine coordinates & phlebotomy capacities.
 * 3. Creates administrative & facility-bound staff accounts with distinct roles (Separation of Duties).
 * 4. Seeds realistic voluntary donors across all 8 blood groups with verified, pending, and unverified statuses.
 * 5. Generates traceable blood batches (PRBC, Whole Blood, FFP, Platelets, Cryo) with FEFO expiry staggering.
 * 6. Populates oxygen cylinder inventory per hospital.
 * 7. Seeds realistic clinical requisitions (emergency, urgent, routine) with doctor credentials and consequence tracking.
 * 8. Seeds active and resolved emergency SOS alerts with reference IDs.
 * 9. Creates phlebotomy appointments and inter-hospital transfers.
 * 10. Appends forensically realistic immutable audit logs.
 *
 * Usage:
 *   node scripts/seedRealisticData.js
 *   npm run seed:realistic
 */

require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');

// Models
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const Donor = require('../models/Donor');
const BloodBatch = require('../models/BloodBatch');
const Inventory = require('../models/Inventory');
const PatientRequest = require('../models/PatientRequest');
const SOSRequest = require('../models/SOSRequest');
const DonationAppointment = require('../models/DonationAppointment');
const ResourceRequest = require('../models/ResourceRequest');
const AuditLog = require('../models/AuditLog');
const WhatsAppSession = require('../models/WhatsAppSession');

const dayMs = 24 * 60 * 60 * 1000;
const futureDate = (days) => new Date(Date.now() + days * dayMs);
const pastDate = (days) => new Date(Date.now() - days * dayMs);

async function seed() {
  console.log('🚀 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB.');

  console.log('🧹 Wiping existing collections for a clean, consistent state...');
  await Promise.all([
    Hospital.deleteMany({}),
    User.deleteMany({}),
    Donor.deleteMany({}),
    BloodBatch.deleteMany({}),
    Inventory.deleteMany({}),
    PatientRequest.deleteMany({}),
    SOSRequest.deleteMany({}),
    DonationAppointment.deleteMany({}),
    ResourceRequest.deleteMany({}),
    mongoose.connection.collection('auditlogs').deleteMany({}).catch(() => {}),
    WhatsAppSession.deleteMany({}),
  ]);
  await mongoose.connection.collection('inventories').dropIndexes().catch(() => {});
  await Inventory.syncIndexes().catch(() => {});
  console.log('✅ Database wiped cleanly & indexes synchronized.');

  // ==========================================
  // 1. HOSPITALS (Real Nigerian Facilities)
  // ==========================================
  console.log('🏥 Seeding Nigerian tertiary and general hospital blood banks...');
  const hospitals = await Hospital.create([
    {
      name: 'Lagos University Teaching Hospital (LUTH)',
      address: 'Ishaga Road, Idi-Araba, Surulere, Lagos',
      location: { type: 'Point', coordinates: [3.3556, 6.5186] },
      contactPhone: '+2348039991101',
      dailyDonationCapacity: 15,
      hourlyDonationCapacity: 3,
      profile: {
        hasMaternity: true,
        hasTrauma: true,
        hasPediatric: true,
        bedCount: 760,
        catchmentK: 1200,
      },
    },
    {
      name: 'Lagos State University Teaching Hospital (LASUTH)',
      address: '1-5 Oba Akinjobi Way, GRA, Ikeja, Lagos',
      location: { type: 'Point', coordinates: [3.3444, 6.5936] },
      contactPhone: '+2348039991102',
      dailyDonationCapacity: 12,
      hourlyDonationCapacity: 3,
      profile: {
        hasMaternity: true,
        hasTrauma: true,
        hasPediatric: true,
        bedCount: 600,
        catchmentK: 950,
      },
    },
    {
      name: 'University College Hospital (UCH)',
      address: 'Queen Elizabeth Road, Mokola, Ibadan, Oyo State',
      location: { type: 'Point', coordinates: [3.9000, 7.4019] },
      contactPhone: '+2348039991103',
      dailyDonationCapacity: 15,
      hourlyDonationCapacity: 3,
      profile: {
        hasMaternity: true,
        hasTrauma: true,
        hasPediatric: true,
        bedCount: 850,
        catchmentK: 1500,
      },
    },
    {
      name: 'Olabisi Onabanjo University Teaching Hospital (OOUTH)',
      address: 'Hospital Road, Sagamu, Ogun State',
      location: { type: 'Point', coordinates: [3.6492, 6.8406] },
      contactPhone: '+2348039991104',
      dailyDonationCapacity: 8,
      hourlyDonationCapacity: 2,
      profile: {
        hasMaternity: true,
        hasTrauma: true,
        hasPediatric: false,
        bedCount: 320,
        catchmentK: 450,
      },
    },
    {
      name: 'National Hospital Abuja',
      address: 'Plot 132 Central Business District (Phase II), Garki, Abuja',
      location: { type: 'Point', coordinates: [7.4646, 9.0436] },
      contactPhone: '+2348039991105',
      dailyDonationCapacity: 15,
      hourlyDonationCapacity: 3,
      profile: {
        hasMaternity: true,
        hasTrauma: true,
        hasPediatric: true,
        bedCount: 500,
        catchmentK: 800,
      },
    },
  ]);

  const [luth, lasuth, uch, oouth, nationalHosp] = hospitals;
  console.log(`✅ Seeded ${hospitals.length} hospitals.`);

  // ==========================================
  // 2. USERS (Separation of Duties Personas)
  // ==========================================
  console.log('👤 Seeding role-segregated user accounts...');
  // Note: Password hashing is handled by the User pre-save hook
  const users = await User.create([
    {
      name: 'Engr. Dapo Alabi (Platform IT Admin)',
      email: 'superadmin@smartbloodbank.com',
      password: 'SuperAdmin123!',
      role: 'superadmin',
      isActive: true,
    },
    {
      name: 'Babatunde Adeleke (LUTH Blood Bank Admin)',
      email: 'luth-admin@smartbloodbank.com',
      password: 'HospitalAdmin123!',
      role: 'admin',
      hospitalId: luth._id,
      isActive: true,
    },
    {
      name: 'Kemi Adebayo (LUTH Senior Lab Scientist)',
      email: 'luth-lab@smartbloodbank.com',
      password: 'HospitalStaff123!',
      role: 'staff',
      hospitalId: luth._id,
      isActive: true,
    },
    {
      name: 'Folashade Alabi (LASUTH Blood Bank Admin)',
      email: 'lasuth-admin@smartbloodbank.com',
      password: 'HospitalAdmin123!',
      role: 'admin',
      hospitalId: lasuth._id,
      isActive: true,
    },
    {
      name: 'Nurse Ngozi Okonkwo (LASUTH Phlebotomist)',
      email: 'lasuth-nurse@smartbloodbank.com',
      password: 'HospitalStaff123!',
      role: 'staff',
      hospitalId: lasuth._id,
      isActive: true,
    },
    {
      name: 'Kelechi Nwosu (UCH Blood Bank Admin)',
      email: 'uch-admin@smartbloodbank.com',
      password: 'HospitalAdmin123!',
      role: 'admin',
      hospitalId: uch._id,
      isActive: true,
    },
    {
      name: 'Suleiman Danjuma (UCH Lab Officer)',
      email: 'uch-staff@smartbloodbank.com',
      password: 'HospitalStaff123!',
      role: 'staff',
      hospitalId: uch._id,
      isActive: true,
    },
  ]);

  const [superAdminUser, luthAdminUser, luthLabUser, lasuthAdminUser, lasuthNurseUser, uchAdminUser, uchStaffUser] = users;

  // Link admin users back to hospitals
  await Hospital.findByIdAndUpdate(luth._id, { adminUserId: luthAdminUser._id });
  await Hospital.findByIdAndUpdate(lasuth._id, { adminUserId: lasuthAdminUser._id });
  await Hospital.findByIdAndUpdate(uch._id, { adminUserId: uchAdminUser._id });
  console.log(`✅ Seeded ${users.length} users across technical and clinical roles.`);

  // ==========================================
  // 3. VOLUNTARY DONORS (Verified vs Unverified)
  // ==========================================
  console.log('🩸 Seeding voluntary blood donors with clinical verification history...');

  const donorDefinitions = [
    // --- 10 Lab-Verified Donors ---
    {
      name: 'Babatunde Fashola',
      email: 'babatunde.fashola@example.com',
      phone: '+2348021110001',
      bloodGroup: 'O-',
      bloodGroupVerified: 'O-',
      bloodGroupVerificationStatus: 'verified',
      gender: 'Male',
      weight: 74,
      dateOfBirth: new Date('1990-03-14'),
      homeHospitalId: luth._id,
      ninMasked: '•••••••1234',
      eligibilityStatus: 'eligible',
      lastDonationDate: pastDate(110),
      verificationHistory: [{
        verifiedBy: luthLabUser._id,
        verifiedAt: pastDate(110),
        verificationMethod: 'tube_agglutination',
        verifiedGroup: 'O-',
        previousGroup: 'O-',
        hospitalId: luth._id,
        notes: 'Confirmatory tube agglutination forward and reverse concordant. Anti-D negative.',
      }],
    },
    {
      name: 'Chidinma Okeke',
      email: 'chidinma.okeke@example.com',
      phone: '+2348021110002',
      bloodGroup: 'O+',
      bloodGroupVerified: 'O+',
      bloodGroupVerificationStatus: 'verified',
      gender: 'Female',
      weight: 66,
      dateOfBirth: new Date('1994-07-22'),
      homeHospitalId: lasuth._id,
      ninMasked: '•••••••2345',
      eligibilityStatus: 'eligible',
      lastDonationDate: pastDate(95),
      verificationHistory: [{
        verifiedBy: lasuthNurseUser._id,
        verifiedAt: pastDate(95),
        verificationMethod: 'gel_card',
        verifiedGroup: 'O+',
        previousGroup: 'O+',
        hospitalId: lasuth._id,
        notes: 'Gel card column agglutination verified. Anti-D 4+.',
      }],
    },
    {
      name: 'Emeka Nnamdi',
      email: 'emeka.nnamdi@example.com',
      phone: '+2348021110003',
      bloodGroup: 'A+',
      bloodGroupVerified: 'A+',
      bloodGroupVerificationStatus: 'verified',
      gender: 'Male',
      weight: 81,
      dateOfBirth: new Date('1988-11-05'),
      homeHospitalId: luth._id,
      ninMasked: '•••••••3456',
      eligibilityStatus: 'eligible',
      lastDonationDate: pastDate(140),
      verificationHistory: [{
        verifiedBy: luthLabUser._id,
        verifiedAt: pastDate(140),
        verificationMethod: 'automated_analyzer',
        verifiedGroup: 'A+',
        previousGroup: 'A+',
        hospitalId: luth._id,
        notes: 'Automated immunohematology analyzer run concordant.',
      }],
    },
    {
      name: 'Amina Yusuf',
      email: 'amina.yusuf@example.com',
      phone: '+2348021110004',
      bloodGroup: 'A-',
      bloodGroupVerified: 'A-',
      bloodGroupVerificationStatus: 'verified',
      gender: 'Female',
      weight: 62,
      dateOfBirth: new Date('1996-02-18'),
      homeHospitalId: nationalHosp._id,
      ninMasked: '•••••••4567',
      eligibilityStatus: 'eligible',
      lastDonationDate: pastDate(100),
      verificationHistory: [{
        verifiedBy: luthLabUser._id,
        verifiedAt: pastDate(100),
        verificationMethod: 'tube_agglutination',
        verifiedGroup: 'A-',
        previousGroup: 'A-',
        hospitalId: nationalHosp._id,
        notes: 'Rare A- voluntary donor verified under National Blood Service protocol.',
      }],
    },
    {
      name: 'Olumide Bakare',
      email: 'olumide.bakare@example.com',
      phone: '+2348021110005',
      bloodGroup: 'B+',
      bloodGroupVerified: 'B+',
      bloodGroupVerificationStatus: 'verified',
      gender: 'Male',
      weight: 77,
      dateOfBirth: new Date('1992-09-30'),
      homeHospitalId: uch._id,
      ninMasked: '•••••••5678',
      eligibilityStatus: 'eligible',
      lastDonationDate: pastDate(125),
      verificationHistory: [{
        verifiedBy: uchStaffUser._id,
        verifiedAt: pastDate(125),
        verificationMethod: 'tube_agglutination',
        verifiedGroup: 'B+',
        previousGroup: 'B+',
        hospitalId: uch._id,
        notes: 'Confirmed B-positive whole blood voluntary donor.',
      }],
    },
    {
      name: 'Funke Adeyemi',
      email: 'funke.adeyemi@example.com',
      phone: '+2348021110006',
      bloodGroup: 'B-',
      bloodGroupVerified: 'B-',
      bloodGroupVerificationStatus: 'verified',
      gender: 'Female',
      weight: 68,
      dateOfBirth: new Date('1993-05-12'),
      homeHospitalId: lasuth._id,
      ninMasked: '•••••••6789',
      eligibilityStatus: 'eligible',
      lastDonationDate: pastDate(150),
      verificationHistory: [{
        verifiedBy: lasuthNurseUser._id,
        verifiedAt: pastDate(150),
        verificationMethod: 'gel_card',
        verifiedGroup: 'B-',
        previousGroup: 'B-',
        hospitalId: lasuth._id,
        notes: 'Confirmed B-negative. Priority registry donor.',
      }],
    },
    {
      name: 'Kelechi Onyeka',
      email: 'kelechi.onyeka@example.com',
      phone: '+2348021110007',
      bloodGroup: 'AB+',
      bloodGroupVerified: 'AB+',
      bloodGroupVerificationStatus: 'verified',
      gender: 'Male',
      weight: 85,
      dateOfBirth: new Date('1987-12-08'),
      homeHospitalId: luth._id,
      ninMasked: '•••••••7890',
      eligibilityStatus: 'eligible',
      lastDonationDate: pastDate(180),
      verificationHistory: [{
        verifiedBy: luthLabUser._id,
        verifiedAt: pastDate(180),
        verificationMethod: 'tube_agglutination',
        verifiedGroup: 'AB+',
        previousGroup: 'AB+',
        hospitalId: luth._id,
        notes: 'AB-positive universal plasma donor.',
      }],
    },
    {
      name: 'Fatima Danjuma',
      email: 'fatima.danjuma@example.com',
      phone: '+2348021110008',
      bloodGroup: 'AB-',
      bloodGroupVerified: 'AB-',
      bloodGroupVerificationStatus: 'verified',
      gender: 'Female',
      weight: 64,
      dateOfBirth: new Date('1995-10-19'),
      homeHospitalId: uch._id,
      ninMasked: '•••••••8901',
      eligibilityStatus: 'eligible',
      lastDonationDate: pastDate(200),
      verificationHistory: [{
        verifiedBy: uchStaffUser._id,
        verifiedAt: pastDate(200),
        verificationMethod: 'tube_agglutination',
        verifiedGroup: 'AB-',
        previousGroup: 'AB-',
        hospitalId: uch._id,
        notes: 'Extremely rare AB-negative voluntary donor.',
      }],
    },
    {
      name: 'Damilola Ogundipe',
      email: 'damilola.ogundipe@example.com',
      phone: '+2348021110009',
      bloodGroup: 'O+',
      bloodGroupVerified: 'O+',
      bloodGroupVerificationStatus: 'verified',
      gender: 'Male',
      weight: 72,
      dateOfBirth: new Date('1991-04-03'),
      homeHospitalId: luth._id,
      ninMasked: '•••••••9012',
      // Currently deferred: donated 25 days ago
      eligibilityStatus: 'deferred',
      deferralReason: 'Deferred: Minimum 90-day recovery window required between whole blood donations (donated 25 days ago).',
      lastDonationDate: pastDate(25),
      verificationHistory: [{
        verifiedBy: luthLabUser._id,
        verifiedAt: pastDate(25),
        verificationMethod: 'tube_agglutination',
        verifiedGroup: 'O+',
        previousGroup: 'O+',
        hospitalId: luth._id,
        notes: 'Recorded donation intake unit at LUTH blood bank.',
      }],
    },
    {
      name: 'Zainab Aliyu',
      email: 'zainab.aliyu@example.com',
      phone: '+2348021110010',
      bloodGroup: 'O-',
      bloodGroupVerified: 'O-',
      bloodGroupVerificationStatus: 'verified',
      gender: 'Female',
      weight: 70,
      dateOfBirth: new Date('1998-08-15'),
      homeHospitalId: nationalHosp._id,
      ninMasked: '•••••••0123',
      eligibilityStatus: 'eligible',
      lastDonationDate: pastDate(105),
      verificationHistory: [{
        verifiedBy: luthLabUser._id,
        verifiedAt: pastDate(105),
        verificationMethod: 'prior_lab_record',
        verifiedGroup: 'O-',
        previousGroup: 'O-',
        hospitalId: nationalHosp._id,
        notes: 'Certified via official NBSC donor card.',
      }],
    },

    // --- 3 Pending Verification Donors (Submitted Correction Request) ---
    {
      name: 'Segun Adeleke',
      email: 'segun.adeleke@example.com',
      phone: '+2348021110011',
      bloodGroup: 'A+',
      bloodGroupSelfReported: 'A+',
      bloodGroupVerificationStatus: 'pending_verification',
      gender: 'Male',
      weight: 78,
      dateOfBirth: new Date('1992-01-20'),
      homeHospitalId: luth._id,
      ninMasked: '•••••••1122',
      eligibilityStatus: 'eligible',
      correctionRequest: {
        requestedGroup: 'O-',
        reason: 'Prior crossmatch at LUTH surgery confirmed O-negative. Selected A+ mistakenly during online signup.',
        status: 'pending',
        requestedAt: pastDate(2),
      },
    },
    {
      name: 'Blessing Okafor',
      email: 'blessing.okafor@example.com',
      phone: '+2348021110012',
      bloodGroup: 'B+',
      bloodGroupSelfReported: 'B+',
      bloodGroupVerificationStatus: 'pending_verification',
      gender: 'Female',
      weight: 63,
      dateOfBirth: new Date('1997-06-11'),
      homeHospitalId: lasuth._id,
      ninMasked: '•••••••2233',
      eligibilityStatus: 'eligible',
      correctionRequest: {
        requestedGroup: 'B-',
        reason: 'Laboratory screening card from State General Hospital indicates Rh-negative.',
        status: 'pending',
        requestedAt: pastDate(1),
      },
    },
    {
      name: 'Yusuf Garba',
      email: 'yusuf.garba@example.com',
      phone: '+2348021110013',
      bloodGroup: 'O+',
      bloodGroupSelfReported: 'O+',
      bloodGroupVerificationStatus: 'pending_verification',
      gender: 'Male',
      weight: 69,
      dateOfBirth: new Date('1989-09-09'),
      homeHospitalId: uch._id,
      ninMasked: '•••••••3344',
      eligibilityStatus: 'eligible',
      correctionRequest: {
        requestedGroup: 'A+',
        reason: 'Previous voluntary drive card at UCH confirmed group A Rh-positive.',
        status: 'pending',
        requestedAt: pastDate(3),
      },
    },

    // --- 3 Self-Reported / Unverified Donors ---
    {
      name: 'Ngozi Nwosu',
      email: 'ngozi.nwosu@example.com',
      phone: '+2348021110014',
      bloodGroup: 'O+',
      bloodGroupSelfReported: 'O+',
      bloodGroupVerificationStatus: 'unverified',
      gender: 'Female',
      weight: 58,
      dateOfBirth: new Date('1999-11-25'),
      homeHospitalId: luth._id,
      ninMasked: '•••••••4455',
      eligibilityStatus: 'eligible',
    },
    {
      name: 'Tunde Bakare',
      email: 'tunde.bakare@example.com',
      phone: '+2348021110015',
      bloodGroup: 'B+',
      bloodGroupSelfReported: 'B+',
      bloodGroupVerificationStatus: 'unverified',
      gender: 'Male',
      weight: 75,
      dateOfBirth: new Date('1993-03-17'),
      homeHospitalId: lasuth._id,
      ninMasked: '•••••••5566',
      eligibilityStatus: 'eligible',
    },
    {
      name: 'Ibrahim Musa',
      email: 'ibrahim.musa@example.com',
      phone: '+2348021110016',
      bloodGroup: 'A+',
      bloodGroupSelfReported: 'A+',
      bloodGroupVerificationStatus: 'unverified',
      gender: 'Male',
      weight: 71,
      dateOfBirth: new Date('1991-08-29'),
      homeHospitalId: uch._id,
      ninMasked: '•••••••6677',
      // Deferred due to low hemoglobin on prior test
      eligibilityStatus: 'deferred',
      deferralReason: 'Deferred: Hemoglobin level was 11.8 g/dL (minimum 12.5 g/dL required). Recommended dietary iron supplement.',
      lastDonationDate: pastDate(40),
    },
  ];

  const seededDonors = [];
  for (const d of donorDefinitions) {
    const donorDoc = new Donor({
      ...d,
      password: 'DonorPassword123!',
      nonRemunerationDeclared: true,
      sosOptIn: true,
      location: {
        type: 'Point',
        coordinates: [3.35 + (Math.random() - 0.5) * 0.1, 6.52 + (Math.random() - 0.5) * 0.1],
      },
    });

    // Generate cryptographic QR code for each donor
    const qrToken = jwt.sign(
      {
        donorId: donorDoc._id,
        type: 'donor-verify',
        bloodGroup: donorDoc.bloodGroup,
        verified: donorDoc.bloodGroupVerificationStatus === 'verified',
      },
      process.env.JWT_SECRET || 'secret'
    );

    donorDoc.qrCode = await QRCode.toDataURL(qrToken, { errorCorrectionLevel: 'H', width: 300 });
    await donorDoc.save();
    seededDonors.push(donorDoc);
  }
  console.log(`✅ Seeded ${seededDonors.length} voluntary donors with cryptographic passes.`);

  // ==========================================
  // 4. BLOOD BATCHES & INVENTORY (FEFO Staged)
  // ==========================================
  console.log('📦 Staging FEFO-compliant blood batches and inventory caches...');

  const batchConfigs = [
    // LUTH Stock
    { hospitalId: luth._id, bloodGroup: 'O-', componentType: 'PACKED_RED_CELLS', units: 4, initialUnits: 6, expiryDays: 5, donor: seededDonors[0] }, // Soonest expiry (FEFO Priority)
    { hospitalId: luth._id, bloodGroup: 'O-', componentType: 'PACKED_RED_CELLS', units: 8, initialUnits: 8, expiryDays: 28, donor: seededDonors[9] },
    { hospitalId: luth._id, bloodGroup: 'O+', componentType: 'PACKED_RED_CELLS', units: 12, initialUnits: 15, expiryDays: 18, donor: seededDonors[1] },
    { hospitalId: luth._id, bloodGroup: 'O+', componentType: 'WHOLE_BLOOD', units: 6, initialUnits: 6, expiryDays: 14, donor: seededDonors[1] },
    { hospitalId: luth._id, bloodGroup: 'A+', componentType: 'PACKED_RED_CELLS', units: 7, initialUnits: 8, expiryDays: 20, donor: seededDonors[2] },
    { hospitalId: luth._id, bloodGroup: 'B+', componentType: 'PACKED_RED_CELLS', units: 5, initialUnits: 5, expiryDays: 22, donor: seededDonors[4] },
    { hospitalId: luth._id, bloodGroup: 'AB+', componentType: 'PLATELET_CONCENTRATE', units: 4, initialUnits: 4, expiryDays: 4, donor: seededDonors[6] },
    { hospitalId: luth._id, bloodGroup: 'O-', componentType: 'FRESH_FROZEN_PLASMA', units: 6, initialUnits: 6, expiryDays: 320, donor: seededDonors[0] },

    // LASUTH Stock
    { hospitalId: lasuth._id, bloodGroup: 'O+', componentType: 'PACKED_RED_CELLS', units: 9, initialUnits: 10, expiryDays: 12, donor: seededDonors[1] },
    { hospitalId: lasuth._id, bloodGroup: 'O+', componentType: 'WHOLE_BLOOD', units: 5, initialUnits: 5, expiryDays: 22, donor: seededDonors[1] },
    { hospitalId: lasuth._id, bloodGroup: 'A-', componentType: 'PACKED_RED_CELLS', units: 3, initialUnits: 3, expiryDays: 15, donor: seededDonors[3] },
    { hospitalId: lasuth._id, bloodGroup: 'B-', componentType: 'PACKED_RED_CELLS', units: 4, initialUnits: 4, expiryDays: 19, donor: seededDonors[5] },
    { hospitalId: lasuth._id, bloodGroup: 'B-', componentType: 'WHOLE_BLOOD', units: 2, initialUnits: 2, expiryDays: 9, donor: seededDonors[5] },
    { hospitalId: lasuth._id, bloodGroup: 'AB-', componentType: 'PACKED_RED_CELLS', units: 2, initialUnits: 2, expiryDays: 25, donor: seededDonors[7] },

    // UCH Stock
    { hospitalId: uch._id, bloodGroup: 'O+', componentType: 'PACKED_RED_CELLS', units: 14, initialUnits: 16, expiryDays: 24, donor: seededDonors[1] },
    { hospitalId: uch._id, bloodGroup: 'B+', componentType: 'PACKED_RED_CELLS', units: 8, initialUnits: 8, expiryDays: 16, donor: seededDonors[4] },
    { hospitalId: uch._id, bloodGroup: 'A+', componentType: 'WHOLE_BLOOD', units: 6, initialUnits: 6, expiryDays: 11, donor: seededDonors[2] },
    { hospitalId: uch._id, bloodGroup: 'AB+', componentType: 'FRESH_FROZEN_PLASMA', units: 5, initialUnits: 5, expiryDays: 300, donor: seededDonors[6] },

    // National Hospital Abuja Stock
    { hospitalId: nationalHosp._id, bloodGroup: 'O-', componentType: 'PACKED_RED_CELLS', units: 6, initialUnits: 6, expiryDays: 21, donor: seededDonors[9] },
    { hospitalId: nationalHosp._id, bloodGroup: 'O+', componentType: 'PACKED_RED_CELLS', units: 10, initialUnits: 12, expiryDays: 26, donor: seededDonors[1] },
    { hospitalId: nationalHosp._id, bloodGroup: 'A-', componentType: 'PACKED_RED_CELLS', units: 4, initialUnits: 4, expiryDays: 17, donor: seededDonors[3] },
  ];

  for (const cfg of batchConfigs) {
    await BloodBatch.create({
      hospitalId: cfg.hospitalId,
      bloodGroup: cfg.bloodGroup,
      componentType: cfg.componentType,
      units: cfg.units,
      initialUnits: cfg.initialUnits,
      volumeMl: cfg.componentType === 'WHOLE_BLOOD' ? 450 : 280,
      storageTemperature: cfg.componentType === 'FRESH_FROZEN_PLASMA' ? '-25°C' : '+4°C',
      donorId: cfg.donor?._id,
      source: 'donation',
      collectionDate: pastDate(7),
      expiryDate: futureDate(cfg.expiryDays),
      status: 'available',
    });
  }

  // Refresh Inventory aggregated caches
  const uniqueCombos = [];
  for (const b of batchConfigs) {
    const key = `${b.hospitalId}::${b.bloodGroup}::${b.componentType}`;
    if (!uniqueCombos.includes(key)) uniqueCombos.push(key);
  }

  for (const combo of uniqueCombos) {
    const [hId, bg, comp] = combo.split('::');
    const totalUnits = batchConfigs
      .filter((b) => b.hospitalId.toString() === hId && b.bloodGroup === bg && b.componentType === comp)
      .reduce((acc, curr) => acc + curr.units, 0);

    await Inventory.create({
      hospitalId: hId,
      resourceType: 'blood',
      bloodGroup: bg,
      componentType: comp,
      units: totalUnits,
      lastUpdatedAt: new Date(),
    });
  }

  // Seed Oxygen Inventories
  const oxygenSeed = [
    { hospitalId: luth._id, cylinders: 18, status: 'full' },
    { hospitalId: lasuth._id, cylinders: 14, status: 'full' },
    { hospitalId: uch._id, cylinders: 16, status: 'full' },
    { hospitalId: oouth._id, cylinders: 9, status: 'partial' },
    { hospitalId: nationalHosp._id, cylinders: 22, status: 'full' },
  ];

  for (const oxy of oxygenSeed) {
    await Inventory.create({
      hospitalId: oxy.hospitalId,
      resourceType: 'oxygen',
      units: oxy.cylinders,
      oxygenCylinderCount: oxy.cylinders,
      oxygenFillStatus: oxy.status,
      lastUpdatedAt: new Date(),
    });
  }
  console.log('✅ Blood batches & oxygen inventories successfully populated.');

  // ==========================================
  // 5. CLINICAL REQUISITIONS (Patient Requests)
  // ==========================================
  console.log('📋 Seeding diverse clinical requisitions with doctor governance & consequence tracking...');

  const requisitions = [
    // 1. Emergency PPH: Approved, Allocated to LUTH
    {
      patientName: 'Mrs. Chioma Okafor',
      contactPhone: '+2348032223301',
      email: 'family.okafor@example.com',
      resourceType: 'blood',
      bloodGroup: 'O-',
      componentType: 'PACKED_RED_CELLS',
      units: 2,
      urgency: 'emergency',
      clinicalIndication: 'Severe Postpartum Hemorrhage (PPH) during emergency Cesarean section. Estimated blood loss > 1,500 mL.',
      destinationFacility: 'Lagos University Teaching Hospital (LUTH)',
      ward: 'Obstetrics & Gynaecology Theatre 2',
      bedNumber: 'OT-02',
      preferredHospitalId: luth._id,
      allocatedHospitalId: luth._id,
      deliveryStatus: 'approved',
      createdAt: pastDate(0.25),
      approvedAt: pastDate(0.1),
      referenceId: 'SBB-8F21A',
      doctorRef: {
        id: luthAdminUser._id,
        name: 'Dr. A. Adeleke, FWACS (OB/GYN)',
        phone: '+2348039991101',
        mdcnNumber: 'MDCN-39482',
        hospitalAffiliation: 'LUTH',
        verificationStatus: 'verified_id',
      },
      source: 'dashboard_requisition',
    },

    // 2. Severe Trauma / Splenic Rupture: In-Transit from LASUTH
    {
      patientName: 'Mr. Ibrahim Musa',
      contactPhone: '+2348032223302',
      resourceType: 'blood',
      bloodGroup: 'O+',
      componentType: 'WHOLE_BLOOD',
      units: 3,
      urgency: 'emergency',
      clinicalIndication: 'RTA Severe Polytrauma - Splenic laceration and active abdominal hemorrhage. BP 80/50 mmHg.',
      destinationFacility: 'Lagos State University Teaching Hospital (LASUTH)',
      ward: 'Trauma & Emergency ICU',
      bedNumber: 'ICU-04',
      preferredHospitalId: lasuth._id,
      allocatedHospitalId: lasuth._id,
      deliveryStatus: 'in-transit',
      createdAt: pastDate(0.35),
      approvedAt: pastDate(0.2),
      inTransitAt: pastDate(0.05),
      referenceId: 'SBB-3C99B',
      doctorRef: {
        name: 'Dr. B. Okonkwo (Trauma Surgery)',
        phone: '+2348039991102',
        mdcnNumber: 'MDCN-48192',
        hospitalAffiliation: 'LASUTH',
        verificationStatus: 'verified_id',
      },
      source: 'whatsapp_doctor',
    },

    // 3. Sickle Cell Crisis: Delivered & Transfused at LUTH
    {
      patientName: 'Master Abiodun Fashola',
      contactPhone: '+2348032223303',
      resourceType: 'blood',
      bloodGroup: 'B+',
      componentType: 'PACKED_RED_CELLS',
      units: 2,
      urgency: 'emergency',
      clinicalIndication: 'Sickle Cell Disease (HbSS) Acute Chest Syndrome with severe anemia (Hb 4.2 g/dL). Exchange transfusion completed.',
      destinationFacility: 'Lagos University Teaching Hospital (LUTH)',
      ward: 'Pediatric Medical Ward 3',
      bedNumber: 'BED-18',
      preferredHospitalId: luth._id,
      allocatedHospitalId: luth._id,
      deliveryStatus: 'delivered',
      createdAt: pastDate(1.2),
      approvedAt: pastDate(1.0),
      inTransitAt: pastDate(0.9),
      deliveredAt: pastDate(0.8),
      referenceId: 'SBB-7A11C',
      doctorRef: {
        name: 'Dr. Mrs. T. Solanke (Pediatrics)',
        phone: '+2348039991101',
        mdcnNumber: 'MDCN-29184',
        hospitalAffiliation: 'LUTH',
        verificationStatus: 'verified_id',
      },
      source: 'dashboard_requisition',
    },

    // 4. Pending Requisition (Queued for automated FEFO allocation)
    {
      patientName: 'Mrs. Ngozi Eze',
      contactPhone: '+2348032223304',
      resourceType: 'blood',
      bloodGroup: 'A+',
      componentType: 'PACKED_RED_CELLS',
      units: 2,
      urgency: 'scheduled',
      scheduledTime: futureDate(1),
      clinicalIndication: 'Elective total abdominal hysterectomy for uterine fibroids. Standby crossmatched units.',
      destinationFacility: 'University College Hospital (UCH)',
      ward: 'Female Surgical Ward 1',
      bedNumber: 'BED-07',
      preferredHospitalId: uch._id,
      deliveryStatus: 'pending',
      createdAt: pastDate(0.5),
      referenceId: 'SBB-4D55E',
      doctorRef: {
        name: 'Dr. Kelechi Nwosu',
        phone: '+2348039991103',
        verificationStatus: 'verified_id',
      },
      source: 'web_form',
    },

    // 5. Emergency Oxygen Requisition: In-Transit
    {
      patientName: 'Mr. Olufemi Balogun',
      contactPhone: '+2348032223305',
      resourceType: 'oxygen',
      units: 2,
      urgency: 'emergency',
      clinicalIndication: 'Acute Respiratory Distress Syndrome (ARDS) secondary to severe viral pneumonia. SpO2 78% on room air.',
      destinationFacility: 'Lagos State University Teaching Hospital (LASUTH)',
      ward: 'Chest Isolation Unit',
      bedNumber: 'ISO-02',
      preferredHospitalId: lasuth._id,
      allocatedHospitalId: lasuth._id,
      deliveryStatus: 'in-transit',
      createdAt: pastDate(0.3),
      approvedAt: pastDate(0.1),
      inTransitAt: pastDate(0.04),
      referenceId: 'SBB-9O22X',
      doctorRef: {
        name: 'Dr. A. Sanusi (Pulmonology)',
        phone: '+2348039991102',
        verificationStatus: 'verified_id',
      },
      source: 'whatsapp_doctor',
    },

    // 6. Structured Cancelled Requisition: Patient Transferred
    {
      patientName: 'Master Chinedu Obi',
      contactPhone: '+2348032223306',
      resourceType: 'blood',
      bloodGroup: 'O+',
      componentType: 'PACKED_RED_CELLS',
      units: 2,
      urgency: 'emergency',
      clinicalIndication: 'Closed head injury; neurosurgical ICU care required.',
      destinationFacility: 'Olabisi Onabanjo University Teaching Hospital (OOUTH)',
      preferredHospitalId: oouth._id,
      deliveryStatus: 'cancelled',
      createdAt: pastDate(0.8),
      referenceId: 'SBB-1T44Q',
      doctorRef: {
        name: 'Dr. K. Adegoke',
        phone: '+2348039991104',
        verificationStatus: 'phone_only',
      },
      source: 'web_form',
      cancellation: {
        reason: 'patient_transferred',
        cancelledBy: luthAdminUser._id,
        cancelledByRole: 'admin',
        notes: 'Patient stabilized and transferred to National Hospital Neurosurgery ICU via air ambulance.',
        cancelledAt: pastDate(0.5),
      },
      cancellationReason: 'patient_transferred',
      cancelledAt: pastDate(0.5),
      consequences: {
        allocatedUnitsReleased: true,
        sosBroadcastStopped: true,
        familyNotified: true,
      },
    },

    // 7. Structured Cancelled Requisition: Found Elsewhere / Sourced
    {
      patientName: 'Mrs. Fatima Aliyu',
      contactPhone: '+2348032223307',
      resourceType: 'blood',
      bloodGroup: 'A-',
      componentType: 'PACKED_RED_CELLS',
      units: 1,
      urgency: 'routine',
      destinationFacility: 'University College Hospital (UCH)',
      preferredHospitalId: uch._id,
      deliveryStatus: 'cancelled',
      createdAt: pastDate(1.5),
      referenceId: 'SBB-6F88K',
      doctorRef: {
        name: 'Dr. M. I. Danjuma',
        phone: '+2348039991103',
        verificationStatus: 'verified_id',
      },
      source: 'web_form',
      cancellation: {
        reason: 'found_elsewhere',
        cancelledBy: uchAdminUser._id,
        cancelledByRole: 'admin',
        notes: 'Family sourced direct voluntary replacement donor from church drive.',
        cancelledAt: pastDate(1.2),
      },
      cancellationReason: 'found_elsewhere',
      cancelledAt: pastDate(1.2),
      consequences: {
        allocatedUnitsReleased: true,
        sosBroadcastStopped: true,
        familyNotified: true,
      },
    },
  ];

  for (const req of requisitions) {
    await PatientRequest.create(req);
  }
  console.log(`✅ Seeded ${requisitions.length} clinical requisitions with full governance.`);

  // ==========================================
  // 6. SOS EMERGENCY ALERTS
  // ==========================================
  console.log('🚨 Seeding emergency stock-out SOS alerts...');

  await SOSRequest.create([
    {
      bloodGroup: 'O-',
      componentNeeded: 'PACKED_RED_CELLS',
      referenceId: 'SOS-9E2A1',
      doctorName: 'Dr. A. Adeleke',
      doctorPhone: '+2348039991101',
      hospitalName: 'Lagos University Teaching Hospital (LUTH)',
      userPhone: '+2348039991101',
      userLocation: { lat: 6.5186, lon: 3.3556 },
      radiusKm: 25,
      status: 'pending',
      donorsAlerted: [
        { donorId: seededDonors[0]._id, phone: seededDonors[0].phone, status: 'dispatched' },
        { donorId: seededDonors[9]._id, phone: seededDonors[9].phone, status: 'dispatched' },
      ],
      donorsResponded: [
        { donorId: seededDonors[0]._id, response: 'YES - On my way to LUTH blood bank', timestamp: new Date() },
      ],
      hospitalNotified: [{ hospitalId: luth._id }],
      createdAt: pastDate(0.08),
    },
    {
      bloodGroup: 'B-',
      componentNeeded: 'WHOLE_BLOOD',
      referenceId: 'SOS-4B7C9',
      doctorName: 'Dr. B. Okonkwo',
      doctorPhone: '+2348039991102',
      hospitalName: 'Lagos State University Teaching Hospital (LASUTH)',
      userPhone: '+2348039991102',
      userLocation: { lat: 6.5936, lon: 3.3444 },
      radiusKm: 15,
      status: 'resolved',
      donorsAlerted: [
        { donorId: seededDonors[5]._id, phone: seededDonors[5].phone, status: 'dispatched' },
      ],
      donorsResponded: [
        { donorId: seededDonors[5]._id, response: 'Donated 1 unit Whole Blood', timestamp: pastDate(1) },
      ],
      hospitalNotified: [{ hospitalId: lasuth._id }],
      createdAt: pastDate(1.5),
    },
  ]);
  console.log('✅ Seeded active and resolved SOS emergency alerts.');

  // ==========================================
  // 7. DONATION APPOINTMENTS
  // ==========================================
  console.log('📅 Seeding donation appointments and hospital capacity bookings...');

  await DonationAppointment.create([
    {
      donorId: seededDonors[1]._id,
      hospitalId: luth._id,
      appointmentDate: futureDate(1),
      assignedDate: futureDate(1),
      assignedTime: '10:00 AM',
      timeSlot: '10:00 - 10:45 AM',
      preferredDay: 'Tomorrow',
      preferredWindow: 'morning',
      donorNinMasked: seededDonors[1].ninMasked,
      status: 'scheduled',
      confirmedByAdminId: luthAdminUser._id,
      confirmedAt: pastDate(0.5),
      notes: 'Scheduled for Phlebotomy Bay 1. Pre-donation hydration advised.',
    },
    {
      donorId: seededDonors[2]._id,
      hospitalId: lasuth._id,
      appointmentDate: futureDate(2),
      assignedDate: futureDate(2),
      assignedTime: '02:00 PM',
      timeSlot: '02:00 - 02:45 PM',
      preferredDay: 'In 2 days',
      preferredWindow: 'afternoon',
      donorNinMasked: seededDonors[2].ninMasked,
      status: 'scheduled',
      confirmedByAdminId: lasuthAdminUser._id,
      confirmedAt: pastDate(0.3),
      notes: 'Donor requested afternoon appointment.',
    },
    {
      donorId: seededDonors[6]._id,
      hospitalId: uch._id,
      appointmentDate: futureDate(3),
      preferredDay: 'Any day next week',
      preferredWindow: 'morning',
      status: 'pending',
      notes: 'Voluntary offer submitted. Awaiting hospital time allocation.',
    },
  ]);
  console.log('✅ Seeded phlebotomy capacity appointments.');

  // ==========================================
  // 8. INTER-HOSPITAL TRANSFER REQUESTS
  // ==========================================
  console.log('🔄 Seeding inter-hospital resource transfer requests...');

  await ResourceRequest.create([
    {
      requestingHospitalId: oouth._id,
      supplyingHospitalId: luth._id,
      resourceType: 'blood',
      bloodGroup: 'O-',
      units: 2,
      status: 'approved',
      requestedAt: pastDate(0.2),
      respondedAt: pastDate(0.1),
      notes: 'Urgent transfer for obstetric trauma in Sagamu. Cold chain courier dispatched with validated temperature logger.',
    },
    {
      requestingHospitalId: lasuth._id,
      supplyingHospitalId: luth._id,
      resourceType: 'blood',
      bloodGroup: 'AB+',
      units: 2,
      status: 'completed',
      requestedAt: pastDate(2),
      respondedAt: pastDate(1.9),
      completedAt: pastDate(1.8),
      notes: 'Plasma transfer for cardiac bypass surgery. Received and verified.',
    },
  ]);
  console.log('✅ Seeded inter-hospital resource sharing transfers.');

  // ==========================================
  // 9. AUDIT LOGS (Append-Only Provenance)
  // ==========================================
  console.log('🔒 Seeding immutable forensic audit log entries...');

  await AuditLog.create([
    {
      actorId: superAdminUser._id,
      actorEmail: superAdminUser.email,
      actorRole: 'superadmin',
      action: 'hospital.create',
      entity: 'Hospital',
      entityId: luth._id,
      summary: 'Onboarded Lagos University Teaching Hospital (LUTH) to national blood network',
      hospitalId: luth._id,
      createdAt: pastDate(10),
    },
    {
      actorId: luthAdminUser._id,
      actorEmail: luthAdminUser.email,
      actorRole: 'admin',
      action: 'capacity.update',
      entity: 'Hospital',
      entityId: luth._id,
      summary: 'Configured phlebotomy daily donation capacity to 15 donors/day',
      hospitalId: luth._id,
      createdAt: pastDate(8),
    },
    {
      actorId: luthLabUser._id,
      actorEmail: luthLabUser.email,
      actorRole: 'staff',
      action: 'donor.blood_group_verify_approve',
      entity: 'Donor',
      entityId: seededDonors[0]._id,
      summary: 'Laboratory scientist certified Babatunde Fashola as O-negative via tube agglutination',
      hospitalId: luth._id,
      createdAt: pastDate(5),
    },
    {
      actorId: luthAdminUser._id,
      actorEmail: luthAdminUser.email,
      actorRole: 'admin',
      action: 'requisition.approve',
      entity: 'ClinicalRequisition',
      summary: 'Approved clinical requisition SBB-8F21A for Mrs. Chioma Okafor (PPH Cesarean)',
      hospitalId: luth._id,
      createdAt: pastDate(0.1),
    },
  ]);
  console.log('✅ Seeded immutable audit log records.');

  console.log('\n======================================================');
  console.log('🎉 REALISTIC DATABASE POPULATION COMPLETED SUCCESSFULLY!');
  console.log('======================================================');
  console.log('🔑 Credentials Reference:');
  console.log('   • Super Admin (IT Plane):     superadmin@smartbloodbank.com / SuperAdmin123!');
  console.log('   • LUTH Admin (Hospital):      luth-admin@smartbloodbank.com / HospitalAdmin123!');
  console.log('   • LUTH Lab Scientist (Staff): luth-lab@smartbloodbank.com / HospitalStaff123!');
  console.log('   • LASUTH Admin (Hospital):    lasuth-admin@smartbloodbank.com / HospitalAdmin123!');
  console.log('   • LASUTH Nurse (Staff):       lasuth-nurse@smartbloodbank.com / HospitalStaff123!');
  console.log('   • Voluntary Donor Portal:     babatunde.fashola@example.com / DonorPassword123!');
  console.log('   • Doctor Access PINs:         DOC-2026, DOC-2045, HOSP-LUTH');
  console.log('======================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Database seed error:', err);
  process.exit(1);
});
