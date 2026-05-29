# OCTO — Cybersecurity & Hardening Architecture

## Security by Design, Phase by Phase

**Versión:** 1.0 — Mayo 2026  
**Clasificación:** Interno — Sensible  
**Ámbito:** Todas las fases F0–F17 y todos los componentes del monorepo OCTO  
**Objetivo:** Definir los requisitos obligatorios de hardening, estándares de seguridad, controles técnicos, gobernanza y gestión de vulnerabilidades que deben cumplirse en cada fase del desarrollo.

---

## 1. Estándares de Seguridad Aplicables

OCTO se rige por los siguientes marcos y estándares, agrupados por dominio. Cada fase debe verificar su cumplimiento progresivo.

| Dominio | Estándares | Aplicación principal |
|---------|------------|----------------------|
| **Gestión de seguridad** | ISO/IEC 27001:2022 (ISMS), ISO/IEC 27017 (cloud), ISO/IEC 27018 (privacidad en cloud), ISO 27701 / GDPR (privacidad operacional) | Gobierno, políticas, continuidad, gestión de activos, cumplimiento legal |
| **Controles técnicos** | NIST SP 800-53 Rev5, NIST SP 800-57 (gestión de claves), NIST AI RMF 1.0, NIST AI 100-1 (ataques adversariales) | Catálogo de controles, gestión de claves, riesgos de IA |
| **Amenazas y defensa** | MITRE ATT&CK v16, MITRE D3FEND (catálogo completo) | Modelado de amenazas, contramedidas defensivas |
| **Seguridad de aplicaciones** | OWASP ASVS 4.0.3, OWASP Top 10 2025, OWASP API Security Top 10 2023, OWASP LLM Top 10 | Autenticación, validación, APIs, LLM |
| **Hardening y contenedores** | CIS Benchmarks 2026 (Docker, Kubernetes), Docker Bench Security | Configuración segura de contenedores y orquestadores |
| **Cadena de suministro** | SLSA Level 3+, SBOM CycloneDX, OpenSSF Scorecard, CVE Monitoring 2026 | Integridad de builds, inventario de dependencias, posture del repo |
| **Herramientas obligatorias** | Semgrep (SAST), Trivy (deps), Grype (contenedores), Gitleaks (secretos), Syft (SBOM), Cosign (firma), OPA (políticas), Falco (runtime) | Pipeline CI/CD y monitorización |

---

## 2. Principios de Hardening (No Negociables)

Estos principios se aplican a **todos los contenedores, servicios y entornos** desde F0:

1. **Non‑root user** – Todos los contenedores ejecutan con un UID ≥ 1000.
2. **Read‑only filesystem** – El sistema de archivos raíz es de solo lectura. Los directorios escribibles son tmpfs con tamaño limitado.
3. **No privileged mode** – `privileged: false` y `cap_drop: ALL`.
4. **Seccomp + AppArmor** – Perfiles personalizados restringen syscalls y capacidades.
5. **Network isolation** – Cada servicio en su propia red Docker; sin expuestos a internet a menos que sea estrictamente necesario (solo API Gateway).
6. **Resource limits** – Límites de CPU, memoria, PIDs y reinicios definidos por servicio.
7. **Secrets management** – No hay secretos en Dockerfiles, compose ni en variables de entorno por defecto. Se inyectan desde vault o variables de entorno de Coolify.
8. **Immutable tags** – Todas las imágenes base y acciones de GitHub se pinan por SHA. Nada de `latest` o `main`.
9. **Health checks** – Todos los contenedores exponen un endpoint de health que no revela información interna.
10. **Audit logging** – Todos los eventos de seguridad se emiten con `trace_id`, `run_id`, `agent_id`, `tenant_id` (si aplica).

---

## 3. Hardening por Fase de Desarrollo (F0 – F17)

Cada fase **hereda todos los requisitos de las fases anteriores**. Los ítems marcados como “Gating” deben estar implementados y verificados antes de dar por cerrada la fase.

### F0 — Fundación (Infraestructura y CI/CD)

| Área | Requisito de hardening | Estándar | Gating |
|------|------------------------|----------|--------|
| Repositorio | Gitleaks pre‑commit, .env.example sin secretos, branch protection (main/develop), commits firmados | OpenSSF Scorecard, SLSA | ✅ Sí |
| Dependencias | pnpm con versiones exactas, SHA‑pinned base images en Dockerfiles | SBOM CycloneDX | ✅ Sí |
| CI/CD | Pipeline: lint → test → SAST (Semgrep) → secret scan → dependency audit (Trivy) → SBOM (Syft) → container build → image scan (Grype) → image sign (Cosign) → deploy | SLSA L3+ | ✅ Sí |
| Contenedores base | Usuario no‑root, filesystem read‑only, `cap_drop ALL`, health check básico | CIS Benchmarks | ✅ Sí |

### F1 — Kernel del Sistema (Runtime Durable)

| Componente | Requisito de hardening | Estándar / D3FEND | Gating |
|------------|------------------------|-------------------|--------|
| API (NestJS) | Helmet instalado, ValidationPipe global, CORS restrictivo, rate limiting atómico (Redis), `@UseGuards` explícito en **todos** los controllers | OWASP ASVS §14, OWASP API Top 10, D3‑ACH | ✅ Sí |
| Runtime worker (Python) | Sin puerto público expuesto; solo comunicación vía cola interna; RLS forzado en cada query mediante `set_config` | NIST AC‑4, D3‑DQSA | ✅ Sí |
| PostgreSQL | RLS activado en todas las tablas con tenant scope; roles de aplicación sin `BYPASSRLS`; auditoría append‑only | NIST AC‑3, AU‑9 | ✅ Sí |
| Redis | AUTH obligatorio, ACLs por servicio, persistencia AOF+RDB | CIS Redis Benchmark | ✅ Sí |
| Secretos | Variables unificadas (`INTERNAL_SECRET`), rotación documentada, comparación timing‑safe | NIST SP 800‑57 | ✅ Sí |
| Observabilidad | Logs estructurados con `trace_id`, `run_id`, `agent_id`; exportación JSONL | D3‑EDL | ✅ Sí |

### F2 – F4 (Jerarquía, Tools, MCP, Memoria)

| Fase | Requisito adicional |
|------|----------------------|
| **F2 – Jerarquía** | El servicio de resolución de políticas y herencia debe auditar cada acceso a recursos de niveles superiores. No se permite `BYPASSRLS` por ningún motivo. |
| **F3 – Agentes** | El compilador de contexto debe aislar prompts y memoria por nivel jerárquico; no hay inyección de contexto entre agentes de diferentes Workspaces. |
| **F4 – Tools y MCP** | **Sandboxing obligatorio:** Cada invocación de tool o MCP se ejecuta en un subproceso con: seccomp profile, límites de CPU/memoria, env mínimo (sin `DATABASE_URL`), egress bloqueado por defecto (solo allowlist). Además, `D3‑EAL` (allowlisting de ejecutables) y `D3‑PSA` (monitoreo de procesos). |

### F5 – F7 (RAG, Multi‑agente, Flows)

| Fase | Requisito adicional |
|------|----------------------|
| **F5 – Memoria/RAG** | Los embeddings y chunks deben estar aislados por tenant/workspace. La recuperación híbrida no debe cruzar fronteras jerárquicas sin política explícita. |
| **F6 – Multi‑agente** | Cada agente tiene su propio `AgentCard` con capacidades explícitas. La delegación requiere paso por `SpawnPolicyResolver` y registro de auditoría. |
| **F7 – Flows** | El motor de ejecución de grafos (DAG) debe congelar un `execution_snapshot` inmutable al iniciar cada run. Ningún flujo puede modificar el estado del sistema fuera de su alcance autorizado. |

### F8 – F10 (Canales, Providers, Observabilidad)

| Componente | Hardening específico |
|------------|----------------------|
| **Canales (WhatsApp, Telegram, etc.)** | Cada canal corre en su propio worker aislado, sin acceso a secretos del core. Los mensajes entrantes se normalizan y enrutan vía cola. Las credenciales (tokens, QR) se almacenan cifradas. |
| **LiteLLM / Providers** | Ningún SDK de proveedor se importa fuera de `packages/sdk-abstractions`. Los API keys se rotan automáticamente y nunca se loguean. Se implementa `SemanticCacheFilter` con TTL y política de invalidación por cambio de Core Files. |
| **Observabilidad** | Prometheus + Grafana + Loki expuestos internamente. Falco monitorea syscalls anómalas en runtime. Las trazas OpenTelemetry cubren todos los flujos de ejecución. |

### F11 – F17 (Gobernanza, Escala, Autonomía)

A partir de F11 se añaden controles enterprise:
- **RBAC granular** por nivel jerárquico con herencia de roles.
- **Hard stop budgets** – Si un nivel excede su presupuesto (tokens, costo, tiempo), se bloquea todo el subárbol hasta aprobación humana.
- **HITL durable** – Los puntos de suspensión se persisten en PostgreSQL como `ExecutionCheckpoint` + `SuspensionToken`.
- **Zero trust mTLS** entre servicios internos (F12).
- **Compliance automática** – Informes periódicos contra ISO 27001, NIST, etc.

---

## 4. Matriz de Cumplimiento (Frameworks)

