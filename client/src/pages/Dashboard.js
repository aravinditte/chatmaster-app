import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import UserProfile from '../components/UserProfile';
import ContactsList from '../components/ContactsList';
import AddFriendModal from '../components/AddFriendModal';
import FriendRequests from '../components/FriendRequests';
import CreateGroupModal from '../components/CreateGroupModal';
import { MessageCircle, Users, Settings, UserPlus, Bell, Plus, User } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from '../api/axios';

const Dashboard = () => {
  const [selectedChat, setSelectedChat] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [activeTab, setActiveTab] = useState('chats');
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0); // NEW
  const { user } = useAuth();
  const { on } = useSocket();

  useEffect(() => {
    fetchFriendRequestCount();
    fetchUnreadCount(); // NEW
  }, []);

  useEffect(() => {
    const unsubscribe = on('new_friend_request', (data) => {
      setFriendRequestCount(prev => prev + 1);
      toast.success(`New friend request from ${data.from.username}`, {
        icon: '👋',
      });
    });

    return () => unsubscribe?.();
  }, [on]);

  // NEW: Listen for new messages to update badge
  useEffect(() => {
    const unsubscribe = on('new_message', (message) => {
      // Only increment if message is not from current chat
      if (!selectedChat || message.chat !== selectedChat._id) {
        setTotalUnreadCount(prev => prev + 1);
      }
    });

    return () => unsubscribe?.();
  }, [on, selectedChat]);

  const fetchFriendRequestCount = async () => {
    try {
      const response = await axios.get('/friend-requests');
      setFriendRequestCount(response.data.count || 0);
    } catch (error) {
      console.error('Error fetching friend request count:', error);
    }
  };

  // NEW: Fetch total unread messages
  const fetchUnreadCount = async () => {
    try {
      const response = await axios.get('/chats');
      const total = response.data.chats?.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0) || 0;
      setTotalUnreadCount(total);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
    // Decrease unread count when opening chat
    if (chat.unreadCount > 0) {
      setTotalUnreadCount(prev => Math.max(0, prev - chat.unreadCount));
    }
  };

  const handleBack = () => {
    setSelectedChat(null);
  };

  const handleGroupCreated = (newGroup) => {
    setSelectedChat(newGroup);
    setActiveTab('groups');
  };

  const handleFriendRequestsClose = () => {
    setShowFriendRequests(false);
    fetchFriendRequestCount();
  };

  const handleStartChat = (chat) => {
    setSelectedChat(chat);
    setActiveTab('chats');
  };

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Sidebar */}
      <div className={`${selectedChat ? 'hidden lg:flex' : 'flex'} lg:w-80 w-full flex-col bg-white border-r`}>
        {/* Sidebar header */}
        <div className="p-4 border-b bg-primary-600 text-white">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">ChatMaster</h1>
            <div className="flex items-center space-x-2">
              {/* Friend Requests Button */}
              <button
                onClick={() => setShowFriendRequests(true)}
                className="relative p-2 hover:bg-primary-700 rounded-lg transition-colors"
                title="Friend Requests"
              >
                <Bell className="w-5 h-5" />
                {friendRequestCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {friendRequestCount}
                  </span>
                )}
              </button>

              {/* Add Friend Button */}
              <button
                onClick={() => setShowAddFriend(true)}
                className="p-2 hover:bg-primary-700 rounded-lg transition-colors"
                title="Add Friend"
              >
                <UserPlus className="w-5 h-5" />
              </button>

              {/* Profile Button */}
              <button
                onClick={() => setShowProfile(!showProfile)}
                className="p-2 hover:bg-primary-700 rounded-lg transition-colors"
                title="Profile"
              >
                <img
                  src={user?.avatar?.url || `https://ui-avatars.com/api/?name=${user?.username}&background=random`}
                  alt={user?.username}
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-white"
                />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('chats')}
              className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm flex items-center justify-center space-x-1 transition-all relative ${
                activeTab === 'chats'
                  ? 'bg-white bg-opacity-20 shadow-sm'
                  : 'hover:bg-white hover:bg-opacity-10'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span>Chats</span>
              {/* NEW: Unread badge */}
              {totalUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('contacts')}
              className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm flex items-center justify-center space-x-1 transition-all ${
                activeTab === 'contacts'
                  ? 'bg-white bg-opacity-20 shadow-sm'
                  : 'hover:bg-white hover:bg-opacity-10'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Friends</span>
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm flex items-center justify-center space-x-1 transition-all ${
                activeTab === 'groups'
                  ? 'bg-white bg-opacity-20 shadow-sm'
                  : 'hover:bg-white hover:bg-opacity-10'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Groups</span>
            </button>
          </div>
        </div>

        {/* New Group Button */}
        {activeTab === 'groups' && (
          <div className="p-4 border-b bg-gray-50">
            <button
              onClick={() => setShowCreateGroup(true)}
              className="w-full btn-primary py-2 flex items-center justify-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Create New Group</span>
            </button>
          </div>
        )}

        {/* Content based on active tab */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'chats' && (
            <ChatList
              onSelectChat={handleSelectChat}
              selectedChatId={selectedChat?._id}
              filterType="chats"
            />
          )}
          {activeTab === 'contacts' && (
            <ContactsList onStartChat={handleStartChat} />
          )}
          {activeTab === 'groups' && (
            <ChatList
              onSelectChat={handleSelectChat}
              selectedChatId={selectedChat?._id}
              filterType="groups"
            />
          )}
        </div>
      </div>

      {/* Main content */}
      <div className={`${selectedChat ? 'flex' : 'hidden lg:flex'} flex-1 flex-col`}>
        {selectedChat ? (
          <ChatWindow chat={selectedChat} onBack={handleBack} />
        ) : (
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
            <div className="text-center text-gray-500 max-w-md px-4">
              <div className="mb-6 relative">
                <div className="w-32 h-32 mx-auto bg-primary-100 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-16 h-16 text-primary-600" />
                </div>
              </div>
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">
                Welcome to ChatMaster
              </h2>
              <p className="text-gray-500 mb-6">
                Select a chat from the sidebar or start a new conversation
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={() => setShowAddFriend(true)}
                  className="btn-primary w-full py-3 flex items-center justify-center space-x-2"
                >
                  <UserPlus className="w-5 h-5" />
                  <span>Add Friend</span>
                </button>
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="btn-secondary w-full py-3 flex items-center justify-center space-x-2"
                >
                  <Users className="w-5 h-5" />
                  <span>Create Group</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Profile sidebar */}
      {showProfile && (
        <div className="hidden lg:block w-80 border-l bg-white">
          <UserProfile onClose={() => setShowProfile(false)} />
        </div>
      )}

      {/* Mobile profile overlay */}
      {showProfile && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-50">
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-2xl">
            <UserProfile onClose={() => setShowProfile(false)} />
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddFriend && (
        <AddFriendModal onClose={() => setShowAddFriend(false)} />
      )}

      {showFriendRequests && (
        <FriendRequests onClose={handleFriendRequestsClose} />
      )}

      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onGroupCreated={handleGroupCreated}
        />
      )}
    </div>
  );
};

export default Dashboard;
