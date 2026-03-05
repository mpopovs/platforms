'use client';

import { usePathname } from 'next/navigation';
import { NavBarSupabase } from '@/components/navbar-supabase';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullPage = pathname?.includes('/worksheet-builder');

  if (isFullPage) {
    return <>{children}</>;
  }

  return (
    <>
      <NavBarSupabase />
      <div className="pt-16">
        {children}
      </div>
    </>
  );
}
