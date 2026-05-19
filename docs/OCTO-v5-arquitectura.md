# Documento Arquitectónico Descriptivo — OCTO
## Self-Hosted Agent Operating Platform · Hierarchical Cognitive Execution System

**Versión:** 4.0 — Mayo 2026  
**Cambios v4.0:** Refundación como OCTO · Renombrado completo del proyecto (agent-visualstudio → OCTO) · Arquitectura oficial de 10 capas · Estructura monorepo Turborepo oficial · Modelo conceptual correcto: Cognitive Execution Hierarchy (no SaaS, no multitenant) · Filosofía anti-fragilidad y principios SDK hostiles · Stack tecnológico oficial · Estándares de seguridad enterprise ISO/NIST/MITRE/OWASP · Sección completa de hardening de contenedores · CI/CD pipeline obligatorio · Deployment strategy · Repositorio oficial: github.com/lssmanager/OCTO

**Cambios v3.1:** Rowboat — Memoria visible en Markdown/backlinks · Artifacts como output nativo del runtime · Knowledge Graph acumulativo por nivel · MCP como vía principal de extensibilidad (refuerzo) · Interfaz bring-your-own-model con modelos locales desde F3 · Live Notes automáticas por nivel · Memoria Obsidian-compatible inspeccionable y editable · Referencia Rowboat añadida a tabla de fuentes.

**Cambios v3:** Jerarquía de 5 niveles con `SubAgent` · Sección de herramientas de visualización y observabilidad externa (Lattice, AgenticLens, AgentNeo, Neurite, noaide, WorkGraph) · Formato JSONL estándar de logs del runtime · Actualización de todos los árboles, tabs y referencias a la nueva jerarquía completa.

---

## 1. Propósito del documento

Este documento define de forma descriptiva y arquitectónica qué debe llegar a ser `OCTO` como producto final. Está basado en la visión consolidada de `PLAN2.md` y complementado con los principios de diseño y referencias técnicas extraídas de los siguientes repositorios y recursos:

