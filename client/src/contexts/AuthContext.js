import React, { createContext, useContext, useReducer, useEffect } from 'react';
import axios from '../api/axios';

const AuthContext = createContext();

const initialState = {
  user: null,
  token: null,
  loading: true,
  error: null
};

const authReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_USER':
      return { 
        ...state, 
        user: action.payload.user, 
        token: action.payload.token, 
        loading: false, 
        error: null 
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'LOGOUT':
      return { ...initialState, loading: false };
    case 'UPDATE_USER':
      return { ...state, user: { ...state.user, ...action.payload } };
    default:
      return state;
  }
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing token on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await axios.get('/auth/me');
          dispatch({
            type: 'SET_USER',
            payload: {
              user: response.data.user,
              token
            }
          });
        } catch (error) {
          console.error('Auth initialization error:', error);
          localStorage.removeItem('token');
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const response = await axios.post('/auth/login', { email, password });
      const { token, user } = response.data;

      localStorage.setItem('token', token);

      dispatch({
        type: 'SET_USER',
        payload: { user, token }
      });

      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Login failed';
      dispatch({ type: 'SET_ERROR', payload: message });
      return { success: false, error: message };
    }
  };

  const register = async (username, email, password) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const response = await axios.post('/auth/register', {
        username,
        email,
        password
      });
      const { token, user } = response.data;

      localStorage.setItem('token', token);

      dispatch({
        type: 'SET_USER',
        payload: { user, token }
      });

      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Registration failed';
      dispatch({ type: 'SET_ERROR', payload: message });
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await axios.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      dispatch({ type: 'LOGOUT' });
    }
  };

  const updateProfile = async (updates) => {
    try {
      const response = await axios.put('/auth/update-profile', updates);
      dispatch({
        type: 'UPDATE_USER',
        payload: response.data.user
      });
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Update failed';
      return { success: false, error: message };
    }
  };

  const uploadAvatar = async (file) => {
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await axios.post('/upload/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      dispatch({
        type: 'UPDATE_USER',
        payload: { avatar: response.data.avatar }
      });

      return { success: true, avatar: response.data.avatar };
    } catch (error) {
      const message = error.response?.data?.error || 'Upload failed';
      return { success: false, error: message };
    }
  };

  const value = {
    ...state,
    login,
    register,
    logout,
    updateProfile,
    uploadAvatar
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
