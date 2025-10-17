import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MoreVertical, Reply, Smile, Check, CheckCheck } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { useSocket } from '../contexts/SocketContext';

const Message = ({ message, isOwn, showAvatar }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const { addReaction } = useSocket();

  const handleEmojiClick = (emojiData) => {
    addReaction(message._id, emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const getStatusIcon = () => {
    if (message.readBy && message.readBy.length > 0) {
      return <CheckCheck className="w-4 h-4 text-blue-500" />;
    } else if (message.deliveredTo && message.deliveredTo.length > 0) {
      return <CheckCheck className="w-4 h-4 text-gray-400" />;
    } else {
      return <Check className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}>
      <div className={`flex items-end space-x-2 max-w-md ${isOwn ? 'flex-row-reverse space-x-reverse' : ''}`}>
        {/* Avatar */}
        {showAvatar && !isOwn && (
          <img
            src={message.sender.avatar?.url || `https://ui-avatars.com/api/?name=${message.sender.username}`}
            alt={message.sender.username}
            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
          />
        )}
        {!showAvatar && !isOwn && <div className="w-8" />}

        {/* Message bubble */}
        <div className="relative">
          <div
            className={`chat-message ${isOwn ? 'message-sent' : 'message-received'} relative`}
          >
            {/* Sender name for group chats */}
            {!isOwn && showAvatar && (
              <p className="text-xs font-medium text-gray-600 mb-1">
                {message.sender.username}
              </p>
            )}

            {/* Reply preview */}
            {message.replyTo && (
              <div className="mb-2 pb-2 border-l-2 border-gray-300 pl-2 text-sm opacity-75">
                <p className="font-medium text-xs">Reply to:</p>
                <p className="truncate">{message.replyTo.content}</p>
              </div>
            )}

            {/* Message content */}
            <p className="message-content whitespace-pre-wrap break-words">
              {message.content}
            </p>

            {/* File preview */}
            {message.file && (
              <div className="mt-2">
                {message.type === 'image' && (
                  <img
                    src={message.file.url}
                    alt="Shared"
                    className="rounded-lg max-w-full h-auto"
                  />
                )}
                {message.type === 'file' && (
                  <a
                    href={message.file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 p-2 bg-gray-100 rounded hover:bg-gray-200"
                  >
                    <span className="text-sm truncate">{message.file.filename}</span>
                  </a>
                )}
              </div>
            )}

            {/* Reactions */}
            {message.reactions && message.reactions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {message.reactions.map((reaction, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 bg-gray-100 rounded-full text-sm"
                  >
                    {reaction.emoji}
                  </span>
                ))}
              </div>
            )}

            {/* Timestamp and status */}
            <div className={`flex items-center space-x-1 mt-1 text-xs ${isOwn ? 'text-white/70' : 'text-gray-500'}`}>
              <span>{formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</span>
              {message.edited && <span>(edited)</span>}
              {isOwn && getStatusIcon()}
            </div>
          </div>

          {/* Message actions */}
          <div className={`absolute top-0 ${isOwn ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} opacity-0 group-hover:opacity-100 transition-opacity`}>
            <div className="flex items-center space-x-1 px-2">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-1 hover:bg-gray-100 rounded"
                title="React"
              >
                <Smile className="w-4 h-4 text-gray-600" />
              </button>
              <button
                className="p-1 hover:bg-gray-100 rounded"
                title="Reply"
              >
                <Reply className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 hover:bg-gray-100 rounded"
                title="More"
              >
                <MoreVertical className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Emoji picker */}
          {showEmojiPicker && (
            <div className="absolute z-10 bottom-full mb-2">
              <EmojiPicker onEmojiClick={handleEmojiClick} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Message;
