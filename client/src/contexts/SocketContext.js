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

  // Initialize socket connection
  useEffect(() => {
    if (user && token) {
      const newSocket = io(SOCKET_URL, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });

      newSocket.on('connect', () => {
        console.log('✅ Socket connected');
        setConnected(true);
        toast.success('Connected');
      });

      newSocket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
        setConnected(false);
        toast.error('Disconnected');
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        toast.error('Connection error');
      });

      newSocket.on('error', (error) => {
        console.error('Socket error:', error.message);
        toast.error(error.message || 'Socket error');
      });

      newSocket.on('online_users', (users) => {
        setOnlineUsers(users);
      });

      newSocket.on('user_status_change', ({ userId, isOnline, lastSeen }) => {
        setOnlineUsers(prev => {
          if (isOnline) {
            return [...new Set([...prev, userId])];
          } else {
            return prev.filter(id => id !== userId);
          }
        });
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [user, token]);

  // Socket event listeners
  const on = useCallback((event, callback) => {
    if (socket) {
      socket.on(event, callback);
      return () => socket.off(event, callback);
    }
  }, [socket]);

  const emit = useCallback((event, data) => {
    if (socket && connected) {
      socket.emit(event, data);
    } else {
      console.warn('Socket not connected');
    }
  }, [socket, connected]);

  const off = useCallback((event, callback) => {
    if (socket) {
      socket.off(event, callback);
    }
  }, [socket]);

  // Join a chat room
  const joinChat = useCallback((chatId) => {
    emit('join_chat', { chatId });
  }, [emit]);

  // Leave a chat room
  const leaveChat = useCallback((chatId) => {
    emit('leave_chat', { chatId });
  }, [emit]);

  // Send a message
  const sendMessage = useCallback((messageData) => {
    emit('send_message', messageData);
  }, [emit]);

  // Send typing indicator
  const sendTypingStart = useCallback((chatId) => {
    emit('typing_start', { chatId });
  }, [emit]);

  const sendTypingStop = useCallback((chatId) => {
    emit('typing_stop', { chatId });
  }, [emit]);

  // Mark messages as read
  const markAsRead = useCallback((chatId, messageIds) => {
    emit('mark_as_read', { chatId, messageIds });
  }, [emit]);

  // Add reaction
  const addReaction = useCallback((messageId, emoji) => {
    emit('add_reaction', { messageId, emoji });
  }, [emit]);

  // Remove reaction
  const removeReaction = useCallback((messageId) => {
    emit('remove_reaction', { messageId });
  }, [emit]);

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
