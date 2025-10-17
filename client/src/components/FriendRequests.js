import React, { useState, useEffect } from 'react';
import { X, Check, UserX } from 'lucide-react';
import axios from '../api/axios';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

const FriendRequests = ({ onClose }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await axios.get('/friend-requests');
      setRequests(response.data.requests || []);
    } catch (error) {
      console.error('Error fetching friend requests:', error);
      toast.error('Failed to load friend requests');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (userId) => {
    setActionLoading(userId);
    try {
      await axios.post(`/friend-requests/accept/${userId}`);
      toast.success('Friend request accepted!');
      setRequests(prev => prev.filter(req => req.from._id !== userId));
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to accept request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId) => {
    setActionLoading(userId);
    try {
      await axios.post(`/friend-requests/reject/${userId}`);
      toast.success('Friend request rejected');
      setRequests(prev => prev.filter(req => req.from._id !== userId));
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to reject request');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">
            Friend Requests ({requests.length})
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <UserX className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No friend requests</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <div
                  key={request._id}
                  className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg"
                >
                  <img
                    src={request.from.avatar?.url || `https://ui-avatars.com/api/?name=${request.from.username}&background=random`}
                    alt={request.from.username}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">
                      {request.from.username}
                    </p>
                    <p className="text-sm text-gray-500">
                      ID: {request.from.friendId}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                    </p>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleAccept(request.from._id)}
                      disabled={actionLoading === request.from._id}
                      className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                      title="Accept"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleReject(request.from._id)}
                      disabled={actionLoading === request.from._id}
                      className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                      title="Reject"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FriendRequests;