| Framework | Categoría | Alcance principal en OCTO |
|-----------|----------|------------------------------|
| ISO/IEC 27001:2022 | ISMS | Gestión de seguridad de la información |
| ISO/IEC 27017 | Seguridad en la nube | Controles específicos para entornos cloud y multi‑tenant |
| ISO/IEC 27018 | Privacidad (cloud) | Protección de PII en la nube (prompts, memoria, artefactos) |
| ISO/IEC 27701 | Gestión de privacidad | Alineación con GDPR, derechos de los interesados |
| NIST SP 800-53 Rev5 | Controles de seguridad | Catálogo completo aplicado a todas las capas |
| NIST AI RMF 1.0 | Riesgo de IA | Gobierno, mapeo, medición y gestión de riesgos de LLM |
| NIST AI 100-1 | IA adversarial | Inyección de prompts, evasión de modelos, envenenamiento de datos |
| MITRE ATT&CK v16 | Mapeo de amenazas | Técnicas ofensivas (T1190, T1059, T1552, T1078, T1611, T1499, T1525, T1041) |
| MITRE D3FEND | Contramedidas | Técnicas defensivas por componente y fase |
| OWASP ASVS 4.0.3 | Seguridad de apps | Verificación de autenticación, sesiones, control de acceso, validación, configuración |
| OWASP API Security Top 10 | Seguridad de APIs | BOLA, Broken Auth, BFLA, consumo ilimitado de recursos, misconfiguración |
| OWASP Top 10 2025 | Seguridad web | Broken Access Control, Security Misconfiguration, Logging Failures |
| OWASP LLM Top 10 | Seguridad LLM | Inyección de prompts, manejo inseguro de salidas, agencia excesiva, RAG |
| CIS Benchmarks 2026 | Hardening | Endurecimiento de contenedores Docker y Kubernetes |
| SLSA Level 3+ | Cadena de suministro | Procedencia de builds, firmas de artefactos, ramas protegidas |
| SBOM CycloneDX | Dependencias | Inventario de todas las dependencias, versionado y monitorización de CVEs |
| OpenSSF Scorecard | Postura del repositorio | Dependencias fijas, revisión de código, higiene de CI, protección de ramas |
| GDPR / ISO 27701 | Privacidad de datos | Base legal, minimización, derecho al olvido, portabilidad, notificación de brechas |

---

## 5. Controles D3FEND (Catálogo Completo)

La siguiente tabla incluye **todas las técnicas D3FEND** que OCTO debe implementar, agrupadas por táctica, con su componente asociado y fase mínima.

| ID | Táctica | Técnica | Componente | Requisito / Aplicación | Fase mínima |
|----|---------|---------|------------|------------------------|--------------|
| D3-ACH | Harden | App Configuration Hardening | API (NestJS) | Helmet, ValidationPipe global, CORS estricto, sin secretos por defecto | F1 |
| D3-CH | Harden | Credential Hardening | Todos los servicios | Sin secretos hardcodeados, rotación, inyección desde vault | F1 |
| D3-CTS | Harden | Credential Transmission Scoping | API ↔ Runtime | El secreto interno solo viaja dentro del mesh de servicios, nunca en logs | F1 |
| D3-CS | Harden | Credential Scrubbing | Runtime, API | Eliminación de secretos de logs, prompts y errores | F4 |
| D3-SCH | Harden | Source Code Hardening | Todos los paquetes | Modo estricto TS, Pydantic, sin tipos `any`, verificación de contratos en CI | F1 |
| D3-DLV | Harden | Domain Logic Validation | Runtime, API | Validación de transiciones de estado con CAS, estados inválidos rechazados | F1 |
| D3-OLV | Harden | Operational Logic Validation | Scheduler, Reclaimer | Semántica unificada de leases, DLQ con manejo de mensajes tóxicos | F1 |
| D3-EAL | Harden | Executable Allowlisting | Runtime Worker | Solo binarios aprobados pueden ejecutarse; comandos MCP validados | F4 |
| D3-KBPI | Harden | Kernel-based Process Isolation | Todos los contenedores | Perfiles seccomp, AppArmor, namespaces, `no-new-privileges` | F4 |
| D3-PH | Harden | Platform Hardening | Todos los contenedores | rootfs de solo lectura, `cap_drop ALL`, sin privilegios, tmpfs limitado | F0 |
| D3-TL | Harden | Trusted Library | CI/CD | Acciones de GitHub e imágenes base pinadas por SHA; nada de tags mutables | F0 |
| D3-MFA | Harden | Multi-factor Authentication | Dashboard (F11+) | MFA obligatorio para operadores en entorno de producción | F11 |
| D3-TB | Harden | Token Binding | API Auth | Validación de audiencia, emisor, nbf; tokens vinculados al tenant | F1 |
| D3-CV | Isolate | Content Validation | Runtime, Tool Exec | Todos los outputs del LLM validados contra esquema antes de ejecutar tools | F3 |
| D3-CNR | Isolate | Content Rebuild | Runtime | Reconstrucción de salida sanitizada en lugar de filtrado; evita inyecciones parciales | F4 |
| D3-CF | Isolate | Content Filtering | Runtime, Channels | Filtro pre/post LLM que bloquea inyecciones y exfiltración de datos | F3 |
| D3-EI | Isolate | Execution Isolation | Runtime Worker | Cada tool/MCP en subproceso aislado, sin estado compartido | F4 |
| D3-SCF | Isolate | System Call Filtering | Runtime Worker | Filtrado de syscalls con seccomp para subprocesos de herramientas | F4 |
| D3-OTF | Isolate | Outbound Traffic Filtering | Contenedores runtime | Bloqueo de todo tráfico saliente excepto destinos autorizados (LiteLLM, MCP, MinIO, Qdrant) | F4 |
| D3-ITF | Isolate | Inbound Traffic Filtering | Infraestructura | El runtime worker no está expuesto a internet, solo accesible desde red interna | F1 |
| D3-NI | Isolate | Network Isolation | Docker Compose | Redes por servicio; ningún contenedor comparte espacio de nombres de red sin declaración explícita | F0 |
| D3-WSAM | Isolate | Web Session Access Mediation | Dashboard | Todas las rutas del dashboard detrás de autenticación; sin acceso público a datos de operaciones | F11 |
| D3-PSA | Detect | Process Spawn Analysis | Runtime Worker | Monitoreo y alerta de árboles de subprocesos inesperados | F4 |
| D3-PLA | Detect | Process Lineage Analysis | Runtime Worker | Trazado de cadena completa padre→hijo; profundidad anómala dispara alerta | F4 |
| D3-SCA | Detect | System Call Analysis | Contenedores runtime | Reglas de Falco detectan syscalls anómalas | F4 |
| D3-CIA | Detect | Container Image Analysis | CI/CD | Escaneo de imágenes con Trivy + Grype; CVEs críticos bloquean despliegue | F0 |
| D3-FIM | Detect | File Integrity Monitoring | Contenedores runtime | Alerta de escrituras inesperadas fuera de tmpfs | F4 |
| D3-NTA | Detect | Network Traffic Analysis | Infraestructura | Detección de tráfico de salida anómalo desde contenedores | F4 |
| D3-DQSA | Detect | Database Query String Analysis | PostgreSQL | Detección de queries SQL sin contexto de tenant; alerta y bloqueo en producción | F1 |
| D3-ANET | Detect | Auth Event Thresholding | API | Rate limiting y alerta por fallos repetidos de autenticación | F1 |
| D3-AZET | Detect | Authorization Event Thresholding | API, Runtime | Alerta por fallos repetidos de autorización del mismo tenant o IP | F1 |
| D3-JFAPA | Detect | Job Function Access Pattern Analysis | API, DB | Detección de accesos a recursos fuera del patrón normal | F6 |
| D3-RAPA | Detect | Resource Access Pattern Analysis | API, DB | Detección de intentos de acceso cross‑tenant | F6 |
| D3-UBA | Detect | User Behavior Analysis | API, Dashboard | Línea base por tenant; alerta de patrones anómalos | F6 |
| D3-UDTA | Detect | User Data Transfer Analysis | Runtime, Channels | Monitoreo de volumen de datos en salidas LLM y mensajes de canal | F4 |
| D3-EDL | Detect | Endpoint Detection Logging | Todos los servicios | Logs estructurados OTEL con `trace_id`, `tenant_id`, `execution_id` | F1 |
| D3-DNSAL | Detect | DNS Allowlisting | Contenedores runtime | Solo resolución de dominios permitidos; el resto bloqueados | F4 |
| D3-DST | Deceive | Decoy Session Token | API | JWTs señuelo inyectados en monitorización; su uso dispara alerta | F12 |
| D3-DUC | Deceive | Decoy User Credential | DB, Vault | Credenciales honeypot en almacén de secretos; acceso detecta brecha | F12 |

---

## 6. Modelo de Amenazas y Superficie de Ataque

### 6.1 Límites de Confianza

OCTO define siete límites de confianza. Cada comunicación que cruza un límite debe validar identidad, autorización e integridad de forma independiente.

| # | Límite | Desde → Hacia | Controles primarios |
|---|--------|---------------|----------------------|
| TB-1 | Internet → API | Navegador / cliente API → NestJS API | JWT, rate limiting, Helmet, validación de entrada, WAF |
| TB-2 | API → Runtime | NestJS → FastAPI Worker | Secreto interno, mTLS (F12+), despacho vía cola, sin exposición directa |
| TB-3 | API/Runtime → DB | Cualquier servicio → PostgreSQL | RLS con contexto de tenant, roles de mínimo privilegio, sin `BYPASSRLS` |
| TB-4 | Runtime → LLM | FastAPI → LiteLLM → proveedores | Allowlist de proveedores, sanitización de parámetros, sin paso de claves, validación de salida |
| TB-5 | Runtime → Tools/MCP | Bucle del agente → ejecutor de tools / subproceso MCP | Validación de esquema, compuertas de aprobación, sandbox (seccomp/namespace), timeout, filtrado de egress |
| TB-6 | Contenedor → Host | Cualquier contenedor → SO host / metadata cloud | Sin contenedores privilegiados, sin montajes del host, bloqueo del endpoint de metadata, perfiles seccomp |
| TB-7 | CI → Producción | GitHub Actions → artefactos de producción | Acciones pinadas por SHA, commits firmados, procedencia SLSA, firmado de imágenes con Cosign |

### 6.2 Mapeo MITRE ATT&CK

| ID ATT&CK | Técnica | Vector de ataque en OCTO | Contramedidas D3FEND |
|-----------|---------|--------------------------|----------------------|
| T1190 | Explotar aplicación pública | API NestJS, puerto del runtime expuesto | D3-ACH, D3-ITF, D3-ANET |
| T1059 | Intérprete de comandos | Ejecución de subprocesos MCP, ejecutor de tools | D3-PSA, D3-PLA, D3-SCF, D3-EAL |
| T1552 | Credenciales no seguras | Secretos en entorno, logs, prompts, artefactos | D3-CS, D3-CTS, D3-FIM, D3-SCH |
| T1078 | Cuentas válidas | Robo de JWT, mal uso de secretos compartidos, bypass de tenant | D3-CH, D3-MFA, D3-ANET, D3-JFAPA |
| T1525 | Imagen interna maliciosa | Tags Docker mutables en CI | D3-CIA, D3-TL |
| T1611 | Escape a host | Contenedores privilegiados, montaje del socket Docker | D3-KBPI, D3-PSA, D3-SCF, D3-PH |
| T1550 | Manipulación de tokens | Confusión de algoritmo JWT, replay, falsificación | D3-CH, D3-TB |
| T1041 | Exfiltración por C2 | Salida del LLM exfiltra datos del tenant | D3-CV, D3-OTF, D3-NTA, D3-UDTA |
| T1499 | Agotamiento de recursos | Amplificación de costo de LLM, inundación de cola | D3-ANET, D3-AZET |
| T1195 | Compromiso de cadena de suministro | Paquetes npm/pip envenenados, inyección en CI | D3-TL, D3-CIA |
| T1082 | Descubrimiento de información del sistema | Endpoints públicos de health/ops que exponen infraestructura | D3-ACH, D3-CF |
| T1677 | Envenenamiento de pipeline de ejecución | Inyección en workflow de CI basada en PR | D3-SCH, D3-CFI, D3-SCA |

### 6.3 OWASP LLM Top 10 – Amenazas específicas para agentes

| ID | Riesgo | Mitigación en OCTO |
|----|--------|---------------------|
| LLM01 | Inyección de prompts | Filtrado de contenido (D3‑CF), validación de salida (D3‑CV), aislamiento de prompts por tenant |
| LLM02 | Manejo inseguro de salidas | Validación de esquema JSON en todas las salidas del LLM, validación de llamadas a tools, reconstrucción de contenido (D3‑CNR) |
| LLM04 | Denegación de servicio del modelo | Límites de tokens por ejecución/tenant, rate limiting (D3‑ANET), timeouts de ejecución, circuit breakers de costo |
| LLM06 | Agencia excesiva | Compuertas de aprobación para tools de alto efecto secundario, HITL para acciones irreversibles, límites de autoridad |
| LLM07 | Fuga del prompt del sistema | Aislamiento de prompts, contexto sin cruce de tenants, alcance de memoria por nivel jerárquico, escaneo DLP de salidas |
| LLM08 | Manipulación de vector/RAG | Validación de integridad de embeddings, trazabilidad de fragmentos, filtrado de resultados de recuperación, detección de envenenamiento de memoria |
| LLM09 | Desinformación | Puntuación de confianza de salida, citación de fuentes, compuertas de revisión humana para salidas críticas |
| LLM10 | Consumo sin límites | Política de presupuesto por ejecución, límites diarios por tenant, topes de cadena de fallback, contabilidad de costo en tiempo real |

---

## 7. Requisitos de Seguridad por Componente (Arquitectura de 10 Capas)

### 7.1 Capa de Presentación (Next.js)
- CSP estricto, cabeceras de seguridad (Helmet), autenticación MFA para operadores (F11+).
- No hay lógica de negocio en el frontend – solo proyecciones vía API.

### 7.2 Control Plane (NestJS API)
- **Autenticación:** JWT con rotación de claves, endpoint JWKS público, `@UseGuards` en cada controlador.
- **Autorización:** Tenant/Workspace scope + RBAC mediante guards.
- **Rate limiting:** Por IP y por tenant, basado en Redis (atómico).
- **Validación:** `ValidationPipe` global con whitelist, forbidNonWhitelisted.
- **Auditoría:** Todos los eventos de seguridad se escriben en tabla `audit_log`.

### 7.3 Orquestación (BullMQ + Redis)
- Redis con contraseña, ACLs (API solo puede añadir, worker solo consumir), persistencia AOF.
- Colas con DLQ, dead letter handling, reintentos con backoff exponencial.

