import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import StoreProvider from "@/store/StoreProvider";
import AuthHydrator from "@/context/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "CodeRAG — Chat with your repositories",
  description:
    "A developer tool for indexing and querying GitHub repositories using RAG.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <StoreProvider>
          <AuthHydrator>{children}</AuthHydrator>
        </StoreProvider>
      </body>
    </html>
  );
}