- [OpenClaw](https://github.com/openclaw/openclaw) — Core Files, formato de skills, canales de mensajería, multi-platform routing.
- [agency-agents](https://github.com/msitarzewski/agency-agents) — Galería de plantillas de agentes especializados.
- [CrewAI](https://github.com/crewaiinc/crewai) — Roles, crews, delegación y planificación colaborativa.
- [LangGraph](https://github.com/langchain-ai/langgraph) — Durable execution, checkpointing, stateful orchestration, HITL.
- [Flowise](https://github.com/flowiseai/flowise) — Builder visual de agentes, RAG visual, experiencia low-code.
- [Semantic Kernel](https://github.com/microsoft/semantic-kernel) — Plugins, memory abstractions, prompt templates, typed functions.
- [Hermes Chief of Staff](https://github.com/TheCraigHewitt/hermes-chief-of-staff) — Agente coordinador, planificación de subtareas, orquestación jerárquica.
- [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) — Multi-agent workflows, MCP, A2A, protocolos, declarative agents.
- [n8n](https://github.com/n8n-io/n8n) — Flow editor visual, inspector de ejecución, integrations.
- [AutoGen](https://github.com/microsoft/autogen) — GroupChat, manager patterns, debate entre agentes.
- [Paperclip](https://github.com/paperclipai/paperclip) — Evals, budgets, governance, cost tracking.
- [Microsoft AI Agents for Beginners](https://microsoft.github.io/ai-agents-for-beginners/) — Marco conceptual de diseño agéntico moderno.
- [Lattice](https://github.com/lattice-agents/lattice) — Grafo interactivo de topología multi-agente generado desde el proyecto.
- [Neurite](https://github.com/satellitecomponent/Neurite) — Espacio de trabajo visual fractal para redes de agentes y conocimiento.
- [AgentNeo](https://github.com/raga-ai-hub/agentneo) — Observabilidad y trazado de ejecuciones multi-agente con dashboard de grafos.
- [noaide](https://github.com/noaide/noaide) — Visualización de topología y mensajes en equipos Claude Code.
- [AgenticLens](https://github.com/agenticlens/agenticlens) — Conversión de logs JSONL en grafos de flujo de ejecución navegables.
- [WorkGraph](https://github.com/workgraph/workgraph) — Grafo de conocimiento de sesiones de programación con IA.
- [Rowboat](https://github.com/rowboatlabs/rowboat) — AI coworker open-source con knowledge graph acumulativo, memoria persistente en Markdown/backlinks Obsidian-compatible, artifacts nativos, extensibilidad MCP y soporte bring-your-own-model.

El documento **no describe el estado actual del repositorio** como si estuviera terminado. Es una visión técnica organizada, un mapa de producto y una arquitectura objetivo para construir la plataforma sin repetir los errores del repositorio actual, donde se mezclaron etapas bloqueantes, deuda técnica y piezas parcialmente implementadas que terminaron impidiendo el funcionamiento real del sistema.

---

## 2. Identidad del producto

**OCTO** es una **Self-Hosted Agent Operating Platform** — un sistema operativo para agentes de inteligencia artificial, orientado a organización jerárquica cognitiva, orquestación de ejecución distribuida y coordinación autónoma de agentes especializados.

**No es:**
- Un SaaS multitenant con features de IA encima.
- Una plataforma de chatbots o copilot personal.
- Un workspace manager al estilo Notion + ChatGPT.
- Un CRUD de agentes con interfaz bonita.

**Es:**
- Un **Agentic Operating System** donde la jerarquía representa estructuras cognitivas y operacionales, no aislamiento de tenants.
- Un **Distributed Cognitive Infrastructure** con ejecución durable, workers aislados y observabilidad total.
- Un **Hierarchical Autonomous Agent Topology** donde cada nodo tiene: role, authority, capabilities, memory scope, tools, delegation rights, execution policies y escalation policies.
- Una plataforma **enterprise-grade** pensada para LONG-TERM EVOLVABILITY, no para velocidad inicial.

**Repositorio oficial:** [https://github.com/lssmanager/OCTO](https://github.com/lssmanager/OCTO)

### Modelo conceptual correcto

La jerarquía `Agency → Department → Workspace → Agent → SubAgent` NO representa tenants SaaS. Representa una **Cognitive Execution Hierarchy**:

```
CEO Agent
│
├── CTO Agent
│   ├── Backend Lead Agent
│   ├── Frontend Lead Agent
│   └── DevOps Lead Agent
│
├── Product Agent
│   ├── UX Agent
│   ├── Research Agent
│   └── QA Agent
│
└── Operations Agent
    ├── Monitoring Agent
    ├── Budget Agent
    └── Security Agent
```

El hierarchy pertenece al dominio **agent-core**, NO al dominio **auth**. Los nodos no son usuarios; son **execution entities**. Las relaciones representan: delegación, supervisión, revisión, coordinación, handoff, aprobación.

El modelo de dominio correcto es:

| Entidad | Descripción |
|---|---|
| `AgentNode` | Unidad de ejecución cognitiva con rol, autoridad y capacidades |
| `ExecutionGraph` | Grafo de delegación y supervisión entre agentes |
| `DelegationEdge` | Relación de delegación entre dos nodos del grafo |
| `CapabilityProfile` | Perfil de capacidades y tools del nodo |
| `AuthorityBoundary` | Límites de autoridad y políticas de escalación |
| `ExecutionContext` | Contexto efectivo compilado para una ejecución |
| `MemoryScope` | Alcance de memoria accesible por nivel jerárquico |
| `ToolAccessPolicy` | Política de acceso y permisos sobre tools |



`OCTO` debe ser una **plataforma integral de orquestación agéntica**, diseñada para que equipos y operadores puedan diseñar, configurar, ejecutar, observar y gobernar agentes de inteligencia artificial dentro de una estructura jerárquica empresarial, con una experiencia visual tipo n8n/Flowise y un runtime durable y robusto debajo.

No debe ser solamente un "chat con tools", ni solo un "builder visual", ni solo un "framework runtime". Debe combinar en un sistema coherente:

- Estructura organizacional jerárquica de cinco niveles con herencia real (Agency → Department → Workspace → Agent → SubAgent).
- Diseño visual de agentes y flujos.
- Runtime durable, reanudable y observable.
- Memoria, RAG y context engineering.
- Herramientas, skills y protocolos estándar.
- Canales de comunicación multi-plataforma.
- Gobernanza, seguridad, costos y evaluación.
- Galería de plantillas de agentes sincronizable.
- Agent Builder asistido por chat y jerarquía.
- Hub de tools y skills importables en formato universal.
- Artifacts como outputs formales nativos del sistema (documentos, código, decks, emails).
- Memoria visible, editable y Obsidian-compatible por nivel jerárquico.
- Knowledge graph acumulativo construido automáticamente por el runtime.

---


## 3. Filosofía arquitectónica — Principios de anti-fragilidad

### PRINCIPIO #1 — SDKs son sistemas hostiles

Todos los SDKs externos cambian APIs, rompen versiones, introducen peer conflicts y crean dependency hell. **Ningún SDK externo debe propagarse al core.**

```
PROHIBIDO:  import OpenAI from "openai"   ← fuera de /packages/sdk-abstractions
CORRECTO:   Application → Internal Interfaces → SDK Adapter Layer → LiteLLM → Provider
```

**Provider Contract obligatorio:**
```typescript
interface LLMProvider {
  chat(): Promise<ChatResponse>
  stream(): AsyncIterable<StreamChunk>
  embeddings(): Promise<EmbeddingResponse>
  image(): Promise<ImageResponse>
  moderation(): Promise<ModerationResponse>
}
```

### PRINCIPIO #2 — Runtime separado del Control Plane

El runtime AI **jamás** debe vivir dentro del frontend, Next.js, el API Gateway ni el websocket layer. El runtime vive en workers aislados con sus propias colas, contenedores y límites de recursos.

### PRINCIPIO #3 — Workers aislados por responsabilidad

Cada responsabilidad crítica recibe: proceso separado, contenedor separado, cola separada, límites de memoria separados. Ningún worker comparte estado volátil con otro.

### PRINCIPIO #4 — SQL First

Preferir SQL explícito, migrations controladas, tipado simple y bajo acoplamiento. Drizzle ORM como abstracción mínima. Evitar ORMs mágicos que ocultan queries críticos.

### PRINCIPIO #5 — Security by Design

Toda decisión arquitectónica asume que **COMPROMISE IS INEVITABLE**. La plataforma debe: contener daño, limitar movimiento lateral, auditar todo, observar todo, rotar secretos y reducir blast radius.

```
PROHIBIDO:  OPENAI_API_KEY=sk-xxx  ← en repositorio
REQUERIDO:  Vault compatible · Docker secrets · runtime injection · key rotation · ephemeral credentials
```

### Reglas de dependencias

```
PROHIBIDO:  "typescript": "^5.0"   ← rangos ^ o ~
PROHIBIDO:  "package": "latest"    ← versiones flotantes
REQUERIDO:  "typescript": "5.9.3"  ← versiones exactas y pinadas
```

---

## 4. Diferenciador central — Jerarquía `Agency → Department → Workspace → Agent → SubAgent`

El diferenciador más importante del producto es la jerarquía de cuatro niveles tratada no como un detalle administrativo sino como el **modelo estructural central** de toda la plataforma.

Cada nivel hereda, especializa o restringe configuración del nivel superior. Todo — prompts, tools, policies, modelos LLM, memoria, canales, costos, credenciales y contexto — fluye a través de esta jerarquía de forma controlada y predecible.

### Estado de activación por nivel

Cada nivel (Agency, Department, Workspace, Agent, SubAgent) tiene un **estado de activación** que puede controlarse manualmente desde el árbol jerárquico (Zona A/B) o desde la vista de detalle del nivel (Zona C):

- **Activo:** el nivel opera con normalidad, acepta runs, responde canales, ejecuta routines y heartbeat.
- **Inactivo / Pausado:** el nivel está desactivado. No ejecuta runs, no responde canales, no procesa heartbeat ni routines. Sus descendientes quedan inactivos automáticamente mientras el padre esté desactivado.
- **Archivado:** modo solo-lectura. Los datos, Core Files, memoria y runs históricos son consultables pero no se puede operar.

El toggle de activación aparece como un switch visible junto al nombre del nodo en el árbol (Zona A y Zona B) y en la cabecera de la vista del nivel en Zona C. Desactivar un nivel padre muestra una advertencia de confirmación que lista todos los elementos descendientes afectados. Al reactivar, el sistema ofrece restaurar todos los descendientes o elegir cuáles reactivar individualmente.

### 4.1 Agency

La `Agency` es el contenedor superior. Representa una unidad organizacional completa: empresa, cliente, vertical, proyecto mayor o célula de negocio. Su función técnica es delimitar un árbol completo de configuración, recursos, aislamiento lógico y gobierno.

Cada Agency define sus propios Departments, Workspaces, Agents, canales, modelos LLM preferidos, credenciales, políticas y trazabilidad. Puede asignarse un modelo LLM primario y una cadena de fallback específica a nivel de Agency, que será heredada por todos sus descendientes salvo que la sobreescriban.

### 4.2 Department

El `Department` agrupa capacidades o dominios funcionales dentro de una Agency. Ejemplos: ingeniería, soporte, growth, ventas, producto, finanzas, marketing, legal. Su función arquitectónica es ser el punto intermedio de herencia y segmentación funcional.

El Department puede asignar su propio modelo LLM y fallback chain distintos a los de la Agency, ajustados al dominio. Por ejemplo, un Department de ingeniería puede preferir un modelo con mayor capacidad de código, mientras que uno de soporte puede usar un modelo más económico para volumen.

### 4.3 Workspace

El `Workspace` es la unidad operativa donde viven los recursos de trabajo concretos: flujos, runs, conexiones, memoria contextual, artefactos, configuraciones específicas y agentes. Puede asignar sus propios modelos LLM y fallback, distintos a los del Department o Agency, ajustados al tipo de trabajo del equipo o proyecto.

### 4.4 Agent

El `Agent` es la unidad ejecutora especializada. Puede tener su propio modelo LLM, fallback chain y budget policy. Su configuración efectiva final resulta de resolver la cadena jerárquica completa, donde el nivel más específico tiene prioridad.

### 4.5 SubAgent

El `SubAgent` es la unidad de ejecución atómica y especializada que vive bajo un `Agent`. Representa una capacidad muy específica o una tarea delegada por el Agent padre: un paso de un pipeline, una habilidad concreta, un worker dedicado a un fragmento de proceso, o un agente auxiliar que el Agent orquesta para completar una tarea mayor.

A diferencia del Agent, el SubAgent:

- **No tiene canales de comunicación directa** asignados por defecto. Recibe inputs exclusivamente desde su Agent padre o desde flows que lo invocan explícitamente.
- **No aparece en la vista de canales ni en el routing de mensajes**. El usuario externo no interactúa con él directamente; el Agent padre actúa como intermediario.
- **Hereda toda la configuración del Agent padre** (modelo LLM, fallback chain, tools, Core Files, memoria, budget) pero puede sobreescribir cualquiera de estos atributos para su dominio específico.
- **Tiene su propio set de Core Files reducido**: `IDENTITY.md`, `SOUL.md`, `AGENTS.md` y `TOOLS.md`. No gestiona `USER.md` ni `HEARTBEAT.md` de forma autónoma (los hereda del padre o del Workspace).
- **Puede tener su propia memoria episódica** limitada al contexto de su rol específico.
- **Se muestra en el árbol jerárquico** bajo su Agent padre, con su propio estado de activación, métricas y logs.
- **Puede ser creado en el Agent Builder** desde la tab `Profile` del Agent: acción "Añadir SubAgent", que abre el mismo wizard guiado del Builder en modo sub-nivel.
- **Sus runs** se registran como `RunStep` de tipo `subagent_delegation` dentro del run del Agent padre, manteniendo trazabilidad completa en el timeline.

**Casos de uso típicos de un SubAgent:**
- Un Agent de soporte tiene un SubAgent especializado en escalaciones y otro en generación de respuestas predefinidas.
- Un Agent de ingeniería tiene un SubAgent para revisión de código y otro para generación de tests.
- Un Agent coordinador tiene SubAgents workers que ejecutan pasos en paralelo de un pipeline.
- Un Agent de contenido tiene un SubAgent SEO y un SubAgent de revisión de tono.

**Resolución jerárquica completa:**

```
Agency → Department → Workspace → Agent → SubAgent
```

El SubAgent resuelve su modelo efectivo siguiendo esta cadena completa. El nivel más específico (SubAgent) tiene prioridad sobre cualquier configuración del Agent o niveles superiores.

**Tabs en Zona C — nivel SubAgent:**
`Profile` · `Core Files` · `Identity` · `Soul` · `Tools & Skills` · `Models & Budget` · `Memory` · `Runs` · `Routines` · `Evals`

El SubAgent no tiene tab `Channels` ni `Heartbeat` autónomo. Sus runs aparecen como pasos delegados dentro del timeline del Agent padre.

---

## 5. Asignación de modelos LLM por nivel

### 5.1 Principio

Cada nivel jerárquico (Agency, Department, Workspace, Agent, SubAgent) puede tener asignados modelos LLM distintos y una fallback chain propia. Los modelos disponibles para asignar son exclusivamente los que estén configurados en el menú de Settings de la plataforma. No se puede asignar un modelo que no haya sido previamente registrado y validado.

### 5.2 Resolución jerárquica de modelo

Cuando un agente va a ejecutar, el sistema resuelve el modelo efectivo siguiendo el orden: Agency → Department → Workspace → AgentProfile → Agent → SubAgent. El nivel más específico que haya definido un modelo lo usa. Si ningún nivel superior lo define, se usa el default global de la plataforma.

### 5.3 Fallback chain jerárquica

Cada nivel puede definir una secuencia de fallback: si el modelo primario falla o supera el budget, el runtime pasa automáticamente al siguiente en la cadena. Esta cadena también se hereda y puede sobreescribirse por nivel.

### 5.4 ModelPolicy y BudgetPolicy

- `ModelPolicy`: qué modelos puede usar el nivel, cuáles prefiere, en qué orden hace fallback, qué providers están autorizados.
- `BudgetPolicy`: cuánto puede gastar por run, por día o por período. No se puede gastar más de lo que permite el nivel superior.

### 5.5 Autenticación de providers

OpenAI y otros providers que lo soporten pueden autenticarse tanto por API Key como por OAuth según la configuración de Settings. El agente usa la credencial registrada en el nivel jerárquico más cercano que la tenga disponible.

---

## 6. Core Files — Sistema de identidad y contexto jerárquico

Los Core Files son el mecanismo central que define la identidad, personalidad, memoria, tools, comportamiento y ciclo de vida de cada nivel del árbol jerárquico. Están inspirados en el sistema de OpenClaw y adaptan sus convenciones al modelo jerárquico propio del producto.

Cada nivel (Agency, Department, Workspace, Agent) tiene su propio set de Core Files. El sistema los compila, hereda y fusiona para construir el contexto final efectivo de cada agente o nivel en ejecución.

### 6.1 AGENTS.md

**Función:** Manual de operaciones del agente o nivel. Define las reglas de inicio, la secuencia de arranque, los protocolos de seguridad, la gestión de la memoria, los patrones de comportamiento en grupos de chat, las reglas de delegación y los límites de operación.

**Qué contiene por nivel:**
- Agency: reglas globales de operación, protocolos de seguridad transversales, convenciones de arranque para toda la organización.
- Department: reglas operativas del dominio, protocolos de herramientas del área, convenciones de comunicación.
- Workspace: reglas del proyecto o equipo, convenciones de naming, restricciones operativas locales.
- Agent: secuencia de arranque específica, límites de acción, comportamiento de autoevaluación, manejo de errores.

### 6.2 SOUL.md

**Función:** Define la personalidad o "alma" del agente o nivel. Contiene el tono de voz, valores fundamentales, límites de comportamiento, filosofía de trabajo y principios que guían todas las respuestas y decisiones.

**Qué contiene por nivel:**
- Agency: valores organizacionales, principios éticos globales, tono institucional.
- Department: carácter del área, estilo de comunicación profesional del dominio.
- Workspace: personalidad del equipo o proyecto.
- Agent: voz única del agente, carácter, forma de expresarse, restricciones de comportamiento personal.

### 6.3 TOOLS.md

**Función:** Lista de herramientas disponibles y notas del entorno local. Indica qué tools puede usar el agente, cómo acceder a recursos específicos, apodos SSH, rutas de proyecto, endpoints, IDs de servicios y cualquier detalle práctico del ecosistema de trabajo.

**Qué contiene por nivel:**
- Agency: catálogo de tools y servicios globales, credenciales de nivel superior, APIs transversales.
- Department: tools del dominio, endpoints del área, integraciones específicas.
- Workspace: tools del proyecto, rutas locales, servicios del entorno de trabajo.
- Agent: tools autorizadas, notas de uso, restricciones de acceso específicas.

**Herencia:** Las tools definidas en niveles superiores se heredan hacia abajo. Un Agent puede usar las tools de su Workspace, su Department y su Agency, siempre que tenga permisos. Las tools también pueden propagarse ascendentemente: si un agente define una nueva tool útil para el Workspace, puede registrarse en ese nivel y quedar disponible para los demás agentes.

### 6.4 IDENTITY.md

**Función:** Tarjeta de presentación del nivel o agente. Define nombre, concepto propio, descripción breve, emoji característico, rol y posición dentro de la jerarquía.

**Qué contiene por nivel:**
- Agency: nombre, descripción de la organización, sector, misión.
- Department: nombre del área, propósito, responsabilidades principales.
- Workspace: nombre del proyecto o equipo, objetivo, contexto.
- Agent: nombre del agente, rol, especialidad, emoji, identificador.

### 6.5 USER.md

**Función:** Perfil de la persona o sistema al que asiste el agente. Contiene nombre, zona horaria, rol, preferencias, horarios, estilo de comunicación y cualquier dato relevante para personalizar la asistencia.

**Qué contiene por nivel:**
- Agency: perfil del owner o administrador de la organización.
- Department: perfil del líder o responsable del área.
- Workspace: perfil del usuario principal del proyecto o equipo.
- Agent: perfil detallado de la persona a la que asiste directamente.

### 6.6 HEARTBEAT.md

**Función:** Lista de tareas cron que el agente genera, actualiza y ejecuta automáticamente en segundo plano según su contexto y nivel jerárquico. El `HEARTBEAT.md` no es un archivo estático que el usuario escribe manualmente: el agente lo construye y mantiene a partir de su `SOUL.md`, `AGENTS.md`, `TOOLS.md` y el contexto heredado del nivel. Al arrancar, el agente analiza su contexto y propone un conjunto de tareas periódicas que tiene sentido ejecutar dado su rol.

Cada tarea del `HEARTBEAT.md` se muestra en la vista de Routines (Zona C) con un **checkmark de activación individual**: el usuario puede activar o desactivar cada tarea de forma independiente sin eliminarla. Una tarea desactivada permanece en el archivo y puede reactivarse en cualquier momento. El usuario también puede aprobar, ajustar la expresión cron o eliminar tareas directamente desde esa vista. Los cambios se reflejan inmediatamente en las Routines activas del agente.

Las tareas definidas en `HEARTBEAT.md` se registran automáticamente como **Routines de tipo Scheduled o Condition-based** en el sistema de Routines de la plataforma, quedando visibles, monitoreables y ajustables desde la interfaz visual. Un cambio en el `HEARTBEAT.md` (por actualización del contexto del agente, cambio de nivel o aprendizaje) se refleja automáticamente en las Routines activas del agente.

**Qué contiene por nivel:**
- Agency: tareas periódicas de nivel organizacional, auditorías automáticas derivadas del rol y contexto de la Agency.
- Department: chequeos de estado del área, reportes automáticos del dominio, generados a partir del `SOUL.md` del Department.
- Workspace: monitoreo del proyecto, alertas de equipo, actualizaciones de estado, inferidas del contexto del Workspace activo.
- Agent: tareas periódicas propias del agente — ciclos de autoevaluación, recordatorios, scraping de fuentes relevantes, monitoreo de canales — generadas y actualizadas automáticamente según el contexto acumulado y los aprendizajes del agente.

### 6.7 MEMORY.md

**Función:** Memoria a largo plazo del nivel o agente. Almacena hechos duraderos, decisiones importantes, aprendizajes persistentes, restricciones aprendidas, acuerdos y contexto que debe mantenerse entre sesiones y runs.

**Qué contiene por nivel:**
- Agency: conocimiento organizacional crítico, decisiones estratégicas pasadas, restricciones globales aprendidas.
- Department: conocimiento del área, patrones exitosos, lecciones del dominio.
- Workspace: historial relevante del proyecto, errores previos, acuerdos de equipo, contexto acumulado.
- Agent: aprendizajes personales, preferencias del usuario observadas, errores evitados, conocimiento especializado acumulado.

**Gestión manual de recuerdos:**

Los recuerdos almacenados en `MEMORY.md` pueden ser revisados, editados y eliminados manualmente desde la tab `Memory` del nivel o agente en Zona C. Esta capacidad es esencial para corregir recuerdos mal guardados, eliminar información obsoleta o irrelevante, y prevenir que contexto erróneo contamine futuras ejecuciones.

- Cada recuerdo se muestra como una entrada individual con fecha, origen (run que lo generó), nivel de procedencia y texto.
- El usuario puede marcar recuerdos individuales para eliminar, editar su contenido o cambiar su alcance.
- **Propagación jerárquica de eliminaciones:** al eliminar un recuerdo en un nivel superior (Agency o Department), el sistema verifica si ese recuerdo se propagó a niveles descendientes y ofrece eliminarlo también en cascada. El usuario puede seleccionar en qué niveles aplicar la eliminación.
- **Propagación ascendente de recuerdos:** si un recuerdo generado en un Agent es relevante para el Workspace o el Department, puede promoverse manualmente hacia el nivel superior para que quede disponible para otros agentes del mismo árbol.

### 6.8 BOOTSTRAP.md

**Función:** Archivo de inicialización que se ejecuta una única vez durante el primer arranque de un nivel o workspace nuevo. Guía la configuración inicial, verifica dependencias, lanza wizards y se elimina automáticamente al completarse.

**Qué contiene:**
- Pasos de configuración inicial del nivel.
- Verificaciones de credenciales y conexiones.
- Instrucciones de onboarding para el nuevo contexto.
- Tareas de setup de herramientas, canales o integraciones.
- Condición de eliminación automática al completarse.

### 6.9 Compilación jerárquica de Core Files

Cuando un agente ejecuta un run, el runtime resuelve y fusiona los Core Files desde Agency hasta el Agent, respetando el orden de herencia y los overrides de cada nivel. Por ejemplo: un agente de contabilidad hereda el `SOUL.md` de la Agency (valores organizacionales), el del Department Finance (carácter financiero profesional) y añade el propio (personalidad específica del agente). Lo mismo aplica para `TOOLS.md`, `MEMORY.md` y el resto del set.

El editor de Core Files debe ser un componente visual central que ayude al usuario a construir estos archivos con el contexto heredado del árbol, mostrando en todo momento qué se hereda de qué nivel y qué está siendo sobreescrito.

---

## 7. Hub de Tools y Skills — Importación universal

### 7.1 Concepto

Cada nivel de la jerarquía debe poder buscar e importar tools y skills desde un Hub centralizado dentro de la plataforma. El Hub contiene el catálogo completo de tools y skills disponibles, y el usuario puede marcar o desmarcar cuáles están activas para el nivel que está configurando, de manera fácil y directa desde un panel de helpers.

### 7.2 Formato universal `.md`

Todas las tools y skills deben estar en formato `.md` universal, compatible con el estándar OpenClaw, lo que garantiza portabilidad, legibilidad y versionabilidad. Una tool o skill en `.md` define:

- Nombre y descripción.
- Input schema.
- Output schema.
- Instrucciones de uso para el agente.
- Ejemplos de invocación.
- Dependencias o configuración requerida.
- Restricciones o condiciones de uso.
- Metadatos de versión y origen.

### 7.3 Operación del Hub

- El Hub muestra todas las tools y skills disponibles en la plataforma.
- El usuario puede filtrar por categoría, dominio, tipo o compatibilidad.
- Para cada nivel (Agency, Department, Workspace, Agent), se puede abrir el Hub y seleccionar qué tools y skills están activas para ese nivel.
- Las tools y skills seleccionadas se registran en el `TOOLS.md` del nivel correspondiente.
- Las tools heredadas de niveles superiores se muestran como "heredadas" y se pueden desactivar con override explícito.
- Las tools propias del nivel se muestran como "propias" y pueden promoverse a un nivel superior si se considera útil para otros contextos.

### 7.4 Importación de tools externas

El Hub debe permitir importar tools desde fuentes externas en formato `.md` universal. Una vez importadas, quedan disponibles en el catálogo y pueden asignarse a cualquier nivel.

### 7.5 Herencia de tools

La herencia sigue el modelo jerárquico bidireccional:

**Descendente:** Una tool de Agency está disponible para todos los niveles inferiores. Una tool de Department aplica a sus Workspaces y Agents. Una tool de Workspace aplica a sus Agents.

**Ascendente:** Un Agent puede proponer una tool al Workspace. El Workspace puede promoverla al Department. El Department puede promoverla a la Agency. Esta propagación ascendente es controlada y requiere confirmación del nivel receptor.

---

## 8. Agent Templates Hub — Galería sincronizable

### 8.1 Concepto

El producto debe incluir un **Agent Templates Hub** integrado que permita importar plantillas pre-construidas de agentes, flows, departments y workspaces con un clic. Las plantillas están inspiradas principalmente en el repositorio `msitarzewski/agency-agents`, que contiene más de 144 agentes especializados organizados por divisiones.

### 8.2 Sincronización automática

El Templates Hub se conecta al repositorio de plantillas externo y sincroniza automáticamente. Cuando ese repositorio agregue nuevas plantillas, aparecen en el Hub sin actualizaciones manuales.

### 8.3 Qué incluye una plantilla

- `IDENTITY.md`: nombre, rol, emoji, descripción.
- `SOUL.md`: tono, valores, carácter.
- `AGENTS.md`: reglas operativas y protocolos.
- `TOOLS.md`: herramientas recomendadas para el rol.
- Skills sugeridas.
- Ejemplos de deliverables y success metrics.
- Etiquetas de dominio y compatibilidad.

### 8.4 Importación y adaptación

Al importar una plantilla:

1. Se muestra preview de todos los Core Files de la plantilla.
2. Se solicita el nivel jerárquico destino.
3. El sistema fusiona la plantilla con el contexto heredado del nivel seleccionado.
4. Se generan los Core Files resultantes listos para edición.
5. Se crea el agente o elemento configurado.

### 8.5 Tipos de plantillas

- Agentes especializados Las categorías de división del repositorio `msitarzewski/agency-agents` se mapean directamente como **Departments** en la jerarquía de la plataforma. Cada división del repositorio corresponde a un Department con sus agentes como miembros:

| Division (agency-agents) | Department en la plataforma |
|---|---|
| Engineering | Engineering |
| Design | Design |
| Marketing | Marketing |
| Sales | Sales |
| Product | Product |
| Finance | Finance |
| Support | Support |
| Legal | Legal |
| Operations | Operations |
| Research | Research |
| HR | Human Resources |
| Executive | Executive |

Al importar una plantilla de agente desde el Templates Hub, el sistema sugiere automáticamente el Department de destino basándose en la división de origen del template.
- Flows de trabajo predefinidos.
- Departments con múltiples agentes.
- Workspaces completos pre-configurados.

### 8.6 Formato

Las plantillas siguen el formato `.md` estándar de OpenClaw/agency-agents, compatible con Claude Code, GitHub Copilot, Cursor, OpenCode y Kimi Code.

---

## 9. Agent Builder — Constructor asistido

### 9.1 Concepto

El Agent Builder es un asistente dedicado para crear o modificar cualquier nivel de la jerarquía (Agency, Department, Workspace, Agent). No es solo un formulario: es una experiencia guiada que combina herencia jerárquica, selección de plantillas, chat asistido y configuración progresiva de tools y skills.

### 9.2 Modos de operación

**Modo formulario guiado:** El Builder presenta los campos del nuevo nivel o agente de forma progresiva, pre-llenando con los valores heredados del nivel padre. El usuario ve en todo momento qué se hereda y qué puede personalizar.

**Modo chat asistido:** El usuario puede describir en lenguaje natural qué quiere que haga el agente o el nivel. El sistema usa el contexto jerárquico activo, el catálogo de tools y skills disponibles, y las plantillas del Hub para construir automáticamente los Core Files, sugerir tools y skills relevantes, proponer un modelo LLM adecuado y generar la configuración inicial lista para revisar y confirmar.

**Modo plantilla:** El usuario selecciona una plantilla del Templates Hub, el Builder la adapta al contexto del nivel jerárquico activo y genera la configuración heredada.

### 9.3 Qué hace el Agent Builder al crear un agente

1. Identifica el nivel padre (Workspace, Department o Agency) desde el que se está creando.
2. Hereda y muestra los Core Files del padre como base.
3. Permite seleccionar una plantilla del Hub como punto de partida.
4. Si se usa modo chat: analiza la descripción del usuario, identifica el propósito del agente, sugiere tools y skills del Hub que enriquecerían sus tareas y funciones.
5. Genera `IDENTITY.md`, `SOUL.md`, `AGENTS.md`, `TOOLS.md`, `MEMORY.md` iniciales.
6. Permite asignar el modelo LLM y fallback chain de los disponibles en Settings.
7. Abre el Hub de Tools y Skills para seleccionar las capacidades del agente.
8. Genera o sugiere una Agent Card formal.
9. **Crea SubAgents opcionales:** el builder permite crear SubAgents directamente durante la creación del Agent, definiendo qué capacidades atómicas delegar. Cada SubAgent hereda el contexto del Agent y puede configurarse de forma independiente.
10. **Asigna binding de canales:** paso dedicado para configurar los canales por los que el agente recibirá y enviará mensajes. `WebChat` está siempre disponible y asignado por defecto a todo agente. El usuario puede además asignar cualquier canal configurado en Settings (WhatsApp, Telegram, Teams, Discord). Cada canal asignado admite configuración de routing: responde directo, escala al Workspace, o requiere aprobación. El binding queda registrado en el perfil del agente y puede modificarse desde la tab `Channels` del agente en Zona C.
11. Ofrece preview del agente y sus SubAgents antes de guardarlo.

### 9.4 Enriquecimiento por tools y skills

Un aspecto clave del Agent Builder es que al agregar tools y skills, el sistema sugiere automáticamente qué tareas adicionales podría resolver el agente dadas esas capacidades. Esto enriquece la definición del agente de manera incremental: a medida que el usuario añade tools, el Builder propone ampliar el `AGENTS.md` y el `SOUL.md` para cubrir los nuevos casos de uso habilitados.

### 9.5 Creación jerárquica

El Agent Builder debe funcionar en todos los niveles, no solo para agentes. Crear un nuevo Department usa el mismo flujo: hereda de la Agency, puede usar una plantilla de Department, construye sus Core Files y configura modelos. Lo mismo aplica para Workspaces.

### 9.6 Asignación de presupuesto por nivel

Cada nivel de la jerarquía puede tener un presupuesto de ejecución asignado. Esto incluye SubAgents, que heredan y pueden restringir el budget del Agent padre. El sistema soporta dos modelos de gestión presupuestaria que pueden combinarse:

**Modelo ascendente (suma al global):** Cada nivel declara su propio presupuesto y el sistema lo acumula hacia arriba. El presupuesto total de un Department es la suma de sus Workspaces. El presupuesto total de una Agency es la suma de todos sus Departments. Esto permite visibilidad consolidada del gasto real por árbol organizativo.

**Modelo descendente (límite desde Agency):** La Agency define un presupuesto base total y lo distribuye hacia abajo. A cada Department se le asigna una fracción del presupuesto de la Agency. Cada Department distribuye su porción entre sus Workspaces. Cada Workspace distribuye entre sus Agents. Un nivel no puede gastar más de lo que le ha sido asignado por el nivel superior, independientemente de lo que declare localmente.

**Reglas de operación presupuestaria:**
- Si un Agent supera su presupuesto asignado, el runtime detiene la ejecución o solicita aprobación humana antes de continuar.
- Si un Workspace agota su presupuesto, todos los Agents dentro de él quedan bloqueados hasta que se amplíe el límite o se apruebe una excepción.
- El dashboard de cada nivel muestra en tiempo real: presupuesto asignado, consumido, disponible y proyectado.
- El Agent Builder incluye un paso de asignación de presupuesto en su flujo de creación, mostrando el presupuesto disponible del nivel padre y permitiendo asignar una fracción al nuevo nivel o agente.
- Los presupuestos se expresan en USD y se calculan en base al costo real de tokens y llamadas LLM registradas por el runtime.


---

## 10. Canales de mensajería

La plataforma soporta cinco canales en su versión objetivo. Todos se gobiernan bajo los mismos principios: viven detrás del Gateway, cada canal se activa/desactiva individualmente desde Settings, el routing es por binding y por nivel jerárquico, y existen políticas comunes de DM, grupo, allowlist y pairing. La referencia funcional por canal es la semántica de OpenClaw Channels.

### 10.1 Principios transversales (todos los canales)

- Todo agente tiene **WebChat asignado por defecto**; los demás canales son opcionales y requieren activación en Settings.
- Cada canal tiene un **estado de salud** visible en Settings → Channels y en el Dashboard.
- Las políticas de seguridad (pairing, allowlist, DM policy, group policy, mention policy) se configuran por canal y pueden sobrescribirse por binding.
- Toda actividad de canal genera logs consultables en Settings → Channels → Logs y en el tab Channels del Dashboard.
- Los mensajes entrantes enrutan al agente correcto según el binding registrado en el Agent Builder.

---

### 10.2 Tabla: canal por canal — inputs, estados, logs y errores esperados

#### WhatsApp

| Dimensión | Detalle |
|---|---|
| **Base técnica** | Baileys (Node.js), runtime activo solo cuando el canal está habilitado |
| **Inputs de configuración** | Nombre identificador, pairing QR o código de emparejamiento, política DM (solo emparejados / todos), política de grupos (responder si mencionado / siempre / nunca), allowlist de números, binding a nivel/agente |
| **Autenticación** | QR pairing manual desde Settings → Channels → WhatsApp → Conectar; reconexión automática con sesión persistida en disco |
| **Estados del canal** | `active` · `pairing_required` · `disconnected` · `reconnecting` · `degraded` · `banned_risk` · `disabled` |
| **Media soportada** | Texto, imágenes, documentos, audio, video (límites de Baileys y WhatsApp) |
| **Logs generados** | QR scan, pairing exitoso, desconexión, reconexión, mensaje entrante/saliente, media entregada, error de entrega, grupo detectado, número bloqueado |
| **Errores esperados** | `QR_EXPIRED` · `SESSION_REVOKED` · `AUTH_FAILURE` · `RATE_LIMIT_WA` · `MEDIA_UPLOAD_FAILED` · `GROUP_POLICY_BLOCKED` · `NOT_ON_ALLOWLIST` · `RECONNECT_MAX_RETRIES` |
| **Troubleshooting** | Re-escanear QR, limpiar sesión persistida, verificar que el número no esté baneado, revisar allowlist, reiniciar runtime del canal |

#### Telegram

| Dimensión | Detalle |
|---|---|
| **Base técnica** | Bot API de Telegram vía grammY (Node.js) |
| **Inputs de configuración** | Bot Token (obtenido de BotFather), modo polling o webhook (según arquitectura), política de grupos (responder si mencionado / siempre), política de DM (todos / solo allowlist), allowlist de chat_ids/users, binding a nivel/agente |
| **Autenticación** | Bot Token estático, sin OAuth; validación de token al guardar en Settings |
| **Estados del canal** | `active` · `token_invalid` · `webhook_error` · `polling_error` · `disconnected` · `disabled` |
| **Media soportada** | Texto, markdown, imágenes, documentos, audio, video, stickers (read-only), inline keyboards |
| **Logs generados** | Bot iniciado, webhook registrado/fallido, mensaje entrante/saliente, update ignorado (por política), media entregada, error de entrega, group join/kick detectado |
| **Errores esperados** | `TOKEN_INVALID` · `WEBHOOK_CONFLICT` · `FLOOD_WAIT` · `BOT_KICKED` · `MESSAGE_TOO_LONG` · `MEDIA_CAPTION_TOO_LONG` · `NOT_ON_ALLOWLIST` · `POLLING_CONFLICT` |
| **Troubleshooting** | Verificar token en BotFather, resolver conflicto webhook/polling, revisar permisos del bot en el grupo, revisar allowlist |

#### WebChat

| Dimensión | Detalle |
|---|---|
| **Base técnica** | Gateway WebSocket; widget embebible en HTML; UI interna de chat en la plataforma |
| **Inputs de configuración** | Nombre del widget, binding a nivel/agente, política de acceso (público / autenticado / token), color y personalización del widget, URL allowed origins para embed, timeout de sesión, placeholder del input |
| **Autenticación** | Sin auth por defecto (visitante anónimo con session token); opcional: JWT, API token o requiere login de la plataforma |
| **Estados del canal** | `active` · `degraded` (latencia WebSocket alta) · `disabled` |
| **Media soportada** | Texto, subida de archivos (PDF, imágenes), streaming de respuesta, markdown renderizado, indicador typing |
| **Logs generados** | Sesión iniciada, mensaje enviado/recibido, archivo subido, run iniciado, run completado, timeout de sesión, error de WebSocket |
| **Errores esperados** | `WS_TIMEOUT` · `WS_CLOSED` · `SESSION_EXPIRED` · `FILE_TOO_LARGE` · `ORIGIN_NOT_ALLOWED` · `AGENT_NOT_FOUND` · `RUN_TIMEOUT` |
| **Troubleshooting** | Verificar origen permitido para embed, revisar timeout de sesión, comprobar que el agente esté activo y con binding WebChat |

#### Microsoft Teams

| Dimensión | Detalle |
|---|---|
| **Base técnica** | Bot Framework SDK; Azure Bot Service como intermediario |
| **Inputs de configuración** | Microsoft App ID, App Secret, Tenant ID (o multi-tenant), Bot Endpoint URL, política de DM, política de canal (teams/canales permitidos), allowlist de usuarios/grupos |
| **Autenticación** | OAuth con Microsoft App ID + Secret; tokens renovados automáticamente |
| **Estados del canal** | `active` · `token_expired` · `bot_unregistered` · `endpoint_unreachable` · `disabled` |
| **Media soportada** | Texto, Adaptive Cards, archivos (vía SharePoint link), menciones, tabs embebibles |
| **Logs generados** | Token renovado, mensaje recibido/enviado, Adaptive Card entregada, error de entrega, channel policy blocked, tenant no autorizado |
| **Errores esperados** | `TOKEN_REFRESH_FAILED` · `UNAUTHORIZED_TENANT` · `BOT_DISABLED_IN_CHANNEL` · `ENDPOINT_TIMEOUT` · `ADAPTIVE_CARD_SCHEMA_ERROR` · `NOT_ON_ALLOWLIST` |
| **Troubleshooting** | Renovar App Secret en Azure AD, verificar Bot Service endpoint, confirmar tenant en allowlist, revisar permisos del bot en el canal |

#### Discord

| Dimensión | Detalle |
|---|---|
| **Base técnica** | Discord Bot API + Discord Gateway (WebSocket) |
| **Inputs de configuración** | Bot Token, Client ID, Guild ID (o modo multi-guild), intents requeridos (MESSAGE_CONTENT, GUILDS, etc.), política por canal (responder en canales específicos / todos), política DM, mención obligatoria on/off, allowlist de roles/usuarios |
| **Autenticación** | Bot Token estático, validación y handshake Discord Gateway |
| **Estados del canal** | `active` · `token_invalid` · `gateway_disconnected` · `intent_missing` · `rate_limited` · `disabled` |
| **Media soportada** | Texto, embeds, archivos, imágenes, reacciones (read-only), slash commands, botones e interacciones |
| **Logs generados** | Bot online/offline, mensaje recibido/enviado, reacción detectada, slash command invocado, error de intent, guild join/leave, channel policy blocked |
| **Errores esperados** | `TOKEN_INVALID` · `MISSING_INTENT` · `MISSING_PERMISSIONS` · `RATE_LIMITED` · `MESSAGE_LENGTH_EXCEEDED` · `INTERACTION_TIMEOUT` · `NOT_ON_ALLOWLIST` |
| **Troubleshooting** | Habilitar intents privilegiados en Discord Developer Portal, verificar permisos del bot en el servidor, revisar allowlist de roles, renovar token si fue regenerado |

---

### 10.3 Settings → Channels: estructura de pantalla

Cada canal en Settings → Channels debe exponer:

- Toggle enable/disable con estado visual.
- Formulario de inputs según tabla anterior.
- Estado actual del canal con badge de color.
- Botón "Probar conexión" que ejecuta un health check real.
- Tab `Logs` con stream filtrable por nivel (info/warn/error) y por fecha.
- Tab `Bindings` con lista de agentes/workspaces/departments que usan este canal.
- Tab `Política` con DM policy, group policy, allowlist y mention policy.
- Histórico de reconexiones y errores recientes.

---

### 10.4 Dashboard → Channels

Métricas por canal en el Dashboard:

- Mensajes entrantes/salientes por canal (gráfico de barras por hora/día).
- Canal más activo del período.
- Tasa de error por canal.
- Latencia promedio de respuesta por canal.
- Estado de salud badge por canal.
- Reconexiones en el período.
- Distribución por agente/workspace/department/agency.



## 11. LLM Providers y configuración en Settings

Los providers de modelos se configuran una vez en Settings y quedan disponibles para asignarse en cualquier nivel de la jerarquía. Solo se pueden asignar modelos previamente registrados y validados. La arquitectura sigue el modelo de autenticación, auth profiles, rotación de claves y observabilidad de OpenClaw.

### 11.1 Registro de un provider en Settings

Para agregar un provider el usuario configura:

- Nombre del provider.
- Tipo de autenticación: API Key, OAuth, token, CLI backend o método externo según el provider.
- Credenciales o referencia a secreto (SecretRef: env / file / exec).
- Endpoint / baseUrl, headers y timeouts cuando aplique.
- Lista de modelos habilitados para ese provider.
- Tags de capacidad: chat, reasoning, coding, embeddings, image, video, audio, speech, search, local.
- Límites globales opcionales.

---

### 11.2 Tabla: provider por provider — auth, capacidad, nivel de asignación y campos en Settings

| Provider | Método de auth | Capacidades principales | Nivel de asignación | Campos en Settings (formulario) |
|---|---|---|---|---|
| **OpenAI** | API Key · OAuth | Chat, reasoning, coding, embeddings, image (DALL-E), speech (Whisper/TTS) | Agency · Department · Workspace · Agent | API Key, Organization ID, Project ID, base URL override, timeout |
| **Anthropic** | API Key · Claude CLI · setup-token | Chat, reasoning, coding | Agency · Department · Workspace · Agent | API Key, CLI path override, profile method selector (api_key / claude_cli / token), timeout |
| **Google (Gemini)** | API Key · OAuth (ADC) | Chat, reasoning, coding, multimodal, embeddings | Agency · Department · Workspace · Agent | API Key o Google ADC, Project ID, Region, timeout |
| **Mistral** | API Key | Chat, coding, embeddings | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **DeepSeek** | API Key | Chat, reasoning, coding | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **xAI** | API Key | Chat, reasoning | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **OpenRouter** | API Key · token paste | Chat (routing a múltiples providers) | Agency · Department · Workspace · Agent | API Key, HTTP Referer header, base URL, timeout |
| **Together AI** | API Key | Chat, coding, embeddings, image | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Groq (LPU inference)** | API Key | Chat, coding (alta velocidad) | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Fireworks** | API Key | Chat, coding, image | Agency · Department · Workspace · Agent | API Key, Account ID, base URL, timeout |
| **Cerebras** | API Key | Chat, reasoning (alta velocidad) | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Moonshot AI (Kimi)** | API Key | Chat, coding, long context | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **MiniMax** | API Key | Chat, audio, TTS | Agency · Department · Workspace · Agent | API Key, Group ID, base URL, timeout |
| **GLM models** | API Key | Chat, coding | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Qwen Cloud** | API Key | Chat, coding, multimodal | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Qianfan (Baidu)** | API Key + Secret Key | Chat, embeddings | Agency · Department · Workspace · Agent | API Key, Secret Key, base URL, timeout |
| **Alibaba Model Studio** | API Key | Chat, coding, embeddings | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Z.AI** | API Key | Chat | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Xiaomi** | API Key | Chat | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **StepFun** | API Key | Chat, image | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Volcengine (Doubao)** | API Key | Chat, multimodal | Agency · Department · Workspace · Agent | API Key, Region, base URL, timeout |
| **Tencent Cloud (TokenHub)** | API Key + Secret | Chat, embeddings | Agency · Department · Workspace · Agent | API Key, Secret Key, Region, base URL, timeout |
| **Venice (privacy-focused)** | API Key | Chat, image | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Vydra** | API Key | Chat | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Gradium** | API Key | Chat | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **BytePlus (International)** | API Key | Chat | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Chutes** | API Key | Chat | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Arcee AI (Trinity)** | API Key | Chat, coding | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Synthetic** | API Key | Chat (testing/synthetic) | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Perplexity** | API Key | Chat + web search integrado | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **GitHub Copilot** | OAuth (GitHub) | Chat, coding | Agent (individual) | GitHub OAuth token, base URL, timeout |
| **LiteLLM (unified gateway)** | API Key (proxy key) | Gateway proxy → múltiples providers | Agency · Department · Workspace | Proxy URL, API Key proxy, timeout |
| **Cloudflare AI Gateway** | API Key + Account ID | Gateway proxy, caché, logs | Agency · Department · Workspace | Account ID, Gateway ID, API Key, base URL, timeout |
| **Vercel AI Gateway** | API Key | Gateway proxy | Agency · Department · Workspace | API Key, base URL, timeout |
| **Amazon Bedrock** | AWS SDK (IAM role / key+secret) | Chat, embeddings, image | Agency · Department · Workspace · Agent | AWS Access Key + Secret, Region, assume-role ARN, timeout |
| **Amazon Bedrock Mantle** | AWS SDK | Chat (modelos Mantle) | Agency · Department · Workspace · Agent | AWS Access Key + Secret, Region, endpoint, timeout |
| **NVIDIA** | API Key | Chat, reasoning (NIM) | Agency · Department · Workspace · Agent | API Key, base URL, timeout |
| **Hugging Face (Inference)** | API Token | Chat, embeddings, image, audio | Agency · Department · Workspace · Agent | API Token, Inference endpoint URL, timeout |
| **Ollama (cloud + local)** | Sin auth (local) · API Key (cloud) | Chat, embeddings, local inference | Workspace · Agent | Base URL (ej. localhost:11434), API Key opcional, model name list, timeout |
| **LM Studio (local)** | Sin auth | Chat, local inference | Workspace · Agent | Base URL, timeout |
| **vLLM (local)** | API Key opcional | Chat, local inference, alta throughput | Workspace · Agent | Base URL, API Key, model name, timeout |
| **SGLang (local)** | Sin auth | Chat, local inference | Workspace · Agent | Base URL, timeout |
| **inferrs (local)** | Sin auth | Chat, local inference | Workspace · Agent | Base URL, timeout |
| **OpenCode** | API Key / CLI | Coding | Agent | API Key o CLI path, base URL, timeout |
| **OpenCode Go** | API Key / CLI | Coding (Go) | Agent | API Key o CLI path, base URL, timeout |
| **Kilocode** | API Key | Coding | Agent | API Key, base URL, timeout |
| **ComfyUI** | Sin auth (local) · API Key | Image generation (workflows) | Workspace · Agent | Base URL, API Key opcional, workflow defaults, timeout |
| **Azure Speech** | API Key + Region | Speech-to-text, TTS | Workspace · Agent | API Key, Resource Region, endpoint, timeout |
| **ElevenLabs** | API Key | TTS, voice cloning | Workspace · Agent | API Key, Voice ID default, base URL, timeout |
| **SenseAudio** | API Key | Speech/audio | Workspace · Agent | API Key, base URL, timeout |
| **Runway** | API Key | Video generation | Workspace · Agent | API Key, base URL, timeout |
| **fal** | API Key | Image/video generation | Workspace · Agent | API Key, base URL, timeout |

---

### 11.3 Auth profiles y gestión de secretos

La plataforma usa un almacén de perfiles de autenticación con estructura canónica `provider:profileId`. Reglas:

- El store de auth solo guarda credenciales; configuración de endpoint, modelos, headers y timeouts vive en la configuración del provider.
- Cada perfil tiene tipo: `api_key`, `oauth`, `token`, `aws_sdk`, `cli_backend`.
- Perfiles OAuth no admiten SecretRef; si el método es `oauth`, se rechaza `keyRef`/`tokenRef` estáticos.
- Soporte de **listas de API keys por provider** para rotación automática en rate-limit.
- Rotación aplica solo para errores 429 / quota / throttling / resource_exhausted; no para errores de auth.

### 11.4 Settings → Models: estructura de pantalla

| Tab | Función |
|---|---|
| **Providers** | Alta/baja de providers, endpoint, capacidades, modelos habilitados, formulario por provider (tabla anterior) |
| **Auth Profiles** | Crear/editar perfiles `provider:profileId`, elegir método, ver estado de expiración y validez |
| **Secrets** | Referencias SecretRef (env / file / exec), validación de disponibilidad |
| **Defaults** | Modelo global por defecto, fallback global, política por capacidad (chat / coding / embeddings / etc.) |
| **Per-Level Assignment** | Vista de qué modelos están habilitados por Agency / Department / Workspace / Agent |
| **Status / Probe** | Estado vivo: credenciales válidas, modelos disponibles, razones de exclusión por perfil, cooldowns |
| **Usage & Costs** | Tokens, costo USD real, proyección y budgets por provider/modelo |
| **Rotation & Cooldowns** | Claves múltiples por provider, cooldowns por modelo/profile, reglas de retry |

### 11.5 Formulario genérico de provider (placeholder universal en Settings)

Cuando se agrega un provider no listado o se configura manualmente, Settings muestra un **formulario genérico** con los campos:

```
Nombre del provider          [input text]
Base URL                     [input url]
Método de auth               [select: API Key / OAuth / Token / AWS SDK / CLI / Sin auth]
API Key                      [input password — si aplica]
Secret Key                   [input password — si aplica]
Client ID                    [input text — si aplica]
Client Secret                [input password — si aplica]
Region                       [input text — si aplica]
Extra headers                [key-value editor — si aplica]
Timeout (ms)                 [input number, default 30000]
Modelos habilitados          [tag input: lista de model IDs]
Capacidades                  [checkboxes: chat / coding / embeddings / image / video / audio / speech / search / local]
Límite de tokens/día         [input number, opcional]
Límite de costo/día (USD)    [input number, opcional]
Activo                       [toggle]
```

### 11.6 Dashboard → Models

- Modelos más usados por período.
- Tokens por modelo y por provider.
- Costo USD real por provider/modelo.
- Proyección de gasto contra budget.
- Fallbacks ocurridos entre modelos.
- Rate-limit hits por provider.
- Health por auth profile (válido / expirado / cooldown).
- Distribución de uso por agency / department / workspace / agent.



## 12. Flow Editor visual

El Flow Editor es la meta de UX central del producto. Debe ofrecer una experiencia similar a n8n y Flowise: diseño visual de flujos de trabajo agénticos, con nodos, conexiones, condiciones, tools, approvals y observación de resultados en tiempo real.

No debe ser decorativo. Debe representar rutas reales de ejecución y mapearse directamente a un runtime durable, de modo que cada nodo del flow tenga correspondencia técnica con un `RunStep`, una tool call, una llamada LLM, una pausa de aprobación o una transición de estado.

### 12.1 Tipos de nodos esperados

| Tipo de nodo | Función |
|---|---|
| Start | Punto de entrada del flow. Recibe input inicial. |
| Agent | Invoca un agente configurado. |
| LLM Call | Llamada directa a un modelo con prompt y contexto. |
| Tool | Invocación de una tool o skill específica. |
| Condition | Bifurcación condicional basada en resultado previo. |
| Approval | Pausa el flow y espera aprobación humana. |
| Memory Read | Lee memoria episódica o semántica. |
| Memory Write | Escribe o actualiza memoria. |
| RAG Retrieval | Ejecuta búsqueda semántica en knowledge base. |
| n8n Webhook | Dispara un workflow n8n externo vía API. |
| Branch | Divide el flow en ramas paralelas. |
| Merge | Consolida resultados de ramas paralelas. |
| Retry | Reintenta el nodo previo bajo condición. |
| SubAgent | Delega a un SubAgent registrado en la jerarquía del nivel activo. Ejecuta como RunStep de tipo `subagent_delegation` y persiste su resultado en el run padre. |
| Transform | Transforma el output de un nodo. |
| End | Fin del flow, consolida respuesta final. |

### 12.2 Qué muestra el Flow Editor en ejecución

- Estado de cada nodo: pending, queued, running, waiting_approval, success, failed, skipped, retrying.
- Duración por nodo en milisegundos.
- Tokens usados.
- Costo estimado o real.
- Error y stack si aplica.
- Output del nodo.
- Input resuelto que recibió.
- Modelo LLM utilizado.
- Tool invocada y argumentos.
- Fallback activado si ocurrió.
- Contexto heredado del nivel jerárquico.

### 12.3 Operación en el Flow Editor

- Crear flows arrastrando y conectando nodos.
- Conectar nodos con edges condicionales.
- Definir inputs y outputs tipados por nodo.
- Configurar fallback y retries.
- Invocar agentes o subagentes de la jerarquía.
- Integrar nodos n8n vía API.
- Simular o probar el flow antes de producción desde sandbox.
- Ver resultado por nodo al ejecutar.
- Versionar flows y comparar cambios entre versiones.
- Exportar/importar flows como plantillas al Templates Hub.

---

## 13. Runtime durable

El runtime debe ser durable, reanudable y consistente. Uno de los principales errores del repositorio actual fue la persistencia fragmentada y la mezcla de mecanismos legacy con nuevas estructuras, lo que rompía reinicios, eventos y confiabilidad.

El producto nuevo debe tener un `RuntimeStateRepository` que centralice el estado productivo en Prisma/PostgreSQL. Ningún estado crítico de ejecución debe vivir en memoria volátil.

### 13.1 Run

Todo lo que se ejecute en la plataforma queda registrado como un `Run` con identidad propia:

- `runId` único.
- `workspaceId` real y resuelto desde la jerarquía.
- Entidad originadora: usuario, canal, scheduler, API o flow.
- Estado global del run.
- Steps asociados.
- Costos acumulados.
- Tiempos de inicio y fin.
- Errores ocurridos.
- Approvals relacionados.
- Trazabilidad completa.

### 13.2 RunStep

Cada `RunStep` representa una unidad observable y persistible de ejecución: una llamada LLM, una tool call, una búsqueda semántica, una pausa de aprobación, una delegación a subagente o una transición de estado.

### 13.3 Tool loop unificado

Debe existir un único `ToolCallRuntime` compartido entre ejecución directa y ejecución por flows:

- Recibe mensajes, tools disponibles, modelo activo y fallback chain.
- Ejecuta rondas de tools iterativamente.
- Detecta loops repetidos o fallos redundantes.
- Consolida resultados y observaciones.
- Calcula uso de tokens y costo USD.
- Emite eventos para tracing y observabilidad.
- Entrega respuesta final con metadata estructurada.


### 13.5 Artifacts — Outputs nativos del runtime

Inspirado en la filosofía de Rowboat de producir trabajo concreto (no solo texto en chat), el runtime debe tratar los **Artifacts** como ciudadanos de primera clase: outputs formales, trazables y reutilizables que un run puede generar como resultado de su ejecución.

**Tipos de Artifact:**

| Tipo | Descripción | Formato |
|---|---|---|
| `document` | Documento redactado por el agente (brief, informe, propuesta) | Markdown / HTML / PDF |
| `spreadsheet` | Tabla de datos estructurada generada por el agente | CSV / XLSX |
| `code` | Código fuente generado, revisado o refactorizado | Lenguaje nativo |
| `deck` | Presentación de diapositivas | Markdown slides / HTML |
| `email_draft` | Borrador de correo electrónico listo para revisar y enviar | Markdown / HTML |
| `data_export` | Export de datos procesados por el agente | JSON / CSV |
| `image` | Imagen generada por provider de imagen | PNG / JPEG / WebP |
| `audio` | Audio generado por TTS o procesado por el agente | MP3 / WAV |
| `custom` | Cualquier output binario o estructurado no clasificado arriba | Binario + metadata |

**Ciclo de vida de un Artifact:**

1. El agente produce el artifact como resultado de una tool call o una secuencia de LLM calls.
2. El runtime registra el artifact en la tabla `Artifact` con: `artifactId`, `runId`, `runStepId`, `agentId`, `workspaceId`, `type`, `name`, `contentRef` (referencia al storage), `mimeType`, `sizeBytes`, `createdAt`, `metadata`.
3. El artifact queda visible en la tab `Runs → [RunId] → Artifacts` del nivel en Zona C.
4. También aparece en la tab `Memory` del nivel como un elemento del knowledge graph enlazable.
5. El artifact puede descargarse, compartirse por canal, enviarse como input a otro run o promoverse al nivel superior del árbol.
6. Los artifacts se indexan para búsqueda semántica: el agente puede recuperar artifacts anteriores como contexto usando `semantic_search` o `artifact_search`.

**Artifact en el Flow Editor:**

El nodo `End` del Flow Editor puede configurarse para declarar qué artifacts produce el flow. Esto permite que flows complejos generen outputs formales en lugar de solo respuestas de chat.

**Vista en el Dashboard:**

El Dashboard incluye métricas de artifacts: tipos más generados, artifacts por agente, artifacts por período, artifacts sin revisar (pendientes de aprobación humana si aplica).

---
### 13.4 HITL durable

Las aprobaciones humanas deben persistir en base de datos. Un run pausado por aprobación debe sobrevivir reinicios del backend y reanudarse desde DB cuando se apruebe o rechace. El registro incluye: `runId`, `runStepId`, `agentId`, `workspaceId`, `status`, motivo de interrupción, payload de reanudación, quién solicitó, quién aprobó, timestamps.

---

## 14. Configuración y despliegue simplificado

### 14.1 Settings centralizado

El producto tiene un menú de Settings único y claro que permite configurar todo desde un solo lugar. El objetivo es que el setup completo de una instancia nueva sea simple y guiado.

| Sección de Settings | Qué configura |
|---|---|
| LLM Providers | APIs de OpenAI (API Key + OAuth), Anthropic, DeepSeek, Qwen, Mistral, Gemini, OpenRouter. |
| Canales (Channels) | Tokens y configuración de WhatsApp, Telegram, WebChat, Teams, Discord. |
| Bases de datos | Conexión a PostgreSQL, vector store. |
| n8n Integration | URL de la instancia n8n, API key, endpoints de webhooks. |
| MCP | Configuración del servidor y cliente MCP. |
| Auth | Proveedores de autenticación (Logto, OAuth, JWT, API keys). |
| Tools & Skills Hub | Catálogo central, importación de tools externas. |
| Templates Hub | Gestión y sincronización de plantillas. |
| Storage | Configuración de almacenamiento de archivos y artefactos. |
| Observability | Endpoints de OpenTelemetry, Prometheus, Grafana. |
| Seguridad | Rate limiting, CORS, HTTPS, credenciales de cifrado. |

### 14.2 Despliegue Docker

El producto se despliega con Docker Compose de forma sencilla. Un `docker-compose.yml` bien documentado levanta todos los servicios necesarios: API, base de datos, UI, worker, y opciones para activar o desactivar componentes según lo que quiera usar el operador.

Al iniciarse por primera vez, el sistema presenta un flujo de **onboarding guiado con diseño y lógica propios de OCTO**. No está inspirado visualmente en OpenClaw ni en ningún otro producto: la UX es nativa del sistema y refleja la identidad de la plataforma.

**Principios del onboarding:**

- **No bloqueante:** el usuario puede omitir o cerrar el onboarding en cualquier momento y entrar directamente a la plataforma. El sistema funciona sin haberlo completado.
- **Rellamable:** disponible en cualquier momento desde `Settings → General → Onboarding`. Útil para reconfigurar providers, revisar canales o introducir nuevos miembros del equipo.
- **Progresivo:** dividido en pasos opcionales independientes, cada uno con su propio estado de completado. No requieren completarse en orden.
- **Contextual:** al rellamarse, detecta qué pasos ya están configurados y marca su estado.

**Pasos del onboarding (todos opcionales):**

1. **Bienvenida:** explicación de la jerarquía `Agency → Department → Workspace → Agent → SubAgent` y la filosofía de OCTO como sistema operativo de agentes.
2. **Primer LLM Provider:** configurar al menos un provider con su API key.
3. **Primera Agency:** crear la Agency raíz del árbol de agentes.
4. **Primer Agent:** crear un agente básico, asignarle modelo y probarlo con un mensaje.
5. **Primer Canal (opcional):** conectar un canal de mensajería externo.
6. **Core Files (opcional):** familiarizarse con el sistema de Core Files y cómo afectan el comportamiento de los agentes.
7. **Listo:** resumen del estado actual con accesos directos a las secciones relevantes.

---

## 15. Herencia jerárquica de contexto y propagación

### 15.1 Herencia descendente

La configuración fluye de Agency hacia Agent. Cuando se define algo en un nivel superior, todos los descendientes lo heredan automáticamente a menos que lo sobreescriban explícitamente. Esto aplica a prompts, tools, modelos, policies, memoria, canales y Core Files.

### 15.2 Propagación de cambios en cascada

Cuando se modifica un elemento en un nivel jerárquico, el cambio se propaga hacia abajo a todos los descendientes afectados. Si una Agency agrega un nuevo Department, todos los Workspaces bajo ese Department reciben la configuración correspondiente. Si se elimina un Department, los Workspaces y Agents descendientes pierden esa capa de contexto de forma controlada y el sistema recalcula la configuración efectiva automáticamente.

### 15.3 Propagación ascendente

Cuando un Agent necesita resolver algo que supera su capacidad o alcance, escala hacia arriba. Si se le pide a un agente una tarea que no puede resolver solo, sube la solicitud al Workspace. Si el Workspace tampoco la puede gestionar, asciende al Department y, si es necesario, a la Agency. Este mecanismo es también la base del routing inteligente y la delegación jerárquica en conversaciones y runs.

### 15.4 Vista jerárquica filtrada

La interfaz visual debe permitir al usuario posicionarse en cualquier nivel y ver únicamente el subárbol correspondiente desde ese punto hacia abajo. Los cambios realizados en cualquier vista se propagan correctamente según las reglas de herencia.

---

## 16. Memoria, RAG y Context Engineering

### 16.1 Context budget

El sistema estima tokens antes de cada llamada LLM, conoce los límites del modelo activo y comprime historial cuando sea necesario, preservando instrucciones, intención y observaciones relevantes.

### 16.2 Memoria episódica

Los agentes recuperan experiencias de runs anteriores cuando la memoria está habilitada: runs similares, errores previos, tools exitosas, decisiones humanas pasadas, restricciones aprendidas. Todo se resume e inyecta como contexto antes del loop principal.

### 16.3 RAG real

La `knowledgeBase` se convierte en retrieval real basado en chunking, embeddings y recuperación híbrida (keyword + vector). La plataforma incluye ingesta, construcción de `KnowledgeChunk`, indexación, filtros y exposición del retrieval como tool `semantic_search`.


### 16.4 Context engineering jerárquico

El contexto también se construye por nivel. Si una Agency define documentos de conocimiento base, todos los agentes del árbol los heredan. Si un Department tiene guías de dominio, sus agentes las reciben. El contexto crece aditivamente conforme se desciende, y se elimina en cascada si se elimina el nivel que lo define.


### 16.5 Memoria visible — Markdown/backlinks (inspirado en Rowboat)

Además de la memoria episódica en base de datos, el sistema debe mantener una **capa de memoria visible, legible y editable por humanos**, inspirada en el vault Markdown/backlinks de Rowboat. Esta capa complementa el `MEMORY.md` de los Core Files con una representación navegable e inspeccionable del conocimiento acumulado por nivel.

**Principios:**

- La memoria de cada nivel (Agency, Department, Workspace, Agent, SubAgent) tiene una vista Markdown renderizada en la plataforma, accesible desde la tab `Memory` de Zona C.

Esta misma lógica aplica para los **Core Files** (sección 5): los archivos `IDENTITY.md`, `SOUL.md`, `AGENTS.md`, `TOOLS.md`, `USER.md`, `HEARTBEAT.md`, `MEMORY.md` y `BOOTSTRAP.md` son Markdown nativo, editables directamente desde la tab `Core Files` de Zona C de cada nivel. La edición humana directa de Core Files es parte del diseño del sistema: el usuario puede modificar el contexto, instrucciones y personalidad del agente en texto plano, y el runtime los compila como parte del contexto efectivo en el siguiente run. Los Core Files son la primera capa de la memoria visible y editable del sistema.
- Los recuerdos se almacenan con backlinks: si un recuerdo menciona un agente, un run, un goal o un artefacto, ese elemento queda enlazado y navegable desde la vista de memoria.
- El usuario puede leer, editar, eliminar o promover recuerdos directamente en esta vista sin tocar la base de datos manualmente.
- Los recuerdos tienen tres representaciones: la entrada estructurada en PostgreSQL (para retrieval y queries), el embedding vectorial (para búsqueda semántica), y la nota Markdown con backlinks (para inspección y edición humana). Las tres se mantienen sincronizadas.
- Esta vista es compatible con exportación a Obsidian: el usuario puede descargar la memoria de cualquier nivel como un vault `.md` navegable con backlinks intactos.

**Lo que NO se copia de Rowboat:** el vault Obsidian no reemplaza la persistencia durable en PostgreSQL. Es una capa de visualización y edición sobre la base real. El núcleo del sistema sigue siendo Run, RunStep, colas, checkpoints y estado durable.

### 16.6 Knowledge Graph acumulativo por nivel

El sistema debe construir progresivamente un **knowledge graph** por nivel jerárquico, conectando entidades relacionadas: agentes, runs, artefactos, goals, tools usadas, errores repetidos, decisiones humanas y conocimiento del dominio.

**Estructura del grafo:**

- **Nodos:** Agent, Run, Artifact, Goal, Tool, Memory entry, Knowledge chunk, RunStep relevante.
- **Edges:** `produced`, `used_tool`, `referenced_in`, `resolved_by`, `contributed_to_goal`, `generated_artifact`, `caused_error`, `corrected_by`.
- El grafo crece automáticamente con cada run completado, aprobación resuelta, artefacto generado y recuerdo consolidado.
- Es consultable como herramienta interna del agente: `knowledge_graph_search(query, nodeTypes, level)`.
- Se visualiza en el Dashboard del nivel como un panel de grafo navegable (tipo D3/Sankey) cuando hay suficientes nodos para justificarlo.

**Cuándo activarlo:** el knowledge graph tiene valor real cuando hay runs suficientes para poblar relaciones útiles. Se activa de forma incremental a partir de F5 (Memoria/RAG maduro), no antes.

### 16.7 Live Notes — Notas automáticas actualizadas por el agente

Las **Live Notes** son documentos de conocimiento vivo que el agente genera y actualiza automáticamente a partir de los runs, recuerdos y contexto acumulado del nivel. No son notas manuales del usuario: el agente las redacta, estructura y mantiene al día como parte de su ciclo de vida.

**Características:**

- Cada nivel puede tener un conjunto de Live Notes: resumen del estado del área, decisiones recientes, aprendizajes del período, errores evitados, patrones detectados.
- Las Live Notes se actualizan al final de cada run relevante, cuando hay cambios en Goals activos, y en las Routines periódicas del agente.
- Son legibles y editables por el usuario desde la tab `Memory` del nivel en Zona C.
- Pueden inyectarse como contexto en futuros runs del mismo nivel.
- Se renderizan en Markdown y soportan backlinks a otros elementos del knowledge graph.

**Cuándo activarlo:** Live Notes dependen de ingesta madura, routines estables y knowledge pipelines probados. Se introducen en F5/F6, no en F3.

---

---

## 17. Multi-agent

### 17.1 Modos de colaboración

| Modo | Descripción |
|---|---|
| Supervisor | Un agente decide qué agente actúa según la tarea. |
| Delegación | Un agente pasa una subtarea a otro más especializado. |
| GroupChat | Varios agentes discuten antes de consolidar respuesta. |
| Debate | Agentes especializados presentan perspectivas distintas. |
| Replanning | Si una subtarea falla, el supervisor replanifica el tramo afectado. |
| Routing semántico | Matching por embeddings y capacidades de agentes. |

### 17.2 Agent Cards

Cada agente tiene una Agent Card formal: identidad, descripción, capacidades, tools, restricciones, perfil de costo y ownership. Sirve para routing, interoperabilidad, auditoría y visualización del mapa de capacidades.

### 17.3 Routing y delegación jerárquica

El routing multi-agente opera en coherencia con la jerarquía. Cuando llega una tarea, el sistema determina el nivel correcto de entrada, luego busca el agente más adecuado dentro de ese subtárbol usando embeddings de capacidades para un matching semántico preciso.

---

## 18. Protocolos externos

### 18.1 n8n como complemento API

n8n no es el motor principal sino un complemento conectado por API. La plataforma dispara workflows n8n, recibe resultados, mapea entradas/salidas y correlaciona la ejecución con el run interno. Todo queda trazado en el timeline del run.

### 18.2 MCP

MCP es la capa oficial para exponer o consumir tools externas. Incluye registro de tools, autenticación, mapping Skill ↔ MCP Tool y observabilidad por llamada.

Inspirándose en el modelo de extensibilidad de Rowboat, MCP no debe tratarse solo como protocolo técnico sino como la **vía principal de extensibilidad del ecosistema**: cualquier herramienta externa relevante (búsqueda web vía Exa, bases de datos, APIs SaaS, servicios de voz, repositorios de código) entra al sistema por MCP o por el Hub de Tools con formato `.md`, nunca por integraciones ad-hoc directas. Esto garantiza que el ToolRegistry, ToolGuard, permisos, retries, approval hooks y observabilidad por llamada apliquen de forma uniforme a toda tool, sin excepciones. Cada servidor MCP registrado en Settings expone sus tools al catálogo del Hub y queda disponible para asignación en cualquier nivel de la jerarquía.

### 18.3 A2A

En fases avanzadas, la plataforma soporta interoperabilidad agent-to-agent: describir capacidades, descubrir agentes remotos, enviar tareas, observar estado y recibir resultados por contratos estandarizados.

Adicionalmente, desde el Agency Flow se deben permitir **conexiones horizontales** entre entidades del mismo ecosistema, sin necesidad de pasar por el canal jerárquico descendente. Estas conexiones horizontales contemplan los siguientes casos:

- **Agent → Agent:** Un agente completa una tarea y la entrega directamente a otro agente del mismo nivel o de otro Workspace, sin escalar al supervisor ni recorrer la jerarquía completa.
- **Workspace → Workspace:** Un Workspace puede delegar una tarea o transferir un resultado a otro Workspace dentro del mismo Department o de otro Department de la misma Agency.
- **Department → Department:** Dos Departments pueden colaborar directamente, donde uno inicia una tarea y el otro la recibe, la procesa y devuelve el resultado, sin que la Agency actúe como intermediario obligatorio.

Estas conexiones horizontales deben ser explícitas, configurables y trazables. No son rutas implícitas: deben definirse en el Flow Editor o en la configuración del nivel correspondiente, con contratos claros de input/output, permisos de acceso entre niveles y registro completo en el timeline del run. El sistema debe validar que el nivel origen tiene autorización para conectarse con el nivel destino antes de ejecutar la transferencia.

**Escalación jerárquica y HITL automático:**

Cualquier nivel de la jerarquía (`Agency`, `Department`, `Workspace`, `Agent`, `SubAgent`) tiene **autonomía completa para solicitar una escalación**, tanto ascendente (hacia un nivel superior de autoridad) como descendente (delegación hacia un nivel más especializado). La capacidad de solicitar escalación es una propiedad nativa de todos los nodos del grafo cognitivo.

Sin embargo, toda escalación — sea ascendente o descendente — **activa automáticamente un paso HITL** antes de ejecutarse:

- El run se pausa en el punto de escalación.
- Se registra un `RunStep` de tipo `escalation_request` con: nivel origen, nivel destino, dirección (`ascendente` / `descendente`), motivo declarado por el agente, payload de contexto relevante.
- El operador o supervisor humano del nivel destino recibe la solicitud de aprobación en su cola de HITL.
- Si aprueba: la escalación se ejecuta y el run continúa desde el nivel destino.
- Si rechaza: el run regresa al nivel origen con el motivo del rechazo como contexto adicional para replanning.
- Si no hay respuesta en el timeout configurado: se aplica la política de escalación por defecto del nivel (`auto-approve`, `auto-reject` o `suspend`).

**Rationale:** la autonomía de solicitar escalación pertenece al agente; la autoridad de aprobar la transferencia pertenece al humano o al nivel supervisor. Esta separación garantiza que el sistema puede operar de forma autónoma sin sacrificar control y trazabilidad sobre los movimientos de autoridad entre niveles.

---

## 19. Seguridad y confianza

| Componente | Función |
|---|---|
| ToolGuard | Valida nombre, argumentos, permisos y scope de toda tool call antes de ejecutarla. |
| Prompt Injection Detector | Detecta instrucciones maliciosas antes de acciones sensibles. |
| Output Guardrails | Valida la salida final del agente antes de entregarla. |
| Audit Log | Registra acciones sensibles con trazabilidad completa. |
| Hardening HTTP | helmet, rate limiting, CORS restrictivo, headers de seguridad. |
| HITL Approval Rules | Pausa automática ante acciones críticas que requieren revisión humana. |

---

## 20. Observabilidad

### 20.1 OpenTelemetry

Spans mínimos: `run.start`, `run.step`, `llm.call`, `tool.call`, `tool.error`, `approval.wait`, `n8n.workflow`, `mcp.call`, `fallback.model`, `context.compress`, `rag.retrieve`.

### 20.2 Visual Run Debugger

Timeline por run:

```
User input
  ↓ Agente seleccionado
  ↓ Perfil compilado (Core Files resueltos)
  ↓ Contexto cargado (memoria + RAG + jerarquía)
  ↓ LLM call
  ↓ Tool call
  ↓ Observación
  ↓ Retry / Fallback
  ↓ Approval wait
  ↓ Reflexión / Replanning
  ↓ Respuesta final
```

### 20.3 Métricas esperadas

Latencia total, latencia por step, tokens input/output, costo USD, tool rounds, failed tool calls, fallback usado, approval wait time, retrieval latency, context compression count, evaluaciones de calidad.

---

## 21. Logs esperados

| Tipo de log | Contenido |
|---|---|
| Run start | runId, workspaceId, agentId, origen, timestamp |
| Run step change | runId, runStepId, tipo, estado previo, estado nuevo |
| LLM call | modelo, provider, tokens, costo, latencia, input hash |
| Tool call | tool, args hash, status, latencia, costo |
| Tool error | tool, args, error, ronda del loop |
| Fallback | modelo original, modelo fallback, motivo |
| Context compress | tokens antes/después, estrategia |
| RAG retrieve | query, topK, latencia, resultados count |
| Approval | runId, agentId, motivo, who requested, who resolved, timestamps |
| Security | tipo, agentId, acción bloqueada, risk score |
| n8n dispatch | workflowId, input, correlación con runId |
| MCP call | tool, args, latencia, status |
| Channel message | canal, origen, agentId resuelto, workspaceId |
| Cost per run | total USD, tokens in/out, provider, breakdown por step |

---

## 22. Capacidades nativas de visualización y observabilidad del grafo de agentes

Las funciones de visualización del grafo de agentes, trazabilidad de ejecuciones, navegación de logs y representación de la topología jerárquica son **capacidades nativas de OCTO**, construidas directamente en el repositorio. No son integraciones con herramientas externas: son features propias del sistema, inspiradas conceptualmente en proyectos de referencia (Lattice, AgenticLens, AgentNeo, Neurite, noaide, WorkGraph), pero implementadas como parte del producto.

**Principio:** toda función de observabilidad, visualización de grafo y navegación de ejecuciones debe vivir en `packages/observability`, `packages/agent-core/graph` o en la capa de Presentation (`apps/web`), integrada con el Runtime y el Control Plane. Ninguna de estas capacidades depende de binarios externos, CLIs de terceros ni servidores adicionales.

La inspiración de cada referencia se consolida así en funciones nativas de OCTO por interacción de agentes y jerarquías:

---

### 22.1 Tabla comparativa de herramientas externas

| Inspiración original | Función nativa en OCTO | Ubicación en el repo | Activación |
|---|---|---|---|
| **Lattice** (grafo de topología) | **Agent Topology Graph:** vista interactiva del árbol `Agency → Department → Workspace → Agent → SubAgent` como grafo navegable con nodos, edges de delegación y estado en tiempo real. | `apps/web` + `packages/agent-core/graph` | Dashboard → Topology View |
| **Neurite** (graph-of-thought) | **Knowledge Graph View:** visualización del knowledge graph acumulativo por nivel con nodos (Agent, Run, Artifact, Goal, Tool, Memory) y edges tipados. Navegable e interactivo. | `apps/web` + `packages/agent-core/graph` | Dashboard → Knowledge → Graph View |
| **AgentNeo** (trazabilidad de ejecución) | **Run Execution Graph:** grafo histórico de ejecución paso a paso por run, mostrando cada RunStep como nodo: LLM call, tool call, subagent delegation, approval, fallback, retrieval. | `packages/observability` + `apps/web` | Runs → [RunId] → Execution Graph |
| **noaide** (topología de equipos) | **Agent Message Flow View:** visualización del flujo de mensajes entre agentes en un run multi-agent: quién delegó, a quién, con qué payload y resultado. Muestra jerarquía activa durante la ejecución. | `apps/web` + `packages/observability` | Runs → [RunId] → Message Flow |
| **AgenticLens** (walk-through de logs) | **Run Debugger Step-Through:** navegación paso a paso del timeline de un run a partir de RunSteps persistidos. Permite avanzar, retroceder y filtrar eventos. Exportable como JSONL desde `GET /api/runs/:runId/logs.jsonl`. | `apps/web` + `packages/observability` | Runs → [RunId] → Debugger |
| **WorkGraph** (grafo de desarrollo) | **Dev Knowledge Graph:** grafo de conocimiento técnico del sistema, conectando runs de desarrollo, artifacts generados, patrones de prompts y habilidades del agente. Visible desde la tab `Knowledge` del nivel. | `packages/agent-core/graph` + `apps/web` | Dashboard → Knowledge → Dev Graph |

---

### 22.2 Integración arquitectónica

#### Lattice — Grafo de topología del sistema

Lattice actúa como una **capa de lectura externa** del árbol de agentes. Para que Lattice detecte correctamente la estructura de OCTO, el sistema debe exponer la topología del árbol en un formato estándar reconocible:

- Exportar un archivo de manifiesto de agentes por Workspace en formato compatible con Lattice (JSON con nodos y edges).
- El Flow Editor debe poder exportar el grafo de un flow en formato compatible.
- El Agent Builder, al crear un agente o SubAgent, actualiza el manifiesto del Workspace correspondiente.

**Resultado esperado:** Un operador ejecuta `npx lattice-agents ./` y ve el árbol Agency → Department → Workspace → Agent → SubAgent como un grafo interactivo navegable, con nodos por agente y edges por conexiones de flow o delegación.

#### AgenticLens — Análisis post-mortem de logs

El runtime debe emitir logs en formato **JSONL estructurado** por run, compatible con AgenticLens. Cada evento del timeline del run (LLM call, tool call, approval, subagent delegation, fallback) se emite como una línea JSON con:

```json
{
  "timestamp": "ISO8601",
  "runId": "uuid",
  "runStepId": "uuid",
  "type": "llm_call | tool_call | subagent_delegation | approval | fallback | rag_retrieve",
  "agentId": "uuid",
  "subagentId": "uuid | null",
  "workspaceId": "uuid",
  "payload": { ... },
  "durationMs": 123,
  "tokensIn": 0,
  "tokensOut": 0,
  "costUSD": 0.0,
  "status": "success | error | skipped"
}
```

El sistema debe incluir un endpoint de exportación: `GET /api/runs/:runId/logs.jsonl` que entregue el log completo del run en formato JSONL. Esto permite abrir cualquier run fallido o sospechoso en AgenticLens sin intervención manual.

#### AgentNeo — Trazabilidad profunda con SDK

Para runs que se ejecuten con workers Python (por ejemplo, a través del nodo `Tool` del Flow Editor que invoca un script Python), el SDK de AgentNeo puede instrumentar esa ejecución y enviar los spans al dashboard de AgentNeo. La correlación con el run interno se mantiene via `runId` como metadata del trace.

#### noaide — Visualización de equipos Claude Code

Cuando el sistema utiliza equipos de Claude Code como SubAgents o workers externos, noaide puede visualizar la topología de esos equipos y el flujo de mensajes. La integración es indirecta: noaide lee la configuración de Claude Code, y OCTO registra los resultados del equipo como `RunStep` de tipo `external_agent_result`.

#### WorkGraph — Memoria técnica del desarrollo

WorkGraph no se integra en el runtime de producción sino en el flujo de desarrollo del sistema mismo. El equipo de desarrollo usa WorkGraph para registrar sesiones de código, conectar patrones y mantener un grafo de conocimiento técnico del proyecto. Esto es especialmente útil para onboarding de nuevos colaboradores y para rastrear la evolución de la arquitectura.

---

### 22.3 Formato JSONL estándar de logs del runtime

El runtime debe garantizar la emisión de logs en formato JSONL por defecto para todos los runs. Este formato sirve para:

- Alimentar AgenticLens en análisis post-mortem.
- Exportar trazas a sistemas de observabilidad externos (Datadog, Grafana Loki).
- Alimentar pipelines de entrenamiento o fine-tuning futuro.
- Auditoría y compliance.

El endpoint de exportación `GET /api/runs/:runId/logs.jsonl` debe estar disponible desde la primera fase del runtime. El Run Debugger en Zona C incluye un botón "Exportar logs JSONL" que descarga el archivo para análisis externo.

---

### 22.4 Comparativa: observabilidad interna vs. herramientas externas

| Dimensión | Observabilidad interna (Run Debugger + Dashboard) | Herramientas externas |
|---|---|---|
| **Latencia de datos** | Tiempo real (WebSocket/SSE) | Post-run (logs exportados) |
| **Scope** | Runs, pasos, tokens, costos, aprobaciones | Grafos de topología, ejecución histórica |
| **Integración** | Nativa, sin setup adicional | Requiere setup o exportación |
| **Granularidad** | Por step, por tool call, por token | Por run, por sesión, por agente |
| **Mejor para** | Monitoreo operacional en tiempo real | Post-mortems, diseño, revisión de arquitectura |
| **Formato de salida** | Dashboard visual en la plataforma | Web app separada, grafo interactivo |

---


## 23. Evals y regresión

El `eval-engine` mide routing, uso de tools, seguridad, costo y cumplimiento de tareas mediante fixtures definidos y rubrics. Las suites de regresión cubren: tool loop success/failure, fallback de modelo, HITL, RAG, prompt injection block, routing multi-agente, compresión de contexto y output guard.

---

## 24. Organización de menús y navegación

Los menús se organizan como iconos en la **Zona A** con acordeón de submenús. Cada menú filtra por Zona B y carga su vista en Zona C con tabs horizontales. A continuación se detalla cada menú, sus submenús en Zona A y los tabs disponibles en Zona C.

---

### 🏢 Hierarchy

**Submenús en Zona A (árbol jerárquico):**
```
🏢  Hierarchy             ›
    └─ [Agency]
        ├─ [Department]
        │   ├─ [Workspace]
        │   │   └─ [Agent]
        │   │       └─ [SubAgent]
        │   └─ [Workspace]
        └─ [Department]
            └─ [Workspace]
                └─ [Agent]
                    └─ [SubAgent]
```
Al seleccionar cualquier nodo del árbol, la Zona C carga la vista de ese nivel con tabs horizontales:

**Tabs en Zona C — nivel Agency:**
`Overview` · `Core Files` · `Departments` · `Models & Budget` · `Channels` · `Policies` · `Goals` · `Routines` · `Settings`

**Tabs en Zona C — nivel Department:**
`Overview` · `Core Files` · `Workspaces` · `Models & Budget` · `Goals` · `Routines` · `Policies`

**Tabs en Zona C — nivel Workspace:**
`Overview` · `Core Files` · `Agents` · `Flows` · `Runs` · `Memory` · `Knowledge` · `Artifacts` · `Models & Budget` · `Goals` · `Routines` · `Channels`

**Tabs en Zona C — nivel Agent:**
`Profile` · `Core Files` · `Identity` · `Soul` · `Tools & Skills` · `Models & Budget` · `Memory` · `Live Notes` · `Artifacts` · `Runs` · `Channels` · `Routines` · `Heartbeat` · `SubAgents` · `Evals`

**Tab Agent Builder** (disponible en cualquier nivel como acción de creación de nodo hijo):
Wizard guiado con modos: Formulario / Chat asistido / Plantilla.

---

### ⚡ Flows

**Submenús en Zona A:**
```
⚡  Flows                 ›
    ── All Flows
    ── By Workspace
    ── By Department
    ── Templates
    ── Archived
```
**Tabs en Zona C — vista de Flow:**
`Editor` · `Versiones` · `Ejecuciones` · `Sandbox` · `Settings del Flow`

**Tabs en Zona C — Editor de nodo seleccionado:**
`Properties` · `Input/Output` · `Logs` · `Retry Config`

---

### ▶️ Runs

**Submenús en Zona A (árbol jerárquico de ejecuciones):**
```
▶️  Runs                  ›
    ── Active
    ── Completed
    ── Failed
    ── Paused (Approval)
    ── Scheduled
    ── By Agent
    ── By Channel
    ── By Routine
```
**Tabs en Zona C — detalle de un Run:**
`Timeline` · `Steps` · `Tools Used` · `LLM Calls` · `Tokens & Cost` · `Context` · `Approvals` · `Logs` · `Trace`

La vista de Timeline muestra el flujo completo:
```
User input → Agent selected → Core Files compiled → Context loaded
→ LLM call → Tool call → Observation → Retry/Fallback
→ Approval wait → Replanning → Final response
```

---

### 📊 Dashboard

**Submenús en Zona A (árbol jerárquico para filtrar nivel):**
```
📊  Dashboard             ›
    └─ [Agency]
        ├─ [Department]
        └─ [Department]
            └─ [Workspace]
```
**Tabs en Zona C — Dashboard:**
`Overview` · `Costs & Budget` · `Models` · `Channels` · `Agents` · `Runs` · `Tools` · `Goals` · `Routines` · `Approvals` · `Evals`

Cada tab contiene los gráficos relevantes para esa categoría, configurables con drag & drop y filtros temporales.

---

### 🔧 Tools & Skills Hub

**Submenús en Zona A:**
```
🔧  Tools & Skills Hub    ›
    ── All
    ── Tools
    ── Skills
    ── Custom (creadas en esta instancia)
    ── Inherited (del nivel superior)
    ── By Domain
    ── Import
```
**Tabs en Zona C — vista de una Tool o Skill:**
`Definition` · `Schema (Input/Output)` · `Usage Instructions` · `Examples` · `Assigned Levels` · `Version History`

**Tabs en Zona C — vista de Hub general:**
`Catalog` · `Active` · `Inactive` · `Import` · `Create New`

---

### 📋 Templates Hub

**Submenús en Zona A:**
```
📋  Templates Hub         ›
    ── Agents
    ── Flows
    ── Departments
    ── Workspaces
    ── Dashboards
    ── Skills
    ── Tools
    ── Sync Status
```
**Tabs en Zona C — vista de una Plantilla:**
`Preview` · `Core Files` · `Tools & Skills` · `Import` · `Version`

**Tabs en Zona C — vista general:**
`All Templates` · `Agents` · `Flows` · `Dashboards` · `Sync`

---

### 🔁 Routines

**Submenús en Zona A (árbol jerárquico con conteo):**
```
🔁  Routines              ›
    └─ [Agency] (12 active)
        ├─ [Department] (4)
        └─ [Department] (8)
            └─ [Workspace] (3)
                └─ [Agent] (2)
```
**Tabs en Zona C — vista de una Routine:**
`Lista` · `Cron / Condición` · `Flow Asociado` · `Historial` · `Logs`

**Tabs en Zona C — vista general del nivel:**
`Active` · `Paused` · `Failed` · `Scheduled` · `Auto-generated (Heartbeat)` · `Inherited`

---

### 🎯 Goals

**Submenús en Zona A (árbol jerárquico con estado):**
```
🎯  Goals                 ›
    └─ [Agency] 🟡
        ├─ [Department] 🟢
        └─ [Department] 🔴
            └─ [Workspace] 🟡
```
**Tabs en Zona C — vista de un Goal:**
`Detail` · `Metrics` · `Subgoals` · `Runs Linked` · `History`

**Tabs en Zona C — vista general del nivel:**
`Overview` · `Active` · `Completed` · `At Risk` · `Cancelled`

---

### ✅ Approvals

**Submenús en Zona A:**
```
✅  Approvals             ›
    ── Pending
    ── Resolved
    ── Escalated
    ── Rules (HITL config)
    ── By Agent
    ── By Level
```
**Tabs en Zona C — detalle de una Approval:**
`Request Detail` · `Run Context` · `Agent Info` · `Action` · `History`

**Tabs en Zona C — vista general:**
`Pending` · `Resolved` · `Escalated` · `Rules`

---

### ⚙️ Settings

**Submenús en Zona A (planos, sin árbol jerárquico):**
```
⚙️  Settings              ›
    ── Models
    ── Channels
    ── APIs
    ── n8n
    ── MCP
    ── Auth
    ── Storage
    ── Security
    ── Observability
    ── Onboarding
```
**Tabs en Zona C — todos los tabs de Settings visibles horizontalmente:**
`Models` · `Channels` · `APIs` · `n8n` · `MCP` · `Auth` · `Storage` · `Security` · `Observability` · `Onboarding`

Al hacer clic en un submenú de Settings desde Zona A, se abre Zona C con todos los tabs visibles y el tab correspondiente activo. Se puede navegar entre tabs sin volver a Zona A.

- **Models:** registro de providers (OpenAI API Key/OAuth, Anthropic, DeepSeek, Qwen, Mistral, Gemini, OpenRouter), modelos disponibles por provider, default global, fallback global.
- **Channels:** configuración de WhatsApp (Baileys), Telegram (grammY), WebChat, Teams, Discord. Token, webhook, pairing, allowlist, dmPolicy.
- **APIs:** API Keys de la plataforma, scopes, expiración, rotación.
- **n8n:** URL de instancia, API key, webhooks configurados, test de conexión.
- **MCP:** registro de servidores MCP, autenticación, tools expuestas/consumidas.
- **Auth:** providers de autenticación (Logto, OAuth, JWT), roles, permisos.
- **Storage:** configuración de almacenamiento de archivos, artefactos y knowledge base.
- **Security:** rate limiting, CORS, HTTPS, hardening, credenciales de cifrado.
- **Observability:** endpoints OpenTelemetry, Prometheus, Grafana, nivel de logging. Incluye sección de integración externa con Lattice (manifiesto de agentes), exportación JSONL de runs para AgenticLens, y configuración de endpoints externos de trazas.
- **Onboarding:** wizard de configuración inicial, estado de setup, reset.

---

## 25. Qué toma OCTO de cada referencia

| Referencia | Qué adopta el producto |
|---|---|
| **OpenClaw** | Core Files (AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md, MEMORY.md, BOOTSTRAP.md), modelo de canales (WhatsApp/Telegram/WebChat/Teams/Discord), formato SKILL.md, multi-channel routing, modelo de providers y autenticación. |
| **agency-agents** | Galería de 144+ plantillas de agentes especializados, formato de template, categorías por división, sincronización automática con el repo externo. |
| **CrewAI** | Agentes con rol, backstory, goal, delegación, crews y planificación orientada a colaboración especializada. |
| **LangGraph** | Durable execution, checkpoints, stateful orchestration, nodos/edges con lógica explícita, HITL e inspección de ejecución paso a paso. |
| **Flowise** | Builder visual de agentes, RAG visual, experiencia low-code para construir y probar sistemas agénticos. |
| **Semantic Kernel** | Plugins/funciones con contrato, memory abstractions, semantic retrieval, prompt templates, AgentProfile. |
| **Hermes Chief of Staff** | Agente coordinador, planificación de subtareas, priorización y orquestación jerárquica de trabajo. |
| **Microsoft Agent Framework** | Multi-agent workflows, MCP, A2A, HITL, protocolos, declarative agents. |
| **n8n** | Flow editor visual, inspector de ejecuciones, retries, integraciones y estados claros por nodo. Integrado como complemento por API. |
| **AutoGen** | GroupChat, manager patterns, speaker selection, debate entre agentes. |
| **Paperclip** | Evals, budgets, governance, cost tracking, cultura de regresión y modelo de providers LLM. |
| **Rowboat** | Memoria persistente visible en Markdown/backlinks Obsidian-compatible, knowledge graph acumulativo por nivel, artifacts como output nativo del runtime, extensibilidad vía MCP como vía principal, bring-your-own-model con Ollama/LM Studio, Live Notes automáticas. |

---

## 26. Resultados que debe mostrar el sistema

### Al usuario final
- Respuesta del agente.
- Estado del run.
- Evidencia de tools usadas cuando aplique.
- Archivos o artefactos generados.
- Mensaje de error controlado si falló.
- Solicitud de aprobación si la tarea requiere intervención humana.

### Al builder y administrador
- Timeline del run con cada step.
- Costos y tokens.
- Modelos utilizados y fallbacks.
- Herramientas invocadas y resultados.
- Contexto cargado y Core Files resueltos.
- Aprobaciones pendientes o resueltas.
- Indicadores de seguridad y validación.

### Al owner estratégico
- Rendimiento por Agency/Department/Workspace.
- Uso de agentes y canales.
- Costo por equipo, flow o provider.
- Calidad y regresión de agentes.
- Puntos de bloqueo frecuentes.
- Alertas de riesgo técnico u operativo.

---

## 27. Dashboard analítico — Gráficos y métricas por nivel

### 27.1 Concepto

El dashboard tiene su propio **icono de menú en la Zona A** (barra de navegación principal). Al hacer clic, la Zona B muestra el árbol jerárquico para seleccionar el nivel a analizar (Agency, Department, Workspace o Agent), y la Zona C carga la vista de gráficos y métricas correspondiente a ese nivel. Los breadcrumbs en Zona C reflejan el nivel seleccionado de forma sutil.

Los gráficos se filtran automáticamente según el nivel activo: al posicionarse en cualquier nivel del árbol, los paneles reflejan exclusivamente los datos de ese nivel y todos sus descendientes. El usuario puede cambiar el scope del dashboard directamente desde la Zona B sin abandonar la vista.

### 27.2 Filtros temporales

Todos los gráficos del dashboard soportan los siguientes rangos de tiempo seleccionables. El filtro temporal puede operar en dos modos a elección del usuario:

- **Modo dashboard:** un selector unificado en la barra superior afecta todos los paneles del dashboard simultáneamente.
- **Modo por gráfico:** cada panel tiene su propio selector temporal independiente, permitiendo comparar el mismo indicador en distintos períodos dentro de la misma vista.

El usuario puede mezclar ambos modos: fijar algunos paneles al rango global y liberar otros para rangos individuales. Los rangos disponibles son:

`1h · 2h · 5h · 12h · 18h · 1d · 2d · 3d · 7d · 15d · 1m · 3m · 6m · 1y`

El selector temporal también puede combinarse con el filtro jerárquico: ver el costo de un Department específico en los últimos 7 días, o los runs fallidos de un Workspace en las últimas 2 horas.

### 27.3 Métricas principales del sistema

Los datos que alimentan los gráficos provienen exclusivamente del runtime interno de la plataforma:

- Runs: totales, activos, fallidos, completados, pausados por aprobación.
- Tokens: consumidos (input/output), proyectados, por modelo, por agente, por nivel.
- Costos USD: real, proyectado, por provider, por modelo, por nivel jerárquico, vs. presupuesto asignado.
- Latencia: por run, por step, por LLM call, por tool call, promedio y percentil 95.
- Tools: más usadas, tasa de éxito/fallo, rounds por run.
- Aprobaciones: pendientes, resueltas, tiempo promedio de respuesta humana.
- Fallbacks: frecuencia, motivo, modelo de origen y destino.
- Canales: mensajes recibidos/enviados por canal, canal más activo, canal más reciente, distribución.
- Agentes activos: en ejecución ahora, últimos activos, más usados.
- Peticiones pendientes: cola de runs, approvals en espera, pasos bloqueados.
- Presupuesto: asignado vs consumido vs disponible, proyección de agotamiento.
- Heatmaps: actividad de runs por hora del día y día de la semana.
- Uso de modelos: modelos más usados por nivel, tokens por modelo, costo por modelo, ranking.

Si un agente, flow o nivel activa o produce un tipo de dato (por ejemplo datos geográficos de conversaciones, o métricas financieras procesadas), los gráficos correspondientes aparecen automáticamente en el dashboard de ese nivel. Si no hay datos de ese tipo, el panel no se muestra.

### 27.4 Layout del dashboard — Drag & Drop configurable

El dashboard es **configurable por el usuario** con un sistema de paneles drag & drop similar a Grafana o Notion. Las características son:

- Cada panel es un widget independiente: tipo de gráfico, métrica, rango, nivel de filtro.
- Los paneles se pueden añadir, eliminar, reordenar y redimensionar libremente.
- Existe un **layout default** pre-configurado por el sistema que se carga la primera vez. Este default incluye los paneles más útiles para la mayoría de los operadores.
- El usuario puede guardar sus propios layouts como plantillas.
- Las plantillas de dashboard pueden publicarse en el **Templates Hub** y ser importadas por otros usuarios o niveles.
- Cada nivel jerárquico puede tener su propio dashboard guardado, diferente al de otros niveles.

### 27.5 Tipos de gráficos disponibles

| Categoría | Tipos |
|---|---|
| **Comparación de categorías** | Barras verticales, barras horizontales, columnas, barras apiladas, circular (tarta), anillo, radar |
| **Tendencias en el tiempo** | Líneas, área, áreas apiladas, pendientes (slopegraph) |
| **Relaciones y correlaciones** | Dispersión (scatter), burbujas, matriz de correlación |
| **Distribuciones** | Histograma, caja y bigotes (box plot), violín, densidad |
| **Jerarquías y estructuras** | Tree map, sunburst (anillos jerárquicos), Sankey (flujos) |
| **Datos geográficos** | Coropletas (por región), heatmap geográfico, burbujas en mapa |
| **Datos financieros** | Velas japonesas (candlestick), OHLC, bandas (Bollinger) |
| **Especiales** | Gantt (cronogramas de runs), Pareto (barras + línea acumulada), embudo (funnel, para conversiones), waterfall (variaciones de costo), heatmap de actividad |

Los gráficos financieros y geográficos se activan únicamente si los agentes del nivel están procesando o generando ese tipo de datos. No aparecen en el dashboard si no hay datos que los justifiquen.

### 27.6 Dashboard templates en el Hub

El Templates Hub incluye una categoría de **Dashboard Templates**: layouts predefinidos de paneles para distintos perfiles de uso (operaciones, costos, canales, seguridad, performance). Se importan con un clic y se adaptan al nivel jerárquico destino.

---

## 28. Visual IDE — Entorno de trabajo visual unificado

### 28.1 Concepto

El Visual IDE es el entorno de trabajo principal de la plataforma. Unifica en un solo espacio el árbol jerárquico, el editor de flows, los paneles de herramientas, los Core Files y la observación de ejecuciones. Su referencia de layout es la imagen de Paperclip adjunta y la experiencia de herramientas como n8n, Flowise, Linear y VS Code.

El objetivo es maximizar el espacio útil de trabajo, ocultar lo que no se necesita en cada momento, y mantener siempre visible el contexto jerárquico activo sin que ocupe espacio innecesario.

### 28.2 Estructura de paneles del layout

La interfaz se divide en cuatro zonas principales, todas ajustables y colapsables:

**Zona A — Barra de navegación principal con acordeón (extremo izquierdo)**

Es la barra más a la izquierda de la pantalla. Contiene los iconos de los menús principales de la aplicación y nunca desaparece. Opera como un **acordeón**: al hacer clic en el chevron (`›`) de un ítem, ese menú se expande mostrando sus submenús o su árbol jerárquico directamente dentro de la Zona A. Solo un menú puede estar expandido a la vez. Al hacer clic en otro menú, el anterior se cierra automáticamente.

**Menús principales de Zona A:**

| Icono | Menú | Submenús al expandir |
|---|---|---|
| 🏢 | **Hierarchy** | Árbol jerárquico completo: Agency → Department → Workspace → Agent. Navegar por el árbol filtra la Zona C. |
| ⚡ | **Flows** | Árbol de flows filtrado por nivel jerárquico activo. |
| ▶️ | **Runs** | Árbol de ejecuciones por nivel: activos, completados, fallidos, pausados. |
| 📊 | **Dashboard** | Árbol jerárquico para seleccionar el nivel a analizar. |
| 🔧 | **Tools & Skills Hub** | Categorías del hub: All Tools, Skills, Custom, Inherited, por dominio. |
| 📋 | **Templates Hub** | Categorías: Agents, Flows, Departments, Workspaces, Dashboards, por origen. |
| 🔁 | **Routines** | Árbol jerárquico con conteo de routines activas por nivel. |
| 🎯 | **Goals** | Árbol jerárquico con estado de goals por nivel. |
| ✅ | **Approvals** | Lista de aprobaciones pendientes, resueltas, escaladas. |
| ⚙️ | **Settings** | Submenús: Models, Channels, APIs, n8n, MCP, Auth, Storage, Security, Observability, Onboarding. |

**Comportamiento del acordeón:**

Al expandir un menú en Zona A, el área de Zona A se amplía levemente para mostrar los submenús o el árbol en texto compacto, con íconos pequeños y tipografía reducida. El resto de menús permanece visible solo como iconos (colapsados). Al seleccionar un ítem dentro del submenú expandido, la Zona C carga la vista correspondiente y el acordeón puede cerrarse para liberar espacio, o permanecer abierto para seguir navegando.

**Settings como ejemplo de submenús planos:**

Al expandir Settings en Zona A, se muestran sus secciones como submenús planos (sin árbol jerárquico):

```
⚙️  Settings              ›
    ── Models
    ── Channels
    ── APIs
    ── n8n
    ── MCP
    ── Auth
    ── Storage
    ── Security
    ── Observability
    ── Onboarding
```

Al hacer clic en cualquier subítem de Settings (por ejemplo "Models"), la Zona C muestra esa sección en **tabs horizontales** — uno por cada sección de Settings — con la tab correspondiente activa. Esto permite navegar entre secciones de Settings sin volver a la Zona A.

**Hub como ejemplo de submenús de categorías:**

```
📋  Templates Hub         ›
    ── Agents
    ── Flows
    ── Departments
    ── Workspaces
    ── Dashboards
    ── Skills
    ── Tools
```

**Hierarchy como ejemplo de árbol expandido:**

El árbol en Zona A es compacto. Cada nodo muestra exclusivamente su nombre y un **punto de color** que indica su estado operativo. No se muestra texto de estado (`Active`, `Paused`, etc.) en el árbol: el punto es el único indicador visual en Zona A. Al pasar el cursor sobre el punto aparece un tooltip con el nombre del estado.

| Punto | Estado | Significado |
|---|---|---|
| 🟢 | Active | Opera con normalidad |
| 🟠 | Paused | Detenido temporalmente |
| 🔴 | Error / Disabled | Fallo o desactivado manualmente |
| ⚫ | Archived | Solo lectura, oculto por defecto |

Los nodos **archivados no aparecen en el árbol por defecto**. Para verlos, el usuario usa el botón `···` (opciones) disponible en la cabecera del bloque Hierarchy o en la cabecera de una Agency específica. Ese menú incluye la opción **"Mostrar archivados"** (toggle). Al activarla, los nodos archivados se insertan en su posición jerárquica correcta con `opacity: 0.45` y punto ⚫. La opción puede aplicarse globalmente (toda la jerarquía) o solo al subárbol de una Agency concreta.

```
🏢  Hierarchy                       [···]
    🟦 Agency A                     🟢
        🟦 Dept Engineering         🟢
            🟦 WS Backend Core      🟢
                🟦 Agent Sentinel   🟢
                    🟦 SubAgent Code Reviewer   🟢
                    🟦 SubAgent Test Gen        🟢
                🟦 Agent Forge      🟢
                    🟦 SubAgent DB Migrator     🟢
            🟦 WS Platform Runtime  🟠
                🟦 Agent Runtime Guard          🟠
                    🟦 SubAgent Log Auditor     🟠
        🟦 Dept Product             🟢
            🟦 WS Product Design    🟢
                🟦 Agent Pixel      🟢
                    🟦 SubAgent Figma Exporter  🟢

    🟩 Agency B                     🟢  [···]
        🟩 Dept Marketing           🟢
            🟩 WS Campaña Q2        🟢
                🟩 Agent Growth Strategist      🟢
                    🟩 SubAgent SEO Optimizer   🟢
            🟩 WS Social Media      🟢
                🟩 Agent Content Ops            🟢
                    🟩 SubAgent Tone Reviewer   🟢
        🟩 Dept Sales               🟢
            🟩 WS Pipeline LATAM    🟢
                🟩 Agent SDR Assistant          🟢
                    🟩 SubAgent Lead Scorer     🟢

    🟨 Agency C                     ⚫  [oculta — "Mostrar archivados" desactivado]

⚡  Flows                           ›
▶️  Runs                            ›
📊  Dashboard                       ›
```

> **Con "Mostrar archivados" activado para Agency C:**
> ```
>     🟨 Agency C (archived)          ⚫  [···]
>         🟨 Dept Support             ⚫
>             🟨 WS Customer Ops      ⚫
>                 🟨 Agent Support T1 ⚫
>                     🟨 SubAgent Escalation Bot ⚫
> ```
> Los nodos archivados se renderizan con `opacity: 0.45` y sin interacciones de ejecución disponibles. Solo permiten acceso de lectura a Core Files, memoria histórica y runs pasados.

**Menú `···` de opciones del árbol** (disponible en la cabecera global del árbol y en cada Agency individualmente):

- **Mostrar archivados** — toggle que incluye/excluye nodos archivados en la vista del árbol
- **Filtrar por estado** — muestra solo Active / Paused / Error
- **Colapsar todo** / **Expandir todo**
- **Ordenar por** — nombre / estado / fecha de creación

**Separación visual por color:** cada `Agency` tiene un color guía propio que pinta de forma sutil su árbol completo en Zona A y en la breadcrumb/tagging de Zona B/C. Ese color no reemplaza el punto de estado, sino que ayuda a distinguir visualmente qué descendiente pertenece a qué Agency cuando hay múltiples árboles abiertos.

- **Azul:** Agency A y todos sus descendientes.
- **Verde:** Agency B y todos sus descendientes.
- **Amarillo/Ámbar:** Agency C y todos sus descendientes.
- **El estado operativo** se indica exclusivamente con el punto de color (🟢🟠🔴⚫) sin texto adicional en Zona A.

El sistema debe permitir cambiar el color guía de cada Agency desde su configuración para que visualmente sea más fácil separar estructuras grandes. En vistas con alta densidad, el color puede verse como barra lateral, bullet, borde izquierdo suave o background tint muy leve del nodo. Nunca debe romper contraste ni accesibilidad.

El árbol en Zona A es compacto y de lectura rápida. Para ver el árbol completo con todas las propiedades, controles y contexto de cada nodo, se usa la Zona B (que sigue siendo independiente y más detallada).

**Zona B — Panel jerárquico contextual (segundo desde la izquierda, plegable)**
Es el panel que refleja el árbol jerárquico activo: Agency → Department → Workspace → Agent. Su contenido cambia según el icono activo de la Zona A. Si el icono activo es Flows, muestra el árbol de flows del nivel seleccionado. Si es Agents, muestra el árbol de agentes. Si es Analytics, muestra filtros jerárquicos para el dashboard.

Este panel muestra el árbol jerárquico activo navegable. La ruta del nivel activo se refleja como **breadcrumbs muy sutiles** en la barra superior de la **Zona C** — tipografía pequeña, color apagado (`--color-text-faint`), sin bordes ni fondo — mostrando `Agency / Department / Workspace / Agent`. Cada segmento es clickeable para subir a cualquier nivel ancestro sin necesidad de abrir el panel jerárquico. Cuando la Zona B está colapsada, estos breadcrumbs son el único indicador del nivel activo, razón por la que deben estar siempre presentes en Zona C aunque ocupen el mínimo espacio posible.

**Zona C — Área de trabajo principal (centro y derecha, el espacio más grande)**
Es el espacio donde viven el Flow Editor, el editor de Core Files, el dashboard, el Run Debugger, el Agent Builder y cualquier otro editor o vista. Esta zona se expande cuando los paneles A o B se colapsan. Tiene su propia barra de herramientas contextual (según qué se esté editando), scroll, zoom in/out con rueda del mouse, minimap de navegación y capacidad de abrir múltiples tabs o paneles divididos.

**Zona D — Panel inferior o lateral derecho (colapsable, para propiedades e inspección)**
Panel de propiedades del elemento seleccionado, logs en vivo, output de runs, inspector de nodos en el flow editor. Se puede abrir/cerrar con atajos de teclado. Puede dividirse en tabs: Properties, Logs, Output, Trace.

### 28.3 Comportamientos del layout

- Todos los paneles tienen un handle de resize para ajustar su ancho manualmente.
- Cada panel recuerda su estado (abierto/cerrado, ancho) por usuario y por sesión.
- El usuario puede maximizar la Zona C para trabajo de pantalla completa sin perder acceso rápido a las zonas A/B/D.
- La Zona B (árbol jerárquico) actúa como filtro global: cambiar el nivel seleccionado actualiza automáticamente las vistas de Zona C y D.
- Atajos de teclado para colapsar/expandir cada zona.

### 28.4 Flow Editor dentro del Visual IDE

El Flow Editor vive en la Zona C. Tiene sus propias barras de herramientas que incluyen:

- Barra superior: nombre del flow, estado, botones de guardar/publicar/probar, historial de versiones, modo sandbox.
- Panel de nodos (colapsable, lateral derecho de la Zona C): catálogo de tipos de nodos disponibles para arrastrar al canvas.
- Canvas central: área de trabajo del flow con grid, zoom, pan, snap-to-grid, minimap.
- Inspector de nodo (Zona D): al seleccionar un nodo, muestra sus propiedades, configuración, inputs/outputs esperados y logs de la última ejecución.
- Barra de estado inferior: nivel jerárquico activo, modelo LLM asignado, presupuesto disponible, último run.

El zoom del canvas es controlado con la rueda del ratón o el trackpad (pinch). Los controles de zoom mínimo/máximo están en la esquina del canvas.

### 28.5 Editor de Core Files

Los Core Files (AGENTS.md, SOUL.md, TOOLS.md, etc.) se editan dentro de la Zona C con un editor de Markdown que incluye:

- Syntax highlighting para Markdown.
- Vista previa renderizada en split screen o toggle.
- Indicador del nivel que define cada sección (heredado vs propio).
- **Comparación de cambios tipo IDE (diff view):** dos paneles lado a lado mostrando la versión anterior y la nueva, con líneas añadidas/eliminadas resaltadas por colores, equivalente a la vista diff de VS Code o GitHub. Disponible para cualquier Core File y para cualquier versión del historial.
- Guardado automático con versionado.
- Resolución visual de herencia: muestra qué está heredado de qué nivel con color y etiqueta, permitiendo override explícito.

### 28.6 Paneles colapsables y aprovechamiento del espacio

El principio de diseño es que el espacio de trabajo principal siempre debe poder expandirse al máximo cuando el usuario necesita concentrarse. Los paneles secundarios se pliegan hacia sus bordes dejando solo un handle o icono para reabrirlos. Los paneles colapsables incluyen:

- Panel jerárquico (Zona B): se colapsa hacia la izquierda.
- Panel de nodos del Flow Editor: se colapsa hacia la derecha.
- Panel de propiedades/logs (Zona D): se colapsa hacia abajo.
- Barra de herramientas del flow: puede ocultarse en modo presentación.

---

## 29. Goals — Objetivos por nivel con propagación jerárquica

### 29.1 Concepto

Cada nivel de la jerarquía (Agency, Department, Workspace, Agent) puede definir objetivos (Goals) propios. Los Goals establecen qué debe lograr ese nivel en un período dado, qué métricas miden el éxito y qué resultados deben alcanzarse. Se propagan naturalmente desde Agency hacia abajo, de forma que los Goals del nivel superior se reflejan como contexto y restricción en los niveles inferiores.

Cada Goal activo **genera automáticamente gráficos en el dashboard** del nivel al que pertenece. Al definirse un Goal con una métrica cuantitativa, el sistema crea un panel de seguimiento en el dashboard del nivel correspondiente: gauge de progreso, trend line de avance en el tiempo, y comparativa vs. objetivo. Estos paneles son gráficos como cualquier otro del dashboard: configurables, con filtros temporales, drag & drop, y exportables como template.

### 29.2 Estructura de un Goal

Un Goal define:
- Título y descripción del objetivo.
- Tipo: cuantitativo (métrica medible) o cualitativo (hito o entregable).
- Métrica de éxito y valor objetivo.
- Período o deadline.
- Nivel al que pertenece.
- Subgoals asociados (Goals hijos en niveles inferiores que contribuyen al goal padre).
- Estado: not started, in progress, at risk, completed, cancelled.

### 29.3 Propagación jerárquica de Goals

Un Goal de Agency puede descomponerse en Goals de Department. Un Goal de Department puede descomponerse en Goals de Workspace. Un Goal de Workspace puede asignarse a un agente específico. Esta cadena permite que cada nivel vea cómo sus objetivos locales contribuyen al objetivo mayor del nivel superior.

Cuando un agente recibe un run, el runtime puede inyectar en el contexto los Goals activos del Workspace, Department y Agency correspondientes, para que el agente opere con conciencia de los objetivos del árbol al que pertenece.

### 29.4 Visualización de Goals

Los Goals tienen presencia en múltiples zonas del layout:

- **Zona A (barra de iconos):** Goals tiene su propio icono de menú en la barra de navegación principal. Al hacer clic, la Zona B muestra el árbol de Goals del nivel jerárquico activo, organizados por nivel y estado. Desde aquí se pueden crear nuevos Goals directamente.
- **Zona B (panel jerárquico):** Los Goals aparecen como indicadores de estado junto a cada nodo del árbol: semáforo de color y porcentaje de avance visible sin necesidad de abrir el detalle.
- **Dashboard (Zona C):** Los Goals generan widgets configurables automáticamente: progress bars, trend lines de avance en el tiempo, semáforos de estado. El filtro temporal del dashboard aplica también a los Goals, mostrando evolución histórica del avance.
- **Navegación por clic:** Al hacer clic en cualquier gráfico de Goal en el dashboard, o en cualquier indicador de Goal en la Zona B o en cualquier otro gráfico del repositorio vinculado a un Goal, el sistema navega directamente al editor completo del Goal en la Zona C, mostrando detalle, métricas, subgoals asociados, historial de cambios y los runs vinculados al avance del objetivo.

---

## 30. Routines — Tareas periódicas y automáticas por nivel

### 30.1 Concepto

Las Routines son secuencias de tareas o runs que se ejecutan automáticamente de forma periódica, programada o por condición. Cada nivel jerárquico puede definir sus propias Routines, que se heredan hacia abajo y pueden sobreescribirse en niveles más específicos. Son la base del comportamiento proactivo de los agentes, complementando el `HEARTBEAT.md` con lógica de scheduling más estructurada.

### 30.2 Tipos de Routine

| Tipo | Disparador |
|---|---|
| **Scheduled** | Cron expression: cada hora, cada día a las 9am, cada lunes, etc. |
| **Event-triggered** | Se activa cuando ocurre un evento específico en el sistema (run completado, approval resuelto, nuevo mensaje en canal, nuevo archivo en storage). |
| **Condition-based** | Se activa cuando se cumple una condición: presupuesto por debajo del 20%, agente sin actividad hace 24h, Goal en estado "at risk". |
| **Manual** | Se ejecuta bajo demanda pero sigue el mismo flow que las automáticas. |

Cada Routine activa **genera automáticamente gráficos en el dashboard** del nivel al que pertenece. El sistema crea paneles de seguimiento que incluyen: histograma de ejecuciones por período, tasa de éxito/fallo por rutina, trend line de frecuencia de activación, heatmap de ejecuciones por hora y día, y tiempo promedio de ejecución. Estos gráficos siguen las mismas reglas del dashboard: configurables, con filtro temporal propio o global, drag & drop, y exportables como template al Hub.

### 30.3 Qué puede hacer una Routine

- Ejecutar un agente o un flow completo.
- Enviar un mensaje a un canal.
- Generar un reporte de estado y entregarlo por canal o email.
- Monitorear una fuente externa y notificar cambios.
- Revisar el estado de Goals y actualizar métricas.
- Limpiar memoria episódica antigua.
- Ejecutar evals de regresión sobre un set de agentes.
- Escalar una tarea si no fue atendida en un tiempo dado.

### 30.4 Herencia y propagación de Routines

Una Routine definida en Agency aplica a todos los niveles descendientes que no hayan definido una Routine equivalente. Un Department puede sobreescribir una Routine de Agency para su dominio específico. Un Workspace puede crear Routines propias adicionales. Los Agents pueden tener Routines personales definidas en su `HEARTBEAT.md`, que se integran en el sistema de Routines de la plataforma como entradas de tipo cron.

### 30.5 Visualización de Routines

Las Routines siguen el flujo estándar de navegación de la plataforma: **Zona A → Zona B → Zona C**.

- **Zona A:** icono dedicado de Routines en la barra de navegación principal.
- **Zona B:** al hacer clic en el icono, se carga el árbol jerárquico filtrado mostrando los niveles con Routines activas y el conteo de tareas programadas por nivel. La selección de un nivel actualiza los breadcrumbs sutiles en Zona C.
- **Zona C:** vista completa de Routines del nivel seleccionado, organizada en **tabs horizontales** en la parte superior del área de trabajo:

| Tab | Contenido |
|---|---|
| **Lista** | Todas las Routines del nivel: nombre, tipo, estado, próxima ejecución, última ejecución, origen (manual / HEARTBEAT / heredada). |
| **Cron / Condición** | Editor de la expresión cron o condición disparadora de la Routine seleccionada. |
| **Flow asociado** | Flow o agente vinculado a la Routine, con acceso directo al Flow Editor. |
| **Historial** | Ejecuciones pasadas de la Routine: estado, duración, tokens, costo, run asociado. |
| **Logs** | Logs detallados del último run de la Routine. |

Las Routines originadas en `HEARTBEAT.md` se distinguen con una etiqueta sutil "Auto-generada" y muestran desde qué Core File fueron inferidas.

**Los gráficos van al Dashboard:** Los paneles analíticos de Routines (histograma de ejecuciones, heatmap por hora/día, tasa de éxito/fallo, trend line) no viven en la vista de Routines sino en el **Dashboard (menú Zona A → Analytics)**. Desde la vista de Routines en Zona C existe un acceso directo "Ver en Dashboard" que navega al panel correspondiente. Al hacer clic en un widget de Routines en el Dashboard, se regresa a la Zona C de Routines del nivel correspondiente usando los breadcrumbs.

**En la vista de Runs:** Las ejecuciones originadas por una Routine se distinguen con una etiqueta de origen en el timeline del run.

---

## 31. Orden correcto de construcción — Fases

La estructura de fases debe reorganizarse para que el producto crezca por **capas arquitectónicas**, no solo por features. Esta separación evita mezclar runtime con agents, providers con lógica de dominio, flows con el executor, channels con lógica interna y UI con conocimiento que debería vivir en backend.[web:30][web:34][web:35]

### 31.1 Capas arquitectónicas objetivo

La plataforma debe separarse explícitamente en estas capas funcionales:[web:30][web:34]

| Capa | Función arquitectónica |
|---|---|
| **Platform Kernel** | Núcleo durable del sistema: runs, estado, eventos, colas, checkpoints, costos, lifecycle. |
| **Runtime Engine** | Ejecución genérica y durable de pasos, retries, pause/resume, scheduler y recuperación. |
| **Agent Intelligence Layer** | Construcción del cerebro agéntico: AgentProfile, prompt compiler, context builder, planning, HEARTBEAT, AgentCard. |
| **Execution Graph Layer** | Motor declarativo y visual de grafos/flows separado del engine de agentes. |
| **Integration Layer** | MCP, tools, channels, gateways, webhooks, providers, adapters externos. |
| **Governance Layer** | Policies, approvals, audit, security, evals, budgets, compliance, observabilidad. |
| **Experience Layer** | Dashboard, explorers, editors, inspectors, traces, UX enterprise. |

Si esta separación no se respeta, el sistema tenderá a producir estos problemas estructurales:

- Runtime mezclado con lógica de agentes.
- Providers acoplados al dominio.
- Flows pegados al executor principal.
- Channels implementando lógica que debería vivir en el core.
- UI con conocimiento de negocio o resolución jerárquica que debería resolverse en backend.[web:30][web:34]

### 31.2 Reagrupación de macrofases

Se adopta esta interpretación de alto nivel:

- **F0–F5 = backend core**.
- **F6–F8 = orchestration / channels**.
- **F9+ = providers / enterprise / observability / ops / hardening**.

### 31.3 Fases recomendadas

#### F0 — Foundation & Monorepo Infrastructure
**Objetivo:** base técnica y operacional para construir el runtime.[web:30][web:32]

**Incluye:**
- Turborepo.
- pnpm.
- estándares TypeScript.
- ESLint / Prettier.
- Docker Compose.
- CI/CD.
- Prisma.
- PostgreSQL.
- Redis.
- ADRs.
- package boundaries.
- observability bootstrap.
- env system.
- secret management.
- base SDK contracts.

**Resultado esperado:** infraestructura lista para construir el runtime.

#### F1 — Platform Kernel
**Objetivo:** construir el kernel central del sistema. Aquí todavía no existen agentes inteligentes completos.[web:30][web:31]

**Incluye:**
- Run.
- RunStep.
- State machine.
- Event bus.
- Queue engine.
- Checkpointing.
- Retry system.
- Persistence layer.
- Budget engine.
- Token accounting.
- Cost accounting.
- Cancellation.
- Pause / resume.
- Execution lifecycle.

**Inspiración:** Temporal, LangGraph runtime, Durable Functions.[web:31]

**Resultado esperado:** runtime durable genérico.

#### F2 — Hierarchy & Configuration System
**Objetivo:** construir el sistema organizacional enterprise.[web:34]

**Incluye:**
- Agency.
- Department.
- Workspace.
- Agent.
- inheritance resolver.
- config merging.
- activation states.
- policy resolution.
- Core Files persistence.
- versioning.

**Resultado esperado:** gobernanza jerárquica enterprise.

#### F3 — Agent Intelligence Layer
**Objetivo:** construir el cerebro agéntico real.[web:30][web:34]

**Incluye:**
- AgentProfile.
- context builder.
- prompt compiler.
- Core Files compiler.
- memory injection.
- AgentCard.
- semantic capabilities.
- routines.
- HEARTBEAT system.
- planning loop.

**Inspiración:** OpenClaw, CrewAI, Hermes.[web:34]

**Resultado esperado:** agentes operativos reales.

#### F4 — Tool Runtime & MCP
**Objetivo:** sistema universal de tools y execution.

**Incluye:**
- ToolRegistry.
- ToolGuard.
- Skills.
- MCP client / server.
- execution wrappers.
- tool loop.
- retries.
- tool permissions.
- sandboxing.
- approval hooks.

**Resultado esperado:** runtime universal de tools.

#### F5 — Memory, Knowledge & RAG
**Objetivo:** sistema cognitivo persistente.[web:33][web:34]

**Incluye:**
- episodic memory.
- semantic memory.
- MEMORY.md.
- vector DB.
- embeddings.
- chunking.
- retrieval pipelines.
- hybrid search.
- context compression.
- knowledge ingestion.

**Resultado esperado:** memoria persistente contextual.

#### F6 — Multi-Agent Orchestration
**Objetivo:** coordinación real entre agentes especializados.[web:34]

**Incluye:**
- delegation.
- supervisors.
- groupchat.
- replanning.
- semantic routing.
- agent registry.
- capability matching.
- distributed execution.
- task graphs.

**Inspiración:** AutoGen, CrewAI, Semantic Kernel orchestration.[web:34]

**Resultado esperado:** sistema multi-agente real.

#### F7 — Execution Graph & Flow Engine
**Importante:** aquí se separa el **FLOW ENGINE** del **AGENT ENGINE**, lo cual es crítico arquitectónicamente.[web:30][web:31]

**Objetivo:** motor visual y declarativo de ejecución.

**Incluye:**
- Flow entity.
- DAG execution.
- node runtime.
- graph scheduler.
- branching.
- merges.
- retries.
- visual execution.
- versioning.
- dry runs.
- subflows.

**Inspiración:** n8n, Flowise, LangGraph.[web:31]

**Resultado esperado:** sistema visual de automatización.

#### F8 — Integration & Channels Layer
**Objetivo:** gateway universal de comunicación.

**Incluye:**
- channel adapters.
- message normalization.
- routing.
- sessions.
- auth bindings.
- streaming.
- websocket gateway.
- reconnect engine.
- channel policies.

**Canales:** WhatsApp, Telegram, Discord, Teams, WebChat.

**Resultado esperado:** capa omnichannel desacoplada.

#### F9 — Model, Provider & Inference Platform
**Objetivo:** infraestructura universal de inferencia. Esta fase ya es casi una plataforma aparte.

**Incluye:**
- provider registry.
- auth profiles.
- routing engine.
- fallback chains.
- model capability matrix.
- gateways.
- local inference.
- multimodal.
- embeddings.
- speech.
- image / video.
- coding runtimes.

**Resultado esperado:** inference platform enterprise.

#### F10 — Observability, Telemetry & Evals
**Objetivo:** observabilidad total desde runtime hasta UX.[web:33][web:34]

**Incluye:**
- OpenTelemetry.
- spans.
- traces.
- visual debugger.
- token metrics.
- latency metrics.
- eval framework.
- regression suite.
- prompt tracing.
- execution replay.

**Resultado esperado:** runtime observable y auditable.

#### F11 — Experience Layer (Dashboard & UX)
**Objetivo:** interfaz enterprise completa.

**Incluye:**
- hierarchy explorer.
- flow editor UI.
- runtime inspector.
- approvals.
- analytics.
- goals.
- routines.
- Core Files editor.
- live traces.
- debug views.

**Inspiración:** Linear, Vercel, GitHub, n8n.

**Resultado esperado:** plataforma usable enterprise-grade.

#### F12 — Security, Governance & Compliance
**Objetivo:** hardening enterprise.

**Incluye:**
- RBAC.
- audit logs.
- guardrails.
- injection detection.
- compliance.
- secrets.
- scoped credentials.
- policy enforcement.
- rate limiting.
- governance engine.

**Resultado esperado:** seguridad enterprise real.

#### F13 — Templates, Marketplace & Hub
**Objetivo:** ecosistema reusable y extensible.

**Incluye:**
- templates.
- skills hub.
- tools hub.
- flow marketplace.
- agent marketplace.
- imports / exports.
- sync engines.

**Resultado esperado:** ecosistema extensible.

#### F14 — Deployment, Operations & DevOps
**Objetivo:** operación real del producto.

**Incluye:**
- production compose.
- kubernetes.
- scaling.
- migrations.
- backups.
- onboarding.
- installers.
- cloud deployment.
- self-hosting.

**Resultado esperado:** sistema desplegable real.

#### F15 — Enterprise Platform Features
**Objetivo:** escalabilidad organizacional y SaaS enterprise.

**Incluye:**
- multi-tenancy.
- SLA.
- quotas.
- budget governance.
- enterprise analytics.
- billing.
- SSO.
- SCIM.
- org-wide governance.

**Resultado esperado:** SaaS enterprise listo.

#### F16 — Beta Release & Stabilization
**Objetivo:** convergencia final antes de una beta pública usable.[web:30][web:32]

**Incluye:**
- performance.
- QA.
- regression.
- docs.
- onboarding.
- demos.
- examples.
- benchmarks.

**Resultado esperado:** beta pública usable.

#### F17 — AI Native Operating System
**Objetivo:** visión de largo plazo para evolución autónoma de la plataforma.[web:31][web:33]

**Incluye:**
- autonomous routines.
- agent swarms.
- long-running cognition.
- realtime voice.
- computer use.
- browser use.
- desktop automation.
- autonomous memory evolution.
- self-improving agents.

**Resultado esperado:** sistema operativo nativo para agentes de IA.

### 31.4 Cambio arquitectónico más importante

El cambio más importante respecto a la formulación anterior es este:

- **Antes:** F7 = solo Flow Editor.
- **Después:** F7 = **Execution Graph Engine**.

Esto es clave porque el editor visual es solo una interfaz; el verdadero valor arquitectónico está en el **graph runtime**, el scheduler, los nodos, la durabilidad, los retries y la ejecución declarativa.[web:30][web:31]

Separar el Flow Engine del Agent Engine evita estos errores:

- UI controlando ejecución.
- lógica mezclada.
- flujos no durables.
- reutilización imposible entre visual builder, API y automatizaciones headless.[web:30][web:31]

### 31.5 Lectura ejecutiva

Con esta reorganización, el sistema crece en este orden sano:

1. Infraestructura.
2. Kernel durable.
3. Jerarquía y configuración.
4. Inteligencia agéntica.
5. Tools y MCP.
6. Memoria y RAG.
7. Orquestación multi-agent.
8. Graph runtime / flow engine.
9. Channels.
10. Providers e inference platform.
11. Observabilidad.
12. UX enterprise.
13. Seguridad y gobierno.
14. Ecosistema reusable.
15. DevOps y despliegue.
16. Enterprise scale.
17. Beta y estabilización.
18. Visión AI-native OS.[web:30][web:34]

## 32. Errores que no deben repetirse

En este proyecto debe asumirse que **es un desarrollo nuevo**. No debe hablarse de “legacy” como excusa de diseño antes de tener una primera versión final real. Mientras el sistema está en construcción, lo correcto es pensar en **capas de implementación**, **checkpoints verificables** y **milestones reversibles**, no en convivencias indefinidas de soluciones paralelas.

### Principio de arquitectura sólida — Sin parches, sin bypass, sin ocultamientos

**No se proponen parches. No se proponen ocultamientos. No se proponen fixes de bypass.** Ante cualquier problema técnico, la decisión correcta es fundamentar la solución en la estructura y arquitectura del sistema, no en soluciones temporales que acumulen deuda técnica invisible.

**Toda decisión arquitectónica debe:**
- Estar fundamentada en la estructura real del sistema, no en workarounds.
- Ser **escalable**: funcionar igual con 1 agente que con 1.000.
- Ser **aumentativa**: cada nueva función se añade sobre la base existente sin romper lo que ya funciona.
- Ser **reversible**: si una decisión resulta incorrecta, debe poder deshacerse sin afectar capas no relacionadas.
- Ser **explícita**: ningún comportamiento crítico del sistema debe depender de efectos secundarios o asunciones implícitas.

**Está prohibido:**
- Implementar un fix temporal "mientras se hace bien": si no se puede hacer bien ahora, se documenta como deuda explícita con criterio de resolución, no se parchea.
- Ocultar un error con un `catch` silencioso, un fallback sin log o un estado inconsistente ignorado.
- Hacer bypass de capas de seguridad, validación o autorización "por simplicidad de desarrollo".
- Duplicar lógica de negocio en dos capas distintas como solución a un problema de acoplamiento.
- Proponer migraciones incompletas que dejan dos versiones del mismo sistema coexistiendo sin estrategia de reemplazo cerrada.

**El criterio de decisión es:**
> ¿Esta solución fortalece la arquitectura o la complica? Si la complica, no es la solución correcta.

OCTO debe pensarse siempre en **modo aumentativo**: cada fase, cada feature, cada fix añade capacidad real al sistema sin romper lo construido. La estabilidad de cada capa es prerequisito para construir sobre ella. Cada deploy debe dejar el sistema en un estado igual o mejor al anterior: nunca en un estado más frágil.

### Lo que no debe repetirse

- Mezclar visión final con implementación incompleta sin separar fases claramente.
- Construir UI visual sin runtime durable y testeable detrás.
- Crear dos o más soluciones paralelas para el mismo problema sin una estrategia de reemplazo cerrada.
- Introducir multi-agent avanzado antes de estabilizar el runtime base.
- Implementar aprobación humana efímera en memoria para flujos que deben ser durables.
- Integrar demasiados canales y providers antes de cerrar el core funcional.
- Carecer de observabilidad, evals y regresión desde etapas tempranas.
- No documentar la arquitectura real causando drift entre docs y código.
- No separar fases de desarrollo y mezclar etapas bloqueantes.
- Avanzar sin checkpoints verificables y sin posibilidad de rollback funcional.

### Regla operativa de construcción

Cada paso relevante del proyecto debe corresponder a una unidad verificable de trabajo:

- **Issue/Ticket en GitHub Project:** define alcance, criterios y dependencia.
- **Branch dedicada:** implementa solo la capacidad del milestone.
- **PR de milestone:** integra esa capacidad con evidencia, pruebas y validación.
- **Checkpoint verificable:** deja el sistema en un estado funcional al que puede regresarse.

### Política de checkpoints y rollback

- Cada subfase debe cerrar con un punto estable comprobable.
- Si el siguiente milestone rompe comportamiento crítico, debe poder revertirse al checkpoint anterior sin ambigüedad.
- Cada PR debe dejar claro: qué cierra, qué valida, qué no toca y desde qué checkpoint parte.
- El objetivo no es acumular código, sino acumular **estados confiables de producto**.

### Cómo debe gestionarse en GitHub

- El roadmap vive en el **GitHub Project** como fuente de verdad operativa.
- Cada milestone se representa mediante uno o varios issues enlazados.
- Cada PR debe vincular sus issues, criterios de aceptación y evidencia de funcionamiento.
- No debe abrirse una fase superior si la fase base aún no tiene PR merged y checkpoint validado.

Este enfoque convierte el desarrollo en una secuencia de validaciones progresivas y evita caer en una arquitectura teórica no comprobada.

---

## 33. Arquitectura técnica oficial — 10 capas OCTO

```
┌────────────────────────────────────┐
│       1. PRESENTATION LAYER        │
│    Next.js / Dashboard / GUI       │
└────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────┐
│       2. CONTROL PLANE LAYER       │
│      NestJS Modular Core API       │
└────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────┐
│      3. ORCHESTRATION LAYER        │
│     BullMQ / Scheduler / Runs      │
└────────────────────────────────────┘
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Runtime  │ │ Channels │ │Embedding │
│ Workers  │ │ Workers  │ │ Workers  │
└──────────┘ └──────────┘ └──────────┘
 (4. Runtime  (5. Channel  
  Execution)   Isolation)  
                 │
                 ▼
┌────────────────────────────────────┐
│   7. PROVIDER ABSTRACTION LAYER    │
│     LiteLLM / Adapters / MCP       │
└────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────┐
│       8. PERSISTENCE LAYER         │
│ Postgres / Redis / Qdrant / MinIO  │
└────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────┐
│      10. OBSERVABILITY LAYER       │
│  OTEL / Logs / Metrics / Traces    │
└────────────────────────────────────┘

   9. SECURITY LAYER — transversal a todas las capas
   6. INFRASTRUCTURE LAYER — Docker / Coolify / infra/
```

### Descripción de cada capa

| # | Capa | Responsabilidad | Tecnología |
|---|---|---|---|
| 1 | **Presentation** | UI web, Flow Editor, dashboards, Agent Builder, Core Files editor, Templates Hub, Tools Hub, canal adapters visuales | Next.js + React + RSC + Tailwind + shadcn/ui |
| 2 | **Control Plane** | API Gateway, casos de uso, gestión de hierarchy, runs, approvals, budgets, policies, flows, settings | NestJS Modular (apps/api) |
| 3 | **Orchestration** | Encolado de jobs, scheduling, despacho a workers, retries, coordinación de runs distribuidos | BullMQ + Redis (apps/scheduler-worker) |
| 4 | **Runtime Execution** | Loop de ejecución AI, tool loop, planner, memory, reasoning, context compilation, HITL | FastAPI Python worker (apps/runtime-worker) |
| 5 | **Channel Isolation** | Adaptadores desacoplados por canal, cada uno en su propio worker y contenedor | Node.js workers aislados por canal |
| 6 | **Infrastructure** | Contenedores, orquestación, secretos, networking, almacenamiento, backups | Docker + Coolify (infra/) |
| 7 | **Provider Abstraction** | Aislamiento total de SDKs externos, unified interface, fallback chains, routing por modelo | LiteLLM + adapters (packages/sdk-abstractions) |
| 8 | **Persistence** | Estado durable, runs, steps, memoria, embeddings, artifacts, logs, audit | PostgreSQL + Redis + Qdrant + MinIO (packages/database) |
| 9 | **Security** | Auth, encryption, policies, secrets, audit logging, containment, zero trust | packages/security + OWASP + NIST |
| 10 | **Observability** | Métricas, trazas, logs correlacionados, dashboards, alertas, JSONL export | OpenTelemetry + Prometheus + Grafana + Loki |

### Regla de Baileys (WhatsApp)

**Baileys isolation mandatory.** Baileys nunca puede compartir runtime con: API, frontend, embeddings, memory. Vive exclusivamente en `apps/channel-whatsapp-worker` como proceso aislado con su propia cola, contenedor y límites de recursos.

---

*(Tabla reemplazada por arquitectura de 10 capas arriba — ver sección 31 completa.)*

---


## 34. Estructura oficial del monorepo OCTO

```
octo/
│
├── apps/
│   ├── web/                          ← Next.js frontend (Presentation Layer)
│   │
│   ├── api/                          ← NestJS Control Plane ONLY
│   │   └── src/
│   │       ├── agents/
│   │       ├── approvals/
│   │       ├── auth/
│   │       ├── budgets/
│   │       ├── flows/
│   │       ├── hierarchy/
│   │       ├── policies/
│   │       ├── runs/
│   │       ├── settings/
│   │       ├── workspaces/
│   │       └── orchestration/
│   │
│   ├── runtime-worker/               ← AI Runtime aislado (Python/FastAPI)
│   │   ├── executions/
│   │   ├── tool-loop/
│   │   ├── planner/
│   │   ├── memory/
│   │   ├── reasoning/
│   │   └── adapters/
│   │
│   ├── embedding-worker/             ← Embeddings aislados
│   ├── memory-worker/                ← Memory pipelines aislados
│   ├── scheduler-worker/             ← BullMQ scheduler aislado
│   ├── channel-whatsapp-worker/      ← Baileys isolation mandatory
│   ├── channel-telegram-worker/
│   └── channel-discord-worker/
│
├── packages/
│   ├── contracts/                    ← DTOs/types compartidos ONLY
│   ├── events/                       ← Schemas de eventos
│   ├── queue/                        ← Abstracciones BullMQ
│   ├── sdk-abstractions/             ← Provider Abstraction Layer ← ÚNICO lugar con SDKs externos
│   ├── security/                     ← auth/crypto/policies
│   ├── observability/                ← OTEL/logging
│   ├── config/                       ← Validación de env
│   ├── database/
│   │   ├── drizzle/
│   │   ├── migrations/
│   │   └── seeds/
│   ├── prompts/
│   ├── agent-core/                   ← Hierarchy, graph, delegation, authority
│   │   ├── graph/
│   │   ├── delegation/
│   │   ├── authority/
│   │   ├── execution/
│   │   ├── memory/
│   │   └── policies/
│   ├── workflow-engine/
│   ├── mcp/
│   └── ui/
│
├── infra/
│   ├── postgres/
│   ├── redis/
│   ├── qdrant/
│   ├── minio/
│   ├── litellm/
│   └── observability/
│
├── docker/
│   ├── api/
│   ├── runtime/
│   ├── channels/
│   └── workers/
│
├── scripts/
├── docs/
├── .github/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### Stack tecnológico oficial

| Área | Tecnología |
|---|---|
| Frontend | Next.js + React + RSC |
| UI | Tailwind + shadcn/ui |
| Backend | NestJS |
| Runtime AI | FastAPI (Python) |
| Queue | BullMQ |
| Base de datos | PostgreSQL |
| Vector DB | Qdrant |
| Cache | Redis |
| Object Storage | MinIO |
| LLM Gateway | LiteLLM |
| ORM | Drizzle ORM |
| Monorepo | Turborepo |
| Package Manager | pnpm |
| Deployment | Docker + Coolify |

### agent-core — El lugar correcto del hierarchy

El `hierarchy` NO pertenece al módulo `auth`. Pertenece a `packages/agent-core` porque representa estructuras cognitivas y operacionales de agentes, no tenants ni usuarios. Esta distinción es arquitectónicamente crítica: evita que el sistema termine modelando RBAC de SaaS cuando lo que necesita es DAGs de ejecución cognitiva.

---


## 35. Seguridad enterprise 2026

### Compliance Targets

| Estándar | Objetivo |
|---|---|
| ISO/IEC 27001:2022 | ISMS |
| ISO/IEC 27017 | Cloud Security |
| ISO/IEC 27018 | Privacy Controls |
| NIST SP 800-53 Rev5 | Security Controls |
| NIST AI RMF 1.0 | AI Risk Management |
| MITRE ATT&CK v16 | Threat Mapping |
| MITRE D3FEND | Defensive Countermeasures |
| OWASP ASVS 4.0.3 | Application Security |
| OWASP Top 10 2025 | Web Security |
| OWASP LLM Top 10 | AI Security |
| CIS Benchmarks 2026 | Hardening |
| SLSA Level 3+ | Supply Chain Security |
| SBOM CycloneDX | Dependency Inventory |
| CVE Monitoring 2026 | Vulnerability Tracking |

### Container Hardening obligatorio

Todos los contenedores deben cumplir:
- non-root user
- read-only filesystem
- no privileged mode
- seccomp enabled
- AppArmor enabled
- capabilities minimizadas
- no Docker socket mounting
- resource limits: PID limits, memory limits, CPU quotas

### Runtime AI Isolation

Los workers AI deben ejecutarse SIN acceso directo a: secrets globales, postgres raw, filesystem host, Docker daemon, canales críticos.

### CVE Governance Policy

| Severidad | Plazo de parche |
|---|---|
| Critical | < 24 horas |
| High | < 72 horas |
| Medium | < 14 días |

### MITRE ATT&CK — Riesgos prioritarios

| ATT&CK ID | Riesgo |
|---|---|
| T1190 | Exploit Public-Facing Application |
| T1059 | Command Execution |
| T1552 | Credential Exposure |
| T1078 | Valid Accounts |
| T1021 | Remote Services |
| T1611 | Container Escape |
| T1525 | Implant Internal Image |
| T1550 | Token Manipulation |
| T1041 | Exfiltration |
| T1499 | Resource Exhaustion |

### MITRE D3FEND Mapping

| Técnica | Control |
|---|---|
| D3-PSA | Process Sandboxing |
| D3-SCF | Secret Filtering |
| D3-DNSAL | DNS Logging |
| D3-NTA | Network Traffic Analysis |
| D3-FIM | File Integrity Monitoring |
| D3-EDL | Endpoint Detection Logging |

### AI Security — OWASP LLM Top 10

Mitigar obligatoriamente: Prompt Injection, Tool Poisoning, Context Leakage, Data Exfiltration, Agent Hijacking, Memory Poisoning, Excessive Agency, Model Supply Chain.

Todos los tools deben tener: execution timeout, rate limits, audit logging, sandboxing, output validation, schema enforcement, permission boundaries.

### Supply Chain Security

Obligatorio: SBOM generation, provenance signing, artifact signing, dependency pinning, CVE scanning, image scanning, lockfile enforcement.

Herramientas: Semgrep (SAST), Trivy (dependency), Grype (container), Gitleaks (secrets), Syft (SBOM), Cosign (signing), Open Policy Agent (policy), Falco (runtime security).

### Zero Trust Model

Todo request debe validar: identity, permissions, scope, origin, integrity.

### Database Standards

**PostgreSQL obligatorio:** row-level audit, WAL archiving, PITR backups, replication ready, connection pooling, slow query logging.

**Redis obligatorio:** AUTH enabled, protected mode, persistence enabled, memory limits, ACLs.

---

## 36. CI/CD y Git strategy

### Pipeline obligatorio

```
lint → test → sast → sbom → container scan → signing → deploy
```

### Git branches

```
main        ← producción, commits firmados
develop     ← integración
release/*   ← candidatos a release
hotfix/*    ← parches críticos
feature/*   ← features individuales
```

**Protected branches obligatorio:** signed commits, PR reviews, status checks, linear history, CODEOWNERS.

### Deployment strategy

**FASE 1:** Docker + Coolify (estado actual y F1–F9).

**FASE 2:** Migrar a Kubernetes, Nomad o Talos Linux si escala operacionalmente lo justifica.

### Docker standards

Obligatorio en todos los contenedores: multi-stage builds, distroless runtime, image signing, immutable tags, health checks, restart policies.

---

## 37. Flujo operativo de extremo a extremo

1. Un usuario, canal, scheduler o API inicia una tarea.
2. El sistema resuelve Agency, Department, Workspace y Agent destino por jerarquía.
3. Se compilan los Core Files efectivos del agente (Agency → Department → Workspace → Agent).
4. Se resuelve el modelo LLM efectivo y su fallback chain por herencia jerárquica.
5. Se precarga contexto: memoria episódica, RAG, knowledge base, context budget.
6. Se crea el Run con estado inicial y persistencia en DB.
7. El runtime ejecuta RunSteps: planificación, LLM call, tool calls, retrieval, approvals, delegación, replanning.
8. Cada step se persiste como RunStep inmediatamente.
9. Se registran métricas, costos y logs estructurados por cada evento.
10. Si hay acción sensible, se pausa el run y se solicita aprobación humana durable en DB.
11. Si interviene n8n o MCP, la llamada queda trazada en el mismo timeline del run.
12. El sistema consolida salida final, valida output guardrails y responde al canal de origen.
13. La ejecución queda disponible para auditoría, memoria episódica, evaluación y como base para templates futuros.

---

## 38. OCTO como Plataforma Operacional Viva — Deployment por Fases en Coolify

OCTO no es un proyecto que "compila y se entrega". Es una **plataforma operacional viva desplegada continuamente**. Cada fase del desarrollo debe producir un sistema **visible, usable y verificable vía URL pública en Coolify** — no un entregable teórico.

### Principio fundamental de cada fase

Cada fase debe cumplir **todos** estos requisitos sin excepción:

| Requisito | Obligatorio |
|---|---|
| URL pública en Coolify | ✅ Sí |
| GUI funcional | ✅ Sí |
| Backend funcional | ✅ Sí |
| Workers reales corriendo | ✅ Sí |
| Persistencia real en DB | ✅ Sí |
| Observabilidad mínima (logs + health) | ✅ Sí |
| Docker Compose deployable | ✅ Sí |
| Health checks respondiendo | ✅ Sí |
| Logs visibles en Coolify | ✅ Sí |

**El criterio de éxito de cada fase no es "el código compila". Es: "el sistema vive."**

Al abrir la URL de una fase debe poder verse: qué funciona, qué no funciona, qué agentes viven, qué workers corren, qué jobs existen, qué runtime ejecuta, qué memoria existe y qué providers responden.

---

### Por qué Coolify es la plataforma correcta

Coolify provee exactamente las capacidades que OCTO necesita para este modelo de desarrollo continuo:

| Feature de Coolify | Valor para OCTO |
|---|---|
| URL pública inmediata | Cada fase tiene su dominio desde el primer deploy |
| Docker deploy simple | Sin configuración de infra manual |
| Logs visibles en panel | Observabilidad de contenedores sin herramientas extra |
| Restart automático | Los workers sobreviven fallos sin intervención |
| Env vars gestionadas | Credenciales y configs por entorno sin commits |
| Reverse proxy integrado | Networking resuelto automáticamente |
| SSL automático | Cada URL de fase tiene HTTPS desde el día 1 |
| Deploy por push | CD nativo con el repo |

---

### F0 — Foundation Platform

**URL:** `https://f0.octo.local`

**Objetivo:** Construir la fundación operacional mínima. Infra levantada en Coolify con todos los contenedores base respondiendo y visibles.

**Contenedores:**

| Contenedor | Rol |
|---|---|
| `web` | Frontend Next.js — dashboard de estado |
| `api` | NestJS API principal |
| `postgres` | Base de datos principal |
| `redis` | Cola y caché |
| `litellm` | Gateway de LLM providers |

**GUI esperada — Dashboard mínimo de estado:**

```
┌─────────────────────────────┐
│ OCTO FOUNDATION             │
├─────────────────────────────┤
│ API          ✅ Online      │
│ PostgreSQL   ✅ Connected   │
│ Redis        ✅ Connected   │
│ LiteLLM      ✅ Connected   │
│ Runtime      ❌ Offline     │
├─────────────────────────────┤
│ Build: F0                   │
│ Version: 0.0.1              │
└─────────────────────────────┘
```

**Validaciones al completar F0:**

| Validación | Resultado esperado |
|---|---|
| Docker Compose levanta | ✅ |
| Networking entre contenedores | ✅ |
| Reverse proxy en Coolify | ✅ |
| Variables de entorno inyectadas | ✅ |
| Health checks responden | ✅ |
| Deploy automático desde Coolify | ✅ |
| Frontend ↔ API comunicados | ✅ |

---

### F1 — Agent Graph System

**URL:** `https://f1.octo.local`

**Objetivo:** Jerarquía Agency → Department → Workspace → Agent visible, navegable y persistida. El grafo de agentes existe y puede modificarse desde la GUI.

**Contenedor nuevo:** `runtime-worker`

**GUI esperada — Agent Graph Console:**

```
CEO Agent
├── CTO Agent
│   ├── Backend Agent
│   └── Frontend Agent
│
└── Operations Agent
```

**Features visibles en GUI:**

| Feature | Visible |
|---|---|
| Crear agente | ✅ |
| Crear relaciones jerárquicas | ✅ |
| Graph visual navegable | ✅ |
| Estado online/offline por nodo | ✅ |
| Panel de capabilities | ✅ |
| Panel de policies | ✅ |

**Validaciones técnicas:**

| Validación | Resultado |
|---|---|
| Persistencia del grafo en DB | ✅ |
| Registro en runtime-worker | ✅ |
| Topología de agentes | ✅ |
| Contratos input/output | ✅ |
| Actualizaciones por WebSocket | ✅ |

---

### F2 — Execution Engine

**URL:** `https://f2.octo.local`

**Objetivo:** El runtime ejecuta tasks reales. BullMQ corre workers reales. Cada step se persiste y traza en tiempo real.

**GUI esperada — Runtime Execution Console:**

```
Task: "Research AI security"
Status: RUNNING

Planner Agent
  ↓
Research Agent
  ↓
Summarizer Agent
```

**Features visibles en GUI:**

| Feature | Visible |
|---|---|
| Ejecutar task desde GUI | ✅ |
| Cola de jobs visible | ✅ |
| Execution trace en tiempo real | ✅ |
| Streaming de logs por step | ✅ |
| Token usage por call | ✅ |
| Estado de retries | ✅ |
| Runtime events en vivo | ✅ |

**Validaciones técnicas:**

| Validación | Resultado |
|---|---|
| BullMQ procesando jobs | ✅ |
| Isolation por run | ✅ |
| Worker execution real | ✅ |
| Jobs durables (no en memoria) | ✅ |
| Event streaming por WebSocket | ✅ |

---

### F3 — Channels Platform

**URL:** `https://f3.octo.local`

**Objetivo:** Canales de mensajería operativos. Mensajes entrantes llegan, se enrutan y agentes responden. El flujo canal → agente → canal es visible.

**Contenedores nuevos:**

| Contenedor | Canal |
|---|---|
| `channel-whatsapp-worker` | WhatsApp vía Baileys |
| `channel-telegram-worker` | Telegram vía grammY |
| `channel-discord-worker` | Discord |

**GUI esperada — Channels Console:**

```
WhatsApp    ✅ Connected
Telegram    ✅ Connected
Discord     ❌ Offline
```

**Features visibles en GUI:**

| Feature | Visible |
|---|---|
| QR code de pairing WhatsApp | ✅ |
| Mensajes entrantes en tiempo real | ✅ |
| Logs por canal | ✅ |
| Routing de mensaje a agente | ✅ |
| Respuesta del agente visible | ✅ |

**Validaciones técnicas:**

| Validación | Resultado |
|---|---|
| Isolation por canal (contenedor propio) | ✅ |
| Webhooks funcionando | ✅ |
| Queue routing canal → agente | ✅ |
| Propagación de eventos | ✅ |

---

### F4 — Memory System

**URL:** `https://f4.octo.local`

**Objetivo:** Memoria semántica y de grafo operativa. Los agentes recuerdan contexto entre runs. El retrieval es visible y trazable.

**Contenedores nuevos:**

| Contenedor | Rol |
|---|---|
| `qdrant` | Vector store para embeddings |
| `memory-worker` | Procesamiento y retrieval de memoria |

**GUI esperada — Memory Graph Explorer:**

```
[AI Security]
   ↕
[OWASP]
   ↕
[MITRE ATT&CK]
```

**Features visibles en GUI:**

| Feature | Visible |
|---|---|
| Memoria semántica navegable | ✅ |
| Graph memory visual | ✅ |
| Context explorer por agente | ✅ |
| Inspector de retrieval | ✅ |
| Similarity search desde GUI | ✅ |

**Validaciones técnicas:**

| Validación | Resultado |
|---|---|
| Embeddings generados y almacenados | ✅ |
| Retrieval funcional por query | ✅ |
| Persistencia de memoria entre runs | ✅ |
| Context injection en AgentProfile | ✅ |

---

### F5 — Planning & Orchestration

**URL:** `https://f5.octo.local`

**Objetivo:** El planner descompone goals en tareas, genera DAGs, delega a agentes especializados y ejecuta con orden de dependencias correcto.

**GUI esperada — Planning DAG Console:**

```
Goal: "Launch marketing campaign"

Planner
 ├── Research
 ├── Content
 ├── Design
 └── Publish
```

**Features visibles en GUI:**

| Feature | Visible |
|---|---|
| DAG del planner renderizado | ✅ |
| Árbol de delegación | ✅ |
| Subtasks con estado | ✅ |
| Dependencias entre nodos | ✅ |
| Orden de ejecución visible | ✅ |

**Validaciones técnicas:**

| Validación | Resultado |
|---|---|
| Graph execution con dependencias | ✅ |
| Resolución de dependencias | ✅ |
| Planner engine real | ✅ |
| Task decomposition funcional | ✅ |

---

### F6 — Observability Platform

**URL:** `https://f6.octo.local`

**Objetivo:** Observabilidad completa del sistema. Trazas, métricas, logs y costos visibles en dashboards operacionales.

**Contenedores nuevos:**

| Contenedor | Rol |
|---|---|
| `prometheus` | Scraping de métricas |
| `grafana` | Dashboards operacionales |
| `loki` | Agregación de logs estructurados |
| `otel-collector` | Recepción de spans y trazas |

**GUI esperada — Operational Intelligence Console:**

```
CPU          ████████░░ 78%
Memory       ██████░░░░ 61%
Tokens/sec   ████░░░░░░ 42
Executions/min ███░░░░░ 31
Failures     █░░░░░░░░░ 2%
Latency p95  ████░░░░░░ 1.2s
```

**Features visibles en GUI:**

| Feature | Visible |
|---|---|
| Traces por run | ✅ |
| Métricas de sistema | ✅ |
| Logs estructurados | ✅ |
| Replay de ejecuciones | ✅ |
| Cost tracking por run | ✅ |
| Token tracking por modelo | ✅ |

**Validaciones técnicas:**

| Validación | Resultado |
|---|---|
| OpenTelemetry spans emitidos | ✅ |
| Pipeline de métricas | ✅ |
| Logs estructurados (JSONL) | ✅ |
| Correlación trace-run-step | ✅ |

---

### F7 — Governance & Security

**URL:** `https://f7.octo.local`

**Objetivo:** Políticas, aprobaciones HITL, presupuestos y auditoría operativos. El sistema puede detenerse ante acciones sensibles y esperar intervención humana.

**GUI esperada — Governance Console:**

```
Approval Required:
"Deploy Production Agent?"

[Approve]  [Deny]
```

**Features visibles en GUI:**

| Feature | Visible |
|---|---|
| Cola de aprobaciones HITL | ✅ |
| Gestión de políticas por nivel | ✅ |
| Presupuestos y alertas | ✅ |
| Scopes de permisos | ✅ |
| Audit logs en tiempo real | ✅ |

**Validaciones técnicas:**

| Validación | Resultado |
|---|---|
| Policy engine evaluando reglas | ✅ |
| Audit system persistente | ✅ |
| Escalation rules funcionando | ✅ |
| Approval gates pausando runs | ✅ |

---

### F8 — Autonomous Operations

**URL:** `https://f8.octo.local`

**Objetivo:** Agentes autónomos corriendo sin intervención humana. Scheduling, jobs recurrentes, agentes de larga duración y recovery automático.

**GUI esperada — Autonomous Operations Center:**

```
Scheduled Agents:
- Security Scanner      [RUNNING]  Next: 2h
- Market Research       [PAUSED]   Next: 8h
- Monitoring Agent      [RUNNING]  Next: 15m
```

**Features visibles en GUI:**

| Feature | Visible |
|---|---|
| Runs autónomos activos | ✅ |
| Scheduling configurado | ✅ |
| Jobs recurrentes con estado | ✅ |
| Agentes de larga duración | ✅ |

**Validaciones técnicas:**

| Validación | Resultado |
|---|---|
| Persistencia de estado entre runs | ✅ |
| Scheduler ejecutando en horario | ✅ |
| Autonomous runtime sin intervención | ✅ |
| Recovery automático ante fallos | ✅ |

---

### F9 — AI Operating System (Full)

**URL:** `https://octo.domain.com`

**Objetivo:** Convergencia de todas las fases en una sola plataforma operacional completa. El sistema se comporta como un AI Operating System: todas las capas viven juntas, interoperan, son observables y gestionables desde una sola GUI.

**GUI esperada — Full Operational System:**

Todas las capacidades de F0 a F8 convergidas y accesibles desde el Visual IDE con el layout completo de Zonas A/B/C/D:

- Agent Graph navegable
- Runtime ejecutando
- Memoria activa
- Canales conectados
- Planning en ejecución
- Governance vigilando
- Observabilidad completa
- Operaciones autónomas corriendo

**Criterio de completitud de F9:**

> Cuando abres `https://octo.domain.com` puedes decir:
> **"Sí, el sistema vive."**
> — No solamente: *"El código compila."*

---

### Mapa de fases y sus URLs

| Fase | URL | Capacidad principal añadida |
|---|---|---|
| F0 | `https://f0.octo.local` | Infra base: API, DB, Redis, LiteLLM |
| F1 | `https://f1.octo.local` | Jerarquía Agency → Agent, grafo visible |
| F2 | `https://f2.octo.local` | Runtime de ejecución, BullMQ, workers |
| F3 | `https://f3.octo.local` | Canales: WhatsApp, Telegram, Discord |
| F4 | `https://f4.octo.local` | Memoria semántica, Qdrant, RAG |
| F5 | `https://f5.octo.local` | Planner, DAG, delegación |
| F6 | `https://f6.octo.local` | Observabilidad: OTel, Grafana, Loki |
| F7 | `https://f7.octo.local` | Governance, HITL, políticas, auditoría |
| F8 | `https://f8.octo.local` | Operaciones autónomas, scheduling |
| F9 | `https://octo.domain.com` | AI Operating System completo |

Cada fila de esta tabla representa un sistema vivo y desplegado, no un milestone teórico. El avance es acumulativo: F1 incluye todo lo de F0, F2 incluye todo lo de F1, y así sucesivamente. **Ninguna fase se cierra sin su URL respondiendo, su GUI funcional y su health check verde en Coolify.**


---

## 39. OCTO Engineering Doctrine — Principios Arquitectónicos Congelados

Esta sección es el documento de doctrina de ingeniería de OCTO. Sus reglas son **no negociables**. Si en cualquier fase del desarrollo una decisión de implementación entra en conflicto con estas reglas, la decisión incorrecta es la implementación, nunca la doctrina. El objetivo de congelar estos principios ahora es evitar **architecture drift**: el fenómeno donde en F4 o F5 se empieza a romper la arquitectura propia sin darse cuenta, porque no existe una fuente de verdad explícita.

> **Regla de uso:** Antes de fusionar cualquier PR, el autor debe poder responder: "¿Este cambio viola algún principio de la Doctrine?" Si la respuesta es "sí" o "no sé", el PR no se fusiona.

---

### 39.1 Los primitivos reales del sistema

OCTO no es un framework de agentes. Es un **Distributed Cognitive Execution System**. Sus primitivos operacionales reales son:

| Primitivo | Rol en el sistema |
|---|---|
| `AgentNode` | Entidad operacional con identidad, capacidades y políticas |
| `Execution` | Runtime activo de una tarea con ciclo de vida durable |
| `Task` | Unidad atómica de trabajo con input, output y contrato |
| `DelegationEdge` | Relación operacional explícita entre niveles |
| `ExecutionEvent` | Unidad de trazabilidad — todo lo que ocurre emite un evento |
| `MemoryRecord` | Unidad de persistencia cognitiva del agente |
| `ToolInvocation` | Acción externa con contrato, permisos y resultado |
| `ExecutionCheckpoint` | Punto durable de pause/resume en el runtime |
| `PolicyBoundary` | Límite de gobernanza que el sistema no puede cruzar sin autorización |
| `Budget` | Límite de recursos: tokens, tiempo, subtareas, fanout, costo |
| `Capability` | Permiso explícito para ejecutar una acción o herramienta |
| `ExecutionGraph` | DAG operacional inmutable que define el flujo de un run |

Estos primitivos son la base de todo. Cualquier nueva entidad del sistema debe poder describirse en términos de estos doce.

---

### 39.2 Riesgo crítico 1 — Agentes generando agentes sin límite

**El riesgo:** Un agente con capacidad de delegación puede disparar N agentes hijos, cada uno de los cuales dispara N más. En minutos esto destruye CPU, la queue, los costos y la observabilidad.

```
CEO Agent
 → 5 agents
   → 5 agents
     → 5 agents  ← explosión combinatoria
```

**La solución completa requiere cuatro controles simultáneos:**

**A. Recursion depth** — `max_depth_per_run` configurable por nivel jerárquico. Si se supera, el run falla con error explícito, no silenciosamente.

**B. Global execution budget** — No solo tokens. El budget cubre: tiempo máximo de ejecución, número máximo de subtasks, número máximo de tool calls, fanout máximo por nivel y crecimiento máximo de memoria en un run.

**C. Delegation budget** — El control más crítico. Cada nodo del árbol tiene un presupuesto de delegación asignado por su nivel padre. No puede crear más ramas de las que su budget autoriza.

**D. SpawnPolicyResolver** — Nunca `agent.createAgent()` directo. Todo spawning de agente pasa por el `SpawnPolicyResolver` porque crear un agente es una **capability escalation** que requiere autorización explícita.

**Componente requerido:** `ExecutionGovernor` en `packages/governance`, que contiene:

```
ExecutionGovernor
BudgetResolver
DelegationLimiter
RecursionPolicy
FanoutPolicy
SpawnPolicyResolver
```

---

### 39.3 Riesgo crítico 2 — Runtime con estado durable

**El riesgo:** Si el runtime guarda estado crítico en memoria, la muerte del contenedor mata la ejecución. En un sistema durable, esto es inaceptable.

**La doctrina:** El runtime debe ser **stateless o casi stateless**. El estado durable vive exclusivamente en PostgreSQL. El runtime solo ejecuta, procesa, emite eventos y consume jobs de la queue.

**Run State Machine fuera del runtime:** El estado del run (`PENDING → RUNNING → SUSPENDED → COMPLETED → FAILED`) vive en `packages/execution-state`, no en el worker. Cuando el contenedor muere y se reinicia, lee el estado desde DB y continúa desde el último checkpoint.

```
Runtime Worker
  → consume job de BullMQ
  → lee RunState desde Postgres
  → ejecuta step
  → persiste RunStep en Postgres
  → emite ExecutionEvent
  → muere el contenedor → no importa
```

---

### 39.4 Riesgo crítico 3 — Flow Engine == Agent Engine (el desastre más común)

**El riesgo:** Es el error más frecuente en proyectos agentic. Termina así:

```
React Flow controla la ejecución real
```

Esto es un desastre arquitectónico. La UI nunca debe ser el runtime.

**La doctrina:**

- El `ExecutionGraph` (DAG real) vive en `packages/execution-graph`
- El editor visual (`FlowEditor`) solo edita definiciones de grafos, nunca ejecuta
- La relación es exactamente igual a Kubernetes: `kubectl` edita manifests, no controla el runtime

**Immutable Execution Graphs — regla de oro:** Cuando un run empieza, se congela un `execution_snapshot` del grafo en ese momento. Si el usuario modifica el flow después, los runs en curso no se ven afectados. Si no se aplica esta regla, los runs se vuelven **irreproducibles** — imposible debuggear, auditar o reproducir un comportamiento.

```
FlowEditor  →  edita  →  FlowDefinition (mutable)
                               ↓ al iniciar run
                        ExecutionSnapshot (immutable)
                               ↓
                        ExecutionEngine (lo ejecuta)
```

---

### 39.5 Riesgo crítico 4 — Multi-agent antes de runtime estable

**El riesgo:** Multi-agent multiplica la complejidad de forma cuadrática (N²). Si el runtime base no es durable, observable, replayable y gobernable, introducir multi-agent produce caos absoluto. La mayoría de frameworks actuales cometieron exactamente este error.

**La doctrina:** Single-agent runtime primero. No introducir multi-agent hasta que el single-agent cumple todos estos criterios sin excepción:

- ✅ **Durable:** sobrevive reinicios de contenedor
- ✅ **Observable:** cada step tiene trace, log y evento
- ✅ **Replayable:** un run puede reproducirse desde cualquier checkpoint
- ✅ **Gobernable:** los budgets y políticas funcionan y se aplican

Esto aplica hasta F4 o F5 como mínimo. Cualquier introducción prematura de orquestación multi-agent antes de que el single-agent sea sólido está prohibida.

---

### 39.6 Riesgo crítico 5 — UI con conocimiento de negocio

**El riesgo:** El frontend acumula lógica de orchestration, policies, delegation rules y approval logic. Empieza como un "atajo", termina como una dependencia arquitectónica imposible de deshacer.

**La doctrina:** El frontend **solo renderiza state projections**. Nunca conoce:
- Policies de ejecución
- Reglas de orchestration
- Lógica de delegación
- Lógica de aprobación
- Execution rules

El frontend recibe y renderiza: snapshots, traces, events, DTOs. Toda la lógica operacional vive en el backend.

**CQRS projection layer requerido:** Las GUIs operacionales eventualmente necesitan timelines, traces, live graphs, métricas y replay. Esto requiere una capa de proyección explícita que transforme el estado interno del sistema en representaciones optimizadas para la UI, sin que el frontend tenga que conocer el modelo de dominio.

---

### 39.7 Riesgo crítico 6 — Channels con lógica de core

**El riesgo:** Un channel adapter empieza a hacer routing, orquestación, manejo de memoria o aplicación de políticas. Cuando el channel falla, se lleva consigo lógica crítica.

**La doctrina:** Los channels son **dumb transport adapters**. Sus cuatro únicas responsabilidades son:

```
normalize → authenticate → route → emit
```

Nada más. Nunca orchestration, planning, memory, policies ni approval logic.

**WhatsApp específicamente:** Baileys (la librería usada) es estructuralmente inestable: rompe sesiones, consume RAM excesiva, puede crashear Chromium y romper WebSockets. Por esta razón `channel-whatsapp-worker` debe estar totalmente aislado en su propio contenedor, con restart policy agresivo y sin ninguna dependencia hacia el core del sistema más allá de emitir eventos a la queue.

---

### 39.8 Riesgo crítico 7 — Approvals como estado en memoria

**El riesgo:** Una aprobación HITL que vive en memoria desaparece si el contenedor reinicia. El run queda colgado indefinidamente sin posibilidad de reanudar.

**La doctrina:** Las approvals no son notificaciones. Son **execution suspension points** — puntos durables donde la ejecución se pausa hasta recibir una señal externa.

**Los primitivos correctos son:**

```typescript
ExecutionCheckpoint   // estado congelado al suspenderse
SuspensionToken       // identificador durable de la pausa
ResumeToken           // señal que reactiva la ejecución
```

Este modelo es análogo a Temporal.io. El run se suspende en un checkpoint persistido en DB, genera un `SuspensionToken` para el aprobador humano, y cuando llega la aprobación (o el timeout), el `ResumeToken` reactiva el run desde exactamente el mismo punto.

**El verdadero primitivo no es `approval`. Es `durable pause/resume`.** Las approvals son un caso específico de ese primitivo más general.

---

### 39.9 Riesgo crítico 8 — Observabilidad como afterthought

**El riesgo:** La observabilidad se deja para el final. Cuando el sistema está en F5 o F6, debuggear un problema es imposible porque no hay trazas, los IDs no son consistentes y los logs son texto libre.

**La doctrina:** Structured logging obligatorio desde **F0, día 1**. Cada evento del sistema emite obligatoriamente estos cuatro campos como mínimo:

```typescript
{
  trace_id: string,    // correlaciona todos los eventos de un request
  run_id: string,      // identifica el run específico
  agent_id: string,    // identifica el agente
  execution_id: string // identifica la ejecución dentro del run
}
```

Sin estos cuatro campos en cada log, el sistema es **indebuggeable en producción**. No existe workaround: o se instrumenta desde el inicio, o nunca se instrumenta bien.

---

### 39.10 Riesgo crítico 9 — Browser automation en runtime principal

**El riesgo:** Los workers de browser automation (`playwright`, `puppeteer`) corren en el mismo proceso o contenedor que el runtime principal. Los memory leaks, procesos zombie y corrupción de Chromium son inevitables en browser automation sostenida.

**La doctrina:** Browser workers son **efímeros y aislados**. El modelo de ciclo de vida correcto es:

```
spawn → execute → destroy
```

No workers persistentes de browser en contenedores de larga duración. Cada tarea de browser automation arranca un contenedor efímero, ejecuta, entrega resultado y muere. El runtime principal nunca conoce los detalles de ejecución del browser — solo recibe el resultado como una `ToolInvocation` normal.

---

### 39.11 Riesgo crítico 10 — Over-modeling antes de entender el runtime real

**El riesgo:** Se crean 40 entidades, interfaces y abstracciones antes de haber ejecutado un solo agente real. Las abstracciones quedan mal diseñadas porque no se construyeron sobre experiencia operacional real.

**La doctrina:** Los modelos se construyen incrementalmente a medida que el runtime revela sus necesidades reales. La lista mínima de entidades para F0–F2 es:

```typescript
Run
RunStep
AgentProfile
ExecutionEvent   // ← crítico, central para replay/observabilidad/timelines
Tool
ToolInvocation
LLMCall
Budget
Policy
```

`ExecutionEvent` es el más importante de los que se suelen omitir. Sin él, el sistema no puede hacer replay, observabilidad, timelines ni debugging efectivo. Toda acción significativa del sistema emite un `ExecutionEvent` tipado y persistido.

---

### 39.12 Capas del sistema y sus fronteras (inviolables)

| Capa | Contenido | Prohibido en esta capa |
|---|---|---|
| **Platform Kernel** | Runs, estado, eventos, colas, checkpoints, costos | Lógica de agentes, lógica de UI |
| **Runtime Engine** | Ejecución de steps, retries, pause/resume, scheduler | Estado durable en memoria, lógica de negocio |
| **Agent Intelligence** | AgentProfile, prompt compiler, context builder, planning | Lógica de runtime, acceso a DB directo |
| **Execution Graph** | DAG, nodos, edges, scheduler de grafos | Renderizado UI, lógica de agentes |
| **Integration** | MCP, tools, channels, gateways, webhooks | Orchestration, planning, memory |
| **Governance** | Policies, approvals, audit, budgets, compliance | Ejecución directa, acceso a runtime |
| **Experience** | Dashboard, editors, inspectors, traces | Lógica de negocio, orchestration, policies |

**Si una capa viola la columna "Prohibido", el diseño es incorrecto.** No se busca un workaround — se rediseña la interfaz entre capas.

---

### 39.13 Patrones prohibidos (Forbidden Patterns)

Los siguientes patrones están **explícitamente prohibidos** en el codebase de OCTO:

| Patrón prohibido | Por qué | Alternativa correcta |
|---|---|---|
| `agent.createAgent()` directo | Capability escalation sin control | `SpawnPolicyResolver.requestSpawn()` |
| Estado de run en memoria del worker | Muere el contenedor, muere la ejecución | `RunStateRepository` en Postgres |
| `ReactFlow` controlando ejecución | UI como runtime | `ExecutionEngine` consume `ExecutionGraph` |
| `catch (e) {}` silencioso | Errores ocultos imposibles de debuggear | `ExecutionEvent` de tipo `error` + log estructurado |
| Approval como flag en memoria | No sobrevive reinicio | `ExecutionCheckpoint` + `SuspensionToken` en DB |
| Channel con lógica de routing | Acoplamiento channel-orchestration | Channel emite evento, `RoutingEngine` decide |
| Frontend leyendo DB directamente | Acoplamiento UI-dominio | CQRS projection layer |
| Browser worker persistente | Memory leaks, zombie processes | Contenedor efímero spawn/execute/destroy |
| Log de texto libre sin IDs | Indebuggeable en producción | Structured log con `trace_id`, `run_id`, `agent_id`, `execution_id` |
| Multi-agent antes de single-agent durable | Complejidad N² sobre base inestable | Single-agent durable, observable, replayable primero |
| Fix temporal "mientras se hace bien" | Deuda técnica invisible acumulada | Se documenta como deuda explícita o no se implementa |
| Migración incompleta con dos versiones coexistiendo | Comportamiento no determinista | Estrategia de reemplazo cerrada antes de iniciar |

---

### 39.14 Reglas de observabilidad (obligatorias desde F0)

- Todo evento significativo del sistema emite un `ExecutionEvent` tipado y persistido.
- Cada log incluye obligatoriamente: `trace_id`, `run_id`, `agent_id`, `execution_id`.
- Ningún error se captura silenciosamente — todo error es un `ExecutionEvent` de tipo `error` con contexto completo.
- Las métricas de costo, tokens y latencia se emiten en tiempo real, no se calculan retroactivamente.
- El `RunDebugger` debe poder reproducir cualquier run desde cualquier checkpoint usando solo los `ExecutionEvent` almacenados.
- Grafana, Prometheus y Loki están presentes desde F6 pero los datos que consumen se producen correctamente desde F0.

---

### 39.15 Filosofía de persistencia

- **El estado durable vive en PostgreSQL.** Redis es caché y queue, no fuente de verdad.
- **Cada `RunStep` se persiste inmediatamente al crearse**, no al completarse. Si el worker muere, el estado queda en el último step persistido.
- **Los `ExecutionCheckpoint` son los puntos de reinicio**. El sistema puede reanudarse desde cualquier checkpoint sin reejecutar steps anteriores.
- **Los `ExecutionEvent` son inmutables.** Una vez emitidos, nunca se modifican. El historial de ejecución es append-only.
- **Los `ExecutionSnapshot` de grafos son inmutables.** El grafo que ejecutó un run nunca cambia, aunque el flow definition del usuario se modifique después.

---

### 39.16 Modelo de eventos del sistema

El sistema de eventos es el tejido nervioso de OCTO. Sin él no hay replay, no hay observabilidad, no hay timelines, no hay debugging.

**Eventos mínimos requeridos desde F0:**

```typescript
run.created
run.started
run.step.created
run.step.completed
run.step.failed
run.suspended        // checkpoint + suspension_token
run.resumed          // resume_token resolvido
run.completed
run.failed
llm.call.started
llm.call.completed
llm.call.failed
tool.invocation.started
tool.invocation.completed
tool.invocation.failed
agent.spawned        // vía SpawnPolicyResolver
agent.delegation.requested
agent.delegation.approved
agent.delegation.rejected
approval.requested
approval.resolved
budget.threshold.reached
budget.exceeded
policy.evaluated
policy.blocked
channel.message.received
channel.message.routed
channel.message.sent
```

Cada evento incluye: `event_id`, `trace_id`, `run_id`, `agent_id`, `timestamp`, `type`, `payload`, `version`.

---

### 39.17 Resumen ejecutivo de la Doctrine

> OCTO es un **Distributed Cognitive Execution System**, no un framework de agentes.
>
> Sus reglas fundamentales son:
> 1. El runtime es stateless — el estado durable vive en Postgres.
> 2. El flow editor edita definiciones — el execution engine ejecuta grafos inmutables.
> 3. Los channels son dumb adapters — nunca orquestan.
> 4. La UI renderiza proyecciones — nunca contiene lógica de negocio.
> 5. La observabilidad existe desde F0 — nunca es un afterthought.
> 6. Los approvals son checkpoints durables — no flags en memoria.
> 7. El spawning de agentes pasa por `SpawnPolicyResolver` — nunca directo.
> 8. El single-agent runtime es durable, observable y replayable antes de introducir multi-agent.
> 9. Cada error emite un `ExecutionEvent` — ningún catch es silencioso.
> 10. Cada deploy deja el sistema en un estado igual o mejor al anterior — nunca más frágil.
>
> **Si una decisión de implementación viola cualquiera de estas diez reglas, la decisión incorrecta es la implementación.**


---

## 40. Refinamientos y Capacidades Avanzadas — Adopciones por Referencia

Esta sección consolida las recomendaciones de profundidad técnica derivadas del análisis comparativo de las plataformas de referencia. Cada recomendación está clasificada por prioridad, la sección del documento que modifica, y los principios de la Engineering Doctrine que aplican. Estas no son funciones opcionales: son capacidades que elevan OCTO de una plataforma robusta a un sistema **excepcionalmente capaz y diferenciado** en el ecosistema de agentes de IA.

---

### 40.1 Tabla de prioridades

| Prioridad | Recomendación | Referencia | Sección OCTO afectada |
|---|---|---|---|
| 🔴 Alta | Checkpointing delta (Delta Channels) | LangGraph 1.2 | §12 Runtime durable |
| 🔴 Alta | Hard stop de budgets por nivel | Paperclip | §8.6 Presupuesto |
| 🔴 Alta | Planners configurables con task decomposition | Hermes | §16 Multi-agent |
| 🔴 Alta | FilterPipeline — Middleware hooks de ejecución | Semantic Kernel / MAF | §18 Seguridad + Capa 9 |
| 🟡 Media | Time travel y replay desde checkpoint arbitrario | LangGraph | §19.2 Run Debugger |
| 🟡 Media | Async messaging entre agentes (AgentBus) | AutoGen 0.4 | §16 Multi-agent |
| 🟡 Media | Self-evolving skills con aprobación opcional | Hermes | §6 Hub de Tools y Skills |
| 🟡 Media | NLWeb protocol para interacción web sin API | Microsoft AI Agents | §17 Protocolos externos |
| 🟡 Media | SystemMessageTemplate.md por nivel | Microsoft AI Agents | §5 Core Files |
| 🟡 Media | Debugger con pause, inspect y fork | AgenticLens | §21 Observabilidad |
| 🟢 Baja | Fractal graph view (Neurite-inspired) | Neurite | §15.6 Knowledge Graph |
| 🟢 Baja | Form input como trigger de flow | Flowise | §11 Flow Editor |
| 🟢 Baja | Timelapse de ejecuciones | AgentNeo | §25 Dashboard |
| 🟢 Baja | Auto-generación de briefs post-run | WorkGraph | §21 Observabilidad |

---

### 40.2 CrewAI — CollaborationMode, SharedMemoryScope y HierarchicalProcess

#### 40.2.1 CollaborationMode en Crew y Department

OCTO tiene la jerarquía Agency → Department → Workspace → Agent, pero no define explícitamente el **modo de coordinación** entre agentes de un mismo nivel. CrewAI define tres modos de ejecución dentro de un Crew: secuencial, jerárquico y paralelo.

**Adopción en OCTO:** Añadir `CollaborationMode` como campo de configuración en Workspace y Department con tres valores:

| Modo | Comportamiento |
|---|---|
| `sequential` | Los agentes ejecutan en orden definido, cada uno recibe el output del anterior |
| `hierarchical` | Un agente manager orquesta y delega a subordinados, consolida resultados |
| `parallel` | Los agentes ejecutan independientemente en paralelo, resultados se agregan al final |

Este campo se configura en la tab Overview del nivel correspondiente y es heredable jerárquicamente. Si un Workspace no lo define, hereda el del Department.

#### 40.2.2 SharedMemoryScope

CrewAI permite que agentes de un mismo Crew compartan memoria para contexto colaborativo. OCTO no tiene un concepto explícito de memoria compartida dentro de un nivel.

**Adopción en OCTO:** Añadir `SharedMemoryScope` en Workspace y Department. Los agentes dentro del mismo scope pueden acceder a un segmento de memoria episódica compartida — el contexto de conversaciones grupales, decisiones de equipo y artefactos producidos en ese nivel. La memoria compartida es:
- **Visible** para todos los agentes del scope
- **Escribible** solo por agentes que tienen el permiso `memory.write` en ese nivel
- **Trazable**: cada escritura registra qué agente escribió y en qué run

#### 40.2.3 HierarchicalProcess explícito

El patrón donde un agente manager delega tareas a subordinados y consolida resultados existe implícitamente en la jerarquía de OCTO, pero no está formalizado como un patrón de orquestación invocable.

**Adopción en OCTO:** Formalizar `HierarchicalProcess` como patrón de orquestación disponible en el Flow Editor, con nodos explícitos:

```
[Manager Agent]
  ↓ delegate(task_1)     ↓ delegate(task_2)
[Worker Agent A]      [Worker Agent B]
  ↓ result_1              ↓ result_2
        ↘                ↙
         [Consolidator]
              ↓
         [Final Result]
```

El Manager no ejecuta la tarea: planifica, delega y consolida. Los Workers ejecutan. El Consolidator (que puede ser el mismo Manager) agrega los resultados con una lógica configurable.

#### 40.2.4 Formato estándar de importación de plantillas

Estandarizar el formato de importación de plantillas de agentes para que incluya los campos de CrewAI como metadatos importables, mapeados a Core Files:

| Campo CrewAI | Mapeo en OCTO |
|---|---|
| `role` | `IDENTITY.md → ## Role` |
| `goal` | `IDENTITY.md → ## Goal` |
| `backstory` | `SOUL.md → ## Backstory` |
| `tools` | `TOOLS.md → ## Assigned Tools` |
| `verbose` | Config de agente → `logging.verbose` |

---

### 40.3 LangGraph — Delta Checkpoints, Time Travel y Pregel Runtime

#### 40.3.1 Checkpointing delta (🔴 Alta prioridad)

LangGraph 1.2 introdujo `DeltaChannel`, un mecanismo que reduce el almacenamiento de checkpoints de O(N²) a O(N) para runs de larga duración (demostrado: de 5.3 GB a 129 MB para 200 turnos).

**Adopción en OCTO:** Implementar checkpointing delta en el `RuntimeStateRepository`:

- Para estados acumulativos (historiales de mensajes, contexto creciente), almacenar **solo deltas** en Redis
- Crear snapshots completos periódicamente (configurable, default: cada 50 steps)
- Al reanudar un run, reconstruir el estado desde el snapshot más reciente + los deltas acumulados

```
Step 1  → full snapshot
Step 2  → delta(2-1)
Step 3  → delta(3-2)
...
Step 50 → full snapshot
Step 51 → delta(51-50)
```

Esto es especialmente crítico para SubAgents, runs de larga duración y deploys de agentes autónomos (F8).

#### 40.3.2 Time Travel — Reanudar desde checkpoint arbitrario (🟡 Media)

LangGraph permite reanudar la ejecución desde **cualquier checkpoint anterior**, no solo el último.

**Adopción en OCTO:** En el Run Debugger (§19.2), añadir capacidad de **Time Travel**:

- El timeline del run muestra todos los checkpoints con su estado
- El operador puede seleccionar cualquier checkpoint y crear una nueva ejecución desde ese punto
- El run original no se modifica; se crea un `run_fork` con `parent_run_id` y `fork_checkpoint_id`
- El fork es trazable en el dashboard como derivado del run original

Casos de uso: corregir un error a mitad de un run largo sin reejecutar desde cero, experimentar con diferentes estrategias desde un punto determinado, post-mortem de fallos.

#### 40.3.3 Checkpointers multi-backend

**Adopción en OCTO:** Configurar el backend de checkpoints por entorno:

| Entorno | Backend de checkpoints |
|---|---|
| Desarrollo (F0–F4) | Redis (rápido, efímero) |
| Producción | PostgreSQL (durable, indexable) |
| Archivo largo plazo | S3 / S3 Glacier |

Configurable desde `Settings → Storage → Checkpoint Backend` con fallback automático a PostgreSQL si Redis no está disponible.

#### 40.3.4 Pregel Runtime — Ejecución paralela de steps independientes

El núcleo de LangGraph es el modelo Pregel: ejecución en "supersteps" donde los nodos independientes de un mismo paso se ejecutan en paralelo.

**Adopción en OCTO:** El Runtime Worker puede adoptar el modelo Pregel para `RunStep` independientes:

- Si dos o más `RunStep` no tienen dependencia entre sí, se ejecutan en paralelo como un superstep
- El Runtime espera a que todos los steps del superstep completen antes de avanzar
- Esto mejora significativamente la latencia en flows con múltiples herramientas independientes o agentes paralelos

---

### 40.4 Flowise — Modos de Builder, Flow Validation y Form Triggers

#### 40.4.1 Tres modos de edición en el Flow Editor

Flowise ofrece tres constructores: Assistant (chat simple con RAG), Chatflow (single-agent con lógica avanzada) y Agentflow (multi-agent con orquestación).

**Adopción en OCTO:** El Flow Editor expone tres modos de complejidad seleccionables al crear un nuevo flow:

| Modo | Complejidad expuesta | Casos de uso |
|---|---|---|
| `simple` | Solo nodos de agente, canal y respuesta | Bots de respuesta directa |
| `advanced` | Nodos de lógica, condiciones, tools, RAG | Agentes con razonamiento complejo |
| `multi-agent` | Nodos de orquestación, delegación, crews | Sistemas multi-agente completos |

El modo puede cambiarse en cualquier momento sin perder la definición del flow.

#### 40.4.2 Flow Validation automática

**Adopción en OCTO:** El Flow Editor incluye un validador que se ejecuta antes de cada deploy de un flow y revisa:

- Ciclos en el DAG (no permitidos, excepto en nodos de retry explícito)
- Nodos sin conexión de entrada o salida
- Tipos de entrada/salida incompatibles entre nodos conectados
- Herramientas asignadas a nodos sin permisos configurados
- Políticas de aprobación requeridas pero no configuradas
- Presupuesto no asignado para flows con agentes de costo alto

El validador muestra errores con localización exacta del nodo problemático y sugerencia de corrección. Un flow con errores de validación no puede deployarse.

#### 40.4.3 Form Input como trigger de flow (🟢 Baja)

**Adopción en OCTO:** Añadir un nodo `FormTrigger` en el Flow Editor que define campos de entrada estructurados:

- Tipos soportados: `text`, `number`, `date`, `select`, `multiselect`, `file`
- Validación configurable por campo (requerido, regex, rango)
- El form se puede embeber en la WebChat del canal o invocar desde la API
- Los datos del formulario se inyectan como `input` inicial del flow con tipado explícito

#### 40.4.4 Template Marketplace con componentes reusables

**Adopción en OCTO:** Extender el Templates Hub para permitir publicación de **componentes reusables**:

- Subflows (grupos de nodos que pueden importarse como un nodo único)
- Nodos personalizados con lógica propia
- Conjuntos de tools preconfiguradas para un dominio
- Cada componente tiene versión, autor, descripción y métricas de uso

---

### 40.5 Semantic Kernel — FilterPipeline, Semantic Cache y Parallel Orchestration

#### 40.5.1 FilterPipeline — Middleware de ejecución (🔴 Alta prioridad)

Semantic Kernel implementa un pipeline de filtros completo: rate limiting, semantic caching, audit logging, output validation y token metering.

**Adopción en OCTO:** Implementar `FilterPipeline` en el runtime como un middleware configurable que se ejecuta antes y después de cada `LLMCall` y `ToolInvocation`. Los filtros son configurables por nivel jerárquico:

```
Request → [RateLimitFilter] → [CacheFilter] → [AuditFilter] → LLMCall
                                                                    ↓
Response ← [OutputValidationFilter] ← [TokenMeterFilter] ← LLMCall
```

Filtros disponibles (configurables desde Settings → Governance):

| Filtro | Función |
|---|---|
| `RateLimitFilter` | Limita llamadas por tiempo y nivel |
| `SemanticCacheFilter` | Busca respuesta cacheada antes de llamar al LLM |
| `AuditFilter` | Registra input/output en audit log |
| `OutputValidationFilter` | Aplica output guardrails y reglas de formato |
| `TokenMeterFilter` | Acumula tokens y verifica budget antes de ejecutar |
| `InjectionDetectorFilter` | Bloquea prompt injection antes de enviar al LLM |
| `ContentSafetyFilter` | Valida contenido según políticas de seguridad |

Los operadores pueden crear filtros personalizados implementando la interfaz `IExecutionFilter` y registrarlos en el Hub.

#### 40.5.2 Semantic Caching (reducción 30-60% de costos)

Semantic Kernel tiene un "Redis Semantic Cache" que logra reducción del 30–60% en costos al cachear respuestas LLM por similitud semántica.

**Adopción en OCTO:** El `SemanticCacheFilter` del pipeline usa Qdrant como vector store. Antes de cada llamada LLM:

1. Genera embedding del prompt compilado
2. Busca en Qdrant si existe una respuesta cacheada con similitud > umbral configurable (default: 0.92)
3. Si existe y no ha expirado (`ttl` configurable), devuelve la respuesta cacheada como `cached_llm_response`
4. El `ExecutionEvent` registra si la respuesta fue del cache o del LLM real, con el ahorro en tokens y costo

El cache tiene tres políticas de invalidación: `ttl`, `manual` (el operador invalida desde el dashboard) y `content_change` (se invalida cuando los Core Files del agente cambian).

#### 40.5.3 Parallel Orchestration Pattern

**Adopción en OCTO:** En el `RunStep` de tipo `llm_call`, permitir que múltiples llamadas LLM independientes se ejecuten en paralelo con agregación de resultados:

```typescript
RunStep {
  type: 'parallel_llm_calls',
  calls: [
    { agent: 'research_agent', prompt: '...' },
    { agent: 'analysis_agent', prompt: '...' },
    { agent: 'synthesis_agent', prompt: '...' }
  ],
  aggregation: 'concat' | 'vote' | 'first' | 'custom'
}
```

Reducción de latencia significativa en flows con múltiples agentes independientes que trabajan sobre el mismo input.

#### 40.5.4 Cuatro primitivas de Semantic Kernel mapeadas

Adoptar explícitamente el modelo de cuatro primitivas:

| Primitiva SK | Implementación en OCTO |
|---|---|
| Plugins | Tools y Skills del Hub (§6) |
| Planners | Motor de planificación con estrategias configurables (ReAct, CoT, ToT) |
| Memory | Sistema de memoria episódica y semántica (§15) |
| Filters | `FilterPipeline` del runtime (nuevo, §35.5.1) |

---

### 40.6 Hermes — PlannerProfile, Self-Evolving Skills y Event-Triggered Heartbeats

#### 40.6.1 PlannerProfile con task decomposition configurable (🔴 Alta)

Hermes tiene un motor de planificación que descompone automáticamente tareas complejas en subtareas usando Planner Profiles configurables.

**Adopción en OCTO:** Añadir `PlannerProfile` como entidad de configuración por nivel (Agency / Department / Workspace), con los siguientes campos:

```typescript
PlannerProfile {
  id: string
  name: string
  domain: 'software_development' | 'customer_support' | 'research' | 'marketing' | 'custom'
  strategy: 'react' | 'chain_of_thought' | 'tree_of_thought' | 'plan_and_execute'
  max_subtasks: number
  max_depth: number
  decomposition_prompt: string    // prompt personalizado para el planner
  consolidation_strategy: 'summary' | 'vote' | 'first_valid' | 'merge'
  replanning_enabled: boolean
  replanning_trigger: 'on_failure' | 'on_timeout' | 'on_quality_threshold'
}
```

El `PlannerProfile` se hereda jerárquicamente y puede sobreescribirse en cualquier nivel. Se configura desde la tab `Overview` de cada nivel.

#### 40.6.2 Self-Evolving Skills con aprobación opcional (🟡 Media)

Hermes tiene "self-evolving skills" con tres capas: atomic skills, composite skills (Skill Graph) y meta-skills que optimizan automáticamente.

**Adopción en OCTO:** Extender el sistema de Skills (§6) para soportar evolución dirigida por agentes:

- Los agentes pueden **proponer** nuevas skills a partir de patrones exitosos detectados en runs anteriores
- Las propuestas se registran como `PendingSkill` con la lógica generada y métricas de éxito que la justifican
- Con `SkillEvolution.approval = required` (default): van a la cola de aprobación del nivel correspondiente
- Con `SkillEvolution.approval = auto` (avanzado): se registran automáticamente si superan el umbral de calidad
- Las skills aprobadas se registran en `TOOLS.md` del nivel que las originó y quedan disponibles para herencia

**Composite Skills:** Las skills pueden componerse en `SkillGraph`: un grafo de skills que se ejecutan en secuencia o paralelo, creando skills de orden superior. Ejemplo: `research + summarize + format = briefing_skill`.

#### 40.6.3 Event-Triggered Heartbeats

`HEARTBEAT.md` ya cubre cron y tareas periódicas. Añadir **heartbeats activados por eventos**:

```yaml
# HEARTBEAT.md — Event triggers
event_triggers:
  - on: artifact.created
    condition: "artifact.type == 'report'"
    action: notify_department_manager
    
  - on: run.failed
    condition: "run.cost > 5.00"
    action: escalate_to_agency_review
    
  - on: budget.threshold_reached
    condition: "threshold == 0.80"
    action: pause_low_priority_agents
```

Estos triggers se procesan por el `RoutineEngine` de la misma forma que los cron jobs, con los mismos mecanismos de persistencia, trazabilidad y HITL.

#### 40.6.4 Vista Kanban de tareas por nivel

**Adopción en OCTO:** En el Dashboard, añadir una vista `Kanban` como tab alternativo al gráfico de Runs:

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   PENDING   │  │   RUNNING   │  │  BLOCKED    │  │  COMPLETED  │
├─────────────┤  ├─────────────┤  ├─────────────┤  ├─────────────┤
│ Task A      │  │ Task C      │  │ Task E      │  │ Task G      │
│ Task B      │  │ Task D      │  │ (awaiting   │  │ Task H      │
│             │  │             │  │  approval)  │  │             │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

Las tareas son Runs agrupados por estado. El usuario puede arrastrar runs de Blocked a Running (al aprobar), y de Running a Completed (manualmente si necesita). El Kanban filtra por el nivel jerárquico activo en Zona B.

---

### 40.7 Microsoft Agent Framework — AgentBus, Convergencia de Ramas y Magentic-One

#### 40.7.1 AgentBus — Async messaging con pub/sub (🟡 Media)

AutoGen v0.4 introdujo una arquitectura completamente asíncrona con `RoutedAgent` y un modelo de pub/sub para mensajes entre agentes.

**Adopción en OCTO:** Implementar `AgentBus` como canal de eventos global con pub/sub:

```typescript
// Un agente publica un evento
AgentBus.publish({
  type: 'research.completed',
  from: 'research_agent_id',
  payload: { topic: 'AI security', summary: '...' }
})

// Otro agente se suscribe a ese tipo de evento
AgentBus.subscribe('research.completed', async (event) => {
  // el agente analysis_agent reacciona automáticamente
})
```

Beneficios: comunicación desacoplada, escalabilidad horizontal de workers, y resiliencia ante fallos individuales. El `AgentBus` se implementa sobre el sistema de eventos existente (`ExecutionEvent`), no como infraestructura paralela.

La comunicación entre agentes es **asíncrona por defecto**: cuando un agente A delega a B, A no espera bloqueado. Recibe un `ExecutionEvent` de tipo `delegation.completed` cuando B termina. Esto elimina deadlocks en orquestaciones complejas.

#### 40.7.2 Convergencia de ramas paralelas con políticas configurables

El Flow Editor de OCTO ya tiene nodos `Condition` y `Merge`. Añadir soporte explícito para convergencia de ramas paralelas con políticas:

| Política | Comportamiento |
|---|---|
| `wait_for_all` | Espera a que todas las ramas paralelas terminen |
| `wait_for_any` | Continúa cuando la primera rama termina |
| `wait_for_majority` | Continúa cuando la mayoría (N/2+1) termina |
| `wait_for_n` | Espera N ramas específicas configurables |
| `first_valid` | Continúa con el primer resultado que pasa validación |

El nodo `ParallelGateway` (apertura) y `ConvergenceGateway` (cierre) encapsulan estas políticas, con timeout configurable y política de fallback si el timeout se alcanza.

#### 40.7.3 HITL con tres modos de AutoGen

Extender el sistema HITL (§12.4) para soportar tres modos por Run o por nivel:

| Modo | Comportamiento |
|---|---|
| `NEVER` | Ejecución completamente autónoma, sin pausas para aprobación |
| `ALWAYS` | Cada step significativo requiere aprobación antes de continuar |
| `TERMINATE` | Solo requiere aprobación al finalizar el run |

Estos modos se configuran en el `PlannerProfile` y pueden sobreescribirse por Run desde la interfaz de ejecución.

#### 40.7.4 Patrón Magentic-One como orquestación predefinida

**Adopción en OCTO:** Añadir `MagenticOne` como patrón de orquestación disponible en el Flow Editor y como plantilla en el Templates Hub:

```
Orchestrator Agent
  ├── WebSearch Agent    (búsqueda web y APIs)
  ├── Analysis Agent     (procesamiento de datos)
  ├── Code Agent         (generación y ejecución de código)
  ├── Document Agent     (lectura y síntesis de documentos)
  └── Verifier Agent     (validación de resultados antes de consolidar)
```

El Orchestrator mantiene un "ledger" de progreso de la tarea. Cada agente especializado opera de forma independiente. El Verifier valida los resultados antes de que el Orchestrator consolide la respuesta final.

---

### 40.8 n8n — Trigger Nodes, Code Nodes y Integraciones Nativas

#### 40.8.1 Start con triggers múltiples

**Adopción en OCTO:** El nodo `Start` del Flow Editor acepta diferentes tipos de trigger como origen del flow:

| Tipo de trigger | Cuándo activa el flow |
|---|---|
| `webhook` | Cuando llega una petición HTTP al endpoint del flow |
| `schedule` | Según expresión cron configurada |
| `event` | Cuando ocurre un `ExecutionEvent` de tipo específico |
| `message` | Cuando un canal recibe un mensaje que coincide con un patrón |
| `form` | Cuando se envía un formulario (§35.4.3) |
| `manual` | Solo al ser invocado explícitamente desde la UI o API |
| `api` | Invocado desde la API REST de OCTO con payload |

#### 40.8.2 Nodo Code — JavaScript/Python en el Flow Editor

**Adopción en OCTO:** Añadir un nodo `Code` en el Flow Editor que ejecuta código arbitrario:

- Lenguajes: JavaScript (Node.js) y Python
- Acceso a datos del flow: `input`, `context`, `memory`, `tools`
- Sandboxing configurable: `sandbox: 'v8isolate' | 'docker' | 'none'`
- Para código de alto riesgo o con I/O externo: ejecutar en contenedor efímero (§34.10)
- El output del nodo es el valor retornado por el código
- Integrado con el sistema de trazabilidad: el código ejecutado se registra como `ToolInvocation`

#### 40.8.3 Hub de integraciones con nodos pre-construidos

**Adopción en OCTO:** El Tools Hub incluye nodos de integración pre-construidos para servicios populares, con autenticación gestionada desde `Settings → APIs`:

Categorías de integración disponibles en el Hub:
- **LLM & AI:** OpenAI, Anthropic, Gemini, Mistral, Perplexity
- **Productivity:** Google Sheets, Notion, Airtable, Monday.com
- **Communication:** Slack, Discord, Teams, Email (SMTP/IMAP)
- **Development:** GitHub, GitLab, Jira, Linear
- **Storage:** S3, Google Drive, Dropbox
- **Data:** PostgreSQL, MySQL, MongoDB, Redis
- **HTTP:** REST client genérico, GraphQL client

Cada integración es un nodo que encapsula autenticación, manejo de errores y retry logic. Las credenciales se gestionan en `Settings → APIs` y se referencian por nombre, nunca se exponen en el flow definition.

---

### 40.9 Paperclip — Hard Stop Budgets, Ticket System y Goal Tracing

#### 40.9.1 Hard stop budgets por nivel (🔴 Alta)

Paperclip implementa budget limits por agente con hard stop automático.

**Adopción en OCTO:** Añadir `BudgetPolicy.hard_stop` como configuración por nivel:

```typescript
BudgetPolicy {
  level: 'agency' | 'department' | 'workspace' | 'agent'
  monthly_limit_usd: number
  token_limit: number
  hard_stop: boolean          // si true: bloquea ejecución al alcanzar límite
  stop_threshold: number      // default: 1.0 (100%)
  warning_threshold: number   // default: 0.8 (80%)
  on_stop: 'block_all' | 'block_new_only' | 'pause_low_priority'
  resume_requires: 'human_approval' | 'budget_reset' | 'manual'
}
```

Con `hard_stop: true`: cuando un nivel alcanza su `stop_threshold`, todos sus agentes quedan en estado `BUDGET_BLOCKED`. Los runs en curso se suspenden en su próximo checkpoint. Ningún nuevo run puede iniciarse. La reanudación requiere la acción configurada en `resume_requires`.

El operador ve en el Dashboard el nivel bloqueado con badge rojo de `BUDGET_EXCEEDED` y un botón de "Aprobar extensión" que abre un modal con el detalle de consumo.

#### 40.9.2 Ticket — Agrupación de Runs relacionados

**Adopción en OCTO:** Añadir entidad `Ticket` que agrupa múltiples Runs relacionados con un mismo objetivo:

```typescript
Ticket {
  id: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'blocked' | 'resolved' | 'closed'
  priority: 'critical' | 'high' | 'medium' | 'low'
  runs: Run[]           // todos los runs asociados
  goal_id?: string      // goal que originó este ticket
  comments: Comment[]   // comentarios humanos
  created_by: AgentNode | User
  assigned_to: AgentNode | User
  created_at: timestamp
  resolved_at?: timestamp
}
```

Los Tickets se gestionan desde el menú **Approvals** (que se renombraría a **Approvals & Tickets**) y son visibles en el Kanban del Dashboard (§35.6.4).

#### 40.9.3 Goal tracing inverso — goalId en Run y RunStep

**Adopción en OCTO:** Añadir `goal_id` como campo en `Run` y `RunStep` para correlacionar cada ejecución con el Goal que la originó:

- Cuando un Run se inicia en respuesta a un Goal o sub-Goal, hereda el `goal_id`
- El Dashboard de Goals muestra progreso real calculado desde Runs completados vinculados
- Clicking en el gráfico de progreso de un Goal navega a la lista de Runs que contribuyeron
- Las ejecuciones huérfanas (sin `goal_id`) se muestran como "operacionales" en el Dashboard

---

### 40.10 Microsoft AI Agents for Beginners — Metacognición, Confiabilidad y NLWeb

#### 40.10.1 Capa de metacognición en el agente (Lesson 9)

La metacognición es la capacidad del agente de evaluar y ajustar sus propias acciones basándose en autoconciencia y experiencias pasadas.

**Adopción en OCTO:** Añadir `MetacognitionLayer` en la Agent Intelligence (F3):

- **Diario de razonamiento:** El agente mantiene un log de sus decisiones durante el Run, almacenado en `MEMORY.md → ## Reasoning Log`
- **Auto-evaluación post-run:** Al completar un Run vinculado a un Goal, el agente evalúa su propio desempeño contra el Goal usando una rubric configurable. El resultado se almacena como `SelfEvaluation` con score y justificación
- **Lecciones aprendidas:** Los errores y ajustes del agente se registran en `MEMORY.md → ## Lessons Learned` y se recuperan en contexto en runs futuros
- **Explicabilidad:** El agente puede responder "¿Por qué tomé esta decisión?" recuperando el `reasoning_log` del RunStep correspondiente

#### 40.10.2 SystemMessageTemplate.md por nivel (🟡 Media)

**Adopción en OCTO:** Añadir `SystemMessageTemplate.md` como nuevo Core File opcional en cualquier nivel de la jerarquía:

```markdown
# SystemMessageTemplate.md

## Purpose
Meta-prompt que guía cómo se construyen los prompts de sistema
de los agentes descendientes.

## Constraints
- Todos los agentes de este nivel deben responder en español formal
- Todas las respuestas deben incluir nivel de confianza
- Las referencias a datos externos deben citarse explícitamente

## Format
- Respuestas estructuradas con secciones claras
- Límite de 500 palabras por respuesta por defecto
- Código siempre en bloques formateados
```

El `PromptCompiler` de la capa de inteligencia procesa este template antes de compilar el prompt final del agente, asegurando consistencia de estilo y restricciones en toda la jerarquía.

#### 40.10.3 Panel de Transparencia en el Dashboard

**Adopción en OCTO:** Añadir tab `Transparency` en el Dashboard de cualquier nivel, que muestra:

| Sección | Contenido |
|---|---|
| **Tools disponibles** | Lista de tools con su origen (propio, heredado de qué nivel) |
| **Policies activas** | Policies que aplican a este nivel y su fuente jerárquica |
| **Contexto inyectado** | Core Files resueltos en el último run de este nivel |
| **Cadena de decisión** | Resumen del reasoning log del último run |
| **Filtros activos** | FilterPipeline configurado para este nivel |
| **Budget status** | Consumo actual vs límite con proyección |

Esto transforma los agentes de "cajas negras" en "cajas de cristal" auditables por cualquier operador con permisos de visualización.

#### 40.10.4 NLWeb Protocol (🟡 Media)

NLWeb es un protocolo que lleva interfaces de lenguaje natural a cualquier sitio web, permitiendo que agentes descubran e interactúen con contenido web de forma estructurada sin necesidad de APIs específicas.

**Adopción en OCTO:** Añadir soporte para `NLWebClient` como tool nativa disponible en el Hub:

- Permite que los agentes naveguen, descubran e interactúen con sitios web que soporten NLWeb
- Se registra como `ToolInvocation` con trazabilidad completa
- Compatible con el sistema de permisos del `ToolGuard` (§18)
- Sandboxable (ejecutable en contenedor efímero si el sitio requiere autenticación compleja)

---

### 40.11 Capacidades de observabilidad avanzada — Debugger con Fork y Timelapse

#### 40.11.1 Run Debugger con Pause, Inspect y Fork (🟡 Media)

**Adopción en OCTO:** El Run Debugger (§19.2) añade tres capacidades avanzadas:

**Pause:** Un run en ejecución puede pausarse desde el debugger en el siguiente checkpoint durable. Diferente al HITL: esta es una pausa operacional del operador, no una aprobación de política.

**Inspect:** Con el run pausado, el operador puede inspeccionar el estado completo:
- Memoria actual del agente
- Contexto compilado (Core Files efectivos en ese momento)
- Cola de steps pendientes
- Budget consumido hasta ese punto
- Variables del flow activas

**Fork:** El operador puede crear una copia del run desde el checkpoint actual (`run_fork`). El fork es independiente — permite experimentar con diferentes inputs o estrategias sin afectar el run original. Los forks son trazables con `parent_run_id` y `fork_checkpoint_id`.

#### 40.11.2 Timelapse de ejecuciones (🟢 Baja)

**Adopción en OCTO:** En el Dashboard, añadir vista `Timelapse` como tab en el menú de Analytics:

- Muestra cómo evoluciona el grafo de agentes y ejecuciones a lo largo del tiempo en un período seleccionado
- Controles de reproducción: play, pause, velocidad (1x, 5x, 10x, 50x)
- El grafo de topología cambia en tiempo real según los eventos del período
- Útil para revisiones de sprint, auditorías y presentaciones del estado operacional

#### 40.11.3 Auto-generación de briefs post-run (🟢 Baja)

**Adopción en OCTO:** Al completar runs vinculados a Goals o Tickets de alta prioridad, el sistema puede generar automáticamente un brief de ejecución:

```markdown
# Run Brief — [Run ID] — [timestamp]

## Objetivo
[Goal o tarea que originó este run]

## Lo que se construyó / ejecutó
[Resumen de steps completados]

## Qué falló y por qué
[Errores, retries, fallbacks utilizados]

## Lecciones aprendidas
[Patrones identificados por el MetacognitionLayer]

## Métricas
- Duración: Xs
- Tokens: X input / X output
- Costo: $X
- Tools invocadas: X
```

Los briefs se almacenan en `MEMORY.md → ## Run Briefs` del nivel correspondiente y forman parte del Dev Knowledge Graph (§21.4).

---

### 40.12 Actualización del mapa de primitivos y capacidades

Con las adopciones de esta sección, el mapa de primitivos del sistema queda extendido:

| Primitivo | Nuevo en §35 | Descripción |
|---|---|---|
| `PlannerProfile` | ✅ | Estrategia de planificación configurable por nivel |
| `CollaborationMode` | ✅ | Modo de coordinación: secuencial, jerárquico, paralelo |
| `SharedMemoryScope` | ✅ | Memoria compartida entre agentes del mismo nivel |
| `FilterPipeline` | ✅ | Middleware pre/post LLM call y ToolInvocation |
| `AgentBus` | ✅ | Canal de eventos pub/sub entre agentes |
| `Ticket` | ✅ | Agrupación de Runs relacionados con trazabilidad |
| `SelfEvaluation` | ✅ | Auto-evaluación post-run del agente |
| `MetacognitionLayer` | ✅ | Capa de reflexión y aprendizaje del agente |
| `SystemMessageTemplate` | ✅ | Meta-prompt jerárquico por nivel |
| `ExecutionFork` | ✅ | Copia de run desde un checkpoint para experimentación |

