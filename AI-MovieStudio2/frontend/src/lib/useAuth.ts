"use client";

import { useState, useEffect, useCallback } from "react";

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

interface StoredUser extends User {
  passwordHash: string;
}

const STORAGE_KEY = "aims2_users";
const SESSION_KEY = "aims2_session";

function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function getStoredUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredUsers(users: StoredUser[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function getStoredSession(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredSession(user: User | null) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getStoredSession());
    setLoading(false);
  }, []);

  const signUp = useCallback(
    (username: string, email: string, password: string): { success: boolean; error?: string } => {
      const trimmedUsername = username.trim();
      const trimmedEmail = email.trim().toLowerCase();

      if (trimmedUsername.length < 3) {
        return { success: false, error: "Username must be at least 3 characters" };
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return { success: false, error: "Please enter a valid email address" };
      }
      if (password.length < 6) {
        return { success: false, error: "Password must be at least 6 characters" };
      }

      const users = getStoredUsers();
      if (users.some((u) => u.username.toLowerCase() === trimmedUsername.toLowerCase())) {
        return { success: false, error: "Username already taken" };
      }
      if (users.some((u) => u.email === trimmedEmail)) {
        return { success: false, error: "Email already registered" };
      }

      const newUser: StoredUser = {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        username: trimmedUsername,
        email: trimmedEmail,
        createdAt: new Date().toISOString(),
        passwordHash: hashPassword(password),
      };

      users.push(newUser);
      saveStoredUsers(users);

      const sessionUser: User = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        createdAt: newUser.createdAt,
      };
      saveStoredSession(sessionUser);
      setUser(sessionUser);
      return { success: true };
    },
    []
  );

  const signIn = useCallback(
    (identifier: string, password: string): { success: boolean; error?: string } => {
      const trimmed = identifier.trim().toLowerCase();
      if (!trimmed || !password) {
        return { success: false, error: "Please enter your credentials" };
      }

      const users = getStoredUsers();
      const found = users.find(
        (u) => u.username.toLowerCase() === trimmed || u.email === trimmed
      );

      if (!found) {
        return { success: false, error: "Account not found. Please sign up first." };
      }
      if (found.passwordHash !== hashPassword(password)) {
        return { success: false, error: "Incorrect password" };
      }

      const sessionUser: User = {
        id: found.id,
        username: found.username,
        email: found.email,
        createdAt: found.createdAt,
      };
      saveStoredSession(sessionUser);
      setUser(sessionUser);
      return { success: true };
    },
    []
  );

  const signOut = useCallback(() => {
    saveStoredSession(null);
    setUser(null);
  }, []);

  return { user, loading, signUp, signIn, signOut };
}
