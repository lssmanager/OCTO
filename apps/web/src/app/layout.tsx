import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OCTO — Distributed Cognitive Execution System',
  description: 'Self-hosted agent orchestration platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
