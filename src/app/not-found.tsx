import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
export default function NotFound() {
  return (
    <main id="main" className="page-content">
      <Card className="not-found">
        <p className="eyebrow">404 / A SMALL DETOUR</p>
        <h1>This page isn’t here.</h1>
        <p className="page-description">
          Let’s get you back to familiar ground.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Back to overview</Link>
        </Button>
      </Card>
    </main>
  );
}
