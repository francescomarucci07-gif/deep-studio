import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deep Studio",
  description: "Il coach di mixaggio per producer house in FL Studio.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <div className="ds-shell">
          <header className="ds-header">
            <Link href="/" className="ds-brand">
              DEEP STUDIO
            </Link>
          </header>
          <main className="ds-main">{children}</main>
          <footer className="ds-footer">
            <span>La tua musica resta tua.</span>
            <Link href="/privacy">Privacy</Link>
          </footer>
        </div>
      </body>
    </html>
  );
}
