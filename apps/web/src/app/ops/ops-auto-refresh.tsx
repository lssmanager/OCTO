'use client';

// ops-auto-refresh.tsx
// Client component: triggers a router.refresh() every 30s
// to keep the /ops console data live.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function OpsAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 30_000);

    return () => clearInterval(interval);
  }, [router]);

  // Renders nothing — only triggers refresh
  return null;
}
