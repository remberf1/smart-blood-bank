const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, isSuperAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { loginSchema, registerUserSchema, updateUserSchema } = require('../validators/schemas');
const { notifyNewUser } = require('../services/notificationService');

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

// ==================== CHANGE PASSWORD ====================
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
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
    res.json(user);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;