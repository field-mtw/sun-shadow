import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Inter, Noto_Sans_Thai } from 'next/font/google';
import { ReactNode } from 'react';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const notoSansThai = Noto_Sans_Thai({ subsets: ['thai'], variable: '--font-noto-sans-thai' });

export const metadata = {
  title: 'SunShadow',
  description: 'Topographic map with sun shadow simulation',
};

export default async function LocaleLayout(
  props: LayoutProps<"/[locale]">
) {
  const { locale } = await props.params;
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${inter.variable} ${notoSansThai.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <NextIntlClientProvider messages={messages}>
          {props.children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
