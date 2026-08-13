
import "./globals.css";
import { Outfit, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import ChunkErrorRecovery from "@/components/ChunkErrorRecovery";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import ClientNotificationListeners from "@/components/ClientNotificationListeners";

const outfit = Outfit({ 
  subsets: ["latin"],
  variable: "--font-outfit",
});

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#10b981",
};

export const metadata = {
  title: "NaijaDrops | Reliable Delivery in Kano — Launching Soon",
  description: "No more chasing riders on the phone. NaijaDrops brings trackable, reliable delivery to Kano vendors and customers. Launching soon.",
  metadataBase: new URL('https://naijadrops.tech'),
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "NaijaDrops | Reliable Delivery in Kano — Launching Soon",
    description: "No more chasing riders on the phone. Track every delivery live, right here in Kano.",
    url: 'https://naijadrops.tech',
    siteName: 'NaijaDrops',
    locale: 'en_NG',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'NaijaDrops — Reliable delivery, finally trackable. Launching soon in Kano.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "NaijaDrops | Reliable Delivery in Kano — Launching Soon",
    description: "No more chasing riders on the phone. Track every delivery live, right here in Kano.",
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${inter.variable}`}>
      <head>
        {/* Warms the DNS/TLS connection to Mapbox ahead of time, site-wide,
            so whichever page first opens a map isn't also paying for that
            handshake on top of downloading the map bundle itself. This is a
            near-zero-cost hint - browsers only actually use it if something
            on the page ends up requesting these domains. */}
        <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://events.mapbox.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.mapbox.com" />
        <link rel="dns-prefetch" href="https://events.mapbox.com" />
      </head>
      <body className="font-sans bg-charcoal-50 text-charcoal-900 antialiased overflow-x-hidden selection:bg-emerald-500 selection:text-white flex flex-col min-h-screen">
        <ThemeProvider>
          <ChunkErrorRecovery />
          <ServiceWorkerRegister />
          {children}
          <ClientNotificationListeners />
        </ThemeProvider>
      </body>
    </html>
  );
}