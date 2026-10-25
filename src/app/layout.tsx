import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseThemePreference, themeAttribute } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const SITE_NAME = "Digital Brand Platform";
const SITE_TITLE = `${SITE_NAME}: authentic voting rounds`;
const SITE_DESCRIPTION =
  "Run staff awards, recognition votes and feedback rounds with one-time invite links, one person one vote, a secret ballot, and results revealed when voting closes.";

/**
 * The site-wide defaults. `/p/[postId]` and `/u/[username]` replace the title,
 * description and OpenGraph with their own; every other page inherits these.
 */
export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
  },
};

/**
 * Reads the theme cookie on the server so the very first HTML byte already
 * carries the visitor's choice: no flash of the wrong theme, and no client
 * script. Awaiting cookies() adds no Suspense boundary, so the permalink
 * routes' real 404 (see src/app/page.tsx) is unaffected.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = themeAttribute(
    parseThemePreference(cookieStore.get(THEME_COOKIE)?.value),
  );

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
