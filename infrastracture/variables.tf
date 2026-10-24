variable "region" {
  description = "The AWS region to deploy resources in"
  type        = string
  default     = "eu-west-3"
}

variable "aws_profile" {
  description = "The aws profile to use"
  type        = string
  default     = "default"
}

variable "vpc_cidr" {
  description = "The CIDR block for the vpc"
  type        = string
  default     = "10.0.0.0/16"
}

variable "project_name" {
  description = "The name of the project"
  type        = string
  default     = "manara-project"
}

variable "public_subnet_cidrs" {
  description = "The cidr blocks of the public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "The cidr blocks of the private subnets"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.20.0/24"]
}