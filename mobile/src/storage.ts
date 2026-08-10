import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import type { ChatMessage } from './types';

const TOKEN_KEY = 'utto.deviceToken';
const API_URL_KEY = 'utto.apiUrl';
const MESSAGES_KEY = 'utto.messages';

export async function loadSession(): Promise<{
  apiUrl: string | null;
  token: string | null;
}> {
  const [apiUrl, token] = await Promise.all([
    AsyncStorage.getItem(API_URL_KEY),
    SecureStore.getItemAsync(TOKEN_KEY),
  ]);

  return { apiUrl, token };
}

export async function saveSession(apiUrl: string, token: string): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(API_URL_KEY, apiUrl.trim().replace(/\/+$/, '')),
    SecureStore.setItemAsync(TOKEN_KEY, token),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(API_URL_KEY),
    SecureStore.deleteItemAsync(TOKEN_KEY),
  ]);
}

export async function loadMessages(): Promise<ChatMessage[]> {
  const raw = await AsyncStorage.getItem(MESSAGES_KEY);
  if (!raw) {
    return [];
  }

  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item): item is ChatMessage =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ChatMessage).id === 'string' &&
        ((item as ChatMessage).role === 'user' ||
          (item as ChatMessage).role === 'assistant') &&
        typeof (item as ChatMessage).content === 'string' &&
        typeof (item as ChatMessage).createdAt === 'string',
    );
  } catch {
    return [];
  }
}

export async function saveMessages(messages: ChatMessage[]): Promise<void> {
  await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(messages.slice(-200)));
}

export async function clearMessages(): Promise<void> {
  await AsyncStorage.removeItem(MESSAGES_KEY);
}
