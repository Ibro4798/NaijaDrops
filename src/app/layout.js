import Navbar from "@/components/layout/Navbar";
import "./globals.css";
import 'mapbox-gl/dist/mapbox-gl.css';

const inter = { variable: "font-inter" }; // Fallback for variable usage

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#10b981",
};

export const metadata = {
  title: "NaijaDrops App",
  description: "The premier logistics delivery app mapping out Kano seamlessly.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NaijaDrops",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans bg-gray-50 text-charcoal-800 antialiased overflow-x-hidden selection:bg-emerald-500 selection:text-white flex flex-col min-h-screen`}>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
