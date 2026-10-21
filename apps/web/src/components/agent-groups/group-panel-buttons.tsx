import { Button } from "@nakama/ui";
import { BrainIcon, Folder01Icon } from "hugeicons-react";
import { useSearchParams } from "react-router-dom";
import { PANELS } from "@/lib/agent-group-pending";

/** Opens the group's shared folder or memory in the side panel. */
function GroupPanelButton({
  icon: Icon,
  label,
  panel,
}: {
  icon: typeof Folder01Icon;
  label: string;
  panel: "files" | "memory";
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <Button
      aria-label={label}
      onClick={() =>
        setSearchParams(
          (current) => {
            const next = new URLSearchParams(current);

            for (const key of PANELS) {
              next.delete(key);
            }

            next.set(panel, "1");

            return next;
          },
          { replace: true }
        )
      }
      size="sm"
      type="button"
      variant={searchParams.get(panel) === "1" ? "secondary" : "outline"}
    >
      <Icon aria-hidden />
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  );
}

export function GroupPanelButtons() {
  return (
    <>
      <GroupPanelButton icon={Folder01Icon} label="Files" panel="files" />
      <GroupPanelButton icon={BrainIcon} label="Memory" panel="memory" />
    </>
  );
}
