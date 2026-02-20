import type { Metadata } from 'next';
import { rootDomain } from '@/lib/utils';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: `Admin Dashboard | ${rootDomain}`,
  description: `Manage viewers for ${rootDomain}`
};

export default async function AdminPage() {
  // Auth is enforced by middleware — no need to re-check here
  redirect('/admin/viewers');
}
