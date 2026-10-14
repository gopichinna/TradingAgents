import './globals.css';
import Providers from '../components/Providers';

export const metadata = {
  title: 'TradingAgents Research Desk',
  description: 'Multi-agent dialectical equity research terminal powered by LangGraph and Gemini.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
