import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./ui-fixes.css";
import TurnNoticeWatcher from "./TurnNoticeWatcher";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Stuno",
  description: "Un juego de palabras y cartas para jugar en línea o alrededor de la misma mesa.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title:"Stuno", description:"Piensa rápido. Juega tu letra.", images:["https://juego-de-palabras.barcco.chatgpt.site/og.png"] },
  twitter: { card:"summary_large_image", title:"Stuno", description:"Piensa rápido. Juega tu letra.", images:["https://juego-de-palabras.barcco.chatgpt.site/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <TurnNoticeWatcher />
      </body>
    </html>
  );
}
