const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, isSuperAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { loginSchema, registerUserSchema, updateUserSchema, forgotPasswordSchema, resetPasswordSchema } = require('../validators/schemas');
const { notifyNewUser, sendEmail, buildPasswordResetEmail } = require('../services/notificationService');
const { generateResetToken, hashToken } = require('../utils/passwordReset');
const { logAudit } = require('../services/auditService');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ==================== REGISTER (Super Admin only - for creating staff) ====================
router.post('/register', auth, isSuperAdmin, validate(registerUserSchema), async (req, res) => {
  try {
    const { name, email, password, role, hospitalId } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Create user
    const user = new User({ name, email, password, role, hospitalId });
    await user.save();

    // Best-effort welcome email.
    notifyNewUser(user).catch(() => {});

    logAudit(req.user, 'user.create', {
      entity: 'User', entityId: user._id,
      summary: `Created ${user.role} ${user.email}`,
    });

    // Create token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, hospitalId: user.hospitalId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== LOGIN ====================
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }
    
    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();

    logAudit(
      { userId: user._id, email: user.email, role: user.role, hospitalId: user.hospitalId },
      'auth.login',
      { entity: 'User', entityId: user._id, summary: `${user.email} signed in` }
    );

    // Create token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, hospitalId: user.hospitalId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== FORGOT PASSWORD (request a reset link) ====================
// Always responds success — never reveal whether an email is registered.
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  const generic = { message: 'If that email is registered, a reset link has been sent.' };
  try {
    const user = await User.findOne({ email: req.body.email });
    if (user && user.isActive) {
      const { raw, hash, expiry } = generateResetToken();
      user.resetTokenHash = hash;
      user.resetTokenExpiry = expiry;
      await user.save();

      const resetUrl = `${APP_URL}/reset-password?token=${raw}`;
      const e = buildPasswordResetEmail(user.name, resetUrl);
      // Best-effort: don't fail the request if email is disabled/misconfigured.
      sendEmail(user.email, e.subject, e.text, e.html).catch((err) =>
        console.error('Reset email failed:', err.message)
      );
    }
    res.json(generic);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== RESET PASSWORD (consume the token) ====================
router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  try {
    const { token, password } = req.body;
    const user = await User.findOne({
      resetTokenHash: hashToken(token),
      resetTokenExpiry: { $gt: new Date() },
    }).select('+resetTokenHash +resetTokenExpiry');

    if (!user) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    user.password = password; // hashed by the pre-save hook
    user.resetTokenHash = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: 'Password updated. You can now sign in with your new password.' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== GET CURRENT USER ====================
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== UPDATE OWN PROFILE (name) ====================
router.put('/me', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required.' });
    }
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { name: name.trim() },
      { new: true }
    ).select('-password').populate('hospitalId', 'name');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== CHANGE PASSWORD ====================
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    const user = await User.findById(req.user.userId);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== GET ALL USERS (Admin only) ====================
router.get('/users', auth, async (req, res) => {
  try {
    // Only superadmin can list all users
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const users = await User.find().select('-password').populate('hospitalId', 'name');
    res.json(users);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== UPDATE USER (Super Admin only) ====================
// Assign/change a user's hospital, role, or active status.
router.put('/users/:id', auth, isSuperAdmin, validate(updateUserSchema), async (req, res) => {
  try {
    const { role, hospitalId, isActive } = req.body;

    // Guard against self-lockout: a superadmin can't demote or deactivate itself.
    if (req.params.id === req.user.userId) {
      if (role !== undefined && role !== req.user.role) {
        return res.status(400).json({ error: 'You cannot change your own role' });
      }
      if (isActive === false) {
        return res.status(400).json({ error: 'You cannot deactivate your own account' });
      }
    }

    const update = {};
    if (role !== undefined) update.role = role;
    if (hospitalId !== undefined) update.hospitalId = hospitalId || null;
    if (isActive !== undefined) update.isActive = isActive;

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('-password')
      .populate('hospitalId', 'name');
    if (!user) return res.status(404).json({ error: 'User not found' });
    logAudit(req.user, 'user.update', {
      entity: 'User', entityId: user._id,
      summary: `Updated ${user.email}`, meta: update,
    });
    res.json(user);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== DELETE USER (Super Admin only) ====================
router.delete('/users/:id', auth, isSuperAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Never remove the last superadmin (would lock everyone out of admin).
    if (target.role === 'superadmin') {
      const supers = await User.countDocuments({ role: 'superadmin' });
      if (supers <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last superadmin.' });
      }
    }

    await User.findByIdAndDelete(req.params.id);
    logAudit(req.user, 'user.delete', {
      entity: 'User', entityId: target._id,
      summary: `Deleted ${target.role} ${target.email}`,
    });
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;