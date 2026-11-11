"use client";
import { ErrorState } from "@/components/ui/states";
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="This view couldn’t load"
      description="Please try again. If the problem continues, return to the overview."
      onRetry={reset}
    />
  );
}
