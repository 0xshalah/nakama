import type { OrgRole } from "@nakama/core/contract";
import { Button } from "@nakama/ui/button";
import { Card } from "@nakama/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nakama/ui/dialog";
import { Spinner } from "@nakama/ui/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown01Icon, Tick02Icon } from "hugeicons-react";
import { type FormEvent, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ProfileCreateDialog } from "@/components/ProfileCreateDialog";
import { OrgMemberPicker } from "@/components/settings/org-member-dialogs";
import { OrgMemberRoleCards } from "@/components/settings/org-member-role-select";
import { useAuth } from "@/context/use-auth";
import {
  useAcpAgentPresetsQuery,
  useToolsQuery,
} from "@/hooks/use-app-queries";
import {
  useAddOrgMember,
  useOrganizationOverview,
  useParentOrgMembers,
} from "@/hooks/use-org-members";
import { formatError } from "@/lib/client";
import { PAGE_PATHS } from "@/lib/navigation";
import { canArchiveOrganization } from "@/lib/org-archive";
import { queryKeys } from "@/lib/query-keys";

type TeamStep = {
  action: string;
  description: string;
  done: boolean;
  onOpen: () => void;
  title: string;
};

function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative size-14 shrink-0">
      <svg aria-hidden className="size-14 -rotate-90" viewBox="0 0 48 48">
        <circle
          className="stroke-muted"
          cx="24"
          cy="24"
          fill="none"
          r={radius}
          strokeWidth="4"
        />
        <circle
          className="stroke-primary"
          cx="24"
          cy="24"
          fill="none"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - done / total)}
          strokeLinecap="round"
          strokeWidth="4"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-semibold text-sm">
        {done}/{total}
      </span>
    </div>
  );
}

