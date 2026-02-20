import { NavBarSupabase } from '@/components/navbar-supabase';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBarSupabase />
      <div className="pt-16">
        {children}
      </div>
    </>
  );
}
