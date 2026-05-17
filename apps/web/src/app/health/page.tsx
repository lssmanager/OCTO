import { ServiceDetailCard } from '@/components/service-detail-card';
import { getSystemHealth } from '@/lib/health';

export const revalidate = 30;

export default async function HealthPage() {
  const health = await getSystemHealth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          Service Health
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Raw health check responses from each service. Revalidates every 30s.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ServiceDetailCard
          service="api"
          label="Control Plane (NestJS API)"
          data={health.api}
        />
        <ServiceDetailCard
          service="runtime"
          label="Execution Plane (Runtime Worker)"
          data={health.runtime}
        />
      </div>
    </div>
  );
}
