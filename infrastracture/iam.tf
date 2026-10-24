data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    actions = [ "sts:AssumeRole" ]
    principals {
      type = "Service"
      identifiers = [ "ecs-tasks.amazonaws.com" ]
    }
  }
}


locals {
  service_secret_arns = {
    auth = [
        aws_secrets_manager_secret.db["auth"].arn,
        aws_secrets_manager_secret.redis.arn,
        aws_secrets_manager_secret.auth_private_key.arn
    ]
    orders = [
        aws_secrets_manager_secret.db["orders"].arn,
        aws_secrets_manager_secret.redis.arn,
        aws_secrets_manager_secret.auth_private_key.arn
    ]
    notifications = [
        aws_secrets_manager_secret.db["notifications"].arn,
        aws_secrets_manager_secret.redis.arn,
        aws_secrets_manager_secret.auth_private_key.arn
    ]
  }
}

resource "aws_iam_role" "execution" {
    for_each = toset(local.services)
    name = "${var.project_name}-${each.key}-exec"
    assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  for_each = aws_iam_role.execution
  role = each.value.name
  policy_arn = "arn:aws:iam:aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}


resource "aws_iam_role_policy" "execution_secrets" {
    for_each = aws_iam_role.execution
    name = "read-own-secrets"
    role = each.value.id
    policy = jsonencode({
        Version = "2012-10-17"
        Statement = [{
            Effect = "Allow"
            Action = ["secretsmanager:GetSecretValue"]
            Resource = local.service_secret_arns[each.key]
        }]
    })
}

resource "aws_iam_role" "task" {
  for_each = toset(local.services)
  name = "${var.project_name}-${each.key}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

resource "aws_iam_role_policy_attachment" "task_xray" {
  for_each = aws_iam_role.task
  role = each.value.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}