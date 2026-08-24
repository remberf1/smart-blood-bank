const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const bloodGroup = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
// Optional email that also tolerates an empty string from forms.
const optionalEmail = z.email().optional().or(z.literal(''));

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'Password is required'),
});

const registerUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'superadmin', 'staff']).optional(),
  hospitalId: objectId.optional(),
});

const donorRegisterSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: optionalEmail,
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  bloodGroup,
  location: z.object({
    type: z.literal('Point').optional(),
    coordinates: z.array(z.number()).length(2, 'coordinates must be [lng, lat]'),
  }),
  dateOfBirth: z.coerce.date(),
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  weight: z.coerce.number().positive().optional(),
  lastDonationDate: z.coerce.date().optional(),
});

const patientRequestSchema = z
  .object({
    patientName: z.string().optional(),
    contactPhone: z.string().min(1, 'Contact phone is required'),
    resourceType: z.enum(['blood', 'oxygen']),
    bloodGroup: bloodGroup.optional(),
    units: z.coerce.number().int().positive().default(1),
    urgency: z.enum(['emergency', 'scheduled', 'routine']).optional(),
    preferredHospitalId: objectId.optional(),
    scheduledTime: z.coerce.date().optional(),
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
  units: z.coerce.number().int().positive(),
  notes: z.string().optional(),
});

module.exports = {
  loginSchema,
  registerUserSchema,
  donorRegisterSchema,
  patientRequestSchema,
  resourceRequestSchema,
};
