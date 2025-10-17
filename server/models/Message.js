const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    emoji: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const messageSchema = new mongoose.Schema({
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: [true, 'Chat reference is required'],
        index: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Sender reference is required'],
        index: true
    },
    content: {
        type: String,
        required: [true, 'Message content is required'],
        maxlength: [5000, 'Message cannot exceed 5000 characters'],
        trim: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'audio', 'file', 'system'],
        default: 'text'
    },
    file: {
        url: String,
        publicId: String,
        filename: String,
        size: Number,
        mimeType: String,
        thumbnail: String
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    reactions: [reactionSchema],
    readBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
    deliveredTo: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        deliveredAt: {
            type: Date,
            default: Date.now
        }
    }],
    edited: {
        type: Boolean,
        default: false
    },
    editedAt: Date,
    deleted: {
        type: Boolean,
        default: false
    },
    deletedAt: Date,
    deletedFor: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    metadata: {
        linkPreview: {
            url: String,
            title: String,
            description: String,
            image: String
        },
        location: {
            latitude: Number,
            longitude: Number,
            address: String
        },
        duration: Number, // For audio/video
        dimensions: {
            width: Number,
            height: Number
        }
    }
}, {
    timestamps: true,
    toJSON: { 
        virtuals: true,
        transform(doc, ret) {
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

// Compound indexes for efficient queries
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ chat: 1, deleted: 1, createdAt: -1 });

// Virtual for read status
messageSchema.virtual('isRead').get(function() {
    return this.readBy && this.readBy.length > 0;
});

// Virtual for delivered status
messageSchema.virtual('isDelivered').get(function() {
    return this.deliveredTo && this.deliveredTo.length > 0;
});

// Virtual for reaction count
messageSchema.virtual('reactionCount').get(function() {
    return this.reactions ? this.reactions.length : 0;
});

// Method to mark as read by user
messageSchema.methods.markAsReadBy = function(userId) {
    // Don't mark own messages as read
    if (this.sender.equals(userId)) {
        return this;
    }
    
    const alreadyRead = this.readBy.find(read => read.user.equals(userId));
    
    if (!alreadyRead) {
        this.readBy.push({
            user: userId,
            readAt: new Date()
        });
    }
    
    return this.save();
};

// Method to mark as delivered to user
messageSchema.methods.markAsDeliveredTo = function(userId) {
    // Don't mark own messages as delivered
    if (this.sender.equals(userId)) {
        return this;
    }
    
    const alreadyDelivered = this.deliveredTo.find(d => d.user.equals(userId));
    
    if (!alreadyDelivered) {
        this.deliveredTo.push({
            user: userId,
            deliveredAt: new Date()
        });
    }
    
    return this.save();
};

// Method to add reaction
messageSchema.methods.addReaction = function(userId, emoji) {
    const existingReaction = this.reactions.find(r => r.user.equals(userId));
    
    if (existingReaction) {
        // Update existing reaction
        existingReaction.emoji = emoji;
        existingReaction.createdAt = new Date();
    } else {
        // Add new reaction
        this.reactions.push({ 
            user: userId, 
            emoji,
            createdAt: new Date()
        });
    }
    
    return this.save();
};

// Method to remove reaction
messageSchema.methods.removeReaction = function(userId) {
    this.reactions = this.reactions.filter(r => !r.user.equals(userId));
    return this.save();
};

// Method to edit message content
messageSchema.methods.editContent = function(newContent, userId) {
    // Only sender can edit
    if (!this.sender.equals(userId)) {
        throw new Error('Only sender can edit message');
    }
    
    // Can't edit deleted messages
    if (this.deleted) {
        throw new Error('Cannot edit deleted message');
    }
    
    // Can't edit system messages
    if (this.type === 'system') {
        throw new Error('Cannot edit system message');
    }
    
    this.content = newContent;
    this.edited = true;
    this.editedAt = new Date();
    
    return this.save();
};

// Method to delete message
messageSchema.methods.deleteMessage = function(userId, deleteForEveryone = false) {
    if (deleteForEveryone) {
        // Only sender can delete for everyone
        if (!this.sender.equals(userId)) {
            throw new Error('Only sender can delete message for everyone');
        }
        this.deleted = true;
        this.deletedAt = new Date();
        this.content = 'This message was deleted';
    } else {
        // Delete for specific user
        if (!this.deletedFor.includes(userId)) {
            this.deletedFor.push(userId);
        }
    }
    
    return this.save();
};

// Method to check if message is deleted for user
messageSchema.methods.isDeletedForUser = function(userId) {
    return this.deleted || this.deletedFor.some(id => id.equals(userId));
};

// Static method to get unread count for user in chat
messageSchema.statics.getUnreadCount = async function(chatId, userId) {
    return await this.countDocuments({
        chat: chatId,
        sender: { $ne: userId },
        'readBy.user': { $ne: userId },
        deleted: false
    });
};

// Static method to mark all messages as read in a chat
messageSchema.statics.markAllAsRead = async function(chatId, userId) {
    return await this.updateMany(
        {
            chat: chatId,
            sender: { $ne: userId },
            'readBy.user': { $ne: userId },
            deleted: false
        },
        {
            $push: {
                readBy: {
                    user: userId,
                    readAt: new Date()
                }
            }
        }
    );
};

module.exports = mongoose.model('Message', messageSchema);
