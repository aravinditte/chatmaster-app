const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/messages/:chatId
// @desc    Get messages for a chat
// @access  Private
router.get('/:chatId', [
    auth,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { chatId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Check if chat exists and user is participant
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (!chat.isParticipant(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get messages
        const messages = await Message.find({ 
            chat: chatId,
            $or: [
                { deleted: false },
                { deleted: true, sender: req.user._id }
            ]
        })
        .populate('sender', 'username avatar')
        .populate('replyTo', 'content sender type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

        // Filter out messages deleted for this user
        const filteredMessages = messages.filter(msg => 
            !msg.isDeletedForUser(req.user._id)
        );

        // Get total count
        const total = await Message.countDocuments({ 
            chat: chatId,
            deleted: false
        });

        res.json({
            success: true,
            messages: filteredMessages.reverse(),
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            hasMore: skip + filteredMessages.length < total
        });

    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/messages
// @desc    Send message
// @access  Private
router.post('/', [
    auth,
    body('chatId').notEmpty().withMessage('Chat ID is required'),
    body('content').trim().notEmpty().withMessage('Message content is required')
        .isLength({ max: 5000 }).withMessage('Message too long'),
    body('type').optional().isIn(['text', 'image', 'video', 'audio', 'file', 'system']),
    body('replyTo').optional().isMongoId()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { chatId, content, type = 'text', replyTo, file, metadata } = req.body;

        // Check if chat exists and user is participant
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (!chat.isParticipant(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Check group settings
        if (chat.type === 'group' && chat.settings.onlyAdminsCanMessage) {
            if (!chat.isAdmin(req.user._id)) {
                return res.status(403).json({ error: 'Only admins can send messages' });
            }
        }

        // Create message
        const messageData = {
            chat: chatId,
            sender: req.user._id,
            content,
            type
        };

        if (replyTo) messageData.replyTo = replyTo;
        if (file) messageData.file = file;
        if (metadata) messageData.metadata = metadata;

        const message = new Message(messageData);
        await message.save();

        // Update chat's last message
        chat.lastMessage = message._id;
        chat.lastActivity = new Date();
        await chat.save();

        // Populate message
        await message.populate('sender', 'username avatar');
        if (replyTo) {
            await message.populate('replyTo', 'content sender type');
        }

        res.status(201).json({
            success: true,
            message
        });

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   PUT api/messages/:messageId
// @desc    Edit message
// @access  Private
router.put('/:messageId', [
    auth,
    body('content').trim().notEmpty().withMessage('Message content is required')
        .isLength({ max: 5000 }).withMessage('Message too long')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { content } = req.body;
        const message = await Message.findById(req.params.messageId);

        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Edit message
        await message.editContent(content, req.user._id);

        res.json({
            success: true,
            message: 'Message edited successfully',
            data: message
        });

    } catch (error) {
        console.error('Edit message error:', error);
        res.status(400).json({ error: error.message || 'Server error' });
    }
});

// @route   DELETE api/messages/:messageId
// @desc    Delete message
// @access  Private
router.delete('/:messageId', auth, async (req, res) => {
    try {
        const { deleteForEveryone = false } = req.query;
        const message = await Message.findById(req.params.messageId);

        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Delete message
        await message.deleteMessage(req.user._id, deleteForEveryone === 'true');

        res.json({
            success: true,
            message: 'Message deleted successfully'
        });

    } catch (error) {
        console.error('Delete message error:', error);
        res.status(400).json({ error: error.message || 'Server error' });
    }
});

// @route   POST api/messages/:messageId/reaction
// @desc    Add reaction to message
// @access  Private
router.post('/:messageId/reaction', [
    auth,
    body('emoji').notEmpty().withMessage('Emoji is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { emoji } = req.body;
        const message = await Message.findById(req.params.messageId);

        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Check if user is in the chat
        const chat = await Chat.findById(message.chat);
        if (!chat.isParticipant(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Add reaction
        await message.addReaction(req.user._id, emoji);

        res.json({
            success: true,
            message: 'Reaction added successfully',
            reactions: message.reactions
        });

    } catch (error) {
        console.error('Add reaction error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   DELETE api/messages/:messageId/reaction
// @desc    Remove reaction from message
// @access  Private
router.delete('/:messageId/reaction', auth, async (req, res) => {
    try {
        const message = await Message.findById(req.params.messageId);

        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Remove reaction
        await message.removeReaction(req.user._id);

        res.json({
            success: true,
            message: 'Reaction removed successfully',
            reactions: message.reactions
        });

    } catch (error) {
        console.error('Remove reaction error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST api/messages/:chatId/read
// @desc    Mark messages as read
// @access  Private
router.post('/:chatId/read', [
    auth,
    body('messageIds').optional().isArray()
], async (req, res) => {
    try {
        const { chatId } = req.params;
        const { messageIds } = req.body;

        // Check if chat exists and user is participant
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (!chat.isParticipant(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (messageIds && messageIds.length > 0) {
            // Mark specific messages as read
            await Promise.all(
                messageIds.map(async (msgId) => {
                    const message = await Message.findById(msgId);
                    if (message) {
                        await message.markAsReadBy(req.user._id);
                    }
                })
            );
        } else {
            // Mark all messages in chat as read
            await Message.markAllAsRead(chatId, req.user._id);
        }

        res.json({
            success: true,
            message: 'Messages marked as read'
        });

    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET api/messages/search/:chatId
// @desc    Search messages in chat
// @access  Private
router.get('/search/:chatId', [
    auth,
    query('q').trim().notEmpty().withMessage('Search query is required'),
    query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { chatId } = req.params;
        const { q, limit = 20 } = req.query;

        // Check if chat exists and user is participant
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (!chat.isParticipant(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Search messages
        const messages = await Message.find({
            chat: chatId,
            content: { $regex: q, $options: 'i' },
            deleted: false,
            type: 'text'
        })
        .populate('sender', 'username avatar')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit));

        res.json({
            success: true,
            messages,
            count: messages.length
        });

    } catch (error) {
        console.error('Search messages error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
