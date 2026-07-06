import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import logo from "@/assets/logo.png";
import { LEGAL_LINKS, LEGAL_SITE } from "@/lib/legal-site";

export function LegalPageLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="Автодом Павлодар" className="h-9 w-auto" />
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            На главную
          </Link>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-10 md:py-14">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {LEGAL_SITE.companyName} · {LEGAL_SITE.city}
        </p>
        <article className="prose-legal mt-8 space-y-6 text-[15px] leading-relaxed text-foreground/90">
          {children}
        </article>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <nav className="mb-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="hover:text-foreground underline-offset-4 hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
          <p>
            © {new Date().getFullYear()} {LEGAL_SITE.companyName} · CRM учёта заявок
          </p>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}
