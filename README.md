# Manara ECS Microservices Project

This repository currently contains the Auth service for the ECS Fargate microservices project.

## Structure

```text
services/
  auth/             TypeScript/Express authentication service
docker-compose.yml  Local PostgreSQL, Redis, migration, and Auth containers
```

See [services/auth/README.md](services/auth/README.md) for the API contract and development commands.

## Run locally with containers

```bash
docker compose up --build
```

The service is available at `http://localhost:3001`; Compose applies the Auth schema migration before starting it.

The credentials and signing secret in `docker-compose.yml` are for local development only. ECS should inject the production database URL, Redis URL, and JWT secret at runtime.
