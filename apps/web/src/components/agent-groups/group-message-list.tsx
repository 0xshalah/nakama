import type { ProfileSummary } from "@nakama/core";
import type {
  AgentGroupMessage,
  AgentGroupRun,
} from "@nakama/core/agent-groups";
import { cn } from "@nakama/ui/utils";
import { Chat01Icon, CheckmarkCircle01Icon, Copy01Icon } from "hugeicons-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MentionText,
  markMentions,
  mentionMarkdownComponents,
} from "@/components/agent-groups/group-mentions";
import {
  Conversation,
  ConversationScrollButton,
  ConversationStickinessProvider,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { ThinkingState } from "@/components/chat/ThinkingState";
import { ProfileAvatar } from "@/components/ProfileAvatar";

/** Same threshold as the agent chat list. */
const AT_BOTTOM_PX = 80;

const ACTION_BUTTON =
  "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Copy and reply, floated over the card's top right while it is hovered. */
function MessageActions({
  onReply,
  text,
}: {
  onReply: () => void;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="absolute top-0 right-3 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <button
        aria-label={copied ? "Copied" : "Copy response"}
        className={ACTION_BUTTON}
        onClick={copy}
        title={copied ? "Copied" : "Copy response"}
        type="button"
      >
        {copied ? (
          <CheckmarkCircle01Icon aria-hidden className="size-4" />
        ) : (
          <Copy01Icon aria-hidden className="size-4" />
        )}
      </button>
      <button
        aria-label="Reply in thread"
        className={ACTION_BUTTON}
        onClick={onReply}
        title="Reply in thread"
        type="button"
      >
        <Chat01Icon aria-hidden className="size-4" />
      </button>
    </div>
  );
}

/** Under the text once a thread has replies, or an agent is answering in it. */
function ThreadLink({
  onClick,
  replies,
  replying,
}: {
  onClick: () => void;
  replies: number;
  replying: boolean;
}) {
  if (replies === 0 && !replying) {
    return null;
  }

  return (
    <button
      className="ml-1 rounded text-left font-medium text-primary text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      type="button"
    >
      {replying
        ? "Replying in thread…"
        : `${replies} ${replies === 1 ? "reply" : "replies"} in thread`}
    </button>
  );
}

/** A time label shows between messages this far apart. */
const TIME_GAP_MS = 30 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
}

/** "Today 8:36 AM", "Yesterday 12:35 PM", else "Oct 18, 12:35 PM". */
function timeLabel(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS);

  if (days === 0) {
    return `Today ${time}`;
  }

  if (days === 1) {
    return `Yesterday ${time}`;
  }

  const day = date.toLocaleDateString([], { day: "numeric", month: "short" });

  return `${day}, ${time}`;
}

/**
 * A sent message first carries a temporary id, then the server's. Keying user
 * messages by their order keeps the swap from remounting (and flashing) them.
 */
function messageKeys(messages: AgentGroupMessage[]): string[] {
  let userCount = 0;

  return messages.map((message) =>
    message.authorProfileId === null
      ? `user-${userCount++}`
      : `message-${message.id}`
  );
}

