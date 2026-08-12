export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type PairExchangeResponse = {
  device_token: string;
  relationship_id: string;
  display_name: string;
  message: string;
};

export type BootstrapResponse = {
  relationship_id: string;
  display_name: string;
  persona: Record<string, unknown> | null;
  device_last_seen: string | null;
};

export type ChatResponse = {
  message: {
    role: 'assistant';
    content: string;
  };
  model: string;
};
