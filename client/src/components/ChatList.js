import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import { useSocket } from '../contexts/SocketContext';
import { formatDistanceToNow } from 'date-fns';
import { Search, MessageCircle, Users } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

const ChatList = ({ onSelectChat, selectedChatId, filterType = 'chats' }) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { on, onlineUsers } = useSocket();

  useEffect(() => {
    fetchChats();
  }, []);

  useEffect(() => {
    // Listen for new messages
    const unsubscribe = on('new_message', (message) => {
      setChats(prev => {
        const updated = prev.map(chat => {
          if (chat._id === message.chat) {
            return {
              ...chat,
              lastMessage: message,
              lastActivity: message.createdAt,
              unreadCount: chat._id === selectedChatId ? 0 : (chat.unreadCount || 0) + 1
            };
          }
          return chat;
        });
        return updated.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
      });
    });

    return () => unsubscribe?.();
  }, [on, selectedChatId]);

  useEffect(() => {
    // Listen for group updates
    const unsubscribe = on('group_updated', ({ chatId }) => {
      fetchChats(); // Refresh chats when group is updated
    });

    return () => unsubscribe?.();
  }, [on]);

  const fetchChats = async () => {
    try {
      const response = await axios.get('/chats');
      setChats(response.data.chats || []);
    } catch (error) {
      console.error('Error fetching chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const isUserOnline = (userId) => {
    return onlineUsers.includes(userId);
  };

  // Filter chats by type
  const filteredByType = chats.filter(chat => {
    if (filterType === 'chats') {
      return chat.type === 'private';
    } else if (filterType === 'groups') {
      return chat.type === 'group';
    }
    return true;
  });

  // Then filter by search query
  const filteredChats = filteredByType.filter(chat => {
    const chatName = chat.name?.toLowerCase() || '';
    return chatName.includes(searchQuery.toLowerCase());
  });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder={`Search ${filterType}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
            {filterType === 'groups' ? (
              <>
                <Users className="w-16 h-16 mb-4 text-gray-300" />
                <p className="text-center">No groups yet</p>
                <p className="text-sm text-center mt-2">Create a group to get started</p>
              </>
            ) : (
              <>
                <MessageCircle className="w-16 h-16 mb-4 text-gray-300" />
                <p className="text-center">No chats yet</p>
                <p className="text-sm text-center mt-2">Add friends to start chatting</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredChats.map((chat) => {
              const isSelected = chat._id === selectedChatId;
              const lastMessage = chat.lastMessage;
              const isOnline = chat.type === 'private' && 
                chat.participants?.some(p => p._id !== chat._id && isUserOnline(p._id));

              return (
                <div
                  key={chat._id}
                  onClick={() => onSelectChat(chat)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    isSelected ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {chat.type === 'group' ? (
                        <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                          <Users className="w-6 h-6 text-primary-600" />
                        </div>
                      ) : (
                        <img
                          src={chat.avatar?.url || `https://ui-avatars.com/api/?name=${chat.name}&background=random`}
                          alt={chat.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      )}
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                      )}
                    </div>

                    {/* Chat info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium text-gray-900 truncate flex items-center space-x-2">
                          <span>{chat.name}</span>
                          {chat.type === 'group' && (
                            <span className="text-xs text-gray-500">
                              ({chat.participants?.length})
                            </span>
                          )}
                        </h3>
                        {lastMessage && (
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                            {formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600 truncate">
                          {lastMessage?.content || 'No messages yet'}
                        </p>
                        {chat.unreadCount > 0 && (
                          <span className="ml-2 px-2 py-1 text-xs font-medium text-white bg-primary-600 rounded-full flex-shrink-0">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatList;
