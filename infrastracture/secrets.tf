resource "random_password" "db" {
  for_each = toset(local.services)
  length   = 32
  special  = false
}


resource "random_password" "redis" {
  length  = 32
  special = false
}

resource "random_password" "internal" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "db" {
  for_each = toset(local.services)
  name = "${var.project_name}/${each.key}/db-password"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db" {
  for_each = toset(local.services)
  secret_id = aws_secretsmanager_secret.db[each.key].id
  secret_string = random_password.db[each.key].result
}

resource "aws_secretsmanager_secret" "redis" {
  name = "${var.project_name}/redis-token"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id = aws_secretsmanager_secret.redis.id
  secret_string = random_password.redis.result
}

resource "aws_secretsmanager_secret" "internal" {
  name = "${var.project_name}/internal-secret"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "internal" {
  secret_id = aws_secretsmanager_secret.internal.id
  secret_string = random_password.internal.result
}


resource "aws_secretsmanager_secret" "auth_private_key" {
    name = "${var.project_name}/auth/private-key"
    recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret" "auth_public_key" {
    name = "${var.project_name}/auth/public-key"
    recovery_window_in_days = 0
}