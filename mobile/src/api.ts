import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import type {
  BootstrapResponse,
  ChatAttachment,
  ChatMessage,
  ChatResponse,
  MemoryCategory,
  MemoryRecord,
  PairExchangeResponse,
} from './types';

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const raw = await response.text();
  let body: unknown = null;

  if (raw) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      body = raw;
    }
  }

  if (!response.ok) {
    const detail =
      typeof body === 'object' && body !== null && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return body as T;
}

export async function pairDevice(
  baseUrl: string,
  pairingCode: string,
): Promise<PairExchangeResponse> {
  return requestJson<PairExchangeResponse>(
    `${normalizeBaseUrl(baseUrl)}/v1/pair/exchange`,
    {
      method: 'POST',
      body: JSON.stringify({ pairing_code: pairingCode.trim() }),
    },
  );
}

export async function getBootstrap(
  baseUrl: string,
  token: string,
): Promise<BootstrapResponse> {
  return requestJson<BootstrapResponse>(
    `${normalizeBaseUrl(baseUrl)}/v1/bootstrap`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export async function sendChat(
  baseUrl: string,
  token: string,
  messages: ChatMessage[],
): Promise<ChatResponse> {
  return requestJson<ChatResponse>(`${normalizeBaseUrl(baseUrl)}/v1/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messages: messages.slice(-20).map(({ role, content }) => ({ role, content })),
    }),
  });
}

export async function streamChat(
  baseUrl: string,
  token: string,
  messages: ChatMessage[],
  onToken: (token: string) => void,
  attachments: ChatAttachment[] = [],
): Promise<void> {
  const attachmentCandidates = [
    ...messages.slice(-20).flatMap((message) => message.attachments ?? []),
    ...attachments,
  ];
  const attachmentIds = Array.from(
    new Set(attachmentCandidates.map((attachment) => attachment.id).reverse()),
  )
    .slice(0, 5)
    .reverse();

  // React Native's global fetch buffers response bodies on iOS. Expo's fetch
  // implementation exposes a ReadableStream so tokens can reach the UI as they arrive.
  const response = await expoFetch(`${normalizeBaseUrl(baseUrl)}/v1/chat/stream`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: messages.slice(-20).map(({ role, content }) => ({ role, content })),
      attachments: attachmentIds.map((id) => ({ id })),
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    let detail = `HTTP ${response.status}`;

    if (raw) {
      try {
        const body = JSON.parse(raw) as { detail?: unknown };
        if (body.detail) {
          detail = String(body.detail);
        }
      } catch {
        detail = raw;
      }
    }

    throw new Error(detail);
  }

  if (!response.body) {
    throw new Error('当前设备不支持流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;

  const consumeEvents = (source: string, flush = false): string => {
    const normalized = source.replace(/\r\n/g, '\n');
    const events = normalized.split('\n\n');
    const remainder = flush ? '' : events.pop() ?? '';

    for (const event of events) {
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');

      if (!data) {
        continue;
      }

      if (data === '[DONE]') {
        completed = true;
        continue;
      }

      try {
        const payload = JSON.parse(data) as { content?: unknown; error?: unknown };
        if (typeof payload.error === 'string' && payload.error) {
          throw new Error(payload.error);
        }
        if (typeof payload.content === 'string' && payload.content) {
          onToken(payload.content);
        }
      } catch (caught) {
        if (caught instanceof Error) {
          throw caught;
        }
        throw new Error('无法读取流式响应');
      }
    }

    return remainder;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = consumeEvents(buffer, done);
      if (done) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!completed) {
    throw new Error('流式响应意外结束');
  }
}

export async function uploadAttachment(
  baseUrl: string,
  token: string,
  file: { uri: string; name: string; mimeType: string | null; size: number | null },
): Promise<ChatAttachment> {
  if (file.size !== null && file.size > 50 * 1024 * 1024) {
    throw new Error('文件不能超过 50 MB');
  }
  const source = new File(file.uri);
  const binaryBody = await source.arrayBuffer();
  if (binaryBody.byteLength === 0) {
    throw new Error('无法读取这个文件');
  }
  if (binaryBody.byteLength > 50 * 1024 * 1024) {
    throw new Error('文件不能超过 50 MB');
  }
  const mimeType = file.mimeType || 'application/octet-stream';
  const endpoint = `${normalizeBaseUrl(baseUrl)}/v1/attachments?filename=${encodeURIComponent(
    file.name,
  )}&mime_type=${encodeURIComponent(mimeType)}`;
  const response = await expoFetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType,
    },
    body: binaryBody,
  });
  const raw = await response.text();
  let responseBody: unknown = null;
  if (raw) {
    try {
      responseBody = JSON.parse(raw) as unknown;
    } catch {
      responseBody = raw;
    }
  }
  if (!response.ok) {
    const detail =
      typeof responseBody === 'object' && responseBody !== null && 'detail' in responseBody
        ? String((responseBody as { detail: unknown }).detail)
        : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return responseBody as ChatAttachment;
}

export async function getMemories(baseUrl: string, token: string): Promise<MemoryRecord[]> {
  return requestJson<MemoryRecord[]>(`${normalizeBaseUrl(baseUrl)}/v1/memories`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function captureMemories(
  baseUrl: string,
  token: string,
  messages: ChatMessage[],
): Promise<void> {
  await requestJson<{ status: string }>(`${normalizeBaseUrl(baseUrl)}/v1/memories/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messages: messages.slice(-12).map(({ role, content }) => ({ role, content })),
    }),
  });
}

export async function createMemory(
  baseUrl: string,
  token: string,
  input: { category: MemoryCategory; content: string; importance: number },
): Promise<MemoryRecord> {
  return requestJson<MemoryRecord>(`${normalizeBaseUrl(baseUrl)}/v1/memories`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export async function updateMemoryStatus(
  baseUrl: string,
  token: string,
  memoryId: string,
  status: 'active' | 'archived',
): Promise<MemoryRecord> {
  return requestJson<MemoryRecord>(`${normalizeBaseUrl(baseUrl)}/v1/memories/${memoryId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
}
