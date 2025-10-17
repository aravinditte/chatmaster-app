import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  ActivityIndicator
} from 'react-native';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';

const API_URL = 'http://localhost:5000/api';

const ChatListScreen = ({ navigation }) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { token, user } = useAuth();
  const { on, onlineUsers } = useSocket();

  useEffect(() => {
    fetchChats();
  }, []);

  useEffect(() => {
    const unsubscribe = on('new_message', (message) => {
      setChats(prev => {
        const updated = prev.map(chat => {
          if (chat._id === message.chat) {
            return {
              ...chat,
              lastMessage: message,
              lastActivity: message.createdAt
            };
          }
          return chat;
        });
        return updated.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
      });
    });

    return () => unsubscribe?.();
  }, [on]);

  const fetchChats = async () => {
    try {
      const response = await axios.get(`${API_URL}/chats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChats(response.data.chats || []);
    } catch (error) {
      console.error('Error fetching chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const isUserOnline = (chat) => {
    if (chat.type === 'private') {
      const otherUser = chat.participants?.find(p => p._id !== user._id);
      return otherUser && onlineUsers.includes(otherUser._id);
    }
    return false;
  };

  const renderChatItem = ({ item }) => {
    const isOnline = isUserOnline(item);
    
    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => navigation.navigate('Chat', { chat: item })}
      >
        <View style={styles.avatarContainer}>
          <Image
            source={{
              uri: item.avatar?.url || `https://ui-avatars.com/api/?name=${item.name}&background=random`
            }}
            style={styles.avatar}
          />
          {isOnline && <View style={styles.onlineIndicator} />}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.lastMessage && (
              <Text style={styles.timestamp}>
                {formatDistanceToNow(new Date(item.lastMessage.createdAt), { addSuffix: true })}
              </Text>
            )}
          </View>
          <View style={styles.chatFooter}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage?.content || 'No messages yet'}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredChats = chats.filter(chat =>
    chat.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ChatMaster</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Image
            source={{
              uri: user?.avatar?.url || `https://ui-avatars.com/api/?name=${user?.username}&background=random`
            }}
            style={styles.headerAvatar}
          />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Chat list */}
      {filteredChats.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No chats yet</Text>
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          renderItem={renderChatItem}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#3b82f6'
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff'
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16
  },
  listContainer: {
    paddingHorizontal: 16
  },
  chatItem: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#fff'
  },
  chatInfo: {
    flex: 1,
    justifyContent: 'center'
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1
  },
  timestamp: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 8
  },
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  lastMessage: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1
  },
  unreadBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16
  }
});

export default ChatListScreen;
