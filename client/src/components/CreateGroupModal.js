import React, { useState, useEffect } from 'react';
import { X, Users, Search, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import axios from '../api/axios';
import toast from 'react-hot-toast';

const CreateGroupModal = ({ onClose, onGroupCreated }) => {
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingContacts, setFetchingContacts] = useState(true);
  const { user } = useAuth();

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
      setFetchingContacts(false);
    }
  };

  const toggleContact = (contactId) => {
    setSelectedContacts(prev => {
      if (prev.includes(contactId)) {
        return prev.filter(id => id !== contactId);
      } else {
        return [...prev, contactId];
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!groupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }

    if (selectedContacts.length === 0) {
      toast.error('Please select at least one contact');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post('/chats/group', {
        name: groupName.trim(),
        description: groupDescription.trim(),
        participants: selectedContacts
      });

      toast.success('Group created successfully!');
      onGroupCreated?.(response.data.chat);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold flex items-center space-x-2">
            <Users className="w-6 h-6 text-primary-600" />
            <span>Create New Group</span>
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="p-6 space-y-4">
            {/* Group Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Group Name *
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name"
                className="input-primary"
                maxLength={100}
                required
              />
            </div>

            {/* Group Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (Optional)
              </label>
              <textarea
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                placeholder="What's this group about?"
                className="input-primary"
                rows="2"
                maxLength={500}
              />
            </div>

            {/* Selected Count */}
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">Select Members</span>
              <span className="text-primary-600">
                {selectedContacts.length} selected
              </span>
            </div>

            {/* Search Contacts */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {fetchingContacts ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? 'No contacts found' : 'No contacts yet'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredContacts.map((contact) => {
                  const isSelected = selectedContacts.includes(contact._id);
                  
                  return (
                    <div
                      key={contact._id}
                      onClick={() => toggleContact(contact._id)}
                      className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-primary-50 border-2 border-primary-500' 
                          : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                      }`}
                    >
                      <img
                        src={contact.avatar?.url || `https://ui-avatars.com/api/?name=${contact.username}&background=random`}
                        alt={contact.username}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">
                          {contact.username}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {contact.status || 'Available'}
                        </p>
                      </div>

                      {isSelected && (
                        <div className="flex-shrink-0 w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t p-6">
            <button
              type="submit"
              disabled={loading || !groupName.trim() || selectedContacts.length === 0}
              className="w-full btn-primary py-3 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Users className="w-5 h-5" />
                  <span>Create Group</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;