/** The group transcript, laid out and pinned to the bottom like agent chat. */
export function GroupMessageList({
  handles,
  messages,
  onOpenThread,
  profiles,
  run,
  threadRunIds,
}: {
  handles: Map<string, string>;
  messages: AgentGroupMessage[];
  onOpenThread: (messageId: number) => void;
  profiles: ProfileSummary[];
  run: AgentGroupRun | null;
  threadRunIds: number[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const markdownComponents = useMemo(
    () => mentionMarkdownComponents(handles, profiles),
    [handles, profiles]
  );

  const pin = useCallback((behavior: ScrollBehavior) => {
    const scroller = scrollRef.current;
    scroller?.scrollTo({ behavior, top: scroller.scrollHeight });
  }, []);

  // New replies, and markdown or images that finish rendering, grow the list;
  // follow them only while the reader sits at the bottom.
  useEffect(() => {
    const content = contentRef.current;

    if (!content) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (stickRef.current) {
        pin("auto");
      }
    });

    observer.observe(content);

    return () => observer.disconnect();
  }, [pin]);

  // Sending a message always brings the reader back down to it; the scroll
  // event then marks the list as at the bottom.
  const lastIsUser = messages.at(-1)?.authorProfileId === null;
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    if (lastIsUser && lastId !== undefined) {
      stickRef.current = true;
      pin("auto");
    }
  }, [lastId, lastIsUser, pin]);

  const stickiness = useMemo(
    () => ({
      isAtBottom,
      scrollToLatest: () => {
        stickRef.current = true;
        setIsAtBottom(true);
        pin("smooth");
      },
    }),
    [isAtBottom, pin]
  );

  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles]
  );

  const replyingThreads = useMemo(() => new Set(threadRunIds), [threadRunIds]);
  const speaker = profileById.get(run?.speakerProfileId ?? "");
  const keys = messageKeys(messages);

  // A new group starts at a time gap or when the author changes; agents show
  // their avatar and name once per group.
  const rows = useMemo(
    () =>
      messages.map((message, index) => {
        const previous = messages[index - 1];

        const showTime =
          !previous ||
          Date.parse(message.createdAt) - Date.parse(previous.createdAt) >
            TIME_GAP_MS;

        return {
          message,
          showTime,
          startsGroup:
            showTime || previous?.authorProfileId !== message.authorProfileId,
        };
      }),
    [messages]
  );

  const speakerContinues =
    speaker !== undefined && messages.at(-1)?.authorProfileId === speaker.id;

  return (
    <ConversationStickinessProvider value={stickiness}>
      <Conversation className="min-h-0 flex-1">
        <div
          className="no-scrollbar h-full overflow-y-auto"
          id="agent-group-messages"
          onScroll={(event) => {
            const scroller = event.currentTarget;

            const atBottom =
              scroller.scrollHeight -
                scroller.scrollTop -
                scroller.clientHeight <=
              AT_BOTTOM_PX;

            stickRef.current = atBottom;
            setIsAtBottom(atBottom);
          }}
          ref={scrollRef}
        >
          <div className="flex flex-col px-4 py-4" ref={contentRef}>
            {rows.map(({ message, showTime, startsGroup }, index) => {
              const spacing = index === 0 ? "" : startsGroup ? "mt-4" : "mt-1";
              const author = profileById.get(message.authorProfileId ?? "");

              return (
                <Fragment key={keys[index]}>
                  {showTime ? (
                    <div
                      className={cn(
                        "text-center text-muted-foreground text-xs",
                        index === 0 ? "pb-3" : "py-4"
                      )}
                    >
                      {timeLabel(message.createdAt)}
                    </div>
                  ) : null}
                  {message.authorProfileId === null ? (
                    <div
                      className={cn(
                        "ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5",
                        spacing
                      )}
                    >
                      <MentionText
                        handles={handles}
                        profiles={profiles}
                        text={message.content}
                      />
                    </div>
                  ) : (
                    <div className={cn("group flex gap-2.5", spacing)}>
                      {startsGroup && author ? (
                        <ProfileAvatar
                          className="mt-0.5 outline-none"
                          profile={author}
                          size="sm"
                        />
                      ) : (
                        <span
                          className={cn(
                            "size-7 shrink-0",
                            startsGroup && "mt-0.5 rounded-full bg-muted"
                          )}
                        />
                      )}
                      <div className="flex min-w-0 max-w-[85%] flex-col items-start gap-1">
                        {startsGroup ? (
                          <div className="px-1 font-medium text-13 text-foreground">
                            {author?.name ?? "Unavailable agent"}
                          </div>
                        ) : null}
                        <div className="relative max-w-full rounded-2xl bg-muted px-4 py-2.5">
                          <Message
                            className="mr-0 ml-0 max-w-full items-start justify-start"
                            from="assistant"
                          >
                            <MessageContent className="ml-0 w-full max-w-full gap-1 group-[.is-user]:ml-0">
                              <MessageResponse components={markdownComponents}>
                                {markMentions(message.content, handles)}
                              </MessageResponse>
                            </MessageContent>
                          </Message>
                          <MessageActions
                            onReply={() => onOpenThread(message.id)}
                            text={message.content}
                          />
                        </div>
                        <ThreadLink
                          onClick={() => onOpenThread(message.id)}
                          replies={message.threadReplies}
                          replying={replyingThreads.has(message.id)}
                        />
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}
            {run ? (
              <div className="mt-4 flex gap-2.5">
                {speaker && !speakerContinues ? (
                  <ProfileAvatar
                    className="mt-0.5 outline-none"
                    profile={speaker}
                    size="sm"
                  />
                ) : (
                  <span className="size-7 shrink-0" />
                )}
                <div className="flex flex-col items-start gap-1">
                  {speaker && !speakerContinues ? (
                    <div className="px-1 font-medium text-13">
                      {speaker.name}
                    </div>
                  ) : null}
                  <div className="rounded-2xl bg-muted px-4 py-2.5">
                    <ThinkingState
                      className="text-sm"
                      label={
                        run.stopping
                          ? "Stopping after this reply"
                          : run.activity || "Working…"
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <ConversationScrollButton />
      </Conversation>
    </ConversationStickinessProvider>
  );
}
