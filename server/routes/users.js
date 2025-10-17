const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/users/search
// @desc    Search users by username or email
// @access  Private
router.get('/search', [
    auth,
    query('q')
        .trim()
        .isLength({ min: 1 })
        .withMessage('Search query is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { q, limit = 20 } = req.query;

        // Search users by username or email
        const users = await User.find({
            $or: [
                { username: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } }
            ],
            _id: { $ne: req.user._id }, // Exclude current user
            _id: { $nin: req.user.blockedUsers } // Exclude blocked users
        })
        .select('username email avatar status isOnline lastSeen')
        .limit(parseInt(limit));

        res.json({
            success: true,
            users,
            count: users.length
        });

    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET api/users/:userId
// @desc    Get user by ID
// @access  Private
router.get('/:userId', auth, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .select('username email avatar status bio isOnline lastSeen preferences.privacy');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check privacy settings
        const isContact = req.user.contacts.includes(user._id);
        const publicProfile = {
            _id: user._id,
            username: user.username,
            avatar: user.avatar
        };

        // Apply privacy settings
        if (user.preferences.privacy.profilePhoto === 'nobody' || 
            (user.preferences.privacy.profilePhoto === 'contacts' && !isContact)) {
            publicProfile.avatar = { url: '' };
        }

        if (user.preferences.privacy.status === 'everyone' || 
            (user.preferences.privacy.status === 'contacts' && isContact)) {
            publicProfile.status = user.status;
            publicProfile.bio = user.bio;
        }

        if (user.preferences.privacy.lastSeen === 'everyone' || 
            (user.preferences.privacy.lastSeen === 'contacts' && isContact)) {
            publicProfile.isOnline = user.isOnline;
            publicProfile.lastSeen = user.lastSeen;
        }

        res.json({
            success: true,
            user: publicProfile
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/users/contacts/add
// @desc    Add user to contacts
// @access  Private
router.post('/contacts/add', [
    auth,
    body('userId').notEmpty().withMessage('User ID is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { userId } = req.body;

        // Check if user exists
        const contactUser = await User.findById(userId);
        if (!contactUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Add to contacts
        await req.user.addContact(userId);

        res.json({
            success: true,
            message: 'Contact added successfully'
        });

    } catch (error) {
        console.error('Add contact error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   DELETE api/users/contacts/:userId
// @desc    Remove user from contacts
// @access  Private
router.delete('/contacts/:userId', auth, async (req, res) => {
    try {
        await req.user.removeContact(req.params.userId);

        res.json({
            success: true,
            message: 'Contact removed successfully'
        });

    } catch (error) {
        console.error('Remove contact error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET api/users/contacts
// @desc    Get user's contacts
// @access  Private
router.get('/contacts/list', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('contacts', 'username email avatar status isOnline lastSeen');

        res.json({
            success: true,
            contacts: user.contacts,
            count: user.contacts.length
        });

    } catch (error) {
        console.error('Get contacts error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/users/block
// @desc    Block a user
// @access  Private
router.post('/block', [
    auth,
    body('userId').notEmpty().withMessage('User ID is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { userId } = req.body;

        // Check if user exists
        const userToBlock = await User.findById(userId);
        if (!userToBlock) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Block user
        await req.user.blockUser(userId);

        res.json({
            success: true,
            message: 'User blocked successfully'
        });

    } catch (error) {
        console.error('Block user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/users/unblock
// @desc    Unblock a user
// @access  Private
router.post('/unblock', [
    auth,
    body('userId').notEmpty().withMessage('User ID is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { userId } = req.body;

        // Unblock user
        await req.user.unblockUser(userId);

        res.json({
            success: true,
            message: 'User unblocked successfully'
        });

    } catch (error) {
        console.error('Unblock user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET api/users/blocked
// @desc    Get blocked users
// @access  Private
router.get('/blocked/list', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('blockedUsers', 'username email avatar');

        res.json({
            success: true,
            blockedUsers: user.blockedUsers,
            count: user.blockedUsers.length
        });

    } catch (error) {
        console.error('Get blocked users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT api/users/preferences
// @desc    Update user preferences
// @access  Private
router.put('/preferences', [
    auth,
    body('preferences').isObject().withMessage('Preferences must be an object')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { preferences } = req.body;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $set: { preferences } },
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Preferences updated successfully',
            preferences: user.preferences
        });

    } catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
