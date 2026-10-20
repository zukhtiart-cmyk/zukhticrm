import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import DepthGauge from "@/components/DepthGauge";
import Footer from "@/components/Footer";
import "./globals.css";

const display = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-display", display: "swap" });
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.heightstones.com"),
  title: {
    default: "Height Stones — Natural stone from India, cut to the millimetre",
    template: "%s — Height Stones",
  },
  description:
    "Manufacturer and exporter of Indian sandstone, marble, granite, limestone, slate, quartzite, travertine and onyx tiles and slabs, paving, garden ornaments and wall panels. Jaipur · Dubai · Brisbane.",
  openGraph: { siteName: "Height Stones", type: "website" },
};

export const viewport: Viewport = { themeColor: "#16130F" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <Nav />
        <DepthGauge />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
