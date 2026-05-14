/**
 * firebase.ts — Firebase client SDK initialization and helpers
 *
 * Provides auth helpers and a small fetch wrapper that injects the
 * Firebase ID token when auth is enabled.
 *
 * @author AKBOYS Team
 * @since 2026-04-03
 */

'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

let authInstance: ReturnType<typeof getAuth> | null = null;
let firestoreInstance: Firestore | null = null;

function isAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_ENABLED === 'true';
}

function hasFirebaseConfig(): boolean {
  return !!firebaseConfig.projectId && !!firebaseConfig.apiKey;
}

function getFirebaseApp(): FirebaseApp | null {
  if (!hasFirebaseConfig()) return null;
  return getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
}

function ensureAuth() {
  if (!isAuthEnabled()) return null;
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  if (!app) return null;
  authInstance = getAuth(app);
  return authInstance;
}

/** Lazy Firestore client. Returns null when Firebase config is missing. */
export function getFirestoreClient(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  const app = getFirebaseApp();
  if (!app) return null;
  firestoreInstance = getFirestore(app);
  return firestoreInstance;
}

export const auth = ensureAuth();
export const googleProvider = auth ? new GoogleAuthProvider() : null;

export function authEnabled(): boolean {
  return isAuthEnabled();
}

export function subscribeToAuth(callback: (user: User | null) => void): (() => void) | null {
  if (!auth) return null;
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle(): Promise<User | null> {
  if (!auth || !googleProvider) return null;
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

export async function getIdToken(): Promise<string | null> {
  if (!auth?.currentUser) return null;
  return auth.currentUser.getIdToken();
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (!isAuthEnabled()) return headers;

  const token = await getIdToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
