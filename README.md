# Manara ECS Microservices Project

This repository currently contains the Auth and Orders services for the ECS Fargate microservices project.

## Structure

```text
services/
  auth/             TypeScript/Express authentication service
  orders/           TypeScript/Express orders service
```

Each service contains its API contract and development commands in its own README. ECS should inject database URLs, Redis URLs, JWT secrets, and internal API keys at runtime.
