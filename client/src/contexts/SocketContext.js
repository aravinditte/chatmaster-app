import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const SocketContext = createContext();

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const { user, token } = useAuth();

  useEffect(() => {
    if (user && token) {
      console.log('[Socket] Connecting to:', SOCKET_URL);
      
      const newSocket = io(SOCKET_URL, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        path: '/socket.io/',
        autoConnect: true,
        forceNew: false,
        multiplex: true,
        timeout: 20000,
      });

      // Connection successful
      newSocket.on('connect', () => {
        console.log('[Socket] Connected successfully');
        setConnected(true);
        toast.success('Connected to server', {
          duration: 2000,
          position: 'bottom-right',
        });
      });

      // Connection failed
      newSocket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        setConnected(false);
        
        if (reason === 'io server disconnect') {
          // Server disconnected, manually reconnect
          newSocket.connect();
        }
        
        toast.error('Disconnected from server', {
          duration: 2000,
          position: 'bottom-right',
        });
      });

      // Connection error
      newSocket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error.message);
        setConnected(false);
        
        // Don't show toast on every reconnection attempt
        if (error.message.includes('unauthorized')) {
          toast.error('Authentication failed', {
            duration: 3000,
          });
        }
      });

      // Reconnection attempt
      newSocket.on('reconnect_attempt', (attemptNumber) => {
        console.log('[Socket] Reconnection attempt:', attemptNumber);
      });

      // Reconnection successful
      newSocket.on('reconnect', (attemptNumber) => {
        console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
        setConnected(true);
        toast.success('Reconnected to server', {
          duration: 2000,
          position: 'bottom-right',
        });
      });

      // Reconnection failed
      newSocket.on('reconnect_failed', () => {
        console.error('[Socket] Reconnection failed');
        toast.error('Could not reconnect to server', {
          duration: 4000,
        });
      });

      // Socket errors
      newSocket.on('error', (error) => {
        console.error('[Socket] Error:', error.message || error);
        toast.error(error.message || 'Socket error occurred', {
          duration: 3000,
        });
      });

      // Online users list
      newSocket.on('online_users', (users) => {
        console.log('[Socket] Online users updated:', users.length);
        setOnlineUsers(users);
      });

      // User status change
      newSocket.on('user_status_change', ({ userId, isOnline, username, lastSeen }) => {
        console.log('[Socket] User status change:', username, isOnline ? 'online' : 'offline');
        
        setOnlineUsers(prev => {
          if (isOnline) {
            return [...new Set([...prev, userId])];
          } else {
            return prev.filter(id => id !== userId);
          }
        });
      });

      // Joined chat acknowledgment
      newSocket.on('joined_chat', ({ chatId, success }) => {
        if (success) {
          console.log('[Socket] Joined chat:', chatId);
        }
      });

      // Left chat acknowledgment
      newSocket.on('left_chat', ({ chatId }) => {
        console.log('[Socket] Left chat:', chatId);
      });

      // Message sent acknowledgment
      newSocket.on('message_sent', ({ tempId, message }) => {
        console.log('[Socket] Message sent successfully:', tempId);
      });

      // Message error
      newSocket.on('message_error', ({ tempId, error }) => {
        console.error('[Socket] Message error:', error);
        toast.error('Failed to send message', {
          duration: 3000,
        });
      });

      setSocket(newSocket);

      return () => {
        console.log('[Socket] Cleaning up connection');
        newSocket.close();
        setSocket(null);
        setConnected(false);
      };
    } else {
      // User logged out, clean up socket
      if (socket) {
        socket.close();
        setSocket(null);
        setConnected(false);
      }
    }
  }, [user, token]);

  // Generic event listener
  const on = useCallback((event, callback) => {
    if (socket) {
      socket.on(event, callback);
      return () => socket.off(event, callback);
    }
    return () => {};
  }, [socket]);

  // Generic event emitter
  const emit = useCallback((event, data) => {
    if (socket && connected) {
      console.log('[Socket] Emitting event:', event);
      socket.emit(event, data);
      return true;
    } else {
      console.warn('[Socket] Cannot emit - not connected:', event);
      toast.error('Not connected to server', {
        duration: 2000,
      });
      return false;
    }
  }, [socket, connected]);

  // Remove event listener
  const off = useCallback((event, callback) => {
    if (socket) {
      socket.off(event, callback);
    }
  }, [socket]);

  // Join a chat room
  const joinChat = useCallback((chatId) => {
    if (!chatId) {
      console.error('[Socket] Cannot join chat: invalid chatId');
      return false;
    }
    
    console.log('[Socket] Joining chat:', chatId);
    return emit('join_chat', { chatId });
  }, [emit]);

  // Leave a chat room
  const leaveChat = useCallback((chatId) => {
    if (!chatId) {
      console.error('[Socket] Cannot leave chat: invalid chatId');
      return false;
    }
    
    console.log('[Socket] Leaving chat:', chatId);
    return emit('leave_chat', { chatId });
  }, [emit]);

  // Send a message
  const sendMessage = useCallback((messageData) => {
    if (!messageData || !messageData.chatId || !messageData.content) {
      console.error('[Socket] Cannot send message: invalid data');
      return false;
    }
    
    console.log('[Socket] Sending message to chat:', messageData.chatId);
    return emit('send_message', messageData);
  }, [emit]);

  // Send typing start indicator
  const sendTypingStart = useCallback((chatId) => {
    if (!chatId) return false;
    return emit('typing_start', { chatId });
  }, [emit]);

  // Send typing stop indicator
  const sendTypingStop = useCallback((chatId) => {
    if (!chatId) return false;
    return emit('typing_stop', { chatId });
  }, [emit]);

  // Mark messages as read
  const markAsRead = useCallback((chatId, messageIds) => {
    if (!chatId) return false;
    
    console.log('[Socket] Marking messages as read:', messageIds?.length || 'all');
    return emit('mark_as_read', { chatId, messageIds });
  }, [emit]);

  // Add reaction to message
  const addReaction = useCallback((messageId, emoji) => {
    if (!messageId || !emoji) return false;
    
    console.log('[Socket] Adding reaction:', emoji);
    return emit('add_reaction', { messageId, emoji });
  }, [emit]);

  // Remove reaction from message
  const removeReaction = useCallback((messageId) => {
    if (!messageId) return false;
    
    console.log('[Socket] Removing reaction');
    return emit('remove_reaction', { messageId });
  }, [emit]);

  // Edit message
  const editMessage = useCallback((messageId, content) => {
    if (!messageId || !content) return false;
    
    console.log('[Socket] Editing message:', messageId);
    return emit('edit_message', { messageId, content });
  }, [emit]);

  // Delete message
  const deleteMessage = useCallback((messageId, deleteForEveryone = false) => {
    if (!messageId) return false;
    
    console.log('[Socket] Deleting message:', messageId);
    return emit('delete_message', { messageId, deleteForEveryone });
  }, [emit]);

  // Send friend request notification
  const sendFriendRequest = useCallback((targetUserId) => {
    if (!targetUserId) return false;
    
    console.log('[Socket] Sending friend request notification');
    return emit('send_friend_request', { targetUserId });
  }, [emit]);

  // Accept friend request notification
  const acceptFriendRequest = useCallback((fromUserId) => {
    if (!fromUserId) return false;
    
    console.log('[Socket] Accepting friend request');
    return emit('accept_friend_request', { fromUserId });
  }, [emit]);

  // Call events
  const initiateCall = useCallback((chatId, callType, callId, targetUserId) => {
    if (!chatId || !callType || !callId) return false;
    
    console.log('[Socket] Initiating call:', callType);
    return emit('call_initiate', { chatId, callType, callId, targetUserId });
  }, [emit]);

  const sendWebRTCOffer = useCallback((targetUserId, offer, callId) => {
    if (!targetUserId || !offer || !callId) return false;
    
    console.log('[Socket] Sending WebRTC offer');
    return emit('webrtc_offer', { targetUserId, offer, callId });
  }, [emit]);

  const sendWebRTCAnswer = useCallback((targetUserId, answer, callId) => {
    if (!targetUserId || !answer || !callId) return false;
    
    console.log('[Socket] Sending WebRTC answer');
    return emit('webrtc_answer', { targetUserId, answer, callId });
  }, [emit]);

  const sendICECandidate = useCallback((targetUserId, candidate, callId) => {
    if (!targetUserId || !candidate || !callId) return false;
    
    return emit('webrtc_ice_candidate', { targetUserId, candidate, callId });
  }, [emit]);

  const respondToCall = useCallback((callId, accepted, targetUserId) => {
    if (!callId || accepted === undefined) return false;
    
    console.log('[Socket] Responding to call:', accepted ? 'accepted' : 'declined');
    return emit('call_response', { callId, accepted, targetUserId });
  }, [emit]);

  const endCall = useCallback((callId, chatId) => {
    if (!callId || !chatId) return false;
    
    console.log('[Socket] Ending call');
    return emit('call_end', { callId, chatId });
  }, [emit]);

  // Context value
  const value = {
    socket,
    connected,
    onlineUsers,
    on,
    emit,
    off,
    joinChat,
    leaveChat,
    sendMessage,
    sendTypingStart,
    sendTypingStop,
    markAsRead,
    addReaction,
    removeReaction,
    editMessage,
    deleteMessage,
    sendFriendRequest,
    acceptFriendRequest,
    initiateCall,
    sendWebRTCOffer,
    sendWebRTCAnswer,
    sendICECandidate,
    respondToCall,
    endCall,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export default SocketContext;
