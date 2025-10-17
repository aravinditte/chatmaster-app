const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/chats
// @desc    Get all chats for current user
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const chats = await Chat.find({ 
            participants: req.user._id,
            isArchived: false
        })
        .populate('participants', 'username email avatar isOnline lastSeen')
        .populate('lastMessage')
        .populate('admins', 'username email avatar')
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(parseInt(limit));

        // Get unread count for each chat
        const chatsWithUnread = await Promise.all(
            chats.map(async (chat) => {
                const unreadCount = await Message.getUnreadCount(chat._id, req.user._id);
                const chatObj = chat.toObject();
                
                // For private chats, set the chat name to the other participant's name
                if (chat.type === 'private') {
                    const otherParticipant = chat.participants.find(
                        p => p._id.toString() !== req.user._id.toString()
                    );
                    chatObj.name = otherParticipant?.username || 'Unknown User';
                    chatObj.avatar = otherParticipant?.avatar || { url: '' };
                }
                
                return {
                    ...chatObj,
                    unreadCount,
                    isPinned: chat.pinnedBy.includes(req.user._id),
                    isMuted: chat.mutedBy.some(m => m.user.equals(req.user._id))
                };
            })
        );

        res.json({
            success: true,
            chats: chatsWithUnread,
            page: parseInt(page),
            totalPages: Math.ceil(chats.length / parseInt(limit))
        });

    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET api/chats/:chatId
