import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';
import { db } from './firebase';

function getDb(): Firestore {
  if (!db) throw new Error('Firestore not initialized. Please configure Firebase in .env.local');
  return db;
}

// ===== Types =====
export interface ForumThread {
  id?: string;
  categoryId: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  replyCount: number;
  lastActivity: Timestamp;
  createdAt: Timestamp;
}

export interface ForumReply {
  id?: string;
  threadId: string;
  body: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  createdAt: Timestamp;
}

export interface CalendarEvent {
  id?: string;
  categoryId: string;
  title: string;
  description: string;
  date: string; // ISO date string
  time: string;
  authorId: string;
  authorName: string;
  attendees: string[];
  createdAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  contacts: string[];
  createdAt: Timestamp;
}

export interface QuizData {
  id?: string;
  categoryId: string;
  title: string;
  questions: QuizQuestion[];
  authorId: string;
  authorName: string;
  createdAt: Timestamp;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface ChatMessage {
  id?: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  timestamp: number;
}

// ===== Forum Functions =====
export async function getThreads(categoryId: string): Promise<ForumThread[]> {
  try {
    const q = query(
      collection(getDb(), 'threads'),
      where('categoryId', '==', categoryId),
      orderBy('lastActivity', 'desc'),
      limit(50)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ForumThread));
  } catch {
    return [];
  }
}

export async function createThread(thread: Omit<ForumThread, 'id' | 'replyCount' | 'lastActivity' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(getDb(), 'threads'), {
    ...thread,
    replyCount: 0,
    lastActivity: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getThread(threadId: string): Promise<ForumThread | null> {
  const docSnap = await getDoc(doc(getDb(), 'threads', threadId));
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as ForumThread;
}

export async function getReplies(threadId: string): Promise<ForumReply[]> {
  try {
    const q = query(
      collection(getDb(), 'replies'),
      where('threadId', '==', threadId),
      orderBy('createdAt', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ForumReply));
  } catch {
    return [];
  }
}

export async function createReply(reply: Omit<ForumReply, 'id' | 'createdAt'>, threadId: string): Promise<void> {
  await addDoc(collection(getDb(), 'replies'), {
    ...reply,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(getDb(), 'threads', threadId), {
    replyCount: (await getThread(threadId))?.replyCount ?? 0 + 1,
    lastActivity: serverTimestamp(),
  });
}

// ===== Events Functions =====
export async function getEvents(categoryId: string): Promise<CalendarEvent[]> {
  try {
    const q = query(
      collection(getDb(), 'events'),
      where('categoryId', '==', categoryId),
      orderBy('date', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CalendarEvent));
  } catch {
    return [];
  }
}

export async function createEvent(event: Omit<CalendarEvent, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(getDb(), 'events'), {
    ...event,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteEvent(eventId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'events', eventId));
}

// ===== User Profile Functions =====
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const docSnap = await getDoc(doc(getDb(), 'users', uid));
  if (!docSnap.exists()) return null;
  return docSnap.data() as UserProfile;
}

export async function createOrUpdateProfile(profile: Omit<UserProfile, 'createdAt' | 'contacts'>): Promise<void> {
  const existing = await getUserProfile(profile.uid);
  if (existing) {
    await updateDoc(doc(getDb(), 'users', profile.uid), {
      displayName: profile.displayName,
      email: profile.email,
      photoURL: profile.photoURL,
    });
  } else {
    await setDoc(doc(getDb(), 'users', profile.uid), {
      ...profile,
      contacts: [],
      createdAt: serverTimestamp(),
    });
  }
}

export async function addContact(userId: string, contactId: string): Promise<void> {
  const profile = await getUserProfile(userId);
  if (profile && !profile.contacts.includes(contactId)) {
    await updateDoc(doc(getDb(), 'users', userId), {
      contacts: [...profile.contacts, contactId],
    });
  }
}

export async function removeContact(userId: string, contactId: string): Promise<void> {
  const profile = await getUserProfile(userId);
  if (profile) {
    await updateDoc(doc(getDb(), 'users', userId), {
      contacts: profile.contacts.filter(c => c !== contactId),
    });
  }
}

export async function searchUsers(searchTerm: string): Promise<UserProfile[]> {
  try {
    const q = query(collection(getDb(), 'users'), limit(20));
    const snapshot = await getDocs(q);
    const users = snapshot.docs.map(doc => doc.data() as UserProfile);
    return users.filter(u =>
      u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  } catch {
    return [];
  }
}

// ===== Quiz Functions =====
export async function getQuizzes(categoryId: string): Promise<QuizData[]> {
  try {
    const q = query(
      collection(getDb(), 'quizzes'),
      where('categoryId', '==', categoryId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuizData));
  } catch {
    return [];
  }
}

export async function createQuiz(quiz: Omit<QuizData, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(getDb(), 'quizzes'), {
    ...quiz,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getQuiz(quizId: string): Promise<QuizData | null> {
  const docSnap = await getDoc(doc(getDb(), 'quizzes', quizId));
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as QuizData;
}

// ===== Cached Wiki Content =====
export async function getCachedWikiContent(slug: string): Promise<string | null> {
  try {
    const docSnap = await getDoc(doc(getDb(), 'wikiCache', slug));
    if (!docSnap.exists()) return null;
    return docSnap.data().content;
  } catch {
    return null;
  }
}

export async function cacheWikiContent(slug: string, content: string): Promise<void> {
  await setDoc(doc(getDb(), 'wikiCache', slug), {
    content,
    cachedAt: serverTimestamp(),
  });
}
