const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId }, 
        process.env.JWT_SECRET, 
        { expiresIn: '30d' }
    );
};

// @route   POST api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', [
    body('username')
        .trim()
        .isLength({ min: 3, max: 20 })
        .withMessage('Username must be between 3 and 20 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
        .matches(/\d/)
        .withMessage('Password must contain at least one number')
], async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array().map(e => e.msg)
            });
        }

        const { username, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            return res.status(400).json({ 
                error: existingUser.email === email 
                    ? 'Email already registered' 
                    : 'Username already taken' 
            });
        }

        // Create new user
        const user = new User({
            username: username.toLowerCase(),
            email,
            password
        });

        await user.save();

        // Generate token
        const token = generateToken(user._id);

        // Log the registration
        console.log(`[Registration] New user: ${username} (${email})`);
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: user.getPublicProfile()
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            error: 'Server error during registration',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// @route   POST api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
], async (req, res) => {
    try {
        // Validate request
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array().map(e => e.msg)
            });
        }

        const { email, password } = req.body;

        // Authenticate user
        const user = await User.getAuthenticated(email, password);

        // Update user status
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user._id);

        // Log the login
        console.log(`[Login] User: ${user.username}`);

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: user.getPublicProfile()
        });

    } catch (error) {
        console.error('Login error:', error);
        
        // Don't expose internal error details
        res.status(401).json({ 
            error: error.message || 'Invalid credentials'
        });
    }
});

// @route   GET api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('contacts', 'username email avatar isOnline lastSeen')
            .populate('blockedUsers', 'username email');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ 
            success: true,
            user: user.getPublicProfile() 
        });
        
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT api/auth/update-profile
// @desc    Update user profile
// @access  Private
router.put('/update-profile', [
    auth,
    body('username')
        .optional()
        .trim()
        .isLength({ min: 3, max: 20 })
        .matches(/^[a-zA-Z0-9_]+$/),
    body('status')
        .optional()
        .trim()
        .isLength({ max: 100 }),
    body('bio')
        .optional()
        .trim()
        .isLength({ max: 500 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { username, status, bio } = req.body;
        const updates = {};

        if (username) {
            // Check if username is taken
            const existingUser = await User.findOne({ 
                username: username.toLowerCase(),
                _id: { $ne: req.user._id }
            });
            
            if (existingUser) {
                return res.status(400).json({ error: 'Username already taken' });
            }
            
            updates.username = username.toLowerCase();
        }

        if (status !== undefined) updates.status = status;
        if (bio !== undefined) updates.bio = bio;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            updates,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: user.getPublicProfile()
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        user.isOnline = false;
        user.lastSeen = new Date();
        user.socketId = '';
        
        await user.save();

        console.log(`User logged out: ${user.username}`);

        res.json({ 
            success: true, 
            message: 'Logged out successfully' 
        });
        
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Server error during logout' });
    }
});

// @route   POST api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', [
    auth,
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 6 })
        .withMessage('New password must be at least 6 characters')
        .matches(/\d/)
        .withMessage('New password must contain at least one number')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { currentPassword, newPassword } = req.body;

        // Get user with password
        const user = await User.findById(req.user._id).select('+password');

        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   DELETE api/auth/delete-account
// @desc    Delete user account
// @access  Private
router.delete('/delete-account', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        // Remove user from all chats
        const Chat = require('../models/Chat');
        await Chat.updateMany(
            { participants: user._id },
            { $pull: { participants: user._id, admins: user._id } }
        );

        // Delete user's messages
        const Message = require('../models/Message');
        await Message.updateMany(
            { sender: user._id },
            { 
                deleted: true, 
                content: 'This message was deleted',
                deletedAt: new Date()
            }
        );

        // Delete user
        await user.remove();

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
