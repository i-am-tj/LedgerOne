"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SuccessState,
} from "@/components/ui/states";

const previewSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Enter at least 2 characters.")
    .max(60, "Use 60 characters or fewer."),
});
export function ComponentGallery() {
  const [state, setState] = useState<"empty" | "loading" | "error" | "success">(
    "empty",
  );
  const [saved, setSaved] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof previewSchema>>({
    resolver: zodResolver(previewSchema),
    defaultValues: { label: "" },
  });
  return (
    <div className="gallery-grid">
      <Card>
        <h2 className="text-lg font-semibold">Forms that guide you</h2>
        <p
          className="mt-2 text-sm text-muted-foreground"
          id="preview-explanation"
        >
          Try a label to see validation and confirmation. This preview stays on
          this page; it creates no account or transaction.
        </p>
        <form
          noValidate
          className="mt-6 space-y-4"
          aria-describedby="preview-explanation"
          onSubmit={handleSubmit(({ label }) => setSaved(label))}
        >
          <div className="space-y-2">
            <Label htmlFor="preview-label">Preview label</Label>
            <Input
              id="preview-label"
              autoComplete="off"
              aria-invalid={!!errors.label}
              aria-describedby={
                errors.label ? "label-help label-error" : "label-help"
              }
              {...register("label", { onChange: () => setSaved("") })}
            />
            <p id="label-help" className="text-sm text-muted-foreground">
              Between 2 and 60 characters.
            </p>
            {errors.label && (
              <p
                id="label-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.label.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting}>
            Preview confirmation
          </Button>
          {saved && (
            <SuccessState>
              Preview accepted: {saved}. Nothing was saved.
            </SuccessState>
          )}
        </form>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Clear at every step</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          These controls demonstrate real interface states. They do not load
          financial data.
        </p>
        <div className="state-controls" role="group" aria-label="Preview state">
          {(["empty", "loading", "error", "success"] as const).map((value) => (
            <Button
              key={value}
              variant={state === value ? "default" : "outline"}
              aria-pressed={state === value}
              onClick={() => setState(value)}
            >
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </Button>
          ))}
        </div>
        <div className="state-preview">
          {state === "empty" && (
            <EmptyState
              title="Nothing here yet"
              description="When records are available, this view will help you find them."
            />
          )}
          {state === "loading" && <LoadingState label="Loading preview…" />}
          {state === "error" && (
            <ErrorState
              title="The preview couldn’t load"
              description="Try again to return to the empty preview."
              onRetry={() => setState("empty")}
            />
          )}
          {state === "success" && (
            <SuccessState>
              You’re all set. This is a confirmation preview.
            </SuccessState>
          )}
        </div>
      </Card>
    </div>
  );
}
