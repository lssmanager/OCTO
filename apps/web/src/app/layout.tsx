import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Header } from '@/components/header';

export const metadata: Metadata = {
  title: 'OCTO — Operational Console',
  description: 'OCTO operational status console',
  robots: 'noindex,nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1 container mx-auto px-4 py-6 max-w-6xl">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