### 7.4 Runtime Worker (FastAPI Python)
- **Aislamiento por tenant:** Cada query PostgreSQL usa `withTenantTx()` que ejecuta `SELECT set_config('app.current_tenant', ...)`. Si no se llama, la query retorna cero filas (fail‑secure).
- **Sandbox para tools/MCP:** Subprocesos con `seccomp`, límites de recursos, entorno sin secretos, egress bloqueado.
- **Filtros de contenido:** Pre‑filtro contra prompt injection (D3‑CF) y post‑filtro de outputs (D3‑CV).
- **Checkpointing delta:** Solo se almacenan cambios desde el último checkpoint, con snapshots periódicos.

### 7.5 Capa de Canales
- Cada worker de canal (WhatsApp, Telegram, Discord, Teams) es un contenedor separado con su propia red y CPU/memoria limitada.
- Las sesiones (Baileys, etc.) se persisten en disco cifrado dentro del contenedor, no en volúmenes compartidos.
- Los mensajes entrantes se validan contra inyección y se normalizan a un evento interno antes de encolarlos.

### 7.6 Infraestructura (Docker + Coolify)
- **Todos los contenedores** cumplen CIS Level 1 (y Level 2 en F12+).
- **Redes:** Overlay interno; solo el contenedor `api` expone puerto público.
- **Secrets:** Se inyectan vía variables de entorno de Coolify o HashiCorp Vault; nunca en `docker-compose.yml` o en imágenes.

### 7.7 Provider Abstraction (LiteLLM)
- Único punto donde se importan SDKs externos.
- Parámetros a proveedores sanitizados (no se permite `api_key` desde inputs de tenant).
- Fallback solo por errores 429/quota, nunca por error de autenticación.

### 7.8 Persistencia (PostgreSQL, Redis, Qdrant, MinIO)
- **PostgreSQL:** RLS obligatorio, cifrado en reposo (LUKS), TLS 1.3 para conexiones, auditoría append‑only.
- **Qdrant:** Namespaces por tenant/workspace, embeddings cifrados en reposo.
- **MinIO:** Buckets privados, políticas de expiración de artefactos, firmas pre‑firmadas limitadas.

### 7.9 Seguridad (Transversal)
- **Gestión de secretos:** Basado en NIST SP 800‑57: rotación automática (ej. cada 30 días), almacenamiento en HashiCorp Vault, inyección en tiempo de ejecución.
- **Políticas:** OPA evalúa permisos, budgets y reglas de aprobación antes de cada acción crítica.
- **Detección de intrusos:** Falco con reglas personalizadas para syscalls anómalos, montos de volumen de datos, y procesos no autorizados.

### 7.10 Observabilidad
- **Traza completa:** Cada `ExecutionEvent` contiene `trace_id`, `run_id`, `step_id`, `agent_id`.
- **Métricas:** Prometheus recolecta latencias, uso de tokens, costos, rate limit hits, fallos de RLS.
- **Logs estructurados:** JSONL con rotación diaria, retención mínima 90 días para logs de seguridad.
- **Alertas:** Envío a canal de operaciones si hay violación de RLS, fuga de secretos sospechosa, o budget excedido.

---

## 8. Gestión de Vulnerabilidades y Parches (CVE Monitoring)

| Severidad | CVSS | Plazo de parche | Proceso |
|-----------|------|-----------------|----------|
| **Critical** | 9.0 – 10.0 | < 24 horas | Bloquear despliegue, hotfix inmediato, notificar a operadores, reporte de incidente |
| **High** | 7.0 – 8.9 | < 72 horas | Rama hotfix, revisión por seguridad, merge aprobado |
| **Medium** | 4.0 – 6.9 | < 14 días | Incluir en sprint actual, seguimiento como deuda de seguridad |
| **Low** | 0.1 – 3.9 | < 90 días | Próximo ciclo de actualización de dependencias |

**Herramientas de monitoreo continuo:**
- **Dependabot** – PRs automáticas para CVEs conocidas.
- **Trivy** – Escaneo de vulnerabilidades en código y dependencias (cada PR).
- **Grype** – Escaneo de imágenes de contenedor (cada build).
- **OpenSSF Scorecard** – Evaluación semanal de la postura de seguridad del repo.
- **Falco** – Detección en runtime de exploits conocidos.

---

## 9. Privacidad de Datos y Cumplimiento Normativo

### 9.1 Clasificación de Datos

| Clasificación | Ejemplos en OCTO | Retención | Controles |
|---------------|------------------|-----------|------------|
| **Altamente sensible** | API keys, claves de firmado JWT, contraseñas de DB, clave maestra de LiteLLM | Nunca se persisten; solo en runtime | Inyección desde vault, nunca en logs, rotación programada, D3‑CS |
| **Personal sensible** | Prompts del tenant, memoria del agente, entradas/salidas de ejecución, artefactos | Por política de retención del tenant (default 90 días) | Cifrado en reposo, RLS con alcance de tenant, exportación bajo demanda, eliminación bajo demanda |
| **Interno** | Trazas de ejecución, logs, métricas, estado de colas | Trazas 90 días, logs de seguridad 12 meses | Limpieza de secretos y PII antes de almacenar, sin acceso cross‑tenant |
| **Público** | Documentación de API, endpoint de health, esquema OpenAPI | Indefinido | Sin información sensible, revisado antes de publicación |

