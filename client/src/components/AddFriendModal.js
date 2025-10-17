import React, { useState } from 'react';
import { X, UserPlus, Copy, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import axios from '../api/axios';
import toast from 'react-hot-toast';

const AddFriendModal = ({ onClose }) => {
  const [friendId, setFriendId] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!friendId.trim() || friendId.length !== 8) {
      toast.error('Please enter a valid 8-digit Friend ID');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post('/friend-requests/send', {
        friendId: friendId.trim()
      });

      toast.success(response.data.message);
      setFriendId('');
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send friend request');
    } finally {
      setLoading(false);
    }
  };

  const copyFriendId = () => {
    navigator.clipboard.writeText(user?.friendId || '');
    setCopied(true);
    toast.success('Friend ID copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Add Friend</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Your Friend ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Friend ID
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={user?.friendId || ''}
                readOnly
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 font-mono text-lg text-center"
              />
              <button
                onClick={copyFriendId}
                className="p-3 bg-primary-100 text-primary-600 rounded-lg hover:bg-primary-200"
                title="Copy Friend ID"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Share this ID with friends so they can add you
            </p>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">OR</span>
            </div>
          </div>

          {/* Add Friend Form */}
          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter Friend ID
            </label>
            <input
              type="text"
              value={friendId}
              onChange={(e) => setFriendId(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="12345678"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-lg text-center"
              maxLength={8}
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter the 8-digit Friend ID of the person you want to add
            </p>

            <button
              type="submit"
              disabled={loading || friendId.length !== 8}
              className="w-full mt-4 btn-primary py-3 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  <span>Send Friend Request</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddFriendModal;
