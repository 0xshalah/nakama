import type { ProfileSummary } from "@nakama/core";
import type { AgentGroup, AgentGroupMessage } from "@nakama/core/agent-groups";
import {
  listAgentGroupMessages,
  listAgentGroupThreadMessages,
} from "./agent-group-store";

const CONTEXT_MESSAGES = 40;

const CONTEXT_CHARS = 24_000;

const CHAT_STYLE =
  "Write like a friendly teammate in a group chat: warm, first-person, plain words, a touch of personality. Use 2-4 short sentences, no headings, lists or bold. When it fits, greet the user, say what you can do for them, and invite their next step. Do not repeat what others already said. Write more only if the user asks for detail.";

/** The group's members the user can still reach, in member order. */
export function groupMembers(
  group: AgentGroup,
  profiles: ProfileSummary[]
): ProfileSummary[] {
  return group.memberIds.flatMap(
    (id) => profiles.find((profile) => profile.id === id) ?? []
  );
}

/** The group's brief as a task section, or nothing when it has none. */
function briefSection(group: AgentGroup): string[] {
  return group.brief ? [`Group brief from the user:\n${group.brief}`] : [];
}

function handleOf(handles: Map<string, string>, profileId: string): string {
  return [...handles].find(([, id]) => id === profileId)?.[0] ?? "";
}

export function groupTask(
  group: AgentGroup,
  speaker: ProfileSummary,
  handles: Map<string, string>
): string {
  const roster = [...handles]
    .map(([handle, id]) => `@${handle}${id === speaker.id ? " (you)" : ""}`)
    .join(", ");

  return [
    `You are ${speaker.name} (@${handleOf(handles, speaker.id)}) in the group chat "${group.name}" with the user and these agents: ${roster}.`,
    ...briefSection(group),
    "The conversation so far is under Context, newest last. Reply to it as yourself.",
    `This is a chat message, not a report. ${CHAT_STYLE} Do not prefix it with your name.`,
    "To hand the conversation to another agent, mention their @handle. Mention nobody when you are done or the user should answer.",
    "When the user writes @all, every agent answers in turn; you never use @all yourself.",
  ].join("\n");
}

function labelled(
  messages: AgentGroupMessage[],
  handles: Map<string, string>,
  members: ProfileSummary[]
): string[] {
  return messages.map(({ authorProfileId, content }) => {
    if (authorProfileId === null) {
      return `User: ${content}`;
    }

    const author = members.find((p) => p.id === authorProfileId);

    return author
      ? `${author.name} (@${handleOf(handles, author.id)}): ${content}`
      : `Unavailable agent: ${content}`;
  });
}

/** The session's recent messages as a labelled transcript for the speaker. */
export function transcript(
  orgId: string,
  sessionId: string,
  handles: Map<string, string>,
  members: ProfileSummary[]
): string {
  return labelled(
    listAgentGroupMessages(orgId, sessionId, CONTEXT_MESSAGES),
    handles,
    members
  )
    .join("\n\n")
    .slice(-CONTEXT_CHARS);
}

export function threadTask(
  group: AgentGroup,
  speaker: ProfileSummary,
  handles: Map<string, string>
): string {
  return [
    `You are ${speaker.name} (@${handleOf(handles, speaker.id)}) in the group chat "${group.name}".`,
    ...briefSection(group),
    "The user opened a private thread with you on one of your messages. The group chat up to that message, then the thread, are under Context, newest last.",
    `Reply to the user in the thread as yourself, without prefixing your name. ${CHAT_STYLE} Other agents do not see the thread, so do not mention them.`,
  ].join("\n");
}

/** The group chat up to the thread's first message, then the thread itself. */
export function threadTranscript(
  orgId: string,
  sessionId: string,
  rootId: number,
  handles: Map<string, string>,
  members: ProfileSummary[]
): string {
  const main = listAgentGroupMessages(
    orgId,
    sessionId,
    CONTEXT_MESSAGES
  ).filter((message) => message.id <= rootId);

  const thread = listAgentGroupThreadMessages(orgId, sessionId, rootId);

  return [
    ...labelled(main, handles, members),
    "--- Thread with the user ---",
    ...labelled(thread, handles, members),
  ]
    .join("\n\n")
    .slice(-CONTEXT_CHARS);
}