### 9.2 Requisitos GDPR / ISO 27701
- Base legal documentada para cada categoría de datos personales.
- Minimización de datos: los prompts y salidas no se retienen más allá de la ejecución a menos que el tenant habilite memoria explícitamente.
- Derecho al olvido: API de borrado de datos del tenant purga ejecuciones, memoria, artefactos y embeddings en menos de 72 horas.
- Portabilidad de datos: el tenant puede exportar todos sus datos de ejecución en formato JSON.
- Notificación de brecha: el plan de respuesta a incidentes incluye el procedimiento de notificación en 72 horas según artículo 33 del GDPR.
- Privacidad desde el diseño: las nuevas características se evalúan para impacto en la privacidad antes de su implementación (proceso DPIA desde F11+).
- Procesadores externos: los proveedores de LLM se documentan como procesadores de datos con acuerdos de tratamiento (DPA) antes de su uso en producción.

---

## 10. Respuesta a Incidentes y Gobernanza de Seguridad

### 10.1 Clasificación de Incidentes de Seguridad

| Severidad | Definición | Tiempo de respuesta | Escalación |
|-----------|------------|---------------------|-------------|
| **P0 — Crítico** | Brecha activa, exfiltración de datos, fallo de aislamiento de tenant, fuga de credenciales maestras | Inmediato (15 min) | Todos los equipos. Aislar servicios afectados. Notificar a los tenants en 1 hora. Comienza el plazo de 72h del GDPR. |
| **P1 — Alto** | Bypass de autenticación, endpoint interno expuesto, CVE crítica en producción | < 1 hora | Líder de seguridad + líder técnico. Parche o mitigación en <24h. |
| **P2 — Medio** | Bypass de rate limiting, divulgación de información no sensible, CVE alta no explotada | < 4 horas | Equipo de ingeniería. Seguimiento en GitHub Security Advisory. |
| **P3 — Bajo** | Deriva de configuración, CVE media, pequeña mala configuración | Siguiente día hábil | Proceso normal de sprint. Ítem de deuda técnica. |

### 10.2 Playbook de Respuesta (P0 y P1)
1. **Aislar** – Cortar tráfico al componente afectado (ej. runtime worker) desde el API Gateway.
2. **Preservar evidencia** – Congelar logs, trazas y volcados de memoria.
3. **Investigar** – Revisar auditorías, determinar vectores de entrada y alcance.
4. **Remediar** – Aplicar parche o configuración; validar en entorno de staging.
5. **Recuperar** – Restablecer servicio con monitoreo reforzado.
6. **Post‑mortem** – Documentar causa raíz, actualizar threat model, añadir controles preventivos.

### 10.3 Política de Divulgación Responsable
OCTO mantiene una política de divulgación responsable publicada en `/security.txt` y en el repositorio de GitHub. Los investigadores de seguridad pueden reportar vulnerabilidades a `security@[domain]`. Los reportes se reconocen en un plazo de 48 horas y se resuelven de acuerdo con la política de gobierno de CVEs.

### 10.4 Cadencia de Gobernanza de Seguridad
- **Semanal:** Ejecución de OpenSSF Scorecard, revisión de CVEs de dependencias, revisión de alertas de Falco.
- **Mensual:** Revisión de deuda de seguridad, verificación de rotación de credenciales caducadas, prueba de restauración de backups.
- **Trimestral:** Revisión del modelo de amenazas, autoevaluación OWASP ASVS, revisión de derechos de acceso (cuentas de usuario, cuentas de servicio, claves API).
- **Por release:** Escaneo completo Trivy + Grype, generación de SBOM, firmado con Cosign, pruebas de penetración para releases mayores.
- **Por incidente:** Post‑mortem con análisis de causa raíz, identificación de brechas de control, plazo de remediación.

---

## 11. Registro de Deuda de Seguridad Actual (Estado F1)

Los siguientes elementos representan brechas de seguridad conocidas a partir de la auditoría de F1. Cada elemento se rastrea como un issue de GitHub y tiene una fase de cierre asignada. Ningún elemento puede permanecer abierto más allá de su fase objetivo.

