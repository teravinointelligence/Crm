export const CANCELLABLE_SAMPLE_STATUSES = ["borrador", "enviada", "aprobada"] as const;

export function isSampleCancellationPending(
  requestedAt: string | null | undefined,
  decision: string | null | undefined,
): boolean {
  return Boolean(requestedAt && !decision);
}

export function canRequestSampleCancellation({
  status,
  isOwner,
  isAdmin,
  requestedAt,
  decision,
}: {
  status: string | null | undefined;
  isOwner: boolean;
  isAdmin: boolean;
  requestedAt: string | null | undefined;
  decision: string | null | undefined;
}): boolean {
  return (
    (isOwner || isAdmin) &&
    CANCELLABLE_SAMPLE_STATUSES.includes(
      (status ?? "") as (typeof CANCELLABLE_SAMPLE_STATUSES)[number],
    ) &&
    !isSampleCancellationPending(requestedAt, decision)
  );
}
