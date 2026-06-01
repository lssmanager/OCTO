# Política de Seguridad de OCTO

## Versiones Soportadas

| Fase | Soporte |
|------|---------|
| F1 y superiores | ✅ Reciben actualizaciones de seguridad y parches |
| F0 | ⚠️ Solo soporte crítico limitado (migración requerida) |
| Versiones anteriores a F0 | ❌ No soportadas |

La política de versiones sigue el ciclo de fases definido en nuestra arquitectura (`OCTO-v5-arquitectura.md`). Se recomienda a todos los despliegues utilizar la última fase estable.

## Reportar una Vulnerabilidad

**Nos tomamos muy en serio la seguridad de OCTO.** Si has descubierto una vulnerabilidad, por favor notifícanos de forma privada.

### Métodos de contacto

1. **Recomendado:** Usa el **Reporte de seguridad privado** de GitHub (https://github.com/[owner]/[repo]/security/advisories)
2. **Alternativo:** Envía un correo a `security@octo.[dominio]` (cifrado con PGP – disponible en `/security.txt`)

Incluye en tu reporte:
- Descripción clara del problema
- Pasos para reproducirlo (entorno, payload, logs)
- Posible impacto (escalada de privilegios, filtración cross-tenant, etc.)
- Versión o fase afectada
- Tu información de contacto (si deseas seguimiento)

### Expectativas

- **Plazo de respuesta inicial:** 48 horas hábiles.
- **Actualizaciones periódicas:** Cada 5 días hábiles mientras se investiga.
- **Divulgación coordinada:** Trabajaremos contigo para planificar la divulgación pública después de la corrección.

## Proceso de Manejo de Vulnerabilidades

| Severidad | Ejemplo | Tiempo de parche | Acción |
|-----------|---------|------------------|--------|
| **Crítica (P0)** | Bypass de aislamiento de tenant, fuga de credenciales maestras | < 24 horas | Hotfix inmediato, notificación a operadores |
| **Alta (P1)** | Bypass de autenticación, CVE crítica en producción | < 72 horas | Rama de hotfix, revisión de seguridad |
| **Media (P2)** | Derivación de rate limiting, CVE alta no explotada | < 14 días | Incluir en sprint actual |
| **Baja (P3)** | Mala configuración menor, CVE media | < 90 días | Deuda técnica programada |

**No aplicamos recompensas económicas (bug bounty)** en este momento, pero agradecemos públicamente a los investigadores que sigan nuestra política de divulgación responsable.

## Prácticas de Seguridad (Resumen)

OCTO se construye siguiendo estándares rigurosos:
- **ISO/IEC 27001, NIST SP 800-53, OWASP ASVS 4.0.3, CIS Benchmarks**
- **Hardening obligatorio** en todos los contenedores: usuario no‑root, sistema de archivos de solo lectura, `cap_drop ALL`, perfiles seccomp
- **RLS (Row Level Security)** en PostgreSQL para aislamiento multi‑tenant
- **Sandboxing** de ejecución de herramientas/MCP con seccomp y bloqueo de egress
- **SBOM, firma de imágenes (Cosign), escaneo continuo** con Trivy, Grype, Semgrep
- **Auditoría completa** con `trace_id`, `tenant_id`, logs estructurados

Para más detalles, consulta el documento interno `ciberseguridad-standars.md` (disponible para colaboradores autorizados).

## Actualizaciones de Seguridad

- **Notificaciones:** Se publican GitHub Security Advisories para cada vulnerabilidad corregida.
- **Parches retroactivos:** Solo para versiones soportadas (F1+).
- **Ciclo de actualización de dependencias:** Dependabot + Trivy ejecutados en cada PR.

## Política de Divulgación Pública

- Una vez corregida la vulnerabilidad y notificada a los afectados, publicaremos un advisory en GitHub.
- El advisory incluirá: descripción, impacto, versiones afectadas, solución y créditos al investigador (si consiente).
- Mantenemos un archivo `SECURITY_ACKNOWLEDGMENTS.md` con los nombres de quienes han contribuido.

## Cumplimiento y Privacidad

- **GDPR / ISO 27701:** Los datos personales (prompts, memoria) se tratan con minimización, cifrado en reposo y derecho al olvido.
- **Clasificación de datos:** Altamente sensible (claves), personal sensible (prompts), interno (logs) y público.
- **Notificación de brecha:** Se informará a los afectados y autoridades en menos de 72 horas, según artículo 33 del GDPR.

## Contacto

- **Equipo de seguridad:** `security@octo.[dominio]` (PGP fingerprint: disponible en `/.well-known/security.txt`)
- **Reportes de incidentes en producción:** Canal interno de operaciones (solo para personal autorizado)

---