| Sev | Componente | Descripción de la brecha | Fase objetivo | Estándares violados |
|-----|------------|--------------------------|---------------|----------------------|
| CRIT | Runtime (Python) | Las queries de PostgreSQL en los módulos de contabilidad, checkpoints y aprobaciones no establecen el contexto RLS de tenant. Posible filtración de datos cross‑tenant. | Cierre F1 | ISO 27001 A.9, NIST AC-4, OWASP ASVS §4 |
| CRIT | MCP Executor | La ejecución de subprocesos MCP no tiene sandbox a nivel de SO. Sin seccomp, sin chroot, sin límites de CPU/memoria. Ejecución arbitraria de código en el contenedor del runtime. | F4 | CIS Benchmarks, MITRE T1059, D3-PSA/SCF |
| CRIT | CI/CD | Las GitHub Actions y las imágenes base de Docker usan tags mutables (master, main-latest). Posible envenenamiento de la cadena de suministro. | Cierre F1 | SLSA L3+, SBOM CycloneDX, MITRE T1525 |
| HIGH | API Controllers | ExecutionController y AgentController carecen de `@UseGuards` explícito. La autenticación depende del middleware global, no de enforcement local. | Cierre F1 | OWASP ASVS §4, NIST IA-2, OWASP API BOLA |
| HIGH | Configuración de secretos | Desajuste entre INTERNAL_SECRET y RUNTIME_API_SECRET entre compose y guard. Posible denegación de servicio o despliegue inseguro. | Cierre F1 | OWASP ASVS §2, NIST IA-5 |
| HIGH | Rate limiting | El token bucket en proceso no es atómico. Puede ser evadido bajo concurrencia. No hay rate limiting a nivel de API para endpoints no autenticados. | Cierre F1 | OWASP API Unrestricted Resource Consumption, NIST SC-5 |
| HIGH | Puerto del runtime worker | El puerto del runtime worker puede quedar expuesto a internet en algunas configuraciones de despliegue. Protegido solo por un secreto compartido sin rate limiting. | Cierre F1 | NIST SC-7, MITRE T1190, ISO 27017 §9 |
| MED | Contratos TS/Python | ExecutionStatus en minúsculas en contratos TS, en mayúsculas en schemas Zod y Python. Puede causar transiciones de estado inválidas y ejecuciones bloqueadas. | Cierre F1 | OWASP ASVS §5, NIST SI-10 |
| MED | Cabeceras HTTP de API | Helmet no instalado. ValidationPipe no global. Faltan cabeceras CSP, HSTS, X‑Frame‑Options. | Cierre F1 | OWASP ASVS §14, OWASP Top 10 A05, CIS |
| MED | Endpoints de health | Los endpoints públicos de health/ops exponen estado de dependencias, conteos de colas, detalles de error y versión sin autenticación. | Cierre F1 | OWASP ASVS §8, NIST SI-12 |
| MED | Guardrails de LLM | No hay detección integral de inyección de prompts, ni filtro DLP de salidas, ni detección de envenenamiento de memoria conectada de extremo a extremo. | F3–F4 | OWASP LLM01/LLM07/LLM08, NIST AI RMF Manage 2.2 |
| MED | Hardening de contenedores | `docker-compose.yml` (principal) no incluye scheduler‑worker ni reclaimer‑worker. Los perfiles seccomp no están declarados. Algunos servicios carecen de `cap_drop`. | Cierre F1 | CIS Docker Benchmark, MITRE T1611, D3‑KBPI |

---

## 12. Lista de Verificación de Hardening por Fase (Resumen Ejecutivo)

| Fase | Gating de hardening obligatorio |
|------|----------------------------------|
| F0 | Gitleaks, imágenes base pinadas por SHA, pasos de seguridad en CI/CD, usuario no‑root, sistema de archivos de solo lectura |
| F1 | Helmet + ValidationPipe, `@UseGuards`, RLS en rutas Python, rate limiting atómico, logs con trace_id, secretos unificados y rotados |
| F2 | Auditoría de acceso jerárquico, políticas de herencia validadas, sin bypass de RLS |
| F3 | Aislamiento de prompts y memoria por nivel, HEARTBEAT con presupuesto |
| F4 | Sandboxing de tools/MCP (seccomp, egress bloqueado, entorno mínimo), allowlisting de ejecutables |
| F5 | Namespaces en Qdrant, validación de integridad de embeddings, memoria compatible con Obsidian cifrada |
| F6 | AgentBus con autenticación, delegación vía `SpawnPolicyResolver`, auditoría de rutas de delegación |
| F7 | `execution_snapshot` inmutable, dry‑run sin efectos secundarios |
| F8 | Canales aislados por contenedor, credenciales cifradas, enrutamiento vía cola |
| F9‑F10 | LiteLLM como único punto de contacto con SDKs externos, caché semántica con TTL e invalidación por cambio de contexto |
| F11+ | RBAC granular, hard stop budgets, mTLS interno, auditoría continua, cumplimiento automático (ISO, NIST, GDPR) |

---

## 13. Referencias y Documentos Relacionados

- [Arquitectura completa de OCTO (10 capas, fases, componentes)](./OCTO-v5-arquitectura.md)
- [F1 Gap Closure Plan](./F1_GAP_CLOSURE_PLAN.md)
- [MITRE D3FEND™ Knowledge Graph](https://d3fend.mitre.org/)
- [CIS Benchmarks 2026](https://www.cisecurity.org/benchmarks/)
- [SLSA Security Levels](https://slsa.dev/)
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)

---

*Fin del documento – v1.0 (Mayo 2026)*