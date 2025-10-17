import React, { useState, useRef, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { Send, Paperclip, Smile, X, Image as ImageIcon } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { useDropzone } from 'react-dropzone';
import axios from '../api/axios';
import toast from 'react-hot-toast';

const MessageInput = ({ chatId }) => {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const { sendMessage, sendTypingStart, sendTypingStop } = useSocket();

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'video/*': ['.mp4', '.webm'],
      'audio/*': ['.mp3', '.wav', '.ogg'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt']
    }
  });

  const handleInputChange = (e) => {
    setMessage(e.target.value);

    // Handle typing indicator
    if (!isTyping) {
      setIsTyping(true);
      sendTypingStart(chatId);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      sendTypingStop(chatId);
    }, 2000);
  };

  const handleEmojiClick = (emojiData) => {
    setMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const uploadFile = async (file) => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post('/upload/file', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data.file;
    } catch (error) {
      console.error('File upload error:', error);
      toast.error('Failed to upload file');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!message.trim() && !selectedFile) return;

    // Stop typing indicator
    if (isTyping) {
      setIsTyping(false);
      sendTypingStop(chatId);
    }

    let fileData = null;
    if (selectedFile) {
      fileData = await uploadFile(selectedFile);
      if (!fileData) return; // Upload failed
    }

    const messageData = {
      chatId,
      content: message.trim() || (selectedFile ? selectedFile.name : ''),
      type: fileData ? getMessageType(selectedFile.type) : 'text',
      file: fileData,
      tempId: Date.now().toString(), // For optimistic updates
    };

    sendMessage(messageData);

    // Clear input
    setMessage('');
    setSelectedFile(null);
    setShowEmojiPicker(false);
  };

  const getMessageType = (mimeType) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'file';
  };

  const removeFile = () => {
    setSelectedFile(null);
  };

  return (
    <div className="border-t bg-white p-4">
      {/* File preview */}
      {selectedFile && (
        <div className="mb-3 flex items-center justify-between bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center space-x-3">
            {selectedFile.type.startsWith('image/') ? (
              <img
                src={URL.createObjectURL(selectedFile)}
                alt="Preview"
                className="w-12 h-12 object-cover rounded"
              />
            ) : (
              <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                <Paperclip className="w-6 h-6 text-gray-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-gray-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          <button
            onClick={removeFile}
            className="p-1 hover:bg-gray-200 rounded"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-4 z-10">
          <EmojiPicker onEmojiClick={handleEmojiClick} />
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex items-end space-x-2">
        {/* File upload */}
        <div {...getRootProps()} className="flex-shrink-0">
          <input {...getInputProps()} />
          <button
            type="button"
            className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Emoji picker toggle */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="p-3 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          title="Add emoji"
        >
          <Smile className="w-5 h-5 text-gray-600" />
        </button>

        {/* Text input */}
        <div className="flex-1">
          <textarea
            value={message}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Type a message..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            rows="1"
            style={{ maxHeight: '120px' }}
          />
        </div>

        {/* Send button */}
        <button
          type="submit"
          disabled={(!message.trim() && !selectedFile) || uploading}
          className="p-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          title="Send message"
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </form>

      {/* Drag and drop overlay */}
      {isDragActive && (
        <div className="absolute inset-0 bg-primary-50 bg-opacity-90 flex items-center justify-center border-2 border-dashed border-primary-400 rounded-lg">
          <div className="text-center">
            <ImageIcon className="w-16 h-16 text-primary-600 mx-auto mb-2" />
            <p className="text-lg font-medium text-primary-900">Drop file here</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageInput;
