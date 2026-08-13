import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  captureMemories,
  createMemory,
  getBootstrap,
  getMemories,
  pairDevice,
  streamChat,
  uploadAttachment,
  updateMemoryStatus,
} from './src/api';
import {
  clearMessages,
  clearSession,
  loadChatAvatars,
  loadMessages,
  loadSession,
  saveChatAvatars,
  saveMessages,
  saveSession,
} from './src/storage';
import type { ChatAvatars } from './src/storage';
import type {
  BootstrapResponse,
  ChatAttachment,
  ChatMessage,
  MemoryCategory,
  MemoryRecord,
} from './src/types';

type TabKey = 'chat' | 'memory' | 'relationship' | 'settings';
type ChatStatus = 'idle' | 'thinking' | 'streaming';
type PendingAttachment = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
};

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

// Tidal Echo-inspired typography: quiet literary serif text with a distinct
// handwritten display face reserved for decorative Latin titles.
const serifFont = Platform.select({ ios: 'Baskerville', android: 'serif' });
const displayScriptFont = Platform.select({ ios: 'Snell Roundhand', android: 'cursive' });
const uiFont = Platform.select({
  ios: 'PingFang SC',
  android: 'sans-serif',
  default: undefined,
});
const uiFontMedium = Platform.select({
  ios: 'PingFang SC',
  android: 'sans-serif-medium',
  default: undefined,
});
const chatFont = Platform.select({
  ios: 'Songti SC',
  android: 'serif',
  default: undefined,
});
const chatFontMedium = Platform.select({
  ios: 'Songti SC',
  android: 'serif',
  default: undefined,
});
const monoFont = Platform.select({ ios: 'Courier New', android: 'monospace' });

const colors = {
  background: '#F2EEE5',
  paper: '#FAF7F0',
  paperDeep: '#E9E2D6',
  surface: '#FCFAF5',
  ink: '#2A2823',
  muted: '#918A7F',
  faint: '#C4BCAF',
  border: '#DED6C9',
  graphite: '#77736C',
  graphiteDark: '#292824',
  rose: '#D3AAA9',
  roseSoft: '#F2DEDD',
  sage: '#A9B0A3',
  danger: '#A85D57',
};

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}


function todayLabel() {
  const date = new Date();
  return `${date.getFullYear()} / ${String(date.getMonth() + 1).padStart(2, '0')} / ${String(date.getDate()).padStart(2, '0')}`;
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
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatAvatars, setChatAvatars] = useState<ChatAvatars>({
    assistant: null,
    user: null,
  });
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const [session, cachedMessages, cachedAvatars] = await Promise.all([
          loadSession(),
          loadMessages(),
          loadChatAvatars(),
        ]);

        if (cancelled) {
          return;
        }

        const initialMessages = cachedMessages.length > 0 ? cachedMessages : [firstMessage];
        setMessages(initialMessages);
        setChatAvatars(cachedAvatars);

        if (!session.apiUrl || !session.token) {
          return;
        }

        setApiUrl(session.apiUrl);
        setToken(session.token);

        try {
          const data = await getBootstrap(session.apiUrl, session.token);
          if (!cancelled) {
            setBootstrap(data);
            setConnectionError(null);
          }
        } catch (caught) {
          if (!cancelled) {
            setConnectionError(
              caught instanceof Error ? caught.message : '暂时无法连接服务器',
            );
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

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      if (Platform.OS === 'ios') {
        const windowHeight = Dimensions.get('window').height;
        const inset = Math.max(0, windowHeight - event.endCoordinates.screenY);
        const visible = inset > 1;
        setKeyboardVisible(visible);
        setKeyboardInset(visible ? inset : 0);
        return;
      }

      setKeyboardVisible(true);
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  async function handlePaired(nextApiUrl: string, nextToken: string) {
    const data = await getBootstrap(nextApiUrl, nextToken);
    await saveSession(nextApiUrl, nextToken);
    setApiUrl(nextApiUrl);
    setToken(nextToken);
    setBootstrap(data);
    setConnectionError(null);
    setActiveTab('chat');
  }

  async function retryConnection() {
    if (!apiUrl || !token || reconnecting) {
      return;
    }

    setReconnecting(true);
    setConnectionError(null);
    try {
      const data = await getBootstrap(apiUrl, token);
      setBootstrap(data);
    } catch (caught) {
      setConnectionError(caught instanceof Error ? caught.message : '暂时无法连接服务器');
    } finally {
      setReconnecting(false);
    }
  }

  async function disconnect() {
    setBootstrap(null);
    setConnectionError('已暂时断开连接，配对信息仍保留。');
    setActiveTab('chat');
  }

  async function resetMessages() {
    await clearMessages();
    const next: ChatMessage[] = [];
    setMessages(next);
    await saveMessages(next);
  }

  async function pickAvatar(role: keyof ChatAvatars) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要照片权限', '请允许 Utto 访问相册，以便设置聊天头像。');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    const next = { ...chatAvatars, [role]: result.assets[0].uri };
    setChatAvatars(next);
    await saveChatAvatars(next);
  }

  async function resetAvatar(role: keyof ChatAvatars) {
    const next = { ...chatAvatars, [role]: null };
    setChatAvatars(next);
    await saveChatAvatars(next);
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.centered}>
        <AnimatedBrand />
        <ActivityIndicator color={colors.graphiteDark} style={{ marginTop: 18 }} />
      </SafeAreaView>
    );
  }

  if (!apiUrl || !token) {
    return <PairingScreen onPaired={handlePaired} />;
  }

  if (!bootstrap) {
    return (
      <ReconnectScreen
        apiUrl={apiUrl}
        error={connectionError}
        busy={reconnecting}
        onRetry={() => void retryConnection()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.appShell}>
        <AmbientPaper />
        <PageTransition key={activeTab}>
          {activeTab === 'chat' ? (
            <ChatScreen
              apiUrl={apiUrl}
              token={token}
              displayName={bootstrap.display_name || '熠'}
              messages={messages}
              setMessages={setMessages}
              keyboardInset={keyboardInset}
              chatAvatars={chatAvatars}
            />
          ) : null}
          {activeTab === 'memory' ? <MemoryScreen apiUrl={apiUrl} token={token} /> : null}
          {activeTab === 'relationship' ? (
            <RelationshipScreen bootstrap={bootstrap} />
          ) : null}
          {activeTab === 'settings' ? (
            <SettingsScreen
              apiUrl={apiUrl}
              onDisconnect={disconnect}
              onResetMessages={resetMessages}
              chatAvatars={chatAvatars}
              onPickAvatar={pickAvatar}
              onResetAvatar={resetAvatar}
            />
          ) : null}
        </PageTransition>
        {!keyboardVisible ? <TabBar activeTab={activeTab} onChange={setActiveTab} /> : null}
      </View>
    </SafeAreaView>
  );
}


function AmbientPaper() {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 10000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 10000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [drift]);

  return (
    <View pointerEvents="none" style={styles.ambientLayer}>
      <Animated.View
        style={[
          styles.ambientBlobOne,
          {
            opacity: drift.interpolate({
              inputRange: [0, 1],
              outputRange: [0.12, 0.2],
            }),
            transform: [
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -8],
                }),
              },
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 7],
                }),
              },
              {
                scale: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.025],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ambientBlobTwo,
          {
            opacity: drift.interpolate({
              inputRange: [0, 1],
              outputRange: [0.08, 0.14],
            }),
            transform: [
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 9],
                }),
              },
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -6],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

