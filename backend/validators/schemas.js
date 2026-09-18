const { z } = require('zod');
const { formatNigerianPhone } = require('../utils/phone');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const bloodGroup = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const componentTypeEnum = z.enum([
  'WHOLE_BLOOD',
  'PACKED_RED_CELLS',
  'PLATELET_CONCENTRATE',
  'FRESH_FROZEN_PLASMA',
  'CRYOPRECIPITATE',
]);
// Optional email that also tolerates an empty string from forms.
const optionalEmail = z.email().optional().or(z.literal(''));

// Enforce valid Nigerian E.164 phone formats (080..., 23480..., +23480...) and reject non-digits like 'hh'.
const nigerianPhone = z.string().refine((val) => Boolean(formatNigerianPhone(val)), {
  message: 'Invalid phone number. Please enter a valid Nigerian phone number (e.g. 08012345678 or +2348012345678)',
});
const optionalNigerianPhone = z.string().refine((val) => !val || Boolean(formatNigerianPhone(val)), {
  message: 'Invalid phone number. Please enter a valid Nigerian phone number (e.g. 08012345678 or +2348012345678)',
}).optional().or(z.literal(''));

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const registerUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'superadmin', 'staff']).optional(),
  hospitalId: objectId.optional(),
});

const updateUserSchema = z.object({
  role: z.enum(['admin', 'superadmin', 'staff']).optional(),
  hospitalId: objectId.or(z.literal('')).nullable().optional(),
  isActive: z.boolean().optional(),
});

const donorDob = z.coerce.date().refine((dob) => {
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  if (dob > now) return false;
  const age = (now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return age >= 16 && age <= 100;
}, {
  message: 'Donors must be at least 16 years old and date of birth cannot be in the future',
});

const donorRegisterSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: nigerianPhone,
  email: optionalEmail,
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  bloodGroup,
  donationTypePreference: z.enum(['WHOLE_BLOOD', 'PLATELET_APHERESIS', 'PLASMA_APHERESIS']).optional().default('WHOLE_BLOOD'),
  nonRemunerationDeclared: z.boolean().optional().default(true),
  location: z.object({
    type: z.literal('Point').optional(),
    coordinates: z.array(z.number()).length(2, 'coordinates must be [lng, lat]'),
  }),
  dateOfBirth: donorDob,
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  weight: z.coerce.number().min(30, 'Weight must be at least 30 kg').max(300, 'Weight cannot exceed 300 kg').optional(),
  allergies: z.string().optional(),
  nin: z.string().regex(/^\d{11}$/, 'NIN must be exactly 11 digits').optional().or(z.literal('')),
  lastDonationDate: z.coerce.date().optional(),
});

const patientRequestSchema = z
  .object({
    patientName: z.string().optional(),
    contactPhone: nigerianPhone,
    email: optionalEmail,
    doctorName: z.string().optional(),
    doctorPhone: optionalNigerianPhone,
    clinicalIndication: z.string().optional(),
    referenceId: z.string().optional(),
    resourceType: z.enum(['blood', 'oxygen']),
    bloodGroup: bloodGroup.optional(),
    componentType: componentTypeEnum.optional().default('PACKED_RED_CELLS'),
    requiresThawing: z.boolean().optional().default(false),
    units: z.coerce.number().int().positive().default(1),
    urgency: z.enum(['emergency', 'scheduled', 'routine']).optional(),
    preferredHospitalId: objectId.optional(),
    scheduledTime: z.coerce.date().optional(),
    destinationFacility: z.string().optional(),
    ward: z.string().optional(),
    bedNumber: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.resourceType !== 'blood' || Boolean(d.bloodGroup), {
    message: 'Blood group is required for blood requests',
    path: ['bloodGroup'],
  });

const resourceRequestSchema = z.object({
  requestingHospitalId: objectId.optional(),
  supplyingHospitalId: objectId,
  resourceType: z.enum(['blood', 'oxygen']),
  bloodGroup: bloodGroup.optional(),
  componentType: componentTypeEnum.optional().default('PACKED_RED_CELLS'),
  units: z.coerce.number().int().positive(),
  notes: z.string().optional(),
});

module.exports = {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  registerUserSchema,
  updateUserSchema,
  donorRegisterSchema,
  patientRequestSchema,
  resourceRequestSchema,
  nigerianPhone,
};
