export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  attachments?: ChatAttachment[];
  attachmentOnly?: boolean;
};

export type ChatAttachment = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  readable_as_text: boolean;
  created_at: string;
  local_uri?: string;
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

export type MemoryCategory = 'preference' | 'fact' | 'boundary' | 'relationship';
export type MemoryStatus = 'active' | 'pending' | 'archived';

export type MemoryRecord = {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: number;
  sensitivity: 'standard' | 'sensitive';
  status: MemoryStatus;
  source: 'auto' | 'manual';
  created_at: string;
  updated_at: string;
};
