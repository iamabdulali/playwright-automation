interface ParentSquareMessages {
  thread: string;
  message: string;
  time: string;
  from: string;
  threadId: string;
  messageId: string;
}

interface BrightWheelsChatData {
  chatIndex: number;
  chatName: string;
  threadId: string;
  badge: string | null;
  newMessages: BrightWheelsNewMessages[];
  lastMessageId: string | null;
}

interface BrightWheelsNewMessages {
  id: string;
  sender: string;
  timestamp: string;
  content: string;
}

interface BrightWheelChatState {
  chatName: string;
  lastMessageId: string | null;
}

type BrightWheelStateMap = Record<string, BrightWheelChatState>;

interface BrightWheelChatStateRow {
  thread_id: string;
  chat_name: string;
  last_message_id: string | null;
  updated_at?: string;
}
