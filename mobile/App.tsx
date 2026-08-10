import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

import { getBootstrap, pairDevice, sendChat } from './src/api';
import {
  clearMessages,
  clearSession,
  loadMessages,
  loadSession,
  saveMessages,
  saveSession,
} from './src/storage';
import type { BootstrapResponse, ChatMessage } from './src/types';

type TabKey = 'chat' | 'memory' | 'relationship' | 'settings';

const colors = {
  background: '#F5F1EC',
  surface: '#FFFDFC',
  ink: '#2A2522',
  muted: '#8A817B',
  border: '#E8DFD8',
  accent: '#735B50',
  accentSoft: '#EDE3DC',
  userBubble: '#735B50',
  assistantBubble: '#FFFDFC',
  danger: '#A24F4F',
};

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

const firstMessage = createMessage('assistant', '你来了。');

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <UttoApp />
    </SafeAreaProvider>
  );
}

function UttoApp() {
  const [booting, setBooting] = useState(true);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('chat');

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const [session, cachedMessages] = await Promise.all([
          loadSession(),
          loadMessages(),
        ]);

        if (cancelled) {
          return;
        }

        const initialMessages = cachedMessages.length > 0 ? cachedMessages : [firstMessage];
        setMessages(initialMessages);

        if (!session.apiUrl || !session.token) {
          return;
        }

        setApiUrl(session.apiUrl);
        setToken(session.token);

        try {
          const data = await getBootstrap(session.apiUrl, session.token);
          if (!cancelled) {
            setBootstrap(data);
          }
        } catch {
          await clearSession();
          if (!cancelled) {
            setApiUrl(null);
            setToken(null);
            setBootstrap(null);
          }
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePaired(nextApiUrl: string, nextToken: string) {
    const data = await getBootstrap(nextApiUrl, nextToken);
    await saveSession(nextApiUrl, nextToken);
    setApiUrl(nextApiUrl);
    setToken(nextToken);
    setBootstrap(data);
    setActiveTab('chat');
  }

  async function disconnect() {
    await clearSession();
    setApiUrl(null);
    setToken(null);
    setBootstrap(null);
    setActiveTab('chat');
  }

  async function resetMessages() {
    await clearMessages();
    const next = [createMessage('assistant', '重新开始也没关系。我还在。')];
    setMessages(next);
    await saveMessages(next);
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.centered}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarLargeText}>熠</Text>
        </View>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 22 }} />
      </SafeAreaView>
    );
  }

  if (!apiUrl || !token || !bootstrap) {
    return <PairingScreen onPaired={handlePaired} />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.appShell}>
        {activeTab === 'chat' ? (
          <ChatScreen
            apiUrl={apiUrl}
            token={token}
            displayName={bootstrap.display_name || '熠'}
            messages={messages}
            setMessages={setMessages}
          />
        ) : null}
        {activeTab === 'memory' ? <MemoryScreen /> : null}
        {activeTab === 'relationship' ? (
          <RelationshipScreen bootstrap={bootstrap} />
        ) : null}
        {activeTab === 'settings' ? (
          <SettingsScreen
            apiUrl={apiUrl}
            onDisconnect={disconnect}
            onResetMessages={resetMessages}
          />
        ) : null}
        <TabBar activeTab={activeTab} onChange={setActiveTab} />
      </View>
    </SafeAreaView>
  );
}

