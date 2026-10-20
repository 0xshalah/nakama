import type { ProfileSummary } from "@nakama/core";
import type { AgentGroup } from "@nakama/core/agent-groups";
import { Button } from "@nakama/ui";
import { ConfirmDialog } from "@nakama/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nakama/ui/dropdown-menu";
import { Input } from "@nakama/ui/input";
import { Spinner } from "@nakama/ui/spinner";
import {
  Delete02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PlusSignIcon,
  Search01Icon,
} from "hugeicons-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GroupAvatar } from "@/components/agent-groups/GroupAvatar";
import { GroupDialog } from "@/components/agent-groups/group-dialog";
import { useAgentGroupsQuery, useDeleteGroup } from "@/hooks/use-agent-groups";
import { useProfilesQuery } from "@/hooks/use-app-queries";
import { groupPath } from "@/lib/navigation";

const MINUTE_MS = 60_000;

const HOUR_MS = 60 * MINUTE_MS;

const DAY_MS = 24 * HOUR_MS;

/** "2m", "1h", "Yesterday", a weekday within the week, else a short date. */
function formatListTime(value: string): string {
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();

  if (Number.isNaN(elapsed)) {
    return "";
  }

  if (elapsed < MINUTE_MS) {
    return "now";
  }

  if (elapsed < HOUR_MS) {
    return `${Math.floor(elapsed / MINUTE_MS)}m`;
  }

  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / HOUR_MS)}h`;
  }

  if (elapsed < 2 * DAY_MS) {
    return "Yesterday";
  }

  if (elapsed < 7 * DAY_MS) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function lastMessagePreview(
  group: AgentGroup,
  profiles: ProfileSummary[]
): string {
  const last = group.lastMessage;

  if (!last) {
    return "No messages yet";
  }

  const author = last.authorProfileId
    ? (profiles.find((profile) => profile.id === last.authorProfileId)?.name ??
      "Agent")
    : "You";

  return `${author}: ${last.content.replace(/\s+/g, " ").trim()}`;
}

export function AgentGroupsPage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data: groups = [], isLoading } = useAgentGroupsQuery();
  const { data: profiles = [] } = useProfilesQuery();
  const [editing, setEditing] = useState<AgentGroup | null>(null);
  const [deleting, setDeleting] = useState<AgentGroup | null>(null);
  const deleteGroup = useDeleteGroup();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const visible = needle
    ? groups.filter(
        (group) =>
          group.name.toLowerCase().includes(needle) ||
          group.memberIds.some((id) =>
            profiles
              .find((profile) => profile.id === id)
              ?.name.toLowerCase()
              .includes(needle)
          )
      )
    : groups;

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-4"
      id="agent-groups-page"
    >
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search01Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search groups or agents"
            className="h-10 pl-9"
            id="agent-groups-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search groups or agents"
            value={query}
          />
        </div>
        <Button
          className="h-10"
          id="btn-new-group"
          onClick={() => setCreating(true)}
        >
          <PlusSignIcon className="size-4" />
          New group
        </Button>
      </div>
      {isLoading ? (
        <div className="flex min-h-32 items-center justify-center">
          <Spinner className="size-5" />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">
          {groups.length === 0 ? "No groups yet" : "No matching groups"}
        </p>
      ) : (
        <div className="flex flex-col gap-1" id="agent-group-list">
          {visible.map((group) => (
            <div
              className="flex items-center rounded-xl pr-2 transition-colors hover:bg-muted/60"
              key={group.id}
            >
              <Link
                className="flex min-w-0 flex-1 items-center gap-4 py-3 pl-4"
                to={groupPath(group.id)}
              >
                <GroupAvatar
                  className="size-11"
                  group={group}
                  profiles={profiles}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-semibold text-base">
                      {group.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground text-sm">
                      {group.memberIds.length} agents
                    </span>
                  </span>
                  <span className="truncate text-muted-foreground text-sm">
                    {lastMessagePreview(group, profiles)}
                  </span>
                </span>
                {group.lastMessage ? (
                  <span className="shrink-0 self-start pt-1 text-muted-foreground text-sm">
                    {formatListTime(group.lastMessage.createdAt)}
                  </span>
                ) : null}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label={`${group.name} actions`}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    />
                  }
                >
                  <MoreHorizontalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditing(group)}>
                    <PencilEdit02Icon />
                    Edit group
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeleting(group)}
                    variant="destructive"
                  >
                    <Delete02Icon />
                    Delete group
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
      {creating ? (
        <GroupDialog
          onClose={() => setCreating(false)}
          onSaved={(group) => navigate(groupPath(group.id))}
        />
      ) : null}
      {editing ? (
        <GroupDialog group={editing} onClose={() => setEditing(null)} />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          description={`Delete "${deleting.name}" with all its chats? This cannot be undone.`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteGroup.mutateAsync(deleting.id);
          }}
          title="Delete group?"
        />
      ) : null}
    </div>
  );
}
