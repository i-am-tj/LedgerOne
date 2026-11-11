import { requirePageSession } from "@/lib/auth/server";
import Link from "next/link";
import {
  ArrowDownUp,
  ArrowRight,
  Compass,
  LockKeyhole,
  Palette,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
export default async function Home() {
  await requirePageSession();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR FINANCIAL HOME</p>
          <h1>Your money. A little clearer.</h1>
          <p className="page-description">
            Room for everyday life, and everything you’re working toward.
          </p>
        </div>
        <span className="pill">Getting started</span>
      </div>
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <span className="welcome-label">
            <Compass size={16} aria-hidden="true" />A CONSIDERED START
          </span>
          <h2 id="welcome-title">
            Good things begin
            <br />
            with a clear foundation.
          </h2>
          <p>
            This is your space to understand your money. Start by making it feel
            like yours.
          </p>
          <Button asChild className="welcome-button">
            <Link href="/settings/appearance">
              Personalize your workspace
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <span className="art-orbit orbit-one" />
          <span className="art-orbit orbit-two" />
          <div className="art-card art-card-back">
            <span />
            <span />
          </div>
          <div className="art-card art-card-front">
            <span className="art-monogram">
              L<span>1</span>
            </span>
            <span className="art-line" />
            <span className="art-line short" />
          </div>
          <span className="art-spark">✳</span>
        </div>
      </section>
      <div className="section-heading">
        <h2>A place for the whole picture</h2>
        <span>One step at a time</span>
      </div>
      <div className="overview-grid">
        <Card>
          <div className="card-heading">
            <span className="section-icon">
              <Wallet aria-hidden="true" />
            </span>
            <h2>Accounts</h2>
            <span className="subtle-badge">Coming soon</span>
          </div>
          <EmptyState
            title="A home for every account"
            description="Your cash, bank accounts and cards will come together here. Account setup is not available yet."
          />
        </Card>
        <Card>
          <div className="card-heading">
            <span className="section-icon">
              <ArrowDownUp aria-hidden="true" />
            </span>
            <h2>Recent activity</h2>
            <span className="subtle-badge">Coming soon</span>
          </div>
          <EmptyState
            title="Everyday moments, clearly recorded"
            description="Once transaction capture is available, you’ll find your activity here. There are no records to show yet."
          />
        </Card>
      </div>
      <Card className="next-step">
        <span className="section-icon">
          <Palette aria-hidden="true" />
        </span>
        <div>
          <h2>Find your comfort zone</h2>
          <p>
            Light, dark, or in sync with your device. A small change that makes
            this space yours.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/settings/appearance">
            Choose your theme
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </Card>
      <p className="foundation-note">
        <LockKeyhole size={15} aria-hidden="true" />
        This foundation preview contains no personal financial data. Secure
        sign-in and money management are coming next.
      </p>
    </>
  );
}
