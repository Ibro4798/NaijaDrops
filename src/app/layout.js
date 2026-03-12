import { Inter } from "next/font/google";
import Navbar from "@/components/layout/Navbar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ['400', '500', '600', '700', '800', '900']
});

export const metadata = {
  title: "NaijaDrops App",
  description: "The premier logistics delivery app mapping out Kano seamlessly.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-gray-50 text-charcoal-800 antialiased overflow-x-hidden selection:bg-emerald-500 selection:text-white flex flex-col min-h-screen`}>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
