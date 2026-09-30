import './globals.css';
import Shell from '@/components/Shell';

export const metadata = { title: 'VAYUZ Champions League - Convergence 11.0', description: 'Live cricket scoring for VAYUZ Champions League, Convergence 11.0' };
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b6b3a' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