// @desc    Get chat by ID
// @access  Private
router.get('/:chatId', auth, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId)
            .populate('participants', 'username email avatar isOnline lastSeen')
            .populate('admins', 'username email avatar')
            .populate('creator', 'username email avatar');

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        // Check if user is participant
        if (!chat.isParticipant(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const chatObj = chat.toObject();
        
        // For private chats, set the chat name to the other participant's name
        if (chat.type === 'private') {
            const otherParticipant = chat.participants.find(
                p => p._id.toString() !== req.user._id.toString()
            );
            chatObj.name = otherParticipant?.username || 'Unknown User';
            chatObj.avatar = otherParticipant?.avatar || { url: '' };
        }

        res.json({
            success: true,
            chat: chatObj
        });

    } catch (error) {
        console.error('Get chat error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/chats/private
// @desc    Create or get private chat
// @access  Private
router.post('/private', [
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
        const otherUser = await User.findById(userId);
        if (!otherUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Can't chat with yourself
        if (userId === req.user._id.toString()) {
            return res.status(400).json({ error: 'Cannot create chat with yourself' });
        }

        // Check if user is blocked
        if (req.user.blockedUsers.includes(userId) || otherUser.blockedUsers.includes(req.user._id)) {
            return res.status(403).json({ error: 'Cannot create chat with blocked user' });
        }

        // Find or create private chat
        const chat = await Chat.findOrCreatePrivateChat(req.user._id, userId);
        
        // Populate the chat
        await chat.populate('participants', 'username email avatar isOnline lastSeen');

        const chatObj = chat.toObject();
        chatObj.name = otherUser.username;
        chatObj.avatar = otherUser.avatar;

        res.status(chat.isNew ? 201 : 200).json({
            success: true,
            chat: chatObj
        });

    } catch (error) {
        console.error('Create private chat error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/chats/group
// @desc    Create group chat
// @access  Private
router.post('/group', [
    auth,
    body('name').trim().notEmpty().withMessage('Group name is required')
        .isLength({ max: 100 }).withMessage('Group name too long'),
    body('participants').isArray({ min: 1 }).withMessage('At least one participant required'),
    body('description').optional().trim().isLength({ max: 500 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { name, participants, description } = req.body;

        // Add creator to participants
        const allParticipants = [...new Set([req.user._id.toString(), ...participants])];

        // Validate all participants exist
        const users = await User.find({ _id: { $in: allParticipants } });
        if (users.length !== allParticipants.length) {
            return res.status(400).json({ error: 'Some participants not found' });
        }

        // Create group chat
        const chat = new Chat({
            name,
            type: 'group',
            participants: allParticipants,
            creator: req.user._id,
            admins: [req.user._id],
            description: description || ''
        });

        await chat.save();

        // Populate the chat
        await chat.populate('participants', 'username email avatar isOnline lastSeen');
        await chat.populate('admins', 'username email avatar');

        // Create system message
        const systemMessage = new Message({
            chat: chat._id,
            sender: req.user._id,
            content: `${req.user.username} created the group`,
            type: 'system'
        });
        await systemMessage.save();

        res.status(201).json({
            success: true,
            chat
        });

    } catch (error) {
        console.error('Create group chat error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT api/chats/:chatId
// @desc    Update group chat
// @access  Private
router.put('/:chatId', [
    auth,
    body('name').optional().trim().isLength({ max: 100 }),
    body('description').optional().trim().isLength({ max: 500 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (chat.type !== 'group') {
            return res.status(400).json({ error: 'Only group chats can be updated' });
        }

        // Check if user is admin
        if (!chat.isAdmin(req.user._id)) {
            return res.status(403).json({ error: 'Only admins can update group' });
        }

        const { name, description } = req.body;

        if (name) chat.name = name;
        if (description !== undefined) chat.description = description;

        await chat.save();

        res.json({
            success: true,
            message: 'Group updated successfully',
            chat
        });

    } catch (error) {
        console.error('Update chat error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/chats/:chatId/participants
// @desc    Add participant to group
// @access  Private
router.post('/:chatId/participants', [
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
        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (chat.type !== 'group') {
            return res.status(400).json({ error: 'Can only add participants to groups' });
        }

        // Check if user can add participants
        if (!chat.settings.allowInvites && !chat.isAdmin(req.user._id)) {
            return res.status(403).json({ error: 'Only admins can add participants' });
        }

        // Check if user exists
        const newUser = await User.findById(userId);
        if (!newUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if already a participant
        if (chat.isParticipant(userId)) {
            return res.status(400).json({ error: 'User already in group' });
        }

        // Add participant
        await chat.addParticipant(userId);

        // Create system message
        const systemMessage = new Message({
            chat: chat._id,
            sender: req.user._id,
            content: `${req.user.username} added ${newUser.username}`,
            type: 'system'
        });
        await systemMessage.save();

        res.json({
            success: true,
            message: 'Participant added successfully'
        });

    } catch (error) {
        console.error('Add participant error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   DELETE api/chats/:chatId/participants/:userId
// @desc    Remove participant from group
// @access  Private
router.delete('/:chatId/participants/:userId', auth, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (chat.type !== 'group') {
            return res.status(400).json({ error: 'Can only remove participants from groups' });
        }

        const { userId } = req.params;
        const isRemovingSelf = userId === req.user._id.toString();

        // Only admins can remove others, anyone can leave
        if (!isRemovingSelf && !chat.isAdmin(req.user._id)) {
            return res.status(403).json({ error: 'Only admins can remove participants' });
        }

        // Can't remove creator
        if (chat.creator && chat.creator.equals(userId)) {
            return res.status(403).json({ error: 'Cannot remove group creator' });
        }

        const userToRemove = await User.findById(userId);
        if (!userToRemove) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Remove participant
        await chat.removeParticipant(userId);

        // Create system message
        const systemMessage = new Message({
            chat: chat._id,
            sender: req.user._id,
            content: isRemovingSelf 
                ? `${req.user.username} left the group`
                : `${req.user.username} removed ${userToRemove.username}`,
            type: 'system'
        });
        await systemMessage.save();

        res.json({
            success: true,
            message: isRemovingSelf ? 'Left group successfully' : 'Participant removed successfully'
        });

    } catch (error) {
        console.error('Remove participant error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/chats/:chatId/admins/:userId
// @desc    Make user admin
// @access  Private
router.post('/:chatId/admins/:userId', auth, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (chat.type !== 'group') {
            return res.status(400).json({ error: 'Only groups have admins' });
        }

        // Only admins can promote others
        if (!chat.isAdmin(req.user._id)) {
            return res.status(403).json({ error: 'Only admins can promote users' });
        }

        await chat.addAdmin(req.params.userId);

        const newAdmin = await User.findById(req.params.userId);
        
        // Create system message
        const systemMessage = new Message({
            chat: chat._id,
            sender: req.user._id,
            content: `${req.user.username} made ${newAdmin.username} an admin`,
            type: 'system'
        });
        await systemMessage.save();

        res.json({
            success: true,
            message: 'User promoted to admin'
        });

    } catch (error) {
        console.error('Add admin error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   DELETE api/chats/:chatId/admins/:userId
// @desc    Remove admin
// @access  Private
router.delete('/:chatId/admins/:userId', auth, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        // Only creator can demote admins
        if (!chat.creator.equals(req.user._id)) {
            return res.status(403).json({ error: 'Only creator can remove admins' });
        }

        await chat.removeAdmin(req.params.userId);

        res.json({
            success: true,
            message: 'Admin removed successfully'
        });

    } catch (error) {
        console.error('Remove admin error:', error);
        res.status(500).json({ error: error.message || 'Server error' });
    }
});

// @route   POST api/chats/:chatId/mute
// @desc    Mute chat
// @access  Private
router.post('/:chatId/mute', auth, async (req, res) => {
    try {
        const { duration } = req.body; // duration in milliseconds
        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        await chat.muteForUser(req.user._id, duration);

        res.json({
            success: true,
            message: 'Chat muted successfully'
        });

    } catch (error) {
        console.error('Mute chat error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/chats/:chatId/unmute
// @desc    Unmute chat
// @access  Private
router.post('/:chatId/unmute', auth, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        await chat.unmuteForUser(req.user._id);

        res.json({
            success: true,
            message: 'Chat unmuted successfully'
        });

    } catch (error) {
        console.error('Unmute chat error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/chats/:chatId/pin
// @desc    Pin chat
// @access  Private
router.post('/:chatId/pin', auth, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        await chat.pinForUser(req.user._id);

        res.json({
            success: true,
            message: 'Chat pinned successfully'
        });

    } catch (error) {
        console.error('Pin chat error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/chats/:chatId/unpin
// @desc    Unpin chat
// @access  Private
router.post('/:chatId/unpin', auth, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        await chat.unpinForUser(req.user._id);

        res.json({
            success: true,
            message: 'Chat unpinned successfully'
        });

    } catch (error) {
        console.error('Unpin chat error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   DELETE api/chats/:chatId
// @desc    Delete chat
// @access  Private
router.delete('/:chatId', auth, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        // For private chats, just leave
        if (chat.type === 'private') {
            return res.status(400).json({ error: 'Cannot delete private chat' });
        }

        // Only creator can delete group
        if (!chat.creator.equals(req.user._id)) {
            return res.status(403).json({ error: 'Only creator can delete group' });
        }

        // Delete all messages
        await Message.deleteMany({ chat: chat._id });

        // Delete chat
        await chat.remove();

        res.json({
            success: true,
            message: 'Chat deleted successfully'
        });

    } catch (error) {
        console.error('Delete chat error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
