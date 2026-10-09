import type { Metadata } from "next";
import { Geist, Hind_Siliguri } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const hind = Hind_Siliguri({ variable: "--font-bangla", subsets: ["bengali", "latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Agam — flash-flood early warning",
  description: "Watches rain across the border and turns it into verified Bangla voice and SMS alerts that reach every household in time.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${hind.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
