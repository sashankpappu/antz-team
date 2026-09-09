import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Intake',
  description: 'Turns scattered business input into a handoff-ready spec.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