function PairingScreen({
  onPaired,
}: {
  onPaired: (apiUrl: string, token: string) => Promise<void>;
}) {
  const [apiUrl, setApiUrl] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const cleanUrl = apiUrl.trim().replace(/\/+$/, '');
    const cleanCode = pairingCode.trim();
    if (!cleanUrl || !cleanCode) {
      setError('先填写电脑上的 Utto API 地址和配对码。');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await pairDevice(cleanUrl, cleanCode);
      await onPaired(cleanUrl, result.device_token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '连接失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.pairingSafeArea}>
      <KeyboardAvoidingView
        style={styles.pairingKeyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.pairingContent}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>熠</Text>
          </View>
          <Text style={styles.brand}>Utto</Text>
          <Text style={styles.pairingTitle}>把熠带到手机上</Text>
          <Text style={styles.pairingSubtitle}>
            第一次连接需要你的电脑 API 地址和一次性配对码。设备令牌会保存在系统安全存储中。
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Utto API</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="例如 http://192.168.1.10:8000"
              placeholderTextColor="#B1A8A2"
              style={styles.formInput}
              value={apiUrl}
              onChangeText={setApiUrl}
            />
            <Text style={styles.inputLabel}>一次性配对码</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="输入服务器生成的配对码"
              placeholderTextColor="#B1A8A2"
              style={styles.formInput}
              value={pairingCode}
              onChangeText={setPairingCode}
              onSubmitEditing={() => void submit()}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable
              disabled={busy}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                busy && styles.buttonDisabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>连接 Utto</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChatScreen({
  apiUrl,
  token,
  displayName,
  messages,
  setMessages,
}: {
  apiUrl: string;
  token: string;
  displayName: string;
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const subtitle = useMemo(() => (sending ? '正在想你说的话…' : '在线'), [sending]);

  async function submit() {
    const text = draft.trim();
    if (!text || sending) {
      return;
    }

    const userMessage = createMessage('user', text);
    const nextMessages = [...messages, userMessage];
    setDraft('');
    setError(null);
    setSending(true);
    setMessages(nextMessages);
    await saveMessages(nextMessages);

    try {
      const response = await sendChat(apiUrl, token, nextMessages);
      const assistantMessage = createMessage('assistant', response.message.content.trim());
      const completed = [...nextMessages, assistantMessage];
      setMessages(completed);
      await saveMessages(completed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '消息发送失败');
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={8}
    >
      <View style={styles.chatHeader}>
        <View style={styles.avatarSmall}>
          <Text style={styles.avatarSmallText}>熠</Text>
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>{displayName}</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.presenceDot} />
      </View>

      <FlatList
        ref={listRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        data={messages}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => <MessageBubble message={item} />}
      />

      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>发送失败：{error}</Text>
        </View>
      ) : null}

      <View style={styles.composerWrap}>
        <View style={styles.composer}>
          <TextInput
            multiline
            maxLength={4000}
            placeholder="和熠说点什么…"
            placeholderTextColor="#A89F99"
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
          />
          <Pressable
            disabled={!draft.trim() || sending}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.sendButton,
              (!draft.trim() || sending) && styles.sendButtonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.sendButtonText}>↑</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user';
  return (
    <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowTheirs]}>
      {!mine ? (
        <View style={styles.messageAvatar}>
          <Text style={styles.messageAvatarText}>熠</Text>
        </View>
      ) : null}
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

function MemoryScreen() {
  return (
    <View style={styles.contentScreen}>
      <Text style={styles.sectionEyebrow}>MEMORY</Text>
      <Text style={styles.sectionTitle}>我们记得的事</Text>
      <Text style={styles.sectionDescription}>
        长期记忆会从重要的共同经历里慢慢形成。当前版本先保留聊天历史，后端记忆抽取会在下一阶段接入。
      </Text>
      <View style={styles.emptyMemoryCard}>
        <Text style={styles.emptyMemorySymbol}>◌</Text>
        <Text style={styles.cardTitle}>还没有长期记忆</Text>
        <Text style={styles.cardBody}>继续聊下去。真正值得留下的事情，会出现在这里。</Text>
      </View>
    </View>
  );
}

function RelationshipScreen({ bootstrap }: { bootstrap: BootstrapResponse }) {
  return (
    <View style={styles.contentScreen}>
      <Text style={styles.sectionEyebrow}>RELATIONSHIP</Text>
      <Text style={styles.sectionTitle}>你和熠</Text>
      <View style={styles.relationshipHero}>
        <View style={styles.avatarXL}>
          <Text style={styles.avatarXLText}>熠</Text>
        </View>
        <Text style={styles.relationshipName}>{bootstrap.display_name || '熠'}</Text>
        <Text style={styles.relationshipStatus}>同一个关系主体 · 已连接</Text>
      </View>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>连接状态</Text>
          <Text style={styles.infoValue}>安全连接</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>关系 ID</Text>
          <Text style={styles.infoValue}>{bootstrap.relationship_id.slice(0, 8)}…</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>人格档案</Text>
          <Text style={styles.infoValue}>{bootstrap.persona ? '已载入' : '待建立'}</Text>
        </View>
      </View>
    </View>
  );
}

function SettingsScreen({
  apiUrl,
  onDisconnect,
  onResetMessages,
}: {
  apiUrl: string;
  onDisconnect: () => Promise<void>;
  onResetMessages: () => Promise<void>;
}) {
  return (
    <View style={styles.contentScreen}>
      <Text style={styles.sectionEyebrow}>SETTINGS</Text>
      <Text style={styles.sectionTitle}>设置</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>当前服务器</Text>
        <Text selectable style={styles.serverAddress}>{apiUrl}</Text>
      </View>
      <Pressable
        onPress={() => void onResetMessages()}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.secondaryButtonText}>清空本机聊天缓存</Text>
      </Pressable>
      <Pressable
        onPress={() => void onDisconnect()}
        style={({ pressed }) => [styles.dangerButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.dangerButtonText}>断开此设备</Text>
      </Pressable>
      <Text style={styles.settingsFootnote}>
        DeepSeek API Key 不会保存在手机端。手机只保存可撤销的设备访问令牌。
      </Text>
    </View>
  );
}

function TabBar({
  activeTab,
  onChange,
}: {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}) {
  const tabs: Array<{ key: TabKey; label: string; glyph: string }> = [
    { key: 'chat', label: '聊天', glyph: '聊' },
    { key: 'memory', label: '记忆', glyph: '忆' },
    { key: 'relationship', label: '关系', glyph: '系' },
    { key: 'settings', label: '设置', glyph: '设' },
  ];

  return (
    <SafeAreaView style={styles.tabSafeArea} edges={['bottom']}>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={styles.tabItem}
            >
              <View style={[styles.tabGlyph, active && styles.tabGlyphActive]}>
                <Text style={[styles.tabGlyphText, active && styles.tabGlyphTextActive]}>
                  {tab.glyph}
                </Text>
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  appShell: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  pairingSafeArea: { flex: 1, backgroundColor: colors.background },
  pairingKeyboard: { flex: 1 },
  pairingContent: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    paddingBottom: 34,
  },
  avatarLarge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: colors.accent,
  },
  avatarLargeText: { color: '#FFFFFF', fontSize: 30, fontWeight: '600' },
  brand: {
    marginTop: 16,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 13,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  pairingTitle: {
    marginTop: 13,
    textAlign: 'center',
    color: colors.ink,
    fontSize: 28,
    fontWeight: '700',
  },
  pairingSubtitle: {
    marginTop: 12,
    alignSelf: 'center',
    maxWidth: 420,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  formCard: {
    marginTop: 28,
    padding: 18,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputLabel: {
    marginBottom: 8,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  formInput: {
    minHeight: 48,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: '#F8F5F2',
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: { marginBottom: 12, color: colors.danger, fontSize: 13, lineHeight: 19 },
  primaryButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  buttonPressed: { opacity: 0.78 },
  buttonDisabled: { opacity: 0.55 },
  chatHeader: {
    minHeight: 72,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: 'rgba(245,241,236,0.96)',
  },
  avatarSmall: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  avatarSmallText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  headerTextWrap: { flex: 1, marginLeft: 12 },
  headerTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  headerSubtitle: { marginTop: 2, color: colors.muted, fontSize: 12 },
  presenceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6E9A74' },
  messageList: { flex: 1 },
  messageListContent: { paddingHorizontal: 14, paddingTop: 20, paddingBottom: 14 },
  messageRow: { marginBottom: 14, flexDirection: 'row', alignItems: 'flex-end' },
  messageRowMine: { justifyContent: 'flex-end', paddingLeft: 54 },
  messageRowTheirs: { justifyContent: 'flex-start', paddingRight: 54 },
  messageAvatar: {
    width: 28,
    height: 28,
    marginRight: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  messageAvatarText: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  bubble: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMine: { backgroundColor: colors.userBubble, borderBottomRightRadius: 5 },
  bubbleTheirs: {
    backgroundColor: colors.assistantBubble,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { color: colors.ink, fontSize: 15.5, lineHeight: 23 },
  bubbleTextMine: { color: '#FFFFFF' },
  inlineError: { paddingHorizontal: 16, paddingBottom: 6 },
  inlineErrorText: { color: colors.danger, fontSize: 12 },
  composerWrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 9 },
  composer: {
    minHeight: 52,
    maxHeight: 132,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 15,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  composerInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 112,
    paddingTop: 8,
    paddingBottom: 7,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
  },
  sendButton: {
    width: 39,
    height: 39,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendButtonDisabled: { backgroundColor: '#C8BDB6' },
  sendButtonText: { color: '#FFFFFF', fontSize: 22, lineHeight: 24, fontWeight: '500' },
  tabSafeArea: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tabBar: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabGlyph: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabGlyphActive: { backgroundColor: colors.accentSoft },
  tabGlyphText: { color: '#A59B94', fontSize: 12, fontWeight: '600' },
  tabGlyphTextActive: { color: colors.accent },
  tabLabel: { marginTop: 3, color: '#A59B94', fontSize: 10 },
  tabLabelActive: { color: colors.accent, fontWeight: '700' },
  contentScreen: { flex: 1, paddingHorizontal: 20, paddingTop: 30 },
  sectionEyebrow: { color: colors.muted, fontSize: 11, letterSpacing: 2.5 },
  sectionTitle: { marginTop: 8, color: colors.ink, fontSize: 28, fontWeight: '700' },
  sectionDescription: {
    marginTop: 11,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  emptyMemoryCard: {
    marginTop: 28,
    paddingVertical: 34,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyMemorySymbol: { color: colors.accent, fontSize: 42, fontWeight: '200' },
  cardTitle: { marginTop: 14, color: colors.ink, fontSize: 17, fontWeight: '700' },
  cardBody: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  relationshipHero: { alignItems: 'center', paddingVertical: 30 },
  avatarXL: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  avatarXLText: { color: '#FFFFFF', fontSize: 36, fontWeight: '600' },
  relationshipName: { marginTop: 15, color: colors.ink, fontSize: 22, fontWeight: '700' },
  relationshipStatus: { marginTop: 5, color: colors.muted, fontSize: 13 },
  infoCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center' },
  infoLabel: { flex: 1, color: colors.muted, fontSize: 13 },
  infoValue: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10, backgroundColor: colors.border },
  serverAddress: { marginTop: 8, color: colors.ink, fontSize: 14, lineHeight: 21 },
  secondaryButton: {
    minHeight: 50,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
  },
  secondaryButtonText: { color: colors.accent, fontWeight: '700' },
  dangerButton: {
    minHeight: 50,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6CCCC',
    backgroundColor: '#FFF7F7',
  },
  dangerButtonText: { color: colors.danger, fontWeight: '700' },
  settingsFootnote: {
    marginTop: 18,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
  },
});
