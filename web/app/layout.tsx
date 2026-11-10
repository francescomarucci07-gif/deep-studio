import type { Metadata } from "next";
import { Chakra_Petch, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Font ospitati dal sito (next/font li scarica alla build), licenza OFL:
// Geist per i testi, Chakra Petch per etichette e pulsanti, Geist Mono per display e numeri.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Deep Studio",
  description: "Crea house nel browser con un coach AI che ti insegna mentre produci.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={`${geist.variable} ${geistMono.variable} ${chakra.variable}`}>
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
