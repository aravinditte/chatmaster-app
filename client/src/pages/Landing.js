import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MessageCircle, Users, Lock, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

const Landing = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isLogin && formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);

    let result;
    if (isLogin) {
      result = await login(formData.email, formData.password);
    } else {
      result = await register(formData.username, formData.email, formData.password);
    }

    if (!result.success) {
      toast.error(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex">
      {/* Left side - Features */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-12 text-white">
        <h1 className="text-5xl font-bold mb-6">ChatMaster</h1>
        <p className="text-xl mb-12 text-primary-100">
          Connect with friends and family in real-time with our powerful messaging platform.
        </p>

        <div className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Real-time Messaging</h3>
              <p className="text-primary-100">
                Send and receive messages instantly with real-time updates
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Group Chats</h3>
              <p className="text-primary-100">
                Create groups and chat with multiple people at once
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Secure & Private</h3>
              <p className="text-primary-100">
                Your conversations are protected with end-to-end encryption
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-3 bg-white bg-opacity-20 rounded-lg">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">Fast & Reliable</h3>
              <p className="text-primary-100">
                Lightning-fast message delivery with 99.9% uptime
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-gray-600">
              {isLogin ? 'Sign in to continue' : 'Join ChatMaster today'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  required={!isLogin}
                  className="input-primary"
                  placeholder="johndoe"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                className="input-primary"
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                className="input-primary"
                placeholder="••••••••"
                minLength={6}
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  required={!isLogin}
                  className="input-primary"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 text-base font-semibold"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Please wait...
                </div>
              ) : (
                isLogin ? 'Sign In' : 'Sign Up'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setFormData({
                  username: '',
                  email: '',
                  password: '',
                  confirmPassword: ''
                });
              }}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t text-center text-sm text-gray-500">
            <p>By signing up, you agree to our Terms of Service and Privacy Policy</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
