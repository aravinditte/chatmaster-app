import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator
} from 'react-native';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';

const API_URL = 'http://localhost:5000/api';

const ChatScreen = ({ route, navigation }) => {
  const { chat } = route.params;
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);
  const { token, user } = useAuth();
  const { emit, on } = useSocket();

  useEffect(() => {
    fetchMessages();
    emit('join_chat', { chatId: chat._id });

    return () => {
      emit('leave_chat', { chatId: chat._id });
    };
  }, []);

  useEffect(() => {
    const unsubscribe = on('new_message', (message) => {
      if (message.chat === chat._id) {
        setMessages(prev => [...prev, message]);
        scrollToBottom();
      }
    });

    return () => unsubscribe?.();
  }, [on]);

  const fetchMessages = async () => {
    try {
      const response = await axios.get(`${API_URL}/messages/${chat._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(response.data.messages || []);
      scrollToBottom();
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleSend = () => {
    if (!inputText.trim() || sending) return;

    setSending(true);
    
    const messageData = {
      chatId: chat._id,
      content: inputText.trim(),
      type: 'text',
      tempId: Date.now().toString()
    };

    emit('send_message', messageData);
    setInputText('');
    setSending(false);
  };

  const renderMessage = ({ item }) => {
    const isOwn = item.sender._id === user._id;

    return (
      <View style={[styles.messageContainer, isOwn ? styles.ownMessage : styles.otherMessage]}>
        {!isOwn && (
          <Image
            source={{
              uri: item.sender.avatar?.url || `https://ui-avatars.com/api/?name=${item.sender.username}`
            }}
            style={styles.messageAvatar}
          />
        )}
        <View style={[styles.messageBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
          {!isOwn && (
            <Text style={styles.senderName}>{item.sender.username}</Text>
          )}
          <Text style={[styles.messageText, isOwn && styles.ownText]}>
            {item.content}
          </Text>
          <Text style={[styles.messageTime, isOwn && styles.ownTime]}>
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Image
          source={{
            uri: chat.avatar?.url || `https://ui-avatars.com/api/?name=${chat.name}&background=random`
          }}
          style={styles.headerAvatar}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{chat.name}</Text>
          <Text style={styles.headerSubtitle}>
            {chat.type === 'group' ? `${chat.participants?.length} members` : 'Online'}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item._id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={scrollToBottom}
      />

      {/* Input */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.attachButton}>
          <Ionicons name="attach" size={24} color="#666" />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={5000}
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#3b82f6'
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginHorizontal: 12
  },
  headerInfo: {
    flex: 1
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff'
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#e0e0e0'
  },
  messagesList: {
    padding: 16
  },
  messageContainer: {
    flexDirection: 'row',
    marginVertical: 4,
    maxWidth: '80%'
  },
  ownMessage: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse'
  },
  otherMessage: {
    alignSelf: 'flex-start'
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '100%'
  },
  ownBubble: {
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4
  },
  otherBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4
  },
  messageText: {
    fontSize: 16,
    color: '#1f2937'
  },
  ownText: {
    color: '#fff'
  },
  messageTime: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4
  },
  ownTime: {
    color: '#e0e0e0'
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb'
  },
  attachButton: {
    padding: 8
  },
  input: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 100,
    marginHorizontal: 8
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc'
  }
});

export default ChatScreen;
