module "network" {
  source = "./network"

  aws_region   = var.aws_region
  stage        = var.stage
  project_name = var.project_name
}

module "backend" {
  source = "./backend"

  aws_region          = var.aws_region
  stage               = var.stage
  project_name        = var.project_name
  vpc_id              = module.network.vpc_id
  private_subnet_ids  = module.network.private_subnet_ids
  lambda_sg_id        = module.network.lambda_sg_id
  secrets_manager_arn = var.secrets_manager_arn
}

module "frontend" {
  source = "./frontend"

  aws_region   = var.aws_region
  stage        = var.stage
  project_name = var.project_name
  api_gateway_invoke_url = module.backend.api_gateway_invoke_url # Pass API Gateway URL to frontend module
}

# Added comment to trigger workflow - {current_date} 
# Added another comment to trigger workflow - {current_date} 