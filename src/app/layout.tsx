import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'VOIDTERM — one calm workspace for every model',
    template: '%s · VOIDTERM',
  },
  description:
    'A clean, multi-provider AI workspace with free OpenRouter models, provider fallback, and email OTP sign-in.',
  applicationName: 'VOIDTERM',
  keywords: ['AI', 'workspace', 'developer tools', 'LLM', 'OpenRouter', 'OpenAI', 'Gemini'],
  authors: [{ name: 'VOIDTERM' }],
  openGraph: {
    title: 'VOIDTERM — one calm workspace for every model',
    description:
      'Six providers, one focused workspace. Free models included, no card required.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#09090B',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark light',
};

// Runs before paint to avoid a light-mode flash. Only reads local UI prefs.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('voidterm-theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}else{document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-fg">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
