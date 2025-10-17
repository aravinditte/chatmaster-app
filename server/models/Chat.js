const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        maxlength: [100, 'Chat name cannot exceed 100 characters']
    },
    type: {
        type: String,
        enum: ['private', 'group'],
        required: [true, 'Chat type is required']
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    admins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    avatar: {
        url: {
            type: String,
            default: ''
        },
        publicId: {
            type: String,
            default: ''
        }
    },
    description: {
        type: String,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    settings: {
        allowInvites: {
            type: Boolean,
            default: true
        },
        onlyAdminsCanMessage: {
            type: Boolean,
            default: false
        },
        onlyAdminsCanEditInfo: {
            type: Boolean,
            default: true
        }
    },
    isArchived: {
        type: Boolean,
        default: false
    },
    mutedBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        mutedUntil: Date
    }],
    pinnedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
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

// Indexes for performance
chatSchema.index({ participants: 1 });
chatSchema.index({ lastActivity: -1 });
chatSchema.index({ type: 1 });
chatSchema.index({ 'participants': 1, 'lastActivity': -1 });

// Virtual for participant count
chatSchema.virtual('participantCount').get(function() {
    return this.participants ? this.participants.length : 0;
});

// Virtual to check if chat is muted
chatSchema.virtual('isMuted').get(function() {
    return this.mutedBy && this.mutedBy.length > 0;
});

// Validation: Private chats must have exactly 2 participants
chatSchema.pre('save', function(next) {
    if (this.type === 'private') {
        if (this.participants.length !== 2) {
            next(new Error('Private chats must have exactly 2 participants'));
        } else {
            // Private chats don't need names or admins
            this.name = undefined;
            this.admins = [];
        }
    } else if (this.type === 'group') {
        if (this.participants.length < 2) {
            next(new Error('Group chats must have at least 2 participants'));
        }
        if (!this.name) {
            next(new Error('Group chats must have a name'));
        }
        // Ensure creator is in admins
        if (this.creator && !this.admins.includes(this.creator)) {
            this.admins.push(this.creator);
        }
    }
    next();
});

// Update lastActivity on save
chatSchema.pre('save', function(next) {
    if (this.isModified('lastMessage')) {
        this.lastActivity = new Date();
    }
    next();
});

// Method to add participant
chatSchema.methods.addParticipant = function(userId) {
    if (!this.participants.includes(userId)) {
        this.participants.push(userId);
    }
    return this.save();
};

// Method to remove participant
chatSchema.methods.removeParticipant = function(userId) {
    this.participants = this.participants.filter(id => !id.equals(userId));
    this.admins = this.admins.filter(id => !id.equals(userId));
    this.pinnedBy = this.pinnedBy.filter(id => !id.equals(userId));
    this.mutedBy = this.mutedBy.filter(m => !m.user.equals(userId));
    return this.save();
};

// Method to add admin
chatSchema.methods.addAdmin = function(userId) {
    if (this.participants.includes(userId) && !this.admins.includes(userId)) {
        this.admins.push(userId);
    }
    return this.save();
};

// Method to remove admin
chatSchema.methods.removeAdmin = function(userId) {
    // Can't remove the creator
    if (this.creator && this.creator.equals(userId)) {
        throw new Error('Cannot remove creator as admin');
    }
    this.admins = this.admins.filter(id => !id.equals(userId));
    return this.save();
};

// Method to check if user is admin
chatSchema.methods.isAdmin = function(userId) {
    return this.admins.some(id => id.equals(userId));
};

// Method to check if user is participant
chatSchema.methods.isParticipant = function(userId) {
    return this.participants.some(id => id.equals(userId));
};

// Method to mute chat for user
chatSchema.methods.muteForUser = function(userId, duration = null) {
    const existingMute = this.mutedBy.find(m => m.user.equals(userId));
    
    if (existingMute) {
        existingMute.mutedUntil = duration ? new Date(Date.now() + duration) : null;
    } else {
        this.mutedBy.push({
            user: userId,
            mutedUntil: duration ? new Date(Date.now() + duration) : null
        });
    }
    
    return this.save();
};

// Method to unmute chat for user
chatSchema.methods.unmuteForUser = function(userId) {
    this.mutedBy = this.mutedBy.filter(m => !m.user.equals(userId));
    return this.save();
};

// Method to pin chat for user
chatSchema.methods.pinForUser = function(userId) {
    if (!this.pinnedBy.includes(userId)) {
        this.pinnedBy.push(userId);
    }
    return this.save();
};

// Method to unpin chat for user
chatSchema.methods.unpinForUser = function(userId) {
    this.pinnedBy = this.pinnedBy.filter(id => !id.equals(userId));
    return this.save();
};

// Static method to find or create private chat
chatSchema.statics.findOrCreatePrivateChat = async function(user1Id, user2Id) {
    // Look for existing private chat
    let chat = await this.findOne({
        type: 'private',
        participants: { $all: [user1Id, user2Id] }
    });
    
    if (!chat) {
        // Create new private chat
        chat = await this.create({
            type: 'private',
            participants: [user1Id, user2Id]
        });
    }
    
    return chat;
};

module.exports = mongoose.model('Chat', chatSchema);
