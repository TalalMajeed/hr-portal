import type { offers as offersTable } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { respondToOfferAction } from "@/actions/candidate";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Badge } from "@/components/ui/badge";

type Offer = typeof offersTable.$inferSelect;

const STATUS = {
  sent: { label: "Awaiting your reply", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
} as const;

/** An offer of appointment with accept and decline (H3, candidate side). */
export function OfferCard({ offer, positionTitle }: { offer: Offer; positionTitle: string }) {
  return (
    <article className="rounded-[10px] border border-teal bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Offer of appointment · sent {formatDate(offer.sentAt)}</p>
          <p className="text-lg font-semibold">{positionTitle}</p>
        </div>
        <Badge tone={STATUS[offer.status].tone}>{STATUS[offer.status].label}</Badge>
      </div>
      {offer.salary && (
        <p className="mt-3 text-[15px]">
          <span className="text-muted">Salary: </span>
          <span className="font-semibold">{offer.salary}</span>
        </p>
      )}
      <p className="mt-3 whitespace-pre-line text-[15px]">{offer.body}</p>
      {offer.status === "sent" && (
        <ActionForm action={respondToOfferAction} className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4">
          <input type="hidden" name="offerId" value={offer.id} />
          <ConfirmButton name="intent" value="accept" variant="primary" size="md" question="Accept this offer?" confirmText="Yes, accept">
            Accept offer
          </ConfirmButton>
          <ConfirmButton name="intent" value="decline" size="md" question="Decline this offer? This can't be undone here." confirmText="Yes, decline">
            Decline
          </ConfirmButton>
        </ActionForm>
      )}
    </article>
  );
}
