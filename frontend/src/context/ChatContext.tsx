import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useChat, type Message } from "@ai-sdk/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useLogger } from "@/utils/Logger";
import { LLMModel } from "@/types/types";
import { useFreshToken } from "@/hooks/useFreshToken";

// Define the shape of the data that will be sent to the AI
type UseChatResult = ReturnType<typeof useChat>;
export type ChatStatus = UseChatResult["status"];
interface ChatDataContext {
  projectName: string;
  sheetName: string;
  sheetId: Id<"sheet">;
  columns: Array<{ id: Id<"column">; name: string; type: string }>;
  rowCount: number;
  mentionedColumns: string[];
}

interface ChatContextType {
  messages: Message[];
  status: ChatStatus;
  error: Error | undefined;
  startConversation: (
    conversationId: Id<"chat_conversation">,
    initialMessages: Message[],
    chatContext: ChatDataContext,
  ) => void;
  sendMessage: (message: string, model: LLMModel) => Promise<void>;
  clearMessages: () => void;
}

export const ChatContext = createContext<ChatContextType | null>(null);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [conversationId, setConversationId] =
    useState<Id<"chat_conversation"> | null>(null);
  const [chatContext, setChatContext] = useState<ChatDataContext | null>(null);

  const saveMessage = useMutation(api.chat_history.saveMessage);
  const getToken = useFreshToken();
  const logger = useLogger("src/context/ChatProvider.tsx");

  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  const httpUrl = convexUrl
    ? convexUrl.replace(".convex.cloud", ".convex.site")
    : "";

  const { messages, append, setMessages, status, error } = useChat({
    api: `${httpUrl}/chat`,
    onFinish: async (message) => {
      logger.debug("Stream finished, saving assistant message.");
      if (conversationId) {
        try {
          await saveMessage({
            conversation_id: conversationId,
            role: "assistant",
            content: message.content,
          });
        } catch (e) {
          logger.error("Failed to save assistant message", { error: e });
        }
      }
    },
    onResponse: (response) => {
      logger.debug("Chat response received:", response);
    },
    onError: (e) => {
      logger.error("Vercel AI SDK useChat hook error", { error: e });
    },
  });

  const getMessageKey = useCallback((message: Message) => {
    if (message.id) {
      return `id:${message.id}`;
    }

    const createdAt = (message as Message & { createdAt?: Date | string; timestamp?: Date | number })
      .createdAt;
    const timestamp = (message as Message & { createdAt?: Date | string; timestamp?: Date | number })
      .timestamp;

    const normalizedTimestamp = createdAt
      ? typeof createdAt === "string"
        ? createdAt
        : createdAt.getTime().toString()
      : timestamp
        ? timestamp instanceof Date
          ? timestamp.getTime().toString()
          : timestamp.toString()
        : "";

    return `content:${message.role}:${message.content}:${normalizedTimestamp}`;
  }, []);

  const startConversation = useCallback(
    (
      convId: Id<"chat_conversation">,
      initialMessages: Message[],
      context: ChatDataContext,
    ) => {
      setChatContext(context);

      setConversationId((previousConversationId) => {
        setMessages((previousMessages) => {
          const isNewConversation = previousConversationId !== convId;

          if (isNewConversation) {
            const nextMessages = [...initialMessages];
            const previousKeys = previousMessages.map(getMessageKey);
            const nextKeys = nextMessages.map(getMessageKey);

            const hasChanges =
              nextKeys.length !== previousKeys.length ||
              nextKeys.some((key, index) => key !== previousKeys[index]);

            return hasChanges ? nextMessages : previousMessages;
          }

          const canonicalIds = new Set(
            initialMessages.map((message) => message.id).filter(Boolean) as string[],
          );
          const canonicalSignatures = new Set(
            initialMessages.map((message) => `${message.role}:${message.content}`),
          );

          const pendingMessages = previousMessages.filter((message) => {
            if (message.id && canonicalIds.has(message.id)) {
              return false;
            }

            const signature = `${message.role}:${message.content}`;
            if (canonicalSignatures.has(signature)) {
              return false;
            }

            return true;
          });

          const nextMessages = [...initialMessages, ...pendingMessages];

          if (nextMessages.length !== previousMessages.length) {
            return nextMessages;
          }

          const previousKeys = previousMessages.map(getMessageKey);
          const nextKeys = nextMessages.map(getMessageKey);

          const hasDifferences = nextKeys.some((key, index) => key !== previousKeys[index]);

          return hasDifferences ? nextMessages : previousMessages;
        });

        return convId;
      });
    },
    [getMessageKey, setMessages],
  );

  const sendMessage = useCallback(
    async (message: string, model: LLMModel) => {
      if (!conversationId || !chatContext) return;

      const mentionedColumns = Array.from(
        message.matchAll(/\{\{(.*?)\}\}/g),
      ).map((match) => match[1]);

      // Immediately save the user's message for persistence
      await saveMessage({
        conversation_id: conversationId,
        role: "user",
        content: message,
        mentioned_columns: mentionedColumns,
      });

      const token = await getToken({ template: "convex" });
      const updatedChatContext = { ...chatContext, mentionedColumns };

      // Append to the Vercel hook to start the stream
      append(
        { role: "user", content: message },
        {
          headers: { Authorization: `Bearer ${token}` },
          body: { dataContext: updatedChatContext, model },
        },
      );
    },
    [append, conversationId, chatContext, saveMessage, getToken],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        status,
        error,
        startConversation,
        sendMessage,
        clearMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
};
