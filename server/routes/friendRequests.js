const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST api/friend-requests/send
// @desc    Send friend request by Friend ID
// @access  Private
router.post('/send', [
    auth,
    body('friendId').trim().isLength({ min: 8, max: 8 }).withMessage('Invalid Friend ID')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { friendId } = req.body;

        // Find user by Friend ID
        const receiver = await User.findByFriendId(friendId);
        
        if (!receiver) {
            return res.status(404).json({ error: 'User not found with this Friend ID' });
        }

        // Can't send request to yourself
        if (receiver._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ error: 'Cannot send friend request to yourself' });
        }

        // Check if blocked
        if (req.user.blockedUsers.includes(receiver._id) || 
            receiver.blockedUsers.includes(req.user._id)) {
            return res.status(403).json({ error: 'Cannot send friend request to this user' });
        }

        // Send friend request
        await req.user.sendFriendRequest(receiver._id);

        res.json({
            success: true,
            message: 'Friend request sent successfully',
            user: {
                _id: receiver._id,
                username: receiver.username,
                avatar: receiver.avatar
            }
        });

    } catch (error) {
        console.error('Send friend request error:', error);
        res.status(400).json({ error: error.message || 'Failed to send friend request' });
    }
});

// @route   GET api/friend-requests
// @desc    Get all pending friend requests
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate({
                path: 'friendRequests.from',
                select: 'username email avatar friendId isOnline lastSeen'
            });

        const pendingRequests = user.friendRequests
            .filter(req => req.status === 'pending')
            .map(req => ({
                _id: req._id,
                from: req.from,
                createdAt: req.createdAt,
                status: req.status
            }));

        res.json({
            success: true,
            requests: pendingRequests,
            count: pendingRequests.length
        });

    } catch (error) {
        console.error('Get friend requests error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/friend-requests/accept/:userId
// @desc    Accept friend request and create private chat
// @access  Private
router.post('/accept/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;
        const Chat = require('../models/Chat');

        const sender = await req.user.acceptFriendRequest(userId);

        // AUTO-CREATE PRIVATE CHAT
        let chat = await Chat.findOne({
            type: 'private',
            participants: { $all: [req.user._id, userId] }
        });

        if (!chat) {
            chat = await Chat.create({
                type: 'private',
                participants: [req.user._id, userId]
            });

            await chat.populate('participants', 'username email avatar isOnline lastSeen friendId');
            
            console.log(`✅ Auto-created private chat for ${req.user.username} and ${sender.username}`);
        }

        res.json({
            success: true,
            message: 'Friend request accepted',
            friend: {
                _id: sender._id,
                username: sender.username,
                avatar: sender.avatar,
                friendId: sender.friendId
            },
            chat: chat
        });

    } catch (error) {
        console.error('Accept friend request error:', error);
        res.status(400).json({ error: error.message || 'Failed to accept friend request' });
    }
});


// @route   POST api/friend-requests/reject/:userId
// @desc    Reject friend request
// @access  Private
router.post('/reject/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;

        await req.user.rejectFriendRequest(userId);

        res.json({
            success: true,
            message: 'Friend request rejected'
        });

    } catch (error) {
        console.error('Reject friend request error:', error);
        res.status(400).json({ error: error.message || 'Failed to reject friend request' });
    }
});

// @route   GET api/friend-requests/sent
// @desc    Get sent friend requests
// @access  Private
router.get('/sent', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate({
                path: 'sentFriendRequests.to',
                select: 'username email avatar friendId isOnline lastSeen'
            });

        const sentRequests = user.sentFriendRequests
            .filter(req => req.status === 'pending')
            .map(req => ({
                _id: req._id,
                to: req.to,
                createdAt: req.createdAt,
                status: req.status
            }));

        res.json({
            success: true,
            requests: sentRequests,
            count: sentRequests.length
        });

    } catch (error) {
        console.error('Get sent requests error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
