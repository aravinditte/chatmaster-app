const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Generate unique 8-digit Friend ID - MOVE THIS TO TOP
async function generateUniqueFriendId() {
    const User = mongoose.model('User');
    let friendId;
    let isUnique = false;
    
    while (!isUnique) {
        // Generate 8-digit number
        friendId = Math.floor(10000000 + Math.random() * 90000000).toString();
        
        // Check if it exists
        const existing = await User.findOne({ friendId }).catch(() => null);
        if (!existing) {
            isUnique = true;
        }
    }
    
    return friendId;
}

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [20, 'Username cannot exceed 20 characters'],
        match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            'Please provide a valid email'
        ]
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    // Unique 8-digit Friend ID
    friendId: {
        type: String,
        unique: true,
        sparse: true // Allow null during creation
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
    status: {
        type: String,
        default: 'Available',
        maxlength: [100, 'Status cannot exceed 100 characters']
    },
    bio: {
        type: String,
        maxlength: [500, 'Bio cannot exceed 500 characters'],
        default: ''
    },
    isOnline: {
        type: Boolean,
        default: false
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    socketId: {
        type: String,
        default: ''
    },
    contacts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // Friend Requests
    friendRequests: [{
        from: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected'],
            default: 'pending'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    // Sent Friend Requests
    sentFriendRequests: [{
        to: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected'],
            default: 'pending'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    preferences: {
        notifications: {
            messages: {
                type: Boolean,
                default: true
            },
            calls: {
                type: Boolean,
                default: true
            },
            groups: {
                type: Boolean,
                default: true
            },
            friendRequests: {
                type: Boolean,
                default: true
            }
        },
        privacy: {
            lastSeen: {
                type: String,
                enum: ['everyone', 'contacts', 'nobody'],
                default: 'contacts'
            },
            profilePhoto: {
                type: String,
                enum: ['everyone', 'contacts', 'nobody'],
                default: 'everyone'
            },
            status: {
                type: String,
                enum: ['everyone', 'contacts', 'nobody'],
                default: 'contacts'
            }
        },
        theme: {
            type: String,
            enum: ['light', 'dark', 'auto'],
            default: 'auto'
        }
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toJSON: { 
        virtuals: true,
        transform(doc, ret) {
            delete ret.password;
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ friendId: 1 });
userSchema.index({ isOnline: 1 });

// FIRST: Generate unique Friend ID before saving - MUST BE BEFORE PASSWORD HASH
userSchema.pre('save', async function(next) {
    // Only generate friendId for new users or if friendId is missing
    if (this.isNew && !this.friendId) {
        try {
            this.friendId = await generateUniqueFriendId();
            console.log(`Generated Friend ID: ${this.friendId} for user: ${this.username}`);
        } catch (error) {
            console.error('Error generating Friend ID:', error);
            return next(error);
        }
    }
    next();
});

// SECOND: Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Update lastSeen when user data is saved
userSchema.pre('save', function(next) {
    if (this.isModified('isOnline') && this.isOnline) {
        this.lastSeen = new Date();
    }
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!candidatePassword) return false;
    
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Get public profile method
userSchema.methods.getPublicProfile = function() {
    return {
        _id: this._id,
        username: this.username,
        email: this.email,
        friendId: this.friendId,
        avatar: this.avatar,
        status: this.status,
        bio: this.bio,
        isOnline: this.isOnline,
        lastSeen: this.lastSeen,
        preferences: {
            theme: this.preferences.theme
        }
    };
};

// Method to send friend request
userSchema.methods.sendFriendRequest = async function(userId) {
    // Check if already friends
    if (this.contacts.includes(userId)) {
        throw new Error('Already friends with this user');
    }
    
    // Check if already sent request
    const alreadySent = this.sentFriendRequests.some(req => 
        req.to.toString() === userId.toString() && req.status === 'pending'
    );
    
    if (alreadySent) {
        throw new Error('Friend request already sent');
    }
    
    // Add to sent requests
    this.sentFriendRequests.push({
        to: userId,
        status: 'pending'
    });
    
    await this.save();
    
    // Add to receiver's friend requests
    const receiver = await this.model('User').findById(userId);
    receiver.friendRequests.push({
        from: this._id,
        status: 'pending'
    });
    
    await receiver.save();
    
    return receiver;
};

// Method to accept friend request
userSchema.methods.acceptFriendRequest = async function(fromUserId) {
    const request = this.friendRequests.find(req => 
        req.from.toString() === fromUserId.toString() && req.status === 'pending'
    );
    
    if (!request) {
        throw new Error('Friend request not found');
    }
    
    // Update request status
    request.status = 'accepted';
    
    // Add to contacts
    if (!this.contacts.includes(fromUserId)) {
        this.contacts.push(fromUserId);
    }
    
    await this.save();
    
    // Update sender's sent request and add to contacts
    const sender = await this.model('User').findById(fromUserId);
    const sentRequest = sender.sentFriendRequests.find(req => 
        req.to.toString() === this._id.toString()
    );
    
    if (sentRequest) {
        sentRequest.status = 'accepted';
    }
    
    if (!sender.contacts.includes(this._id)) {
        sender.contacts.push(this._id);
    }
    
    await sender.save();
    
    return sender;
};

// Method to reject friend request
userSchema.methods.rejectFriendRequest = async function(fromUserId) {
    const request = this.friendRequests.find(req => 
        req.from.toString() === fromUserId.toString() && req.status === 'pending'
    );
    
    if (!request) {
        throw new Error('Friend request not found');
    }
    
    request.status = 'rejected';
    await this.save();
    
    // Update sender's sent request
    const sender = await this.model('User').findById(fromUserId);
    const sentRequest = sender.sentFriendRequests.find(req => 
        req.to.toString() === this._id.toString()
    );
    
    if (sentRequest) {
        sentRequest.status = 'rejected';
    }
    
    await sender.save();
};

// Method to add contact
userSchema.methods.addContact = function(contactId) {
    if (!this.contacts.includes(contactId)) {
        this.contacts.push(contactId);
    }
    return this.save();
};

// Method to remove contact
userSchema.methods.removeContact = function(contactId) {
    this.contacts = this.contacts.filter(id => !id.equals(contactId));
    return this.save();
};

// Method to block user
userSchema.methods.blockUser = function(userId) {
    if (!this.blockedUsers.includes(userId)) {
        this.blockedUsers.push(userId);
        // Also remove from contacts
        this.contacts = this.contacts.filter(id => !id.equals(userId));
    }
    return this.save();
};

// Method to unblock user
userSchema.methods.unblockUser = function(userId) {
    this.blockedUsers = this.blockedUsers.filter(id => !id.equals(userId));
    return this.save();
};

// Static method to find user for login
userSchema.statics.getAuthenticated = async function(email, password) {
    const user = await this.findOne({ email }).select('+password');
    
    if (!user) {
        throw new Error('Invalid credentials');
    }
    
    // Test for matching password
    const isMatch = await user.comparePassword(password);
    
    if (isMatch) {
        return user;
    }
    
    throw new Error('Invalid credentials');
};

// Static method to find user by Friend ID
userSchema.statics.findByFriendId = function(friendId) {
    return this.findOne({ friendId });
};

module.exports = mongoose.model('User', userSchema);
