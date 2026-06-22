import { Toaster } from "react-hot-toast";
import { Geist, Geist_Mono } from "next/font/google";
import ThemeBootstrap from "@/components/ThemeBootstrap";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "i2i DocHub",
  description: "Ideas2Invest document and task management hub",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/images/logo/logo.png", type: "image/png" },
    ],
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeBootstrap />
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
