import React, { useState, useEffect } from 'react';
import { Search, UserPlus, MessageCircle } from 'lucide-react';
import axios from '../api/axios';
import { useSocket } from '../contexts/SocketContext';
import toast from 'react-hot-toast';

const ContactsList = ({ onStartChat }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { onlineUsers } = useSocket();

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    try {
      const response = await axios.get('/users/contacts/list');
      setContacts(response.data.contacts || []);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const startChat = async (contact) => {
    try {
      const response = await axios.post('/chats/private', {
        userId: contact._id
      });
      
      onStartChat(response.data.chat);
    } catch (error) {
      console.error('Error creating chat:', error);
      toast.error('Failed to start chat');
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isOnline = (userId) => onlineUsers.includes(userId);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
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
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Contacts list */}
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
            <UserPlus className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-center">No contacts yet</p>
            <p className="text-sm text-center mt-2">Add friends to see them here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredContacts.map((contact) => (
              <div
                key={contact._id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  {/* Avatar */}
                  <div className="relative">
                    <img
                      src={contact.avatar?.url || `https://ui-avatars.com/api/?name=${contact.username}&background=random`}
                      alt={contact.username}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    {isOnline(contact._id) && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                    )}
                  </div>

                  {/* Contact info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">
                      {contact.username}
                    </h3>
                    <p className="text-sm text-gray-500 truncate">
                      {contact.status || 'Available'}
                    </p>
                  </div>

                  {/* Chat button */}
                  <button
                    onClick={() => startChat(contact)}
                    className="p-2 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200 transition-colors"
                    title="Start Chat"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactsList;
