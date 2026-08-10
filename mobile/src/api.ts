import type {
  BootstrapResponse,
  ChatMessage,
  ChatResponse,
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
