import React, { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X, Camera, LogOut, User, Settings, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const UserProfile = ({ onClose }) => {
  const { user, logout, updateProfile, uploadAvatar } = useAuth();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    status: user?.status || '',
    bio: user?.bio || ''
  });
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleInputChange = useCallback((e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  }, [formData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check if anything changed
    const hasChanges = 
      formData.username !== user?.username ||
      formData.status !== user?.status ||
      formData.bio !== user?.bio;

    if (!hasChanges) {
      setEditing(false);
      return;
    }

    const result = await updateProfile(formData);
    
    if (result.success) {
      toast.success('Profile updated successfully');
      setEditing(false);
    } else {
      toast.error(result.error);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }

    setUploading(true);
    const result = await uploadAvatar(file);
    
    if (result.success) {
      toast.success('Avatar updated successfully');
    } else {
      toast.error(result.error);
    }
    setUploading(false);
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await logout();
      toast.success('Logged out successfully');
    }
  };

  const copyFriendId = () => {
    navigator.clipboard.writeText(user?.friendId || '');
    setCopied(true);
    toast.success('Friend ID copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Profile</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Profile content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative">
            <img
              src={user?.avatar?.url || `https://ui-avatars.com/api/?name=${user?.username}&size=128&background=random`}
              alt={user?.username}
              className="w-32 h-32 rounded-full object-cover border-4 border-gray-100"
            />
            <label
              htmlFor="avatar-upload"
              className="absolute bottom-0 right-0 p-2 bg-primary-600 text-white rounded-full cursor-pointer hover:bg-primary-700 transition-colors shadow-lg"
            >
              {uploading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="w-5 h-5" />
              )}
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
              disabled={uploading}
            />
          </div>
        </div>

        {/* Friend ID Display */}
        <div className="mb-6 p-4 bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg border border-primary-100">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-600 mb-1">Your Friend ID</p>
              <p className="text-2xl font-mono font-bold text-primary-600 tracking-wider">
                {user?.friendId || '--------'}
              </p>
            </div>
            <button
              onClick={copyFriendId}
              className="p-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-md"
              title="Copy Friend ID"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Share this ID with friends so they can add you
          </p>
        </div>

        {/* Profile form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              disabled={!editing}
              className="input-primary disabled:bg-gray-50 disabled:cursor-not-allowed"
              maxLength={20}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={user?.email}
              disabled
              className="input-primary bg-gray-50 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <input
              type="text"
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              disabled={!editing}
              placeholder="Available"
              className="input-primary disabled:bg-gray-50 disabled:cursor-not-allowed"
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bio
            </label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleInputChange}
              disabled={!editing}
              placeholder="Tell us about yourself..."
              className="input-primary disabled:bg-gray-50 disabled:cursor-not-allowed"
              rows="3"
              maxLength={500}
            />
          </div>

          {/* Action buttons */}
          <div className="flex space-x-3 pt-4">
            {editing ? (
              <>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setFormData({
                      username: user?.username || '',
                      status: user?.status || '',
                      bio: user?.bio || ''
                    });
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-primary w-full flex items-center justify-center space-x-2"
              >
                <User className="w-5 h-5" />
                <span>Edit Profile</span>
              </button>
            )}
          </div>
        </form>

        {/* Additional options */}
        <div className="mt-6 pt-6 border-t space-y-3">
          <button className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
            <Settings className="w-5 h-5 text-gray-600" />
            <span className="text-gray-700">Settings</span>
          </button>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 p-3 hover:bg-red-50 rounded-lg transition-colors text-red-600"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
