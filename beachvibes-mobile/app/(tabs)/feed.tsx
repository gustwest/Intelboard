import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, RefreshControl, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Animated,
  Dimensions, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthProvider';
import { SafeAreaView } from 'react-native-safe-area-context';

interface FeedComment {
  id: string;
  authorName: string;
  authorColor: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
}

interface FeedPost {
  id: string;
  authorName: string;
  authorColor: string;
  authorImage: string | null;
  body: string;
  imageUrl: string | null;
  type: string;
  eventTitle: string | null;
  circleName: string | null;
  circleEmoji: string | null;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  comments: FeedComment[];
}

export default function FeedScreen() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<Set<string>>(new Set());

  const loadFeed = useCallback(async () => {
    try {
      const data = await api.get<FeedPost[]>('/api/mobile/feed');
      setPosts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load feed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  // ── Like toggle ──
  const handleLike = async (postId: string) => {
    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      return {
        ...p,
        isLiked: !p.isLiked,
        likeCount: p.isLiked ? p.likeCount - 1 : p.likeCount + 1,
      };
    }));

    try {
      const result = await api.post<{ liked: boolean; count: number }>(
        '/api/mobile/feed/like', { postId }
      );
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, isLiked: result.liked, likeCount: result.count } : p
      ));
    } catch {
      // Revert on error
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        return { ...p, isLiked: !p.isLiked, likeCount: p.isLiked ? p.likeCount - 1 : p.likeCount + 1 };
      }));
    }
  };

  // ── Comment ──
  const toggleComments = (postId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      next.has(postId) ? next.delete(postId) : next.add(postId);
      return next;
    });
  };

  const sendComment = async (postId: string) => {
    const text = commentText[postId]?.trim();
    if (!text) return;

    setSendingComment(prev => new Set(prev).add(postId));
    try {
      const comment = await api.post<FeedComment>(
        '/api/mobile/feed/comment', { postId, body: text }
      );
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        return {
          ...p,
          commentCount: p.commentCount + 1,
          comments: [...p.comments, comment],
        };
      }));
      setCommentText(prev => ({ ...prev, [postId]: '' }));
    } catch {
      Alert.alert('Fel', 'Kunde inte skicka kommentaren');
    } finally {
      setSendingComment(prev => { const n = new Set(prev); n.delete(postId); return n; });
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just nu';
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const parseImages = (imageUrl: string | null): string[] => {
    if (!imageUrl) return [];
    try {
      const parsed = JSON.parse(imageUrl);
      return Array.isArray(parsed) ? parsed : [imageUrl];
    } catch {
      return [imageUrl];
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.logo}>BeachVibes</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.iconBtn}>
            <Ionicons name="notifications-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn}>
            <Ionicons name="chatbubble-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity>
            {user?.image ? (
              <Image source={{ uri: user.image }} style={s.headerAvatar} />
            ) : (
              <View style={[s.headerAvatar, { backgroundColor: Colors.brandPrimary, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                  {user?.name?.charAt(0) || '?'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFeed(); }} tintColor={Colors.brandPrimary} />
          }
        >
          {loading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={Colors.brandPrimary} />
            </View>
          ) : posts.length === 0 ? (
            <View style={s.center}>
              <Ionicons name="sunny-outline" size={64} color={Colors.brandPrimary} />
              <Text style={s.emptyTitle}>Tomt i feeden</Text>
              <Text style={s.emptyText}>Dra ner för att uppdatera</Text>
            </View>
          ) : (
            posts.map((post) => {
              const images = parseImages(post.imageUrl);
              const isExpanded = expandedComments.has(post.id);
              const isSending = sendingComment.has(post.id);

              return (
                <View key={post.id} style={s.postCard}>
                  {/* Post header */}
                  <View style={s.postHeader}>
                    {post.authorImage ? (
                      <Image source={{ uri: post.authorImage }} style={s.postAvatar} />
                    ) : (
                      <View style={[s.postAvatar, { backgroundColor: post.authorColor, justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={s.postAvatarText}>{post.authorName?.charAt(0)}</Text>
                      </View>
                    )}
                    <View style={s.postMeta}>
                      <Text style={s.postAuthor}>{post.authorName}</Text>
                      <Text style={s.postTime}>{timeAgo(post.createdAt)}</Text>
                    </View>
                    {post.circleName && (
                      <View style={s.circleBadge}>
                        <Text style={s.circleBadgeText}>{post.circleEmoji} {post.circleName}</Text>
                      </View>
                    )}
                  </View>

                  {/* Body */}
                  <Text style={s.postBody}>{post.body}</Text>

                  {/* Images */}
                  {images.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.imageScroll}>
                      {images.map((url, i) => (
                        <Image key={i} source={{ uri: url }} style={s.postImage} />
                      ))}
                    </ScrollView>
                  )}

                  {/* Actions */}
                  <View style={s.postActions}>
                    <TouchableOpacity style={s.actionBtn} onPress={() => handleLike(post.id)}>
                      <Ionicons
                        name={post.isLiked ? 'heart' : 'heart-outline'}
                        size={22}
                        color={post.isLiked ? Colors.brandHeart : Colors.textSecondary}
                      />
                      {post.likeCount > 0 && (
                        <Text style={[s.actionText, post.isLiked && { color: Colors.brandHeart }]}>
                          {post.likeCount}
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => toggleComments(post.id)}>
                      <Ionicons name="chatbubble-outline" size={19} color={Colors.textSecondary} />
                      <Text style={s.actionText}>
                        {post.commentCount > 0 ? `${post.commentCount} Kommentar${post.commentCount > 1 ? 'er' : ''}` : 'Kommentera'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn}>
                      <Ionicons name="share-outline" size={19} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Expanded comments */}
                  {isExpanded && (
                    <View style={s.commentsSection}>
                      {post.comments.length > 0 && post.comments.map(c => (
                        <View key={c.id} style={s.commentRow}>
                          {c.authorImage ? (
                            <Image source={{ uri: c.authorImage }} style={s.commentAvatar} />
                          ) : (
                            <View style={[s.commentAvatar, { backgroundColor: c.authorColor, justifyContent: 'center', alignItems: 'center' }]}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{c.authorName?.charAt(0)}</Text>
                            </View>
                          )}
                          <View style={s.commentBubble}>
                            <Text style={s.commentAuthor}>{c.authorName}</Text>
                            <Text style={s.commentBody}>{c.body}</Text>
                          </View>
                        </View>
                      ))}

                      {/* Comment input */}
                      <View style={s.commentInputRow}>
                        <TextInput
                          style={s.commentInput}
                          placeholder="Skriv en kommentar..."
                          placeholderTextColor={Colors.textTertiary}
                          value={commentText[post.id] || ''}
                          onChangeText={(t) => setCommentText(prev => ({ ...prev, [post.id]: t }))}
                          onSubmitEditing={() => sendComment(post.id)}
                          returnKeyType="send"
                          editable={!isSending}
                        />
                        <TouchableOpacity
                          style={[s.sendBtn, !(commentText[post.id]?.trim()) && { opacity: 0.3 }]}
                          onPress={() => sendComment(post.id)}
                          disabled={isSending || !(commentText[post.id]?.trim())}
                        >
                          {isSending ? (
                            <ActivityIndicator size="small" color={Colors.brandPrimary} />
                          ) : (
                            <Ionicons name="send" size={18} color={Colors.brandPrimary} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
  },
  logo: { fontSize: 22, fontWeight: '800', color: Colors.brandPrimary, letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { padding: 4 },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100, gap: 8 },
  center: { paddingTop: 120, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 14, color: Colors.textSecondary },

  postCard: {
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
    paddingVertical: 14, paddingHorizontal: 16, gap: 10,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postAvatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  postAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  postMeta: { flex: 1 },
  postAuthor: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  postTime: { fontSize: 12, color: Colors.textTertiary },
  circleBadge: {
    backgroundColor: 'rgba(249,115,22,0.12)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 100,
  },
  circleBadgeText: { fontSize: 11, color: Colors.brandPrimaryLight, fontWeight: '600' },

  postBody: { fontSize: 15, color: Colors.textPrimary, lineHeight: 21 },

  imageScroll: { marginTop: 4 },
  postImage: { width: 280, height: 200, borderRadius: 12, marginRight: 8, backgroundColor: Colors.bgTertiary },

  postActions: {
    flexDirection: 'row', alignItems: 'center', gap: 24,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderSubtle,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  actionText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },

  // Comments
  commentsSection: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },
  commentBubble: {
    flex: 1, backgroundColor: Colors.bgTertiary, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  commentAuthor: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  commentBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

  commentInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.bgTertiary, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, marginTop: 4,
  },
  commentInput: {
    flex: 1, fontSize: 14, color: Colors.textPrimary,
    paddingVertical: 6,
  },
  sendBtn: { padding: 4 },
});