function PageTransition({ children }: { children: ReactNode }) {
  const entry = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entry, {
      toValue: 1,
      duration: 185,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entry]);

  return (
    <Animated.View
      style={[
        styles.pageTransition,
        {
          opacity: entry,
          transform: [
            {
              translateY: entry.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.pairingContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <Text style={styles.pairingKicker}>NEST · PRIVATE ROOM</Text>
          <AnimatedBrand />
          <Text style={styles.pairingTitle}>连接</Text>
          <Text style={styles.pairingSubtitle}>
            第一次连接需要电脑 API 地址和一次性配对码。
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.formStamp}>PAIRING</Text>
            <Text style={styles.inputLabel}>Utto API</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="例如 http://192.168.1.10:8000"
              placeholderTextColor={colors.faint}
              style={styles.formInput}
              value={apiUrl}
              onChangeText={setApiUrl}
            />
            <Text style={styles.inputLabel}>一次性配对码</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="输入服务器生成的配对码"
              placeholderTextColor={colors.faint}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ReconnectScreen({
  apiUrl,
  error,
  busy,
  onRetry,
}: {
  apiUrl: string;
  error: string | null;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <SafeAreaView style={styles.pairingSafeArea}>
      <View style={styles.reconnectContent}>
        <Text style={styles.pairingKicker}>NEST · PRIVATE ROOM</Text>
        <AnimatedBrand />
        <Text style={styles.pairingSubtitle}>
          已保存连接信息。服务器恢复后，点击重新连接即可。
        </Text>

        <View style={styles.formCard}>
          <Text style={styles.formStamp}>SAVED CONNECTION</Text>
          <Text style={styles.reconnectLabel}>当前服务器</Text>
          <Text selectable style={styles.reconnectUrl}>{apiUrl}</Text>
          {error ? <Text style={styles.errorText}>暂时无法连接 · {error}</Text> : null}
          <Pressable
            disabled={busy}
            onPress={onRetry}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
              busy && styles.buttonDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>重新连接</Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function AnimatedBrand() {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 720,
      delay: 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start();
    return () => animation.stop();
  }, [entrance]);

  return (
    <Animated.View
      accessible
      accessibilityRole="header"
      accessibilityLabel="utto"
      style={[
        styles.brandLockup,
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
            {
              scale: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [0.965, 1],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.brand}>utto</Text>
    </Animated.View>
  );
}

function ChatScreen({
  apiUrl,
  token,
  displayName,
  messages,
  setMessages,
  keyboardInset,
  chatAvatars,
}: {
  apiUrl: string;
  token: string;
  displayName: string;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  keyboardInset: number;
  chatAvatars: ChatAvatars;
}) {
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [chatStatus, setChatStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const listRef = useRef<ScrollView>(null);
  const initialAnchorCompletedRef = useRef(false);
  const initialAnchorQueuedRef = useRef(false);
  const listHasLayoutRef = useRef(false);
  const listHasContentRef = useRef(false);
  const listRevealedRef = useRef(false);
  const nearBottomRef = useRef(true);
  const pendingScrollRef = useRef<'instant' | 'smooth' | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const streamContentRef = useRef('');
  const streamRenderFrameRef = useRef<number | null>(null);
  const lastComposerHeightRef = useRef(34);
  const listOpacity = useRef(new Animated.Value(0)).current;
  const composerFocus = useRef(new Animated.Value(0)).current;
  const composerHeight = useRef(new Animated.Value(34)).current;
  const headerPulse = useRef(new Animated.Value(1)).current;

  const latestMessageId = messages[messages.length - 1]?.id ?? null;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(headerPulse, {
          toValue: 1.012,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(headerPulse, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [headerPulse]);

  function revealList() {
    if (listRevealedRef.current) {
      return;
    }
    listRevealedRef.current = true;
    Animated.timing(listOpacity, {
      toValue: 1,
      duration: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function runScrollToBottom(animated: boolean) {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      listRef.current?.scrollToEnd({ animated });
    });
  }


  function queueScroll(mode: 'instant' | 'smooth') {
    pendingScrollRef.current = mode;
  }

  function anchorInitialMessage() {
    if (
      initialAnchorCompletedRef.current ||
      initialAnchorQueuedRef.current ||
      !listHasLayoutRef.current ||
      !listHasContentRef.current
    ) {
      return;
    }

    initialAnchorQueuedRef.current = true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: false });
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated: false });
          initialAnchorCompletedRef.current = true;
          initialAnchorQueuedRef.current = false;
          nearBottomRef.current = true;
          setShowScrollToBottom(false);
          revealList();
        });
      });
    });
  }

  function handleContentSizeChange(_: number, height: number) {
    if (height > 0) {
      listHasContentRef.current = true;
    }

    if (!initialAnchorCompletedRef.current) {
      anchorInitialMessage();
      return;
    }

    const pending = pendingScrollRef.current;
    if (!pending) {
      return;
    }

    pendingScrollRef.current = null;
    nearBottomRef.current = true;
    runScrollToBottom(pending === 'smooth');
  }

  function handleListLayout(event: any) {
    listHasLayoutRef.current = event.nativeEvent.layout.height > 0;
    anchorInitialMessage();

    if (messages.length === 0) {
      initialAnchorCompletedRef.current = true;
      revealList();
    }
  }

  function handleScroll(event: any) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = Math.max(
      0,
      contentSize.height - (contentOffset.y + layoutMeasurement.height),
    );
    const nextNearBottom = distanceFromBottom <= 96;

    nearBottomRef.current = nextNearBottom;
    setShowScrollToBottom(!nextNearBottom);
  }

  function scrollToLatestMessage() {
    pendingScrollRef.current = null;
    nearBottomRef.current = true;
    setShowScrollToBottom(false);
    runScrollToBottom(true);
  }

  useEffect(() => {
    if (keyboardInset <= 0 || !nearBottomRef.current) {
      return;
    }

    // 键盘高度变化时不要额外做一段滚动动画，直接把底部锚住，避免“弹两次”。
    runScrollToBottom(false);
  }, [keyboardInset]);

  useEffect(() => {
    if (!nearBottomRef.current || messages.length === 0) {
      return;
    }

    // Every visible stream update re-anchors only when the user is already at
    // the bottom. This keeps new content precisely positioned without pulling
    // someone away from older messages they are reading.
    runScrollToBottom(false);
  }, [chatStatus, messages]);

  function animateComposer(focused: boolean) {
    Animated.spring(composerFocus, {
      toValue: focused ? 1 : 0,
      damping: 20,
      stiffness: 240,
      mass: 0.72,
      useNativeDriver: true,
    }).start();
  }

  function animateComposerHeight(nextHeight: number) {
    const clamped = Math.max(34, Math.min(104, Math.ceil(nextHeight)));
    if (Math.abs(lastComposerHeightRef.current - clamped) < 1) {
      return;
    }

    lastComposerHeightRef.current = clamped;
    Animated.timing(composerHeight, {
      toValue: clamped,
      duration: 125,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  function applyStreamingMessage(assistantMessage: ChatMessage) {
    const nextAssistantMessage = {
      ...assistantMessage,
      content: streamContentRef.current,
    };

    setMessages((currentMessages) => {
      const lastMessage = currentMessages[currentMessages.length - 1];
      if (lastMessage?.id === assistantMessage.id) {
        return [...currentMessages.slice(0, -1), nextAssistantMessage];
      }
      return [...currentMessages, nextAssistantMessage];
    });

    if (nearBottomRef.current) {
      queueScroll('instant');
    }
  }

  function scheduleStreamingMessageUpdate(assistantMessage: ChatMessage) {
    if (streamRenderFrameRef.current !== null) {
      return;
    }

    streamRenderFrameRef.current = requestAnimationFrame(() => {
      streamRenderFrameRef.current = null;
      applyStreamingMessage(assistantMessage);
    });
  }

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
      if (streamRenderFrameRef.current !== null) {
        cancelAnimationFrame(streamRenderFrameRef.current);
      }
    },
    [],
  );

  function addPendingAttachments(next: PendingAttachment[]) {
    const oversized = next.find(
      (item) => item.size !== null && item.size > MAX_ATTACHMENT_BYTES,
    );
    if (oversized) {
      setError('单个文件不能超过 50 MB');
      return;
    }
    setPendingAttachments((current) => [...current, ...next].slice(0, 5));
    setError(null);
  }

  async function pickFromFiles() {
    setAttachmentMenuVisible(false);
    setPickerBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: '*/*',
      });
      if (!result.canceled) {
        addPendingAttachments(
          result.assets.map((selected) => ({
            uri: selected.uri,
            name: selected.name,
            mimeType: selected.mimeType ?? null,
            size: selected.size ?? null,
          })),
        );
      }
    } catch {
      setError('无法读取这个文件');
    } finally {
      setPickerBusy(false);
    }
  }

  async function pickFromPhotos() {
    setAttachmentMenuVisible(false);
    setPickerBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('请允许 Utto 访问照片');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 5,
        quality: 1,
      });
      if (!result.canceled) {
        addPendingAttachments(
          result.assets.map((selected) => ({
            uri: selected.uri,
            name: selected.fileName ?? '照片',
            mimeType: selected.mimeType ?? 'image/*',
            size: selected.fileSize ?? null,
          })),
        );
      }
    } catch {
      setError('无法读取照片');
    } finally {
      setPickerBusy(false);
    }
  }

  async function takePhoto() {
    setAttachmentMenuVisible(false);
    setPickerBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('请允许 Utto 使用相机');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        const selected = result.assets[0];
        addPendingAttachments([
          {
            uri: selected.uri,
            name: selected.fileName ?? '相机照片',
            mimeType: selected.mimeType ?? 'image/jpeg',
            size: selected.fileSize ?? null,
          },
        ]);
      }
    } catch {
      setError('无法打开相机');
    } finally {
      setPickerBusy(false);
    }
  }

  function pickAttachment() {
    if (chatStatus === 'idle') {
      setAttachmentMenuVisible(true);
    }
  }

  async function submit() {
    const text = draft.trim();
    const selectedAttachments = pendingAttachments;
    if ((!text && selectedAttachments.length === 0) || chatStatus !== 'idle') {
      return;
    }

    setError(null);
    setChatStatus('thinking');

    try {
      const uploadedAttachments: ChatAttachment[] = [];
      for (const selectedAttachment of selectedAttachments) {
        const uploadedAttachment = await uploadAttachment(apiUrl, token, selectedAttachment);
        uploadedAttachments.push({ ...uploadedAttachment, local_uri: selectedAttachment.uri });
      }
      const attachmentOnly = selectedAttachments.length > 0 && !text;
      const messageText = text || '请查看我附带的文件。';
      const userMessage = {
        ...createMessage('user', messageText),
        attachments: uploadedAttachments,
        attachmentOnly,
      };
      const nextMessages = [...messages, userMessage];
      setDraft('');
      setPendingAttachments([]);
      animateComposerHeight(34);

      // 自己发出的消息必须跟随到底部；真正滚动等待内容完成布局后再执行。
      queueScroll('smooth');
      nearBottomRef.current = true;
      setMessages(nextMessages);
      await saveMessages(nextMessages);

      const assistantMessage = createMessage('assistant', '');
      streamContentRef.current = '';

      await streamChat(apiUrl, token, nextMessages, (nextToken) => {
        streamContentRef.current += nextToken;
        setChatStatus('streaming');

        scheduleStreamingMessageUpdate(assistantMessage);
      }, uploadedAttachments);

      if (streamRenderFrameRef.current !== null) {
        cancelAnimationFrame(streamRenderFrameRef.current);
        streamRenderFrameRef.current = null;
      }
      applyStreamingMessage(assistantMessage);

      const replyContent = streamContentRef.current.trim();
      if (!replyContent) {
        throw new Error('服务端没有返回有效消息');
      }

      const completed = [
        ...nextMessages,
        { ...assistantMessage, content: replyContent },
      ];
      const shouldFollowReply = nearBottomRef.current;

      if (shouldFollowReply) {
        queueScroll('smooth');
      }

      setMessages(completed);
      await saveMessages(completed);
      void captureMemories(apiUrl, token, completed).catch(() => {
        // Capture is intentionally silent: a memory extraction failure must never look like a chat failure.
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '消息发送失败');
    } finally {
      setChatStatus('idle');
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.chatHeader}>
        <View style={styles.headerCircle}>
          <Text style={styles.headerCircleText}>≡</Text>
        </View>
        <Animated.View
          style={[
            styles.headerCenter,
            { transform: [{ scale: headerPulse }] },
          ]}
        >
          <Text style={styles.headerTitle}>{displayName}</Text>
        </Animated.View>
        <View style={styles.headerPill}>
          <Text style={styles.headerPillText}>···</Text>
        </View>
      </View>

      <View style={styles.dayDividerRow}>
        <View style={styles.dayDivider} />
        <Text style={styles.dayDividerText}>今天 · {todayLabel().replaceAll(' / ', '.')}</Text>
        <View style={styles.dayDivider} />
      </View>

      <Animated.View style={[styles.messageListShell, { opacity: listOpacity }]}>
        <ScrollView
          ref={listRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          scrollEventThrottle={16}
          onScroll={handleScroll}
          onScrollBeginDrag={() => {
            // 用户主动查看历史时，任何尚未执行的自动定位都立即让路。
            pendingScrollRef.current = null;
          }}
          onContentSizeChange={handleContentSizeChange}
          onLayout={handleListLayout}
        >
          {messages.map((item) =>
            chatStatus === 'streaming' &&
            item.role === 'assistant' &&
            item.id === latestMessageId ? (
              <StreamingMessage
                key={item.id}
                chatMessage={item}
                avatarUri={chatAvatars.assistant}
                displayName={displayName}
              />
            ) : (
              <MessageBubble
                key={item.id}
                chatMessage={item}
                animate={initialAnchorCompletedRef.current && item.id === latestMessageId}
                chatAvatars={chatAvatars}
                displayName={displayName}
              />
            ),
          )}
          {chatStatus === 'thinking' ? <TypingIndicator /> : <View style={styles.listFooterSpacer} />}
        </ScrollView>
        {showScrollToBottom ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="回到最新消息"
            onPress={scrollToLatestMessage}
            style={({ pressed }) => [
              styles.scrollToBottomButton,
              pressed && styles.scrollToBottomButtonPressed,
            ]}
          >
            <Text style={styles.scrollToBottomIcon}>↓</Text>
          </Pressable>
        ) : null}
      </Animated.View>


      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>发送失败 · {error}</Text>
        </View>
      ) : null}

      <View
        style={[
          styles.composerWrap,
          Platform.OS === 'ios' && keyboardInset > 0
            ? { paddingBottom: keyboardInset + 8 }
            : null,
        ]}
      >
        <Animated.View
          style={[
            styles.composerCard,
            {
              transform: [
                {
                  translateY: composerFocus.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -2],
                  }),
                },
                {
                  scale: composerFocus.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.003],
                  }),
                },
              ],
            },
          ]}
        >
          {pendingAttachments.length > 0 ? (
            <View style={styles.pendingAttachmentList}>
              {pendingAttachments.map((item, index) => (
                <View key={`${item.uri}-${index}`} style={styles.pendingAttachmentRow}>
                  <Text numberOfLines={1} style={styles.pendingAttachmentName}>{item.name}</Text>
                  <Pressable
                    onPress={() =>
                      setPendingAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                    hitSlop={8}
                  >
                    <Text style={styles.pendingAttachmentRemove}>移除</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.composerFirstLine}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="上传文件"
            onPress={pickAttachment}
              style={({ pressed }) => [styles.roundTool, pressed && styles.buttonPressed]}
            >
              <Text style={styles.roundToolText}>+</Text>
            </Pressable>
          <Animated.View style={[styles.composerInputWrap, { height: composerHeight }]}>
            <TextInput
              multiline
              maxLength={4000}
              placeholder="Message..."
              placeholderTextColor={colors.faint}
              style={styles.composerInput}
              value={draft}
              onChangeText={setDraft}
              onContentSizeChange={(event) =>
                animateComposerHeight(event.nativeEvent.contentSize.height + 2)
              }
              onFocus={() => {
                animateComposer(true);
                if (nearBottomRef.current) {
                  runScrollToBottom(false);
                }
              }}
              onBlur={() => animateComposer(false)}
              textAlignVertical="top"
            />
          </Animated.View>
          <SendButton
            disabled={(!draft.trim() && pendingAttachments.length === 0) || chatStatus !== 'idle'}
            sending={chatStatus !== 'idle'}
            onPress={() => void submit()}
          />
          </View>
          <View style={styles.composerBottomRow}>
            <View style={styles.roundTool}>
              <Text style={styles.roundToolText}>＋</Text>
            </View>
            <View style={styles.composerSpacer} />
            <SendButton
              disabled={!draft.trim() || chatStatus !== 'idle'}
              sending={chatStatus !== 'idle'}
              onPress={() => void submit()}
            />
          </View>
        </Animated.View>
      </View>
      <Modal
        visible={attachmentMenuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAttachmentMenuVisible(false)}
      >
        <View style={styles.attachmentModalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭附件菜单"
            onPress={() => setAttachmentMenuVisible(false)}
            style={styles.attachmentModalScrim}
          />
          <View style={styles.attachmentSheet}>
            <View style={styles.attachmentSheetHandle} />
            {pickerBusy ? (
              <ActivityIndicator color={colors.graphiteDark} style={styles.attachmentPickerBusy} />
            ) : (
              <>
                <AttachmentOption title="相机" onPress={() => void takePhoto()} />
                <AttachmentOption title="照片" onPress={() => void pickFromPhotos()} />
                <AttachmentOption title="文件" onPress={() => void pickFromFiles()} />
              </>
            )}
            <Pressable
              onPress={() => setAttachmentMenuVisible(false)}
              style={({ pressed }) => [styles.attachmentCancel, pressed && styles.buttonPressed]}
            >
              <Text style={styles.attachmentCancelText}>取消</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}


function AttachmentOption({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.attachmentOption, pressed && styles.buttonPressed]}
    >
      <Text style={styles.attachmentOptionTitle}>{title}</Text>
    </Pressable>
  );
}


function TypingIndicator() {
  const dotOne = useRef(new Animated.Value(0.28)).current;
  const dotTwo = useRef(new Animated.Value(0.28)).current;
  const dotThree = useRef(new Animated.Value(0.28)).current;
  const dots = [dotOne, dotTwo, dotThree];

  useEffect(() => {
    const pulse = (dot: Animated.Value) =>
      Animated.sequence([
        Animated.timing(dot, {
          toValue: 1,
          duration: 210,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(dot, {
          toValue: 0.28,
          duration: 250,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]);

    const animation = Animated.loop(
      Animated.stagger(110, dots.map((dot) => pulse(dot)))
    );

    animation.start();
    return () => animation.stop();
  }, [dotOne, dotThree, dotTwo]);

  return (
    <View style={styles.typingBlock}>
      <View style={styles.assistantMessageRow}>
        <View style={styles.typingDots}>
          {dots.map((dot, index) => (
            <Animated.View
              key={index}
              style={[
                styles.typingDot,
                {
                  opacity: dot,
                  transform: [
                    {
                      translateY: dot.interpolate({
                        inputRange: [0.28, 1],
                        outputRange: [1.5, 0],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function SendButton({
  disabled,
  sending,
  onPress,
}: {
  disabled: boolean;
  sending: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const enabledProgress = useRef(new Animated.Value(disabled ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(enabledProgress, {
      toValue: disabled ? 0 : 1,
      duration: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [disabled, enabledProgress]);

  function animateScale(toValue: number) {
    Animated.spring(scale, {
      toValue,
      damping: 18,
      stiffness: 360,
      mass: 0.55,
      useNativeDriver: true,
    }).start();
  }

  const backgroundColor = enabledProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#D2CBC0', '#1D1C19'],
  });

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Animated.View style={[styles.sendButton, { backgroundColor }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="发送消息"
          disabled={disabled}
          onPress={onPress}
          onPressIn={() => animateScale(0.91)}
          onPressOut={() => animateScale(1)}
          style={styles.sendButtonPressable}
        >
          <Text style={styles.sendButtonText}>{sending ? '…' : '↑'}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function ChatAvatar({
  uri,
  label,
  side,
}: {
  uri: string | null;
  label: string;
  side: 'assistant' | 'user';
}) {
  return (
    <View style={[styles.chatAvatar, side === 'user' && styles.chatAvatarUser]}>
      {uri ? (
        <Image source={{ uri }} style={styles.chatAvatarImage} />
      ) : (
        <Text style={styles.chatAvatarText}>{label.slice(0, 1)}</Text>
      )}
    </View>
  );
}

function StreamingMessage({
  chatMessage,
  avatarUri,
  displayName,
}: {
  chatMessage: ChatMessage;
  avatarUri: string | null;
  displayName: string;
}) {
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0.2,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    blink.start();
    return () => blink.stop();
  }, [cursorOpacity]);

  return (
    <View style={[styles.messageBlock, styles.messageBlockAssistant]}>
      <View style={styles.assistantMessageRow}>
        <ChatAvatar uri={avatarUri} label={displayName} side="assistant" />
        <View style={styles.assistantMessageContent}>
        <Text style={styles.assistantMessageText}>
          {chatMessage.content}
          <Animated.Text style={[styles.streamingCursor, { opacity: cursorOpacity }]}>▋</Animated.Text>
        </Text>
        </View>
      </View>
    </View>
  );
}

function MessageBubble({
  chatMessage,
  animate = false,
  chatAvatars,
  displayName,
}: {
  chatMessage: ChatMessage;
  animate?: boolean;
  chatAvatars: ChatAvatars;
  displayName: string;
}) {
  const mine = chatMessage.role === 'user';
  const entry = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const animateOnMount = useRef(animate).current;

  useEffect(() => {
    if (!animateOnMount) {
      return;
    }

    Animated.timing(entry, {
      toValue: 1,
      duration: 190,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animateOnMount, entry]);

  return (
    <Animated.View
      style={[
        styles.messageBlock,
        mine ? styles.messageBlockMine : styles.messageBlockAssistant,
        {
          opacity: entry,
          transform: [
            {
              translateY: entry.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
                extrapolate: 'clamp',
              }),
            },
          ],
        },
      ]}
    >
      {mine ? (
        <View style={styles.userMessageRow}>
          <View style={styles.userBubble}>
            {chatMessage.attachments?.map((attachment) => (
              <View key={attachment.id} style={styles.messageAttachment}>
                {attachment.local_uri?.startsWith('file:') && attachment.mime_type.startsWith('image/') ? (
                  <Image source={{ uri: attachment.local_uri }} style={styles.messageAttachmentPreview} />
                ) : null}
                <Text numberOfLines={1} style={styles.messageAttachmentName}>{attachment.filename}</Text>
              </View>
            ))}
            {!chatMessage.attachmentOnly ? (
              <Text style={styles.userBubbleText}>{chatMessage.content}</Text>
            ) : null}
          </View>
          <ChatAvatar uri={chatAvatars.user} label="我" side="user" />
        </View>
      ) : (
        <View style={styles.assistantMessageRow}>
          <ChatAvatar
            uri={chatAvatars.assistant}
            label={displayName}
            side="assistant"
          />
          <View style={styles.assistantMessageContent}>
            <Text style={styles.assistantMessageText}>{chatMessage.content}</Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

function MemoryScreen({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState<MemoryCategory>('fact');
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setError(null);
    try {
      const next = await getMemories(apiUrl, token);
      setMemories(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '记忆库暂时无法读取');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [apiUrl, token]);

  async function saveMemory() {
    const content = draft.trim();
    if (!content || saving) {
      return;
    }
    setSaving(true);
    try {
      const created = await createMemory(apiUrl, token, {
        category,
        content,
        importance: 4,
      });
      setMemories((current) => [created, ...current]);
      setDraft('');
      setAdding(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(memory: MemoryRecord, status: 'active' | 'archived') {
    try {
      const updated = await updateMemoryStatus(apiUrl, token, memory.id, status);
      if (status === 'archived') {
        setMemories((current) => current.filter((item) => item.id !== memory.id));
      } else {
        setMemories((current) => current.map((item) => (item.id === memory.id ? updated : item)));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败');
    }
  }

  const active = memories.filter((memory) => memory.status === 'active');
  const pending = memories.filter((memory) => memory.status === 'pending');

  return (
    <ScrollView
      style={styles.contentScroll}
      contentContainerStyle={styles.memoryPage}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.memoryHeader}>
        <Text style={styles.memoryKicker}>UTTO · PRIVATE ARCHIVE</Text>
        <View style={styles.memoryTitleRow}>
          <Text style={styles.memoryTitle}>记忆</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="刷新记忆"
            onPress={() => void refresh()}
            style={({ pressed }) => [styles.memoryRefreshLink, pressed && styles.buttonPressed]}
          >
            <Text style={styles.memoryRefreshText}>{loading ? '读取中' : '刷新'}</Text>
          </Pressable>
        </View>
        <Text style={styles.memorySubtitle}>the things we choose to keep</Text>
        <View style={styles.memoryRule} />
        <View style={styles.memoryStatRow}>
          <MemoryStat value={active.length} label="已收录" />
          <View style={styles.memoryStatDivider} />
          <MemoryStat value={pending.length} label="待确认" />
          <View style={styles.memoryStatDivider} />
          <MemoryStat value={memories.filter((memory) => memory.source === 'auto').length} label="自动记录" />
        </View>
        <Text style={styles.memoryIntro}>只在相关时被熠自然地想起。</Text>
      </View>

      <View style={styles.memoryActionRow}>
        <Pressable
          onPress={() => setAdding((current) => !current)}
          style={({ pressed }) => [styles.memoryAddButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.memoryAddButtonText}>{adding ? '收起记录' : '记录一条记忆'}</Text>
        </Pressable>
      </View>

      {adding ? (
        <View style={styles.memoryComposer}>
          <Text style={styles.memoryComposerLabel}>写下希望熠长期记得的事</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="例如：用户不喜欢被追问。"
            placeholderTextColor={colors.faint}
            style={styles.memoryComposerInput}
            multiline
            maxLength={500}
          />
          <View style={styles.memoryCategoryRow}>
            {([
              ['fact', '事实'],
              ['preference', '偏好'],
              ['boundary', '边界'],
              ['relationship', '约定'],
            ] as Array<[MemoryCategory, string]>).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setCategory(key)}
                style={[styles.memoryCategoryChip, category === key && styles.memoryCategoryChipActive]}
              >
                <Text style={[styles.memoryCategoryText, category === key && styles.memoryCategoryTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => void saveMemory()}
            style={({ pressed }) => [styles.memorySaveButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.memorySaveButtonText}>{saving ? '保存中…' : '保存并生效'}</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.memoryError}>{error}</Text> : null}

      {pending.length > 0 ? (
        <MemorySection title="待你确认" subtitle="敏感信息不会自动进入对话" tone="pending">
          {pending.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              onApprove={() => void setStatus(memory, 'active')}
              onRemove={() => void setStatus(memory, 'archived')}
            />
          ))}
        </MemorySection>
      ) : null}

      <MemorySection title={active.length ? '已收录' : '从一句话开始'} subtitle={active.length ? '只在相关时被自然地想起' : '聊天时会自动留下真正重要的事'}>
        {active.length ? (
          active.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              onRemove={() =>
                Alert.alert('移除这条记忆？', '熠之后不会再用它。', [
                  { text: '取消', style: 'cancel' },
                  { text: '移除', style: 'destructive', onPress: () => void setStatus(memory, 'archived') },
                ])
              }
            />
          ))
        ) : (
          <View style={styles.memoryEmptyCard}>
            <Text style={styles.memoryEmptyTitle}>还没有长期记忆</Text>
            <Text style={styles.memoryEmptyText}>直接聊天即可自动捕捉；也可以手动记录一条。</Text>
          </View>
        )}
      </MemorySection>
    </ScrollView>
  );
}

function MemoryStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.memoryStat}>
      <Text style={styles.memoryStatValue}>{value}</Text>
      <Text style={styles.memoryStatLabel}>{label}</Text>
    </View>
  );
}

function MemorySection({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  tone?: 'pending';
  children: ReactNode;
}) {
  return (
    <View style={[styles.memorySection, tone === 'pending' && styles.memorySectionPending]}>
      <View style={styles.memorySectionHeader}>
        <View style={styles.memorySectionTitleRow}>
          <Text style={styles.memorySectionTitle}>{title}</Text>
          {tone === 'pending' ? <View style={styles.memorySensitiveDot} /> : null}
        </View>
        <Text style={styles.memorySectionSubtitle}>{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}

function MemoryCard({
  memory,
  onApprove,
  onRemove,
}: {
  memory: MemoryRecord;
  onApprove?: () => void;
  onRemove: () => void;
}) {
  const labels: Record<MemoryCategory, string> = {
    fact: '事实',
    preference: '偏好',
    boundary: '边界',
    relationship: '约定',
  };
  return (
    <View style={[styles.memoryCard, memory.status === 'pending' && styles.memoryCardPending]}>
      <View style={styles.memoryCardTopRow}>
        <View style={styles.memoryCardBadge}>
          <Text style={styles.memoryCardBadgeText}>{labels[memory.category]}</Text>
        </View>
        <Text style={styles.memoryCardMeta}>{memory.source === 'auto' ? '自动捕捉' : '手动记录'}</Text>
      </View>
      <Text style={styles.memoryCardText}>{memory.content}</Text>
      <View style={styles.memoryCardFooter}>
        <Text style={styles.memoryCardDate}>{new Date(memory.updated_at).toLocaleDateString()}</Text>
        <View style={styles.memoryCardActions}>
          {onApprove ? (
            <Pressable onPress={onApprove} hitSlop={8}>
              <Text style={styles.memoryApproveAction}>确认保留</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onRemove} hitSlop={8}>
            <Text style={styles.memoryRemoveAction}>{onApprove ? '忽略' : '移除'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function RelationshipScreen({ bootstrap }: { bootstrap: BootstrapResponse }) {
  return (
    <ScrollView style={styles.contentScroll} contentContainerStyle={styles.diaryPage}>
      <Text style={styles.diaryKicker}>NEST · PRIVATE DIARY</Text>
      <View style={styles.diaryAvatarWrap}>
        <View style={styles.avatarXL}>
          <Text style={styles.avatarXLText}>熠</Text>
        </View>
      </View>
      <Text style={styles.diaryName}>{bootstrap.display_name || '熠'}</Text>
      <Text style={styles.diaryDate}>{todayLabel()}</Text>

      <View style={styles.diaryDotsRow}>
        <View style={[styles.diaryDot, { backgroundColor: colors.roseSoft }]} />
        <View style={[styles.diaryDot, { backgroundColor: colors.surface }]} />
        <View style={[styles.diaryDot, { backgroundColor: colors.paperDeep }]} />
      </View>

      <View style={styles.diaryMenu}>
        <View style={styles.diaryMenuRow}>
          <Text style={styles.diaryMenuLabel}>Persona</Text>
          <Text style={styles.diaryMenuValue}>{bootstrap.persona ? '已载入' : '未设置'}</Text>
        </View>
        <View style={styles.diaryMenuRow}>
          <Text style={styles.diaryMenuLabel}>Relationship ID</Text>
          <Text style={styles.diaryMenuValue}>{bootstrap.relationship_id.slice(0, 8)}…</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function SettingsScreen({
  apiUrl,
  onDisconnect,
  onResetMessages,
  chatAvatars,
  onPickAvatar,
  onResetAvatar,
}: {
  apiUrl: string;
  onDisconnect: () => Promise<void>;
  onResetMessages: () => Promise<void>;
  chatAvatars: ChatAvatars;
  onPickAvatar: (role: keyof ChatAvatars) => Promise<void>;
  onResetAvatar: (role: keyof ChatAvatars) => Promise<void>;
}) {
  function confirmResetMessages() {
    Alert.alert(
      '清空本机聊天缓存？',
      '这会移除这台手机上的聊天记录，无法恢复。不会影响已保存的记忆。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: () => void onResetMessages(),
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.contentScroll} contentContainerStyle={styles.settingsPage}>
      <Text style={styles.settingsKicker}>NEST · UTTO</Text>
      <Text style={styles.settingsTitle}>Settings</Text>

      <View style={styles.settingsPaperCard}>
        <Text style={styles.settingsLabel}>当前服务器</Text>
        <Text selectable style={styles.serverAddress}>{apiUrl}</Text>
      </View>

      <View style={styles.avatarSettingsCard}>
        <Text style={styles.settingsLabel}>聊天头像</Text>
        <AvatarSettingsRow
          label="熠"
          avatarUri={chatAvatars.assistant}
          side="assistant"
          onPick={() => void onPickAvatar('assistant')}
          onReset={() => void onResetAvatar('assistant')}
        />
        <AvatarSettingsRow
          label="我"
          avatarUri={chatAvatars.user}
          side="user"
          onPick={() => void onPickAvatar('user')}
          onReset={() => void onResetAvatar('user')}
        />
      </View>

      <View style={styles.settingsActionsCard}>
        <Pressable
          onPress={confirmResetMessages}
          style={({ pressed }) => [styles.settingsAction, pressed && styles.buttonPressed]}
        >
          <View style={styles.settingsActionCopy}>
            <Text style={[styles.settingsActionTitle, { color: colors.danger }]}>清空本机聊天缓存</Text>
            <Text style={styles.settingsActionSubtitle}>仅清除这台手机上的聊天记录</Text>
          </View>
          <Text style={[styles.settingsActionArrow, { color: colors.danger }]}>›</Text>
        </Pressable>
        <Pressable
          onPress={() => void onDisconnect()}
          style={({ pressed }) => [
            styles.settingsAction,
            styles.settingsActionLast,
            pressed && styles.buttonPressed,
          ]}
        >
          <View style={styles.settingsActionCopy}>
            <Text style={styles.settingsActionTitle}>暂时断开连接</Text>
            <Text style={styles.settingsActionSubtitle}>保留配对信息，下次一键恢复</Text>
          </View>
          <Text style={styles.settingsActionArrow}>›</Text>
        </Pressable>
      </View>
      <Text style={styles.settingsFootnote}>
        DeepSeek API Key 不会保存在手机端。手机只保存可撤销的设备访问令牌。
      </Text>
    </ScrollView>
  );
}

function AvatarSettingsRow({
  label,
  avatarUri,
  side,
  onPick,
  onReset,
}: {
  label: string;
  avatarUri: string | null;
  side: 'assistant' | 'user';
  onPick: () => void;
  onReset: () => void;
}) {
  return (
    <View style={styles.avatarSettingsRow}>
      <ChatAvatar uri={avatarUri} label={label} side={side} />
      <Text style={styles.avatarSettingsName}>{label}</Text>
      {avatarUri ? (
        <Pressable onPress={onReset} hitSlop={8}>
          <Text style={styles.avatarResetAction}>恢复默认</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onPick} hitSlop={8}>
        <Text style={styles.avatarPickAction}>选择照片</Text>
      </Pressable>
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
    { key: 'chat', label: 'Chat', glyph: '●' },
    { key: 'memory', label: 'Memory', glyph: '□' },
    { key: 'relationship', label: 'Diary', glyph: '♡' },
    { key: 'settings', label: 'Set', glyph: '··' },
  ];

  return (
    <SafeAreaView style={styles.tabSafeArea} edges={['bottom']}>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <AnimatedTabItem
              key={tab.key}
              active={active}
              glyph={tab.glyph}
              label={tab.label}
              onPress={() => onChange(tab.key)}
            />
          );
        })}
      </View>
    </SafeAreaView>
  );
}


function AnimatedTabItem({
  active,
  glyph,
  label,
  onPress,
}: {
  active: boolean;
  glyph: string;
  label: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function press(toValue: number) {
    Animated.spring(scale, {
      toValue,
      damping: 20,
      stiffness: 340,
      mass: 0.55,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={[styles.tabItem, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => press(0.96)}
        onPressOut={() => press(1)}
        style={styles.tabPressable}
      >
        <Text style={[styles.tabGlyphText, active && styles.tabGlyphTextActive]}>{glyph}</Text>
        <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  appShell: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  pageTransition: { flex: 1 },
  ambientLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  ambientBlobOne: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    right: -116,
    top: -112,
    backgroundColor: '#E9E5DD',
  },
  ambientBlobTwo: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    left: -154,
    bottom: -162,
    backgroundColor: '#EBE7E0',
  },
  screen: { flex: 1, backgroundColor: 'transparent' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingBrand: {
    marginTop: 14,
    color: colors.muted,
    fontFamily: monoFont,
    fontSize: 11,
    letterSpacing: 3,
  },

  pairingSafeArea: { flex: 1, backgroundColor: colors.background },
  pairingKeyboard: { flex: 1 },
  pairingContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 54,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  reconnectContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 54,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  pairingKicker: {
    textAlign: 'center',
    color: colors.muted,
    fontFamily: monoFont,
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 24,
  },
  brandLockup: {
    alignSelf: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  brand: {
    textAlign: 'center',
    color: colors.graphiteDark,
    fontFamily: displayScriptFont,
    fontSize: 46,
    lineHeight: 54,
    letterSpacing: 0.5,
  },
  pairingTitle: {
    marginTop: 12,
    textAlign: 'center',
    color: colors.ink,
    fontFamily: serifFont,
    fontSize: 29,
    fontWeight: '700',
  },
  pairingSubtitle: {
    fontFamily: uiFont,
    marginTop: 12,
    alignSelf: 'center',
    maxWidth: 420,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  formCard: {
    marginTop: 30,
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#4C473E',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  formStamp: {
    marginBottom: 20,
    color: colors.muted,
    fontFamily: monoFont,
    fontSize: 10,
    letterSpacing: 2.4,
  },
  inputLabel: {
    marginBottom: 8,
    color: colors.ink,
    fontFamily: monoFont,
    fontSize: 11,
    letterSpacing: 1,
  },
  formInput: {
    minHeight: 50,
    paddingHorizontal: 14,
    marginBottom: 17,
    borderRadius: 15,
    backgroundColor: colors.surface,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reconnectLabel: {
    marginBottom: 8,
    color: colors.ink,
    fontFamily: monoFont,
    fontSize: 11,
    letterSpacing: 1,
  },
  reconnectUrl: {
    marginBottom: 17,
    paddingHorizontal: 14,
    paddingVertical: 15,
    borderRadius: 15,
    backgroundColor: colors.surface,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: uiFont,
    fontSize: 14,
  },
  errorText: { fontFamily: uiFont, marginBottom: 12, color: colors.danger, fontSize: 13, lineHeight: 19 },
  primaryButton: {
    minHeight: 51,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.graphiteDark,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  buttonPressed: { opacity: 0.72 },
  buttonDisabled: { opacity: 0.5 },

  chatHeader: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  headerCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#403B34',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  headerCircleText: { color: colors.graphiteDark, fontSize: 21, lineHeight: 23 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  headerTitle: {
    color: '#20201E',
    fontFamily: chatFontMedium,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0,
  },
  headerPill: {
    minWidth: 44,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#403B34',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  headerPillText: { color: colors.graphiteDark, fontSize: 17, letterSpacing: 2 },
  dayDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 6,
  },
  dayDivider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dayDividerText: {
    paddingHorizontal: 12,
    color: '#9A9892',
    fontFamily: chatFont,
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0,
  },

  messageListShell: { flex: 1 },
  messageList: { flex: 1 },
  scrollToBottomButton: {
    position: 'absolute',
    right: 18,
    bottom: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FCFAF5',
    borderWidth: 1,
    borderColor: '#DED8CF',
    shadowColor: '#3D3933',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  scrollToBottomButtonPressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  scrollToBottomIcon: { color: colors.graphiteDark, fontSize: 24, lineHeight: 27 },
  messageListContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  messageBlock: {
    width: '100%',
  },
  messageBlockMine: {
    marginBottom: 16,
  },
  messageBlockAssistant: {
    marginBottom: 18,
  },
  userMessageRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 10,
    paddingLeft: 52,
  },
  userBubble: {
    maxWidth: '76%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#E8E7E3',
    borderWidth: 1,
    borderColor: '#DFDDD8',
  },
  userBubbleText: {
    color: '#232321',
    fontFamily: chatFont,
    fontSize: 16,
    lineHeight: 23,
    letterSpacing: 0,
  },
  assistantMessageRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingRight: 52,
  },
  assistantMessageContent: {
    flexShrink: 1,
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#FCFAF5',
    borderWidth: 1,
    borderColor: '#E6E1D8',
  },
  chatAvatar: {
    width: 46,
    height: 46,
    borderRadius: 7,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.roseSoft,
    borderWidth: 1,
    borderColor: '#E7C8C6',
  },
  chatAvatarUser: {
    backgroundColor: '#E8E7E3',
    borderColor: '#DDDBD6',
  },
  chatAvatarImage: { width: '100%', height: '100%' },
  chatAvatarText: {
    color: colors.graphiteDark,
    fontFamily: chatFontMedium,
    fontSize: 15,
    fontWeight: '600',
  },
  assistantMessageText: {
    color: '#222220',
    fontFamily: chatFont,
    fontSize: 16,
    lineHeight: 25,
    letterSpacing: 0,
  },
  messageAttachment: {
    maxWidth: 196,
    marginBottom: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.46)',
    borderWidth: 1,
    borderColor: '#D9D7D1',
  },
  messageAttachmentPreview: { width: 156, height: 118, marginBottom: 7, borderRadius: 7 },
  messageAttachmentName: { color: colors.ink, fontFamily: uiFontMedium, fontSize: 12 },
  streamingCursor: { color: colors.graphiteDark, fontWeight: '600' },
  listFooterSpacer: { height: 2 },
  typingBlock: {
    marginTop: -2,
    marginBottom: 18,
  },
  typingDots: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 2,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#77756F',
  },
  inlineError: { paddingHorizontal: 18, paddingBottom: 6 },
  inlineErrorText: { fontFamily: uiFont, color: colors.danger, fontSize: 12 },

  composerWrap: {
    paddingHorizontal: 10,
    paddingTop: 5,
    paddingBottom: 6,
    backgroundColor: 'rgba(242, 238, 229, 0.98)',
  },
  composerCard: {
    minHeight: 54,
    maxHeight: 132,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 22,
    backgroundColor: '#F8F7F4',
    borderWidth: 1,
    borderColor: '#E1DFD9',
    shadowColor: '#2B2B29',
    shadowOpacity: 0.055,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  composerInput: {
    flex: 1,
    paddingHorizontal: 5,
    paddingTop: 4,
    paddingBottom: 4,
    color: '#222220',
    fontFamily: chatFont,
    fontSize: 16,
    lineHeight: 23,
    letterSpacing: 0,
  },
  composerFirstLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  pendingAttachmentList: { gap: 5, marginBottom: 6 },
  pendingAttachmentRow: {
    minHeight: 26,
    marginBottom: 6,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9,
    backgroundColor: '#ECEAE5',
  },
  pendingAttachmentName: { flex: 1, color: colors.graphiteDark, fontFamily: uiFont, fontSize: 11 },
  pendingAttachmentRemove: { marginLeft: 8, color: colors.muted, fontFamily: uiFontMedium, fontSize: 11 },
  attachmentModalRoot: { flex: 1, justifyContent: 'flex-end' },
  attachmentModalScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(39, 36, 31, 0.28)' },
  attachmentSheet: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 26 : 18,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachmentSheetHandle: { width: 36, height: 4, marginBottom: 10, alignSelf: 'center', borderRadius: 2, backgroundColor: colors.faint },
  attachmentOption: { minHeight: 54, marginTop: 8, paddingHorizontal: 15, justifyContent: 'center', borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  attachmentOptionTitle: { color: colors.ink, fontFamily: chatFontMedium, fontSize: 16 },
  attachmentPickerBusy: { marginVertical: 40 },
  attachmentCancel: { minHeight: 45, marginTop: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#ECEAE5' },
  attachmentCancelText: { color: colors.graphiteDark, fontFamily: uiFontMedium, fontSize: 14 },
  composerInputWrap: { flex: 1 },
  composerBottomRow: { display: 'none' },
  roundTool: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECEAE5',
  },
  roundToolText: { color: colors.graphite, fontSize: 23, lineHeight: 25, fontWeight: '300' },
  composerSpacer: { flex: 1 },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
  },
  sendButtonPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '500',
  },

  tabSafeArea: { backgroundColor: colors.background },
  tabBar: {
    minHeight: 58,
    marginHorizontal: 12,
    marginTop: 3,
    marginBottom: 6,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabItem: { flex: 1, minHeight: 50 },
  tabPressable: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabGlyphText: { color: colors.faint, fontSize: 12, lineHeight: 13 },
  tabGlyphTextActive: { color: colors.graphiteDark },
  tabLabel: { marginTop: 3, color: colors.muted, fontFamily: serifFont, fontSize: 10.5 },
  tabLabelActive: { color: colors.graphiteDark, fontWeight: '700' },

  contentScroll: { flex: 1, backgroundColor: 'transparent' },
  receiptPage: { paddingHorizontal: 28, paddingTop: 36, paddingBottom: 52 },
  receiptKicker: {
    textAlign: 'center',
    color: colors.muted,
    fontFamily: monoFont,
    fontSize: 10,
    letterSpacing: 3.5,
  },
  receiptTitle: {
    marginTop: 12,
    textAlign: 'center',
    color: colors.ink,
    fontFamily: serifFont,
    fontSize: 32,
    fontWeight: '700',
    fontStyle: 'italic',
  },
  receiptDate: {
    marginTop: 7,
    textAlign: 'center',
    color: colors.muted,
    fontFamily: monoFont,
    fontSize: 11,
    letterSpacing: 1.7,
  },
  dashedRule: {
    marginVertical: 24,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#BBB2A5',
  },
  receiptMetaRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center' },
  receiptMetaLabel: { flex: 1, color: colors.graphite, fontFamily: monoFont, fontSize: 11 },
  receiptMetaValue: { color: colors.ink, fontFamily: monoFont, fontSize: 11 },
  receiptSectionTitle: {
    textAlign: 'center',
    color: colors.graphite,
    fontFamily: monoFont,
    fontSize: 11,
    letterSpacing: 2.2,
    marginBottom: 10,
  },
  receiptTaskRow: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  receiptCheckbox: { width: 34, color: colors.ink, fontFamily: monoFont, fontSize: 13 },
  receiptTaskText: { fontFamily: uiFont, flex: 1, color: colors.ink, fontSize: 14, lineHeight: 21 },
  receiptTaskSide: { marginLeft: 12, color: colors.muted, fontFamily: serifFont, fontStyle: 'italic', fontSize: 12 },
  memoryStamp: {
    alignSelf: 'center',
    paddingHorizontal: 17,
    paddingVertical: 9,
    borderWidth: 2,
    borderColor: colors.rose,
    borderRadius: 3,
    transform: [{ rotate: '-4deg' }],
  },
  memoryStampText: { color: '#AD6D68', fontFamily: serifFont, fontSize: 15, fontWeight: '700', letterSpacing: 1.4 },
  receiptFootnote: { marginTop: 22, textAlign: 'center', color: colors.muted, fontSize: 12.5, lineHeight: 20 },

  memoryPage: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 42 },
  memoryHeader: { paddingTop: 5 },
  memoryKicker: { color: colors.muted, fontFamily: monoFont, fontSize: 9.5, letterSpacing: 2.6 },
  memoryTitleRow: { marginTop: 7, flexDirection: 'row', alignItems: 'baseline' },
  memoryTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 34, fontWeight: '700' },
  memoryRefreshLink: { marginLeft: 'auto', paddingVertical: 7, paddingLeft: 18 },
  memoryRefreshText: { color: colors.graphite, fontFamily: uiFont, fontSize: 12 },
  memorySubtitle: { marginTop: 1, color: colors.muted, fontFamily: serifFont, fontSize: 13, fontStyle: 'italic' },
  memoryRule: { height: StyleSheet.hairlineWidth, marginTop: 22, backgroundColor: colors.border },
  memoryIntro: { marginTop: 13, color: colors.muted, fontFamily: chatFont, fontSize: 12, lineHeight: 19 },
  memoryStatRow: { paddingTop: 15, flexDirection: 'row', alignItems: 'center' },
  memoryStat: { minWidth: 58 },
  memoryStatValue: { color: colors.ink, fontFamily: serifFont, fontSize: 20, fontWeight: '700' },
  memoryStatLabel: { marginTop: 1, color: colors.muted, fontFamily: uiFont, fontSize: 10 },
  memoryStatDivider: { width: StyleSheet.hairlineWidth, height: 24, marginHorizontal: 12, backgroundColor: colors.border },
  memoryActionRow: { marginTop: 22, alignItems: 'flex-start' },
  memoryAddButton: { alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  memoryAddButtonText: { color: colors.graphiteDark, fontFamily: uiFontMedium, fontSize: 12 },
  memoryComposer: { marginTop: 12, padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.paper },
  memoryComposerLabel: { color: colors.ink, fontFamily: chatFontMedium, fontSize: 15 },
  memoryComposerInput: { minHeight: 68, marginTop: 10, paddingHorizontal: 11, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, color: colors.ink, backgroundColor: colors.surface, fontFamily: chatFont, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  memoryCategoryRow: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  memoryCategoryChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  memoryCategoryChipActive: { borderColor: '#61717A', backgroundColor: '#E5EBE9' },
  memoryCategoryText: { color: colors.muted, fontFamily: uiFont, fontSize: 12 },
  memoryCategoryTextActive: { color: '#354850', fontFamily: uiFontMedium },
  memorySaveButton: { minHeight: 40, marginTop: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#61717A' },
  memorySaveButtonText: { color: '#FFFFFF', fontFamily: uiFontMedium, fontSize: 13 },
  memoryError: { marginTop: 12, color: colors.danger, fontFamily: uiFont, fontSize: 12, lineHeight: 18 },
  memorySection: { marginTop: 27 },
  memorySectionPending: { padding: 14, borderRadius: 16, backgroundColor: '#F8F0EB', borderWidth: 1, borderColor: '#E5D6CB' },
  memorySectionHeader: { marginBottom: 10 },
  memorySectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  memorySectionTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 20, fontWeight: '700' },
  memorySensitiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#B67663' },
  memorySectionSubtitle: { marginTop: 3, color: colors.muted, fontFamily: uiFont, fontSize: 11.5 },
  memoryCard: { marginTop: 9, padding: 15, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#E3DDD3' },
  memoryCardPending: { marginTop: 7, backgroundColor: '#FCF8F4', borderColor: '#E6D0C4' },
  memoryCardTopRow: { flexDirection: 'row', alignItems: 'center' },
  memoryCardBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#E8ECE8' },
  memoryCardBadgeText: { color: '#50626A', fontFamily: uiFontMedium, fontSize: 10 },
  memoryCardMeta: { marginLeft: 'auto', color: colors.muted, fontFamily: uiFont, fontSize: 10 },
  memoryCardText: { marginTop: 10, color: colors.ink, fontFamily: chatFont, fontSize: 16, lineHeight: 23 },
  memoryCardFooter: { marginTop: 12, flexDirection: 'row', alignItems: 'center' },
  memoryCardDate: { color: colors.faint, fontFamily: monoFont, fontSize: 10 },
  memoryCardActions: { marginLeft: 'auto', flexDirection: 'row', gap: 14 },
  memoryApproveAction: { color: '#4B6670', fontFamily: uiFontMedium, fontSize: 12 },
  memoryRemoveAction: { color: '#9A776D', fontFamily: uiFont, fontSize: 12 },
  memoryEmptyCard: { minHeight: 118, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26, borderRadius: 15, borderWidth: 1, borderColor: '#E3DDD3', backgroundColor: 'rgba(250, 247, 240, 0.72)' },
  memoryEmptyTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 17, fontWeight: '700' },
  memoryEmptyText: { marginTop: 5, color: colors.muted, fontFamily: uiFont, fontSize: 12, lineHeight: 19, textAlign: 'center' },

  diaryPage: { paddingBottom: 48 },
  diaryKicker: {
    marginTop: 36,
    textAlign: 'center',
    color: colors.muted,
    fontFamily: monoFont,
    fontSize: 10,
    letterSpacing: 3.5,
  },
  diaryAvatarWrap: { alignItems: 'center', paddingTop: 24 },
  avatarXL: {
    width: 102,
    height: 102,
    borderRadius: 51,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.roseSoft,
    borderWidth: 1,
    borderColor: '#E7C8C6',
  },
  avatarXLText: { color: colors.graphiteDark, fontSize: 37, fontWeight: '600' },
  diaryName: { marginTop: 13, textAlign: 'center', color: colors.ink, fontFamily: serifFont, fontSize: 24, fontWeight: '700' },
  diaryDate: { marginTop: 6, textAlign: 'center', color: colors.muted, fontFamily: monoFont, fontSize: 11, letterSpacing: 1.4 },
  diaryDotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 28, marginBottom: 34 },
  diaryDot: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border },
  diaryMenu: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  diaryMenuRow: {
    minHeight: 66,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  diaryMenuLabel: { flex: 1, color: colors.ink, fontFamily: serifFont, fontSize: 19 },
  diaryMenuValue: { fontFamily: uiFont, maxWidth: '52%', textAlign: 'right', color: colors.muted, fontSize: 12.5 },

  settingsPage: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 48 },
  settingsKicker: { color: colors.muted, fontFamily: monoFont, fontSize: 10, letterSpacing: 3 },
  settingsTitle: { marginTop: 10, color: colors.ink, fontFamily: serifFont, fontSize: 32, fontWeight: '700' },
  settingsSubtitle: { marginTop: 6, color: colors.muted, fontSize: 13 },
  settingsPaperCard: {
    marginTop: 22,
    padding: 18,
    borderRadius: 20,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarSettingsCard: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarSettingsRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatarSettingsName: {
    flex: 1,
    color: colors.ink,
    fontFamily: chatFont,
    fontSize: 15,
  },
  avatarPickAction: { color: colors.graphiteDark, fontFamily: uiFontMedium, fontSize: 13 },
  avatarResetAction: { color: colors.muted, fontFamily: uiFont, fontSize: 12 },
  settingsLabel: { color: colors.muted, fontFamily: monoFont, fontSize: 10, letterSpacing: 1.5 },
  serverAddress: { fontFamily: uiFont, marginTop: 9, color: colors.ink, fontSize: 14, lineHeight: 21 },
  settingsActionsCard: {
    marginTop: 16,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  settingsAction: {
    minHeight: 68,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingsActionCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  settingsActionTitle: { color: colors.ink, fontFamily: serifFont, fontSize: 17, lineHeight: 22 },
  settingsActionSubtitle: { marginTop: 3, color: colors.muted, fontFamily: uiFont, fontSize: 12 },
  settingsActionArrow: { color: colors.muted, fontSize: 26, fontWeight: '300' },
  settingsActionLast: { borderBottomWidth: 0 },
  settingsFootnote: { fontFamily: uiFont, marginTop: 22, color: colors.muted, fontSize: 12, lineHeight: 19 },
});
