import { AlertCircle, CheckCircle2, Inbox, LoaderCircle } from "lucide-react";
import { Button } from "./button";

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="state-panel">
      <span className="state-icon">
        <Inbox aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function LoadingState({
  label = "Loading your view…",
}: {
  label?: string;
}) {
  return (
    <div className="state-panel" role="status">
      <LoaderCircle className="loading-spinner" aria-hidden="true" />
      <p>{label}</p>
      <div className="skeleton w-full" aria-hidden="true" />
      <div className="skeleton w-3/4" aria-hidden="true" />
    </div>
  );
}
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
        <Button variant="outline" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      </div>
    </div>
  );
}
export function SuccessState({ children }: { children: React.ReactNode }) {
  return (
    <div className="notice notice-success" role="status">
      <CheckCircle2 aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
