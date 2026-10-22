import type { Metadata, Viewport } from 'next';
import { EditorApp } from './editor-app';

// The scene editor installs as its own app (PWA): manifest, icons, theme.
export const metadata: Metadata = {
  manifest: '/scene-editor.webmanifest',
  appleWebApp: { capable: true, title: 'Scenes', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/scene-editor-apple-180.png', icon: '/icons/scene-editor-192.png' }
};
export const viewport: Viewport = { themeColor: '#141a24' };

export default function ScenesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EditorApp />
      {children}
    </>
  );
}