function TeamAddPersonDialog({
  orgId,
  parentOrgId,
  open,
  onOpenChange,
}: {
  orgId: string;
  parentOrgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const addMutation = useAddOrgMember(orgId);
  const candidates = useParentOrgMembers(orgId, open);
  const [selected, setSelected] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSelected("");
      setRole("member");
      setError(null);
    }

    onOpenChange(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();

    const person = candidates.data?.members.find(
      (member) => member.userId === selected
    );

    if (!person) {
      setError("Select a person to add.");

      return;
    }

    setError(null);
    addMutation.mutate(
      {
        email: person.email,
        name: person.name?.trim() || person.email,
        phone: "",
        role,
      },
      {
        onError: (cause) => setError(formatError(cause)),
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.organizationOverview(parentOrgId, orgId),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.orgParentMembers(orgId),
          });
          handleOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <OrgMemberPicker
            disabled={addMutation.isPending}
            isLoading={candidates.isLoading}
            members={candidates.data?.members ?? []}
            name="team-person"
            onChange={setSelected}
            value={selected}
          />
          <div>
            <p className="mb-1.5 font-medium text-sm">Role</p>
            <OrgMemberRoleCards onChange={setRole} value={role} />
          </div>
          {(error || candidates.isError) && (
            <p className="text-destructive text-sm" role="alert">
              {error ?? formatError(candidates.error)}
            </p>
          )}
          <DialogFooter>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={addMutation.isPending || !selected} type="submit">
              {addMutation.isPending ? "Adding…" : "Add person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReadinessCard({
  busy,
  doneCount,
  nextStep,
  onOpen,
  steps,
  total,
}: {
  busy: boolean;
  doneCount: number;
  nextStep: TeamStep | undefined;
  onOpen: (open: () => void) => void;
  steps: TeamStep[];
  total: number;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <div className="flex items-center gap-4 px-6 py-5">
        <ProgressRing done={doneCount} total={total} />
        <div className="space-y-0.5">
          <h3 className="font-semibold text-lg">Get your team ready</h3>
          <p className="text-muted-foreground text-sm">
            {total - doneCount === 0
              ? "All steps done"
              : `${total - doneCount} ${total - doneCount === 1 ? "step" : "steps"} left`}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border border-border border-t">
        <li className="flex items-center gap-4 px-6 py-4 text-muted-foreground">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Tick02Icon aria-hidden className="size-4" />
          </span>
          <span className="line-through">Create your team</span>
        </li>
        {steps.map((step, index) => {
          const active = step === nextStep;

          return (
            <li
              className={`flex items-center gap-4 px-6 py-4 ${active ? "bg-primary/5" : ""}`}
              key={step.title}
            >
              {step.done ? (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Tick02Icon aria-hidden className="size-4" />
                </span>
              ) : (
                <span
                  aria-hidden
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 font-semibold text-xs ${active ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                >
                  {index + 2}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={
                    step.done
                      ? "text-muted-foreground line-through"
                      : "font-medium"
                  }
                >
                  {step.title}
                </p>
                {!step.done && (
                  <p className="text-muted-foreground text-sm">
                    {step.description}
                  </p>
                )}
              </div>
              {!step.done && (
                <Button
                  disabled={busy}
                  onClick={() => onOpen(step.onOpen)}
                  type="button"
                  variant={active ? "default" : "outline"}
                >
                  {step.action}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function DeleteTeamDialog({
  deleting,
  error,
  onConfirm,
  onOpenChange,
  open,
  teamName,
}: {
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  teamName: string;
}) {
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!(open || deleting)) {
          onOpenChange(false);
        }
      }}
      open={open}
    >
      <DialogContent className="gap-6 p-6 sm:max-w-md">
        <DialogHeader className="gap-3">
          <DialogTitle>Delete team?</DialogTitle>
          <DialogDescription>
            {teamName} will disappear from the switcher and chat. Members,
            profiles, and files stay on disk. Nakama cannot restore it.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <DialogFooter className="mx-0 mb-0 gap-2 border-0 bg-transparent p-0 sm:flex-row sm:justify-end">
          <Button
            disabled={deleting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={deleting}
            onClick={onConfirm}
            type="button"
            variant="destructive"
          >
            {deleting ? <Spinner className="size-4" /> : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamHeader({
  busy,
  onWork,
  showWork,
  team,
}: {
  busy: boolean;
  onWork: () => void;
  showWork: boolean;
  team: { memberCount: number; name: string };
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <TeamBreadcrumb name={team.name} />
        <h2 className="break-words font-semibold text-xl">{team.name}</h2>
        <p className="text-muted-foreground text-sm">
          {team.memberCount} {team.memberCount === 1 ? "person" : "people"}
        </p>
      </div>
      {showWork && (
        <Button disabled={busy} onClick={onWork} type="button">
          Work in this team
        </Button>
      )}
    </div>
  );
}

function TeamBreadcrumb({ name }: { name: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center pb-3 text-sm"
    >
      <ol className="flex min-w-0 flex-wrap items-center gap-2">
        <li>
          <Link
            className="text-muted-foreground transition-colors hover:text-foreground"
            to={PAGE_PATHS.organization}
          >
            Organization
          </Link>
        </li>
        <li aria-hidden className="text-muted-foreground/60">
          /
        </li>
        <li>
          <Link
            className="text-muted-foreground transition-colors hover:text-foreground"
            to={PAGE_PATHS.organization}
          >
            Teams
          </Link>
        </li>
        <li aria-hidden className="text-muted-foreground/60">
          /
        </li>
        <li
          aria-current="page"
          className="min-w-0 truncate font-semibold text-foreground"
        >
          {name}
        </li>
      </ol>
    </nav>
  );
}

function TeamMissing({ loading }: { loading: boolean }) {
  return (
    <section className="mx-auto min-w-0 max-w-3xl space-y-3">
      <Link
        className="text-muted-foreground text-sm"
        to={PAGE_PATHS.organization}
      >
        Back to organization
      </Link>
      <p className="text-muted-foreground text-sm" role="status">
        {loading ? "Loading team…" : "Team not found"}
      </p>
    </section>
  );
}

export function TeamDetailPage() {
  const { teamId } = useParams();
  const { activeOrg, archiveOrg, switchOrg, user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const { data: tools = [] } = useToolsQuery();
  const { data: agentPresets = [] } = useAcpAgentPresetsQuery();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const overview = useOrganizationOverview(
    activeOrg?.id ?? null,
    activeOrg?.parentOrgId ?? null
  );

  const foundTeam = overview.data?.teams.find((entry) => entry.id === teamId);
  const [lastTeam, setLastTeam] = useState(foundTeam);

  if (foundTeam && foundTeam !== lastTeam) {
    setLastTeam(foundTeam);
  }

  const team = foundTeam ?? (lastTeam?.id === teamId ? lastTeam : undefined);

  if (!team) {
    return <TeamMissing loading={overview.isLoading} />;
  }

  const canWork = team.isCurrent || team.canSwitch;

  const steps: TeamStep[] = [
    {
      action: "Add person",
      description: "So they can work with the team",
      done: team.memberCount > 1,
      onOpen: () => setAddOpen(true),
      title: "Invite your teammates",
    },
    {
      action: "Add agent",
      description: "An AI helper that does tasks for the team",
      done: team.localResourceCounts.agents > 0,
      onOpen: () => setAddAgentOpen(true),
      title: "Add your first agent",
    },
    {
      action: "Add knowledge",
      description: "Knowledge your agents can read",
      done: team.localResourceCounts.knowledge > 0,
      onOpen: () => navigate(PAGE_PATHS.profiles),
      title: "Share documents and notes",
    },
    {
      action: "Add skill",
      description: "Step-by-step know-how agents can follow",
      done: team.localResourceCounts.skills > 0,
      onOpen: () => navigate(PAGE_PATHS.skills),
      title: "Teach a skill",
    },
  ];

  const doneCount = steps.filter((step) => step.done).length + 1;
  const total = steps.length + 1;
  const nextStep = steps.find((step) => !step.done);

  async function openIn(open: () => void) {
    if (running.current || !team) {
      return;
    }

    running.current = true;
    setPending(true);
    setError(null);

    try {
      if (!team.isCurrent) {
        await switchOrg(team.id);
      }

      open();
    } catch (cause) {
      setError(formatError(cause));
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  async function deleteTeam() {
    if (!team) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      await archiveOrg(team.id);
      setDeleteOpen(false);
      navigate(PAGE_PATHS.organization);
    } catch (cause) {
      setDeleteError(formatError(cause));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="mx-auto min-w-0 max-w-3xl space-y-8">
      <TeamHeader
        busy={pending}
        onWork={() => void openIn(() => navigate(PAGE_PATHS.chat))}
        showWork={canWork && !team.isCurrent}
        team={team}
      />
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <ReadinessCard
        busy={pending || !canWork}
        doneCount={doneCount}
        nextStep={nextStep}
        onOpen={(open) => void openIn(open)}
        steps={steps}
        total={total}
      />
      <Card className="gap-0 py-0 shadow-none">
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-6 py-4">
            <span className="font-semibold">Technical details</span>
            <span className="flex items-center gap-2 text-muted-foreground text-sm">
              For admins and support
              <ArrowDown01Icon
                aria-hidden
                className="size-4 transition-transform group-open:rotate-180"
              />
            </span>
          </summary>
          <dl className="space-y-2 border-border border-t px-6 py-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Team ID</dt>
              <dd className="break-all font-mono text-xs">{team.id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="break-words">{team.slug}</dd>
            </div>
          </dl>
        </details>
        {canArchiveOrganization(user?.isPlatformAdmin === true) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-border border-t px-6 py-4">
            <h3 className="font-semibold">Delete team</h3>
            <Button
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              type="button"
              variant="destructive"
            >
              Delete
            </Button>
          </div>
        )}
      </Card>
      <DeleteTeamDialog
        deleting={deleting}
        error={deleteError}
        onConfirm={() => void deleteTeam()}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        teamName={team.name}
      />
      <ProfileCreateDialog
        agentPresets={agentPresets}
        onCreated={() => undefined}
        onOpenChange={setAddAgentOpen}
        open={addAgentOpen}
        tools={tools}
      />
      {activeOrg && (
        <TeamAddPersonDialog
          onOpenChange={setAddOpen}
          open={addOpen}
          orgId={team.id}
          parentOrgId={activeOrg.parentOrgId ?? activeOrg.id}
        />
      )}
    </section>
  );
}
