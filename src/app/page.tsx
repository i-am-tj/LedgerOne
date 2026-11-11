import Link from "next/link";
import {
  ArrowRight,
  ArrowDownUp,
  ShieldCheck,
  Wallet,
  ChartNoAxesCombined,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/shell/theme-toggle";

// Deliberately contains no session lookup, database query or personal data.
export default function PublicDashboard() {
  return (
    <div className="public-dashboard">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <Link
          href="/"
          className="brand"
          aria-label="LedgerOne public dashboard"
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            Ledger<span className="font-normal">One</span>
            <small>PERSONAL FINANCE</small>
          </span>
        </Link>
        <nav aria-label="Public navigation" className="header-actions">
          <ThemeToggle />
          <Button asChild>
            <Link href="/login">
              Sign in <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="public-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">THE EVERYDAY. THE BIG PICTURE.</p>
            <h1>A clearer view of your money.</h1>
            <p className="page-description">
              A considered space for today’s choices and tomorrow’s plans.
            </p>
          </div>
          <span className="pill">Foundation preview</span>
        </div>
        <section className="welcome-panel" aria-labelledby="public-welcome">
          <div className="welcome-copy">
            <span className="welcome-label">
              <ShieldCheck size={16} aria-hidden="true" /> YOUR SPACE, KEPT
              PRIVATE
            </span>
            <h2 id="public-welcome">
              Everyday life.
              <br />
              One financial home.
            </h2>
            <p>
              Sign in with your approved Google account to open your private
              workspace. Accounts, transactions and financial summaries are
              coming soon.
            </p>
            <Button asChild className="welcome-button">
              <Link href="/login">
                Open your workspace <ArrowRight aria-hidden="true" />
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
          <span>Coming soon</span>
        </div>
        <div className="public-card-grid">
          {[
            {
              title: "Accounts",
              icon: Wallet,
              text: "A home for your cash, banks and cards. Account balances will stay inside your private workspace.",
            },
            {
              title: "Everyday activity",
              icon: ArrowDownUp,
              text: "Income, purchases and transfers, brought together with a clear record of each movement.",
            },
            {
              title: "Your bigger picture",
              icon: ChartNoAxesCombined,
              text: "Budgets and insights to help you understand where your money goes and what comes next.",
            },
          ].map(({ title, icon: Icon, text }) => (
            <Card key={title} className="public-summary-card">
              <span className="section-icon">
                <Icon aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
              <span className="subtle-badge">Coming soon</span>
            </Card>
          ))}
        </div>
        <p className="foundation-note">
          <ShieldCheck size={16} aria-hidden="true" />
          This public preview contains no personal financial data.
        </p>
      </main>
      <footer className="public-footer">
        LedgerOne <span aria-hidden="true">/</span> Your money. A little
        clearer.
      </footer>
    </div>
  );
}
