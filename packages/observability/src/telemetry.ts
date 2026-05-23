import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  otlpEndpoint?: string;
  enablePrometheus?: boolean;
  prometheusPort?: number;
}

let sdkInstance: NodeSDK | null = null;

export function bootstrapTelemetry(config: TelemetryConfig): NodeSDK {
  if (sdkInstance) {
    return sdkInstance;
  }

  const metricReader = config.enablePrometheus
    ? new PrometheusExporter({
        port: config.prometheusPort ?? 9464,
      })
    : undefined;

  sdkInstance = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion ?? '0.0.1-f0',
    }),
    traceExporter: new OTLPTraceExporter({
      url: config.otlpEndpoint ?? 'http://otel-collector:4318/v1/traces',
    }),
    metricReader,
  });

  void sdkInstance.start();

  process.once('SIGTERM', () => {
    if (sdkInstance) {
      void sdkInstance.shutdown();
    }
  });

  return sdkInstance;
}

