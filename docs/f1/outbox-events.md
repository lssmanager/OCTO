# F1 Outbox Event Catalog

| Event type | Emitter | When | Aggregate |
|---|---|---|---|
| `ExecutionQueued` | API | Execution row created and queued | `execution` |
| `ExecutionDispatched` | Scheduler worker | Dispatch command emitted | `execution` |
| `ExecutionCancellationRequested` | API | Cancel requested | `execution` |
| `ExecutionResumeRequested` | API | Resume requested | `execution` |

> Note: event names currently follow existing PascalCase event types in repository code. Keep naming consistent with producers and contracts.
