import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from '../api/axios';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import Message from './Message';
import MessageInput from './MessageInput';
import CallModal from './CallModal';
import { Phone, Video, MoreVertical, ArrowLeft } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import toast from 'react-hot-toast';

const ChatWindow = ({ chat, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [showCallModal, setShowCallModal] = useState(false);
  const [callType, setCallType] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const messagesEndRef = useRef(null);
  const { user } = useAuth();
  const { on, joinChat, leaveChat, markAsRead, onlineUsers } = useSocket();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!chat?._id) return;
    
    try {
      setLoading(true);
      const response = await axios.get(`/messages/${chat._id}`);
      setMessages(response.data.messages || []);
      
      // Mark all as read
      const unreadIds = response.data.messages
        .filter(msg => msg.sender._id !== user._id && !msg.readBy?.some(r => r.user === user._id))
        .map(msg => msg._id);
      
      if (unreadIds.length > 0) {
        markAsRead(chat._id, unreadIds);
      }
      
      scrollToBottom();
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [chat?._id, user?._id, markAsRead, scrollToBottom]);

  useEffect(() => {
    if (chat) {
      fetchMessages();
      joinChat(chat._id);

      return () => {
        leaveChat(chat._id);
      };
    }
  }, [chat, fetchMessages, joinChat, leaveChat]);

  useEffect(() => {
    if (!chat) return;

    // Listen for new messages
    const unsubscribeNewMessage = on('new_message', (message) => {
      if (message.chat === chat._id) {
        setMessages(prev => [...prev, message]);
        scrollToBottom();
        
        // Mark as read if not sender
        if (message.sender._id !== user._id) {
          markAsRead(chat._id, [message._id]);
        }
      }
    });

    // Listen for message edits
    const unsubscribeEdit = on('message_edited', ({ messageId, content, editedAt }) => {
      setMessages(prev => prev.map(msg => 
        msg._id === messageId ? { ...msg, content, edited: true, editedAt } : msg
      ));
    });

    // Listen for message deletes
    const unsubscribeDelete = on('message_deleted', ({ messageId }) => {
      setMessages(prev => prev.map(msg => 
        msg._id === messageId ? { ...msg, deleted: true, content: 'This message was deleted' } : msg
      ));
    });

    // Listen for reactions
    const unsubscribeReaction = on('reaction_added', ({ messageId, reactions }) => {
      setMessages(prev => prev.map(msg => 
        msg._id === messageId ? { ...msg, reactions } : msg
      ));
    });

    // Listen for typing indicators
    const unsubscribeTypingStart = on('typing_start', ({ userId, chatId }) => {
      if (chatId === chat._id && userId !== user._id) {
        setTypingUsers(prev => new Set([...prev, userId]));
      }
    });

    const unsubscribeTypingStop = on('typing_stop', ({ userId, chatId }) => {
      if (chatId === chat._id) {
        setTypingUsers(prev => {
          const updated = new Set(prev);
          updated.delete(userId);
          return updated;
        });
      }
    });

    return () => {
      unsubscribeNewMessage?.();
      unsubscribeEdit?.();
      unsubscribeDelete?.();
      unsubscribeReaction?.();
      unsubscribeTypingStart?.();
      unsubscribeTypingStop?.();
    };
  }, [chat, on, user, markAsRead, scrollToBottom]);

  // Listen for incoming calls
  useEffect(() => {
    const unsubscribeIncoming = on('call_incoming', (data) => {
      if (data.chatId === chat?._id) {
        setIncomingCall(data);
        setCallType(data.callType);
        setShowCallModal(true);
        
        // Show browser notification
        toast(`Incoming ${data.callType} call from ${data.caller.username}`, {
          icon: data.callType === 'video' ? '📹' : '📞',
          duration: 5000,
        });
      }
    });

    return () => unsubscribeIncoming?.();
  }, [on, chat]);

  const isUserOnline = () => {
    if (chat?.type === 'private') {
      const otherUser = chat.participants?.find(p => p._id !== user._id);
      return otherUser && onlineUsers.includes(otherUser._id);
    }
    return false;
  };

  const startVoiceCall = () => {
    if (chat.type === 'group') {
      toast.error('Voice calls are only available in private chats');
      return;
    }
    setCallType('voice');
    setIncomingCall(null);
    setShowCallModal(true);
  };

  const startVideoCall = () => {
    if (chat.type === 'group') {
      toast.error('Video calls are only available in private chats');
      return;
    }
    setCallType('video');
    setIncomingCall(null);
    setShowCallModal(true);
  };

  const handleCloseCall = () => {
    setShowCallModal(false);
    setIncomingCall(null);
    setCallType(null);
  };

  if (!chat) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <p className="text-lg">Select a chat to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white z-10">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="relative">
            <img
              src={chat.avatar?.url || `https://ui-avatars.com/api/?name=${chat.name}&background=random`}
              alt={chat.name}
              className="w-10 h-10 rounded-full object-cover"
            />
            {isUserOnline() && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
            )}
          </div>
          
          <div>
            <h2 className="font-semibold text-gray-900">{chat.name}</h2>
            {chat.type === 'group' ? (
              <p className="text-sm text-gray-500">{chat.participants?.length} members</p>
            ) : (
              <p className="text-sm text-gray-500">
                {isUserOnline() ? 'Online' : 'Offline'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Voice call button - only for private chats */}
          {chat.type === 'private' && (
            <button 
              onClick={startVoiceCall}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Voice Call"
            >
              <Phone className="w-5 h-5 text-gray-600" />
            </button>
          )}
          
          {/* Video call button - only for private chats */}
          {chat.type === 'private' && (
            <button 
              onClick={startVideoCall}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Video Call"
            >
              <Video className="w-5 h-5 text-gray-600" />
            </button>
          )}
          
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <MoreVertical className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-50">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg mb-2">No messages yet</p>
              <p className="text-sm">Start the conversation!</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <Message
                key={message._id}
                message={message}
                isOwn={message.sender._id === user._id}
                showAvatar={
                  index === 0 ||
                  messages[index - 1].sender._id !== message.sender._id
                }
              />
            ))}
            
            {/* Typing indicator */}
            {typingUsers.size > 0 && (
              <div className="flex items-center space-x-2 text-gray-500 text-sm">
                <div className="flex space-x-1">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
                <span>Someone is typing...</span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input */}
      <MessageInput chatId={chat._id} />

      {/* Call Modal */}
      {showCallModal && (
        <CallModal
          chat={chat}
          callType={callType}
          isIncoming={!!incomingCall}
          caller={user}
          incomingCallData={incomingCall}
          onClose={handleCloseCall}
        />
      )}
    </div>
  );
};

export default ChatWindow;
