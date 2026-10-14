import { SHORTLIST_STATUS_LABELS, type ShortlistEntry } from "@/domain/records";
import { setShortlistAction } from "@/server/actions";
import { SubmitButton } from "./submit-button";

/**
 * Shortlist / review-state controls for one candidate. Review states never
 * include "approved": approval is outside the scope of this software.
 */
export function ShortlistControls({
  materialId,
  applicationId,
  runId,
  entry,
  ineligible,
}: {
  materialId: string;
  applicationId: string;
  runId: string;
  entry: ShortlistEntry | undefined;
  ineligible: boolean;
}) {
  const hidden = (
    <>
      <input type="hidden" name="materialId" value={materialId} />
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="runId" value={runId} />
    </>
  );
  if (!entry) {
    return (
      <form action={setShortlistAction} className="flex flex-wrap gap-2">
        {hidden}
        <SubmitButton variant="secondary" name="status" value="shortlisted" pendingLabel="Saving…">
          {ineligible ? "Shortlist anyway" : "Save to shortlist"}
        </SubmitButton>
      </form>
    );
  }
  return (
    <form action={setShortlistAction} className="flex flex-wrap items-center gap-2">
      {hidden}
      <span className="border border-copper/50 bg-copper-wash px-1.5 py-0.5 text-xs font-semibold text-copper-deep">{SHORTLIST_STATUS_LABELS[entry.status]}</span>
      {entry.status !== "under_review" ? (
        <SubmitButton variant="secondary" name="status" value="under_review" pendingLabel="Saving…">Mark under review</SubmitButton>
      ) : null}
      {entry.status !== "parked" ? (
        <SubmitButton variant="ghost" name="status" value="parked" pendingLabel="Saving…">Park</SubmitButton>
      ) : null}
      <SubmitButton variant="ghost" name="status" value="remove" pendingLabel="Removing…">Remove</SubmitButton>
    </form>
  );
}
