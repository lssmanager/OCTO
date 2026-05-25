# F1 Production Readiness (containers)

- Non-root runtime user (`uid/gid 1001`) across API, runtime-worker, scheduler-worker, and migrate job.
- Multi-stage builds and OCI labels enabled.
- Compose hardening in `docker-compose.f1.yml`: `read_only`, `no-new-privileges`, `cap_drop: [ALL]`, and `tmpfs /tmp`.
- No Docker socket mounts or privileged containers.
- CI builds/scans images and emits CycloneDX SBOM artifacts.
