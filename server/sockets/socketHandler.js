const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

// Store active users and typing status
const activeUsers = new Map(); // userId -> { socketId, user }
const typingUsers = new Map(); // chatId -> Set of userIds
const activeCalls = new Map(); // callId -> { participants, type }

const socketHandler = (io) => {
    // Socket authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            
            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);
            
            if (!user) {
                return next(new Error('Authentication error: User not found'));
            }

            socket.userId = user._id.toString();
            socket.user = user;
            next();
        } catch (error) {
            console.error('Socket auth error:', error);
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        console.log(`[User Connected] ${socket.user.username} (${socket.id})`);

        try {
            // Update user online status
            await User.findByIdAndUpdate(socket.userId, {
                isOnline: true,
                socketId: socket.id,
                lastSeen: new Date()
            });

            // Store active user
            activeUsers.set(socket.userId, {
                socketId: socket.id,
                user: socket.user
            });

            // Join user's personal room
            socket.join(`user_${socket.userId}`);

            // Join user's chat rooms
            const userChats = await Chat.find({ 
                participants: socket.userId 
            }).select('_id');
            
            userChats.forEach(chat => {
                socket.join(`chat_${chat._id}`);
            });

            // Broadcast user online status to contacts
            const user = await User.findById(socket.userId).populate('contacts');
            user.contacts.forEach(contact => {
                io.to(`user_${contact._id}`).emit('user_status_change', {
                    userId: socket.userId,
                    username: socket.user.username,
                    isOnline: true,
                    lastSeen: new Date()
                });
            });

            // Send online users list to the connected user
            const onlineUsers = Array.from(activeUsers.keys());
            socket.emit('online_users', onlineUsers);

        } catch (error) {
            console.error('Connection setup error:', error);
        }

        // ==================== CHAT EVENTS ====================

        // Join a specific chat
        socket.on('join_chat', async (data) => {
            try {
                const { chatId } = data;
                const chat = await Chat.findById(chatId);
                
                if (!chat) {
                    return socket.emit('error', { message: 'Chat not found' });
                }

                if (!chat.isParticipant(socket.userId)) {
                    return socket.emit('error', { message: 'Access denied' });
                }

                socket.join(`chat_${chatId}`);
                socket.emit('joined_chat', { chatId, success: true });
                
                console.log(`User ${socket.user.username} joined chat ${chatId}`);
            } catch (error) {
                console.error('Join chat error:', error);
                socket.emit('error', { message: 'Failed to join chat' });
            }
        });

        // Leave a chat
        socket.on('leave_chat', (data) => {
            const { chatId } = data;
            socket.leave(`chat_${chatId}`);
            socket.emit('left_chat', { chatId });
        });

        // ==================== MESSAGE EVENTS ====================

        // Send message
        socket.on('send_message', async (data) => {
            try {
                const { chatId, content, type = 'text', replyTo, file, metadata } = data;

                // Validate chat access
                const chat = await Chat.findById(chatId);
                if (!chat) {
                    return socket.emit('error', { message: 'Chat not found' });
                }

                if (!chat.isParticipant(socket.userId)) {
                    return socket.emit('error', { message: 'Access denied' });
                }

                // Check group permissions
                if (chat.type === 'group' && chat.settings.onlyAdminsCanMessage) {
                    if (!chat.isAdmin(socket.userId)) {
                        return socket.emit('error', { message: 'Only admins can send messages' });
                    }
                }

                // Create message
                const messageData = {
                    chat: chatId,
                    sender: socket.userId,
                    content,
                    type
                };

                if (replyTo) messageData.replyTo = replyTo;
                if (file) messageData.file = file;
                if (metadata) messageData.metadata = metadata;

                const message = new Message(messageData);
                await message.save();

                // Update chat's last message and activity
                chat.lastMessage = message._id;
                chat.lastActivity = new Date();
                await chat.save();

                // Populate message
                await message.populate('sender', 'username avatar');
                if (replyTo) {
                    await message.populate('replyTo', 'content sender type');
                }

                // Remove typing indicator
                const chatTyping = typingUsers.get(chatId);
                if (chatTyping) {
                    chatTyping.delete(socket.userId);
                    io.to(`chat_${chatId}`).emit('typing_stop', {
                        userId: socket.userId,
                        chatId
                    });
                }

                // Mark as delivered to online participants
                const onlineParticipants = chat.participants.filter(p => 
                    activeUsers.has(p.toString()) && p.toString() !== socket.userId
                );

                for (const participantId of onlineParticipants) {
                    await message.markAsDeliveredTo(participantId);
                }

                // Broadcast message to chat participants
                io.to(`chat_${chatId}`).emit('new_message', message);

                // Send acknowledgment to sender
                socket.emit('message_sent', {
                    tempId: data.tempId,
                    message
                });

                console.log(`Message sent in chat ${chatId} by ${socket.user.username}`);

            } catch (error) {
                console.error('Send message error:', error);
                socket.emit('message_error', { 
                    tempId: data.tempId,
                    error: 'Failed to send message' 
                });
            }
        });

        // Edit message
        socket.on('edit_message', async (data) => {
            try {
                const { messageId, content } = data;
                const message = await Message.findById(messageId);

                if (!message) {
                    return socket.emit('error', { message: 'Message not found' });
                }

                await message.editContent(content, socket.userId);

                io.to(`chat_${message.chat}`).emit('message_edited', {
                    messageId,
                    content,
                    editedAt: message.editedAt
                });

            } catch (error) {
                console.error('Edit message error:', error);
                socket.emit('error', { message: error.message });
            }
        });

        // Delete message
        socket.on('delete_message', async (data) => {
            try {
                const { messageId, deleteForEveryone = false } = data;
                const message = await Message.findById(messageId);

                if (!message) {
                    return socket.emit('error', { message: 'Message not found' });
                }

                await message.deleteMessage(socket.userId, deleteForEveryone);

                if (deleteForEveryone) {
                    io.to(`chat_${message.chat}`).emit('message_deleted', {
                        messageId,
                        deletedBy: socket.userId
                    });
                } else {
                    socket.emit('message_deleted_for_me', { messageId });
                }

            } catch (error) {
                console.error('Delete message error:', error);
                socket.emit('error', { message: error.message });
            }
        });

        // ==================== REACTION EVENTS ====================

        // Add reaction
        socket.on('add_reaction', async (data) => {
            try {
                const { messageId, emoji } = data;
                const message = await Message.findById(messageId);

                if (!message) {
                    return socket.emit('error', { message: 'Message not found' });
                }

                const chat = await Chat.findById(message.chat);
                if (!chat.isParticipant(socket.userId)) {
                    return socket.emit('error', { message: 'Access denied' });
                }

                await message.addReaction(socket.userId, emoji);

                io.to(`chat_${message.chat}`).emit('reaction_added', {
                    messageId,
                    userId: socket.userId,
                    emoji,
                    reactions: message.reactions
                });

            } catch (error) {
                console.error('Add reaction error:', error);
                socket.emit('error', { message: 'Failed to add reaction' });
            }
        });

        // Remove reaction
        socket.on('remove_reaction', async (data) => {
            try {
                const { messageId } = data;
                const message = await Message.findById(messageId);

                if (!message) {
                    return socket.emit('error', { message: 'Message not found' });
                }

                await message.removeReaction(socket.userId);

                io.to(`chat_${message.chat}`).emit('reaction_removed', {
                    messageId,
                    userId: socket.userId,
                    reactions: message.reactions
                });

            } catch (error) {
                console.error('Remove reaction error:', error);
                socket.emit('error', { message: 'Failed to remove reaction' });
            }
        });

        // ==================== TYPING EVENTS ====================

        // Typing start
        socket.on('typing_start', (data) => {
            const { chatId } = data;
            
            if (!typingUsers.has(chatId)) {
                typingUsers.set(chatId, new Set());
            }
            
            typingUsers.get(chatId).add(socket.userId);
            
            socket.to(`chat_${chatId}`).emit('typing_start', {
                userId: socket.userId,
                username: socket.user.username,
                chatId
            });
        });

        // Typing stop
        socket.on('typing_stop', (data) => {
            const { chatId } = data;
            
            const chatTyping = typingUsers.get(chatId);
            if (chatTyping) {
                chatTyping.delete(socket.userId);
                
                socket.to(`chat_${chatId}`).emit('typing_stop', {
                    userId: socket.userId,
                    chatId
                });
            }
        });

        // ==================== READ RECEIPTS ====================

        // Mark messages as read
        socket.on('mark_as_read', async (data) => {
            try {
                const { chatId, messageIds } = data;

                const chat = await Chat.findById(chatId);
                if (!chat || !chat.isParticipant(socket.userId)) {
                    return;
                }

                if (messageIds && messageIds.length > 0) {
                    await Promise.all(
                        messageIds.map(async (msgId) => {
                            const message = await Message.findById(msgId);
                            if (message && !message.sender.equals(socket.userId)) {
                                await message.markAsReadBy(socket.userId);
                            }
                        })
                    );
                } else {
                    await Message.markAllAsRead(chatId, socket.userId);
                }

                socket.to(`chat_${chatId}`).emit('messages_read', {
                    userId: socket.userId,
                    chatId,
                    messageIds
                });

            } catch (error) {
                console.error('Mark as read error:', error);
            }
        });

        // ==================== CALL EVENTS (WebRTC) ====================

        // Initiate call
        socket.on('call_initiate', async (data) => {
            try {
                const { chatId, callType, callId } = data;

                const chat = await Chat.findById(chatId);
                if (!chat || !chat.isParticipant(socket.userId)) {
                    return socket.emit('error', { message: 'Access denied' });
                }

                // Store active call
                activeCalls.set(callId, {
                    chatId,
                    callType,
                    initiator: socket.userId,
                    participants: [socket.userId],
                    startTime: new Date()
                });

                // Notify other participants
                socket.to(`chat_${chatId}`).emit('call_incoming', {
                    callId,
                    callType,
                    chatId,
                    caller: {
                        id: socket.userId,
                        username: socket.user.username,
                        avatar: socket.user.avatar
                    }
                });

                console.log(`Call initiated: ${callId} by ${socket.user.username}`);

            } catch (error) {
                console.error('Call initiate error:', error);
                socket.emit('error', { message: 'Failed to initiate call' });
            }
        });

        // WebRTC signaling
        socket.on('webrtc_offer', (data) => {
            const { targetUserId, offer, callId } = data;
            io.to(`user_${targetUserId}`).emit('webrtc_offer', {
                offer,
                callId,
                from: socket.userId
            });
        });

        socket.on('webrtc_answer', (data) => {
            const { targetUserId, answer, callId } = data;
            io.to(`user_${targetUserId}`).emit('webrtc_answer', {
                answer,
                callId,
                from: socket.userId
            });
        });

        socket.on('webrtc_ice_candidate', (data) => {
            const { targetUserId, candidate, callId } = data;
            io.to(`user_${targetUserId}`).emit('webrtc_ice_candidate', {
                candidate,
                callId,
                from: socket.userId
            });
        });

        // Call response
        socket.on('call_response', (data) => {
            const { callId, accepted, targetUserId } = data;
            
            if (accepted) {
                const call = activeCalls.get(callId);
                if (call) {
                    call.participants.push(socket.userId);
                }
            }

            io.to(`user_${targetUserId}`).emit('call_response', {
                callId,
                accepted,
                from: socket.userId,
                user: {
                    id: socket.userId,
                    username: socket.user.username,
                    avatar: socket.user.avatar
                }
            });
        });

        // Call end
        socket.on('call_end', (data) => {
            const { callId, chatId } = data;
            
            const call = activeCalls.get(callId);
            if (call) {
                activeCalls.delete(callId);
            }

            socket.to(`chat_${chatId}`).emit('call_ended', {
                callId,
                endedBy: socket.userId
            });

            console.log(`Call ended: ${callId}`);
        });

        // ==================== GROUP EVENTS ====================

        // User added to group
        socket.on('user_added_to_group', async (data) => {
            const { chatId, userId } = data;
            
            // Make the new user join the chat room
            const userSocket = activeUsers.get(userId);
            if (userSocket) {
                io.sockets.sockets.get(userSocket.socketId)?.join(`chat_${chatId}`);
            }

            // Notify all participants
            io.to(`chat_${chatId}`).emit('group_updated', {
                chatId,
                action: 'user_added',
                userId
            });
        });

        // User removed from group
        socket.on('user_removed_from_group', async (data) => {
            const { chatId, userId } = data;
            
            // Make the user leave the chat room
            const userSocket = activeUsers.get(userId);
            if (userSocket) {
                io.sockets.sockets.get(userSocket.socketId)?.leave(`chat_${chatId}`);
            }

            // Notify all participants
            io.to(`chat_${chatId}`).emit('group_updated', {
                chatId,
                action: 'user_removed',
                userId
            });
        });

        // ==================== DISCONNECT ====================

        socket.on('disconnect', async () => {
            console.log(`[User Disconnected] ${socket.user.username} (${socket.id})`);

            try {
                // Update user offline status
                await User.findByIdAndUpdate(socket.userId, {
                    isOnline: false,
                    lastSeen: new Date(),
                    socketId: ''
                });

                // Remove from active users
                activeUsers.delete(socket.userId);

                // Remove from all typing indicators
                typingUsers.forEach((users, chatId) => {
                    if (users.has(socket.userId)) {
                        users.delete(socket.userId);
                        io.to(`chat_${chatId}`).emit('typing_stop', {
                            userId: socket.userId,
                            chatId
                        });
                    }
                });

                // End any active calls
                activeCalls.forEach((call, callId) => {
                    if (call.participants.includes(socket.userId)) {
                        io.to(`chat_${call.chatId}`).emit('call_participant_left', {
                            callId,
                            userId: socket.userId
                        });
                    }
                });

                // Broadcast user offline status to contacts
                const user = await User.findById(socket.userId).populate('contacts');
                if (user) {
                    user.contacts.forEach(contact => {
                        io.to(`user_${contact._id}`).emit('user_status_change', {
                            userId: socket.userId,
                            username: socket.user.username,
                            isOnline: false,
                            lastSeen: new Date()
                        });
                    });
                }

            } catch (error) {
                console.error('Disconnect cleanup error:', error);
            }
        });
        // Add this in the connection handler, after other socket events

// ==================== FRIEND REQUEST EVENTS ====================

socket.on('send_friend_request', async (data) => {
  try {
    const { targetUserId } = data;
    
    // Notify the target user
    io.to(`user_${targetUserId}`).emit('new_friend_request', {
      from: {
        _id: socket.userId,
        username: socket.user.username,
        avatar: socket.user.avatar,
        friendId: socket.user.friendId
      }
    });
    
  } catch (error) {
    console.error('Send friend request error:', error);
  }
});

socket.on('accept_friend_request', async (data) => {
  try {
    const { fromUserId } = data;
    
    // Notify the sender
    io.to(`user_${fromUserId}`).emit('friend_request_accepted', {
      by: {
        _id: socket.userId,
        username: socket.user.username,
        avatar: socket.user.avatar,
        friendId: socket.user.friendId
      }
    });
    
  } catch (error) {
    console.error('Accept friend request error:', error);
  }
});


        // Handle errors
        socket.on('error', (error) => {
            console.error('Socket error:', error);
            socket.emit('error', { message: 'Socket error occurred' });
        });
    });

    // Periodic cleanup of typing indicators
    setInterval(() => {
        typingUsers.forEach((users, chatId) => {
            users.forEach(userId => {
                const user = activeUsers.get(userId);
                if (!user) {
                    users.delete(userId);
                }
            });
        });
    }, 30000); // Every 30 seconds

    console.log('[Socket.io] Handlers initialized');
};



module.exports = socketHandler;
