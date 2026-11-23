import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0D0D0D",
};

export const metadata: Metadata = {
  title: "Conserve — Game account vault",
  description:
    "One encrypted vault for all your game logins, from gacha mains to ranked smurfs.",
  icons: {
    icon: "/assets/conserve-icon.png",
    shortcut: "/assets/conserve-icon.png",
    apple: "/assets/conserve-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#F7F7F7] text-[#111111] font-sans selection:bg-[#111111] selection:text-white">
        {children}
      </body>
    </html>
  );
}
