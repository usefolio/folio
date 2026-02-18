import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { Button } from "../ui/button";
import { Loader2, Bot, User, Trash2 } from "lucide-react";
import { useDataContext } from "@/context/DataContext";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "../ui/scroll-area";
import { MentionsComponentRef, ChatMessage } from "@/interfaces/interfaces";
import { Card } from "../ui/card";
import { LLMModel, LLMModelEnum, PromptOptions } from "@/types/types";
import MentionsComponent from "../modalConfig/columnModalConfig/mentionsComponent";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { DEFAULT_AI_MODEL } from "@/constants";
import { Doc } from "../../../convex/_generated/dataModel";
import { useChatContext } from "@/context/ChatContext";
import { ChatContextViews } from "./chat-context-views";
import { ChatInputFooter } from "./chat-input-footer";
import WarningAlert from "../ui/warningAlert";

interface DataChatProps {
  initialMessages?: ChatMessage[];
  isLoading?: boolean;
  error?: Error;
}

const CHAT_MODELS: string[] = [
  LLMModelEnum.GPT41 as unknown as string,
  LLMModelEnum.GPT5 as unknown as string,
  LLMModelEnum.GPT_O3 as unknown as string,
];

const DataChat: React.FC<DataChatProps> = ({
  initialMessages = [],
  isLoading: isLoadingProp, // Rename the prop to avoid conflict
  error: passedError,
}) => {
  const { t } = useTranslation();
  const {
    columns: projectColumns,
    sheet,
    projects,
    project,
  } = useDataContext();

  // Now using context
  const {
    messages,
    status,
    error: contextError,
    startConversation,
    sendMessage,
    clearMessages,
  } = useChatContext();

  const [inputValue, setInputValue] = useState("");
  const [overlayError, setOverlayError] = useState("");
  const [overlayWarning, setOverlayWarning] = useState("");
  const [conversationId, setConversationId] =
    useState<Id<"chat_conversation"> | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const mentionsRef = useRef<MentionsComponentRef | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [selectedModel, setSelectedModel] = useState<LLMModel>(DEFAULT_AI_MODEL);
  const isSendingRef = useRef(false);
  const hasHydratedHistoryRef = useRef(false);

  const internalIsLoading = status === "submitted";
  const isLoading =
    isLoadingProp !== undefined ? isLoadingProp : internalIsLoading;
  const error = passedError ?? contextError;

  // Convex hooks
  const getOrCreateConversation = useMutation(
    api.chat_history.getOrCreateConversation,
  );
  const clearConversationMutation = useMutation(
    api.chat_history.clearConversation,
  );
  const conversationMessages = useQuery(
    api.chat_history.getConversationMessages,
    conversationId ? { conversation_id: conversationId } : "skip",
  );
  const chatAvailability = useQuery(api.chat.getChatAvailability, {});
  const isChatDisabled = chatAvailability?.openAiKeyConfigured === false;

  // Configuration for prompt options
  const promptOptionsRef = useRef<PromptOptions>({
    model: DEFAULT_AI_MODEL,
    userPrompt: "",
    promptType: "noSchema",
    promptInputColumns: [],
    ask: true,
  });

  // Creates a Set of valid column names for quick lookup
  const validColumnNames = useMemo(() => {
    return new Set(projectColumns.map((col) => col.name));
  }, [projectColumns]);

  useEffect(() => {
    promptOptionsRef.current.model = selectedModel;
  }, [selectedModel]);

  // This effect runs when the user selects a new sheet. Its job is to find the
  // right conversation, load its history, and pass it all to the global context.
  useEffect(() => {
    // For storybook
    if (initialMessages.length > 0) {
      const mockConvId = "conv_storybook" as Id<"chat_conversation">;
      const mockContext = {
        projectName: "Storybook Project",
        sheetName: "Mock Sheet",
        sheetId: "sheet_storybook" as Id<"sheet">,
        columns: [],
        rowCount: 0,
        mentionedColumns: [],
      };
      startConversation(mockConvId, initialMessages, mockContext);
      setIsLoadingHistory(false);
      return;
    }
    if (!project || !sheet) {
      setIsLoadingHistory(true);
      return;
    }

    const initializeConversation = async () => {
      setIsLoadingHistory(true);
      const convId = await getOrCreateConversation({
        project_id: project as Id<"project">,
        sheet_id: sheet._id,
      });
      setConversationId(convId);
    };

    initializeConversation();
  }, [project, sheet, getOrCreateConversation]);

  // This effect primes the global context once the history is fetched.
  useEffect(() => {
    if (!conversationId) {
      return;
    }

    if (!conversationMessages) {
      return;
    }

    if (hasHydratedHistoryRef.current) {
      setIsLoadingHistory(false);
      return;
    }

    hasHydratedHistoryRef.current = true;

    const currentProject = projects.find((p) => p._id === project);
    const chatContext = {
      projectName: currentProject?.name || "Unknown Project",
      sheetName: sheet?.name || "Unknown Sheet",
      sheetId: sheet?._id as Id<"sheet">,
      columns: projectColumns.map((c) => ({
        id: c._id,
        name: c.name,
        type: c.column_type ?? "noSchema",
      })),
      rowCount: sheet?.rows_in_sheet_counter || 0,
      mentionedColumns: [],
    };

    if (conversationMessages.length > 0) {
      const historicMessages = conversationMessages.map((msg) => ({
        id: msg._id,
        content: msg.content,
        role: msg.role as "user" | "assistant",
        createdAt: new Date(msg.createdAt),
      }));

      startConversation(conversationId, historicMessages, chatContext);
    } else {
      startConversation(conversationId, [], chatContext);
    }

    setIsLoadingHistory(false);
  }, [
    conversationId,
    conversationMessages,
    startConversation,
    project,
    sheet,
    projects,
    projectColumns,
  ]);

  useEffect(() => {
    hasHydratedHistoryRef.current = false;
  }, [conversationId]);

  const handleSendMessage = useCallback(async () => {
    if (isChatDisabled || isSendingRef.current) {
      return;
    }

    if (!inputValue.trim() || isLoading) return;

    const messageContent = inputValue;
    setInputValue("");
    mentionsRef.current?.updateOverlaySafely("");

    try {
      isSendingRef.current = true;
      await sendMessage(messageContent, selectedModel);
    } finally {
      isSendingRef.current = false;
    }
  }, [inputValue, isLoading, selectedModel, sendMessage, isChatDisabled]);

  const handleClearHistory = async () => {
    if (!conversationId) return;
    await clearConversationMutation({ conversation_id: conversationId });
    clearMessages();
  };

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      ) as HTMLElement;
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const formatTime = (date?: Date) => {
    if (!date) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat messages display area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4" type="scroll">
        <div className="space-y-4">
          {/* Loading history indicator */}
          {isLoadingHistory &&
            (initialMessages.length === 0 || messages.length === 0) && (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t("chat.loading_history")}
                </p>
              </div>
            )}

          {/* Welcome message shown when chat is empty */}
          {!isLoadingHistory && messages.length === 0 && (
            <div className="text-center py-8">
              <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">
                {t("chat.welcome_title")}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {t("chat.welcome_message")}
              </p>
            </div>
          )}

          {/* Renders all messages in the chat */}
          {!isLoadingHistory &&
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {/* Bot icon for assistant messages */}
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-md bg-transparent flex items-center justify-center flex-shrink-0">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                )}

                {/* Message bubble */}
                <Card className="rounded-md max-w-[80%] bg-gray-50">
                  <div className="px-3 py-2">
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                    <p className="text-xs mt-1 text-muted-foreground">
                      {formatTime(message.createdAt || new Date())}
                    </p>
                  </div>
                </Card>

                {/* User icon for user messages */}
                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-md bg-transparent flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                )}
              </div>
            ))}

          {/* Loading indicator while waiting for response */}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-md bg-transparent flex items-center justify-center">
                <Bot className="h-5 w-5 text-foreground" />
              </div>
              <Card className="rounded-md bg-muted px-3 py-2">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              </Card>
            </div>
          )}
          {error && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-md bg-transparent flex items-center justify-center">
                <Bot className="h-5 w-5 text-destructive" />
              </div>
              <Card className="rounded-md bg-destructive/10 border-destructive/20 px-3 py-2">
                <p className="text-sm text-destructive">
                  Error:{" "}
                  {(error as Error)?.message ||
                    t("chat.failed_to_get_response")}
                </p>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t flex flex-col">
        {/* Context Views */}
        <div className="flex-shrink-0">
          <ChatContextViews selectedViews={[]} onRemoveView={() => {}} />
        </div>

        {/* Chat Input Shell */}
        <div className="flex-shrink-0 p-4">
          {isChatDisabled ? (
            <WarningAlert
              className="w-full"
              title={t("chat.chat_unavailable")}
              message={
                chatAvailability?.reason ||
                t("chat.openai_key_not_configured")
              }
            />
          ) : (
            <div className="border border-input rounded-md bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 flex flex-col">
              {/* Mentions Component in place of Textarea */}
              <div className="flex-1">
                <MentionsComponent
                  ref={mentionsRef}
                  value={inputValue}
                  setValue={setInputValue}
                  setPromptOptions={(options) => {
                    promptOptionsRef.current = options;
                  }}
                  setMentionsPopupPosition={() => {}}
                  projectColumns={projectColumns}
                  overlayError={overlayError}
                  overlayWarning={overlayWarning}
                  validColumnNames={validColumnNames}
                  promptOptionsRef={promptOptionsRef}
                  overlayErrorSetter={setOverlayError}
                  overlayWarningSetter={setOverlayWarning}
                  inChat
                  onSend={handleSendMessage}
                  conversationId={conversationId}
                  chatSheet={sheet as Doc<"sheet">}
                  chatLoading={isLoading}
                />
              </div>

              {/* Footer */}
              <div className="border-t border-border/30 bg-white/95 backdrop-blur-sm">
                <ChatInputFooter
                  selectedModel={selectedModel as unknown as string}
                  models={CHAT_MODELS}
                  onModelChange={(m) => setSelectedModel(m as unknown as LLMModel)}
                  onSend={handleSendMessage}
                  onAutoGenerateReport={() => {}}
                  isLoading={isLoading}
                  sendDisabled={
                    !inputValue.trim() ||
                    isLoading ||
                    !(sheet as Doc<"sheet">) ||
                    !conversationId
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Sheet context + clear history */}
        {sheet && (
          <div className="px-4 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t("chat.context_info", {
                sheetName: (sheet as any)?.name ?? "",
                columnCount: projectColumns.length,
                rowCount: (sheet as any)?.rows_in_sheet_counter ?? 0,
              })}
            </p>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearHistory}
                className="text-xs rounded-md"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t("chat.clear_history", { defaultValue: "Clear history" })}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataChat;
