import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const ParticipantNameWithTooltip = ({
  visibleName,
  remoteDisplayName,
  className,
}: {
  visibleName: string;
  remoteDisplayName?: string | null;
  className?: string;
}) => {
  if (!remoteDisplayName) {
    return <span className={className}>{visibleName}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className}>{visibleName}</span>
        </TooltipTrigger>
        <TooltipContent>{remoteDisplayName}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
