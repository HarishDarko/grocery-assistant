# Grocery Assistant - Microservices Application

A microservices-based grocery assistant application with frontend deployed on AWS S3/CloudFront and backend services as AWS Lambda functions.

## Table of Contents

- [Architecture](#architecture)
- [Local Development](#local-development)
  - [Quick Start](#quick-start)
  - [Manual Setup](#manual-setup)
    - [Prerequisites](#prerequisites-local)
    - [Backend Setup](#backend-setup)
    - [Frontend Setup](#frontend-setup)
  - [Using the Application](#using-the-application)
- [AWS Manual Deployment (Console)](#aws-manual-deployment-console)
  - [Prerequisites](#prerequisites-aws)
  - [1. Backend Deployment (Lambda & API Gateway)](#1-backend-deployment-lambda--api-gateway)
    - [A. Prepare Secrets](#a-prepare-secrets)
    - [B. Package Backend Code (.zip)](#b-package-backend-code-zip)
    - [C. Create Lambda Execution Role](#c-create-lambda-execution-role)
    - [D. Create Lambda Function (Auth Service Example)](#d-create-lambda-function-auth-service-example)
    - [E. Create API Gateway (REST API)](#e-create-api-gateway-rest-api)
  - [2. Frontend Deployment (S3 & CloudFront)](#2-frontend-deployment-s3--cloudfront)
    - [A. Update Frontend Configuration](#a-update-frontend-configuration)
    - [B. Create S3 Bucket for Static Hosting](#b-create-s3-bucket-for-static-hosting)
    - [C. Upload Frontend Files to S3](#c-upload-frontend-files-to-s3)
    - [D. Create CloudFront Distribution](#d-create-cloudfront-distribution)
  - [3. Testing the Deployment](#3-testing-the-deployment)
  - [4. Deploying Updates](#4-deploying-updates)
    - [Backend Updates](#backend-updates)
    - [Frontend Updates](#frontend-updates)
- [Automated AWS Deployment (Terraform & GitHub Actions)](#automated-aws-deployment-terraform--github-actions)
- [Troubleshooting](#troubleshooting)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Security](#security)
- [Contributing](#contributing)

## Architecture

- **Frontend**: Static website (HTML, CSS, JavaScript) hosted on S3 and distributed through CloudFront.
- **Backend**: Python/Flask Microservices deployed as Lambda functions behind API Gateway.
  - Auth Service: User authentication and JWT management.
  - Inventory Service: Grocery inventory management (uses MongoDB).
  - Recipe Service: Recipe generation using Groq API.
- **Database**: MongoDB (using MongoDB Atlas or self-hosted instance referenced via URI).
- **Secrets Management**: AWS Secrets Manager for storing sensitive data (API Keys, DB Credentials, JWT Secret).

## Local Development

### Quick Start

For the easiest way to run the application locally, use:

```bash
# Windows
run.bat

# Linux/Mac
chmod +x run.sh
./run.sh
```

This starts both frontend (http://localhost:5000) and backend services (Auth: 3000, Inventory: 3001, Recipe: 3002).

### Manual Setup

#### Prerequisites (Local)

- [Node.js](https://nodejs.org/) (v14+)
- [Python](https://www.python.org/) 3.9+
- MongoDB Database URI (e.g., from MongoDB Atlas free tier) OR use the mock database (`MONGODB_URI=mock://grocery_assistant`)
- Groq API Key (sign up at [Groq Cloud](https://groq.com/))

#### Backend Setup

1.  **Install Dependencies:**
    ```bash
    cd backend
    pip install -r requirements.txt
    ```

2.  **Configure Environment Variables:**
    Create/edit `.env` files in each service directory (`backend/services/*/`) based on the examples provided (or run the app once to generate them).
    - **Auth Service:** `backend/services/auth_service/.env`
      ```dotenv
      MONGODB_URI=your-mongodb-uri-here # Or mock://grocery_assistant
      JWT_SECRET_KEY=your-strong-local-jwt-secret-key # Use a strong key for local dev
      ```
    - **Inventory Service:** `backend/services/inventory_service/.env`
      ```dotenv
      MONGODB_URI=your-mongodb-uri-here # Or mock://grocery_assistant
      ```
    - **Recipe Service:** `backend/services/recipe_service/.env`
      ```dotenv
      GROQ_API_KEY=your-groq-api-key-here
      # GROQ_API_URL= (Defaults usually work)
      ```

3.  **Run Backend Services:**
    ```bash
    cd backend
    python run-local.py
    ```

#### Frontend Setup

1.  **Run Frontend Server:**
    ```bash
    cd frontend
    node run-local.js
    ```
    Access at http://localhost:5000.

### Using the Application

1.  Open http://localhost:5000 in your browser.
2.  Register an account.
3.  Log in.
4.  Add grocery items (e.g., "Milk", "Eggs", "Bread").
5.  Click "Get Recipe Suggestions".

## AWS Manual Deployment (Console)

This section guides you through deploying the application manually using the AWS Management Console. This is useful for understanding the components before automating with IaC (like Terraform) or CI/CD.

### Prerequisites (AWS)

-   **AWS Account:** An active AWS account.
-   **IAM User/Role:** Sufficient permissions to create/manage S3, CloudFront, Lambda, API Gateway, IAM Roles, and Secrets Manager.
-   **Code:** Your application code cloned or downloaded from your repository.
-   **MongoDB Atlas URI (Recommended):** A connection string for your cloud MongoDB database (e.g., from MongoDB Atlas free tier). Ensure your Atlas cluster allows connections from AWS IPs (use `0.0.0.0/0` for initial testing, then refine later).
-   **Groq API Key:** Your API key from Groq Cloud.

### 1. Backend Deployment (Lambda & API Gateway)

We will deploy each microservice as a separate Lambda function triggered by API Gateway.

#### A. Prepare Secrets (AWS Secrets Manager)

Store sensitive configuration securely.

1.  **Navigate to Secrets Manager:** AWS Console -> Secrets Manager.
2.  **Store a new secret:**
    *   Click "Store a new secret".
    *   Secret type: "Other type of secret".
    *   **Secret key/value:** Add the following required key/value pairs:
        *   Key: `MONGODB_URI`, Value: `your-mongodb-atlas-connection-string`
        *   Key: `GROQ_API_KEY`, Value: `your-groq-api-key`
        *   Key: `jwt_secret_key`, Value: `your-strong-unique-jwt-secret` (Generate a strong random string. **Must be lowercase `jwt_secret_key`**)
        *   _Note:_ All services will attempt to read these keys from the single secret defined by the `SECRETS_ARN` environment variable.
    *   Encryption key: Use the default `aws/secretsmanager`.
    *   Click "Next".
3.  **Secret Name:** Give it a descriptive name, e.g., `GroceryAssistant/AppSecrets`. Add a description.
4.  **Rotation:** Configure rotation if needed (optional for this guide).
5.  **Review and Store:** Review and click "Store".
6.  **Note the Secret ARN:** After creation, view the secret and copy its **ARN** (e.g., `arn:aws:secretsmanager:us-east-1:123456789012:secret:GroceryAssistant/AppSecrets-XXXXXX`). You need this for the Lambda environment variables.

#### B. Package Backend Code (.zip)

Create deployment packages for each service using an **AlmaLinux/Linux environment (like WSL, Docker, or a VM) with Python 3.12** installed. This ensures the compiled dependencies match the AWS Lambda Python 3.12 runtime environment.

These steps assume you are running commands within your Linux terminal, navigated to the **root `backend` directory** of your project.

**1. Prepare Linux Environment:**

*   Ensure you have Python 3.12 and pip installed in your Linux environment:
    ```bash
    # Example for AlmaLinux/RHEL/Fedora:
    sudo dnf install python3.12 python3.12-pip python3.12-devel gcc -y

    # Example for Debian/Ubuntu (may require adding a PPA or compiling):
    # sudo add-apt-repository ppa:deadsnakes/ppa # If needed
    # sudo apt update
    # sudo apt install python3.12 python3.12-venv python3.12-dev build-essential zip -y

    # Verify installation
    python3.12 --version
    pip3.12 --version
    ```
*   Create and activate a Python virtual environment using Python 3.12 (highly recommended):
    ```bash
    python3.12 -m venv .venv-py312
    source .venv-py312/bin/activate

    # Upgrade pip and install wheel within the venv
    pip install --upgrade pip wheel
    ```

**2. Prepare Base Dependencies (Install Once per Environment Setup):**

*   Ensure any previous base directory is removed:
    ```bash
    rm -rf ./base_deps
    ```
*   Create a directory to hold the shared installed dependencies:
    ```bash
    mkdir ./base_deps
    ```
*   Install all shared requirements from `backend/requirements.txt` into `base_deps` using Python 3.12's pip:
    ```bash
    pip install -r requirements.txt --target ./base_deps
    # Note: No --platform or --only-binary needed if building in the target Linux env
    ```
*   Copy shared utilities into `base_deps`:
    ```bash
    cp -r utils/ ./base_deps/
    ```

**3. Package Auth Service (`auth_deployment_package.zip`):**

*   Create a temporary directory for this service's package:
    ```bash
    rm -rf ./temp_package # Ensure clean state
    mkdir ./temp_package
    ```
*   Copy the base dependencies and utilities into the temporary directory:
    ```bash
    cp -r base_deps/. temp_package/
    ```
*   Copy Auth service specific files into the temporary directory:
    ```bash
    cp services/auth_service/*.py ./temp_package/
    ```
*   Navigate into the temporary directory and create the zip file from its contents:
    ```bash
    cd temp_package
    zip -r ../auth_deployment_package.zip . -x "*__pycache__*/*" # Zip contents, exclude __pycache__
    cd ..
    ```
*   Clean up the temporary directory:
    ```bash
    rm -rf ./temp_package
    ```

**4. Package Inventory Service (`inventory_deployment_package.zip`):**

*   Create a temporary directory:
    ```bash
    rm -rf ./temp_package
    mkdir ./temp_package
    ```
*   Copy base dependencies and utilities:
    ```bash
    cp -r base_deps/. temp_package/
    ```
*   Copy Inventory service specific files:
    ```bash
    cp services/inventory_service/*.py ./temp_package/
    ```
*   Navigate into the temporary directory and create the zip file:
    ```bash
    cd temp_package
    zip -r ../inventory_deployment_package.zip . -x "*__pycache__*/*"
    cd ..
    ```
*   Clean up:
    ```bash
    rm -rf ./temp_package
    ```

**5. Package Recipe Service (`recipe_deployment_package.zip`):**

*   Create a temporary directory:
    ```bash
    rm -rf ./temp_package
    mkdir ./temp_package
    ```
*   Copy base dependencies and utilities:
    ```bash
    cp -r base_deps/. temp_package/
    ```
*   Copy Recipe service specific files:
    ```bash
    cp services/recipe_service/*.py ./temp_package/
    ```
*   Navigate into the temporary directory and create the zip file:
    ```bash
    cd temp_package
    zip -r ../recipe_deployment_package.zip . -x "*__pycache__*/*"
    cd ..
    ```
*   Clean up:
    ```bash
    rm -rf ./temp_package
    ```

You should now have `auth_deployment_package.zip`, `inventory_deployment_package.zip`, and `recipe_deployment_package.zip` in your `backend` directory, ready for upload to AWS Lambda.

#### C. Create Lambda Execution Role

Create an IAM role that Lambda functions can assume to access AWS services (Secrets Manager, CloudWatch Logs).

1.  **Navigate to IAM:** AWS Console -> IAM.
2.  **Roles -> Create role:**
    *   Trusted entity type: `AWS service`.
    *   Use case: `Lambda`.
    *   Click \"Next\".
3.  **Add Permissions:**
    *   Search for and select `AWSLambdaBasicExecutionRole` (for CloudWatch Logs access).
    *   Search for and select `SecretsManagerReadWrite` (or create a more restrictive policy granting *read-only* access to your specific secret ARN).
    *   Click \"Next\".
4.  **Name and Review:**
    *   Role name: e.g., `GroceryAssistantLambdaRole`.
    *   Description: Add a suitable description.
    *   Review the trusted entities and permissions.
    *   Click \"Create role\".
5.  **Note the Role ARN:** You'll need this when creating the Lambda functions.

#### D. Create Lambda Function (Auth Service Example)

Repeat these steps for each service (`auth`, `inventory`, `recipe`), adjusting names and the deployment package.

1.  **Navigate to Lambda:** AWS Console -> Lambda.
2.  **Create function:**
    *   Select \"Author from scratch\".
    *   Function name: e.g., `grocery-assistant-auth-service`.
    *   **Runtime:** Select `Python 3.12`.
    *   Architecture: `x86_64` (usually default).
    *   **Permissions:**
        *   Choose \"Use an existing role\".
        *   Existing role: Select the `GroceryAssistantLambdaRole` you created.
    *   Click \"Create function\".
3.  **Upload Code:**
    *   On the function's page, go to the \"Code\" tab.
    *   Click \"Upload from\" -> \".zip file\".
    *   Upload the corresponding package (e.g., `auth_deployment_package.zip`).
    *   Click \"Save\".
4.  **Configure Handler:**
    *   Go to \"Configuration\" -> \"General configuration\" -> \"Edit\".
    *   Under \"Runtime settings\", set the **Handler** to the correct value based on your service's entry point file and function. For example:
        *   Auth: `handler.lambda_handler` (assuming `handler.py` contains `lambda_handler`)
        *   Inventory: `handler.lambda_handler`
        *   Recipe: `handler.lambda_handler`
    *   Click \"Save\".
5.  **Configure Environment Variables:**
    *   Go to \"Configuration\" -> \"Environment variables\" -> \"Edit\".
    *   Add the following variables:
        *   Key: `SECRETS_ARN`, Value: `arn:aws:secretsmanager:us-east-1:123456789012:secret:GroceryAssistant/AppSecrets-XXXXXX` (Paste the ARN you copied from Secrets Manager).
        *   Key: `STAGE`, Value: `prod` (or your desired stage name, e.g., `dev`).
        *   Key: `POWERTOOLS_SERVICE_NAME`, Value: `AuthService` (adjust for other services: `InventoryService`, `RecipeService`)
        *   Key: `LOG_LEVEL`, Value: `INFO`
    *   Click \"Save\".
6.  **Increase Timeout (Optional but Recommended):**
    *   Go to \"Configuration\" -> \"General configuration\" -> \"Edit\".
    *   Increase the **Timeout** from the default (e.g., 3 seconds) to something more appropriate, like `30` seconds, especially for the recipe service which calls an external API.
    *   Click \"Save\".
7.  **Repeat:** Repeat steps 1-6 for the `inventory-service` and `recipe-service`, using their respective deployment packages and adjusting names/environment variables where necessary (like `POWERTOOLS_SERVICE_NAME`).

#### E. Create API Gateway (REST API)

This section details how to create a single REST API in API Gateway to act as the entry point for all backend services. We will create resources (URL paths) and methods (HTTP verbs like GET, POST) and link them to the appropriate Lambda functions using **Lambda Proxy Integration**.

**1. Create the REST API:**

*   Navigate to **API Gateway** in the AWS Console.
*   Click **Create API**.
*   Under **REST API**, click **Build**.
*   Leave settings as default:
    *   Protocol: `REST`
    *   Create New API: `New API`
    *   API Name: `GroceryAssistantAPI`
    *   Description: (Optional) e.g., `API for Grocery Assistant Application`
    *   Endpoint Type: `Regional`
*   Click **Create API**.

**2. Create Auth Endpoints (`/auth/...`):**

*   **(Resource: /auth)** In the "Resources" tree, select the root `/`.
    *   Click **Actions** -> **Create Resource**.
    *   Resource Name: `auth`
    *   Resource Path: `/auth` (should auto-populate)
    *   Click **Create Resource**.
*   **(Resource: /auth/login)** Select the newly created `/auth` resource.
    *   Click **Actions** -> **Create Resource**.
    *   Resource Name: `login`
    *   Resource Path: `/login` (should auto-populate)
    *   Click **Create Resource**.
*   **(Method: POST /auth/login)** Select the newly created `/login` resource.
    *   Click **Actions** -> **Create Method**.
    *   From the dropdown, select `POST`.
    *   Click the checkmark (✔).
    *   Integration type: `Lambda Function`
    *   **IMPORTANT:** Check the box for **Use Lambda Proxy integration**.
    *   Lambda Region: Select your AWS region (e.g., `us-east-1`).
    *   Lambda Function: Start typing `GroceryAssistant-AuthService` and select it from the list.
    *   Leave "Use Default Timeout" checked.
    *   Click **Save**.
    *   A dialog "Add Permission to Lambda Function" will appear. Click **OK**.
*   **(Resource: /auth/register)** Select the `/auth` resource again.
    *   Click **Actions** -> **Create Resource**.
    *   Resource Name: `register`
    *   Resource Path: `/register`
    *   Click **Create Resource**.
*   **(Method: POST /auth/register)** Select the newly created `/register` resource.
    *   Click **Actions** -> **Create Method**.
    *   Select `POST`, click the checkmark (✔).
    *   Integration type: `Lambda Function`
    *   Check **Use Lambda Proxy integration**.
    *   Lambda Function: `GroceryAssistant-AuthService`.
    *   Click **Save**, then **OK** to grant permission.

**3. Create Inventory Endpoints (`/inventory/...`):**

*   **(Resource: /inventory)** Select the root `/` resource again.
    *   Click **Actions** -> **Create Resource**.
    *   Resource Name: `inventory`
    *   Resource Path: `/inventory`
    *   Click **Create Resource**.
*   **(Resource: /inventory/items)** Select the newly created `/inventory` resource.
    *   Click **Actions** -> **Create Resource**.
    *   Resource Name: `items`
    *   Resource Path: `/items`
    *   Click **Create Resource**.
*   **(Method: GET /inventory/items)** Select the newly created `/items` resource.
    *   Click **Actions** -> **Create Method**.
    *   Select `GET`, click the checkmark (✔).
    *   Integration type: `Lambda Function`
    *   Check **Use Lambda Proxy integration**.
    *   Lambda Function: `GroceryAssistant-InventoryService`.
    *   Click **Save**, then **OK**.
*   **(Method: POST /inventory/items)** Select the `/items` resource again.
    *   Click **Actions** -> **Create Method**.
    *   Select `POST`, click the checkmark (✔).
    *   Integration type: `Lambda Function`
    *   Check **Use Lambda Proxy integration**.
    *   Lambda Function: `GroceryAssistant-InventoryService`.
    *   Click **Save**, then **OK**.
*   **(Resource: /inventory/items/{item_id})** Select the `/items` resource again.
    *   Click **Actions** -> **Create Resource**.
    *   Configure as proxy resource: UNCHECKED.
    *   Resource Name: `item_id`
    *   Resource Path: `{item_id}` (Type the curly braces `{}`).
    *   Click **Create Resource**.
*   **(Method: DELETE /inventory/items/{item_id})** Select the newly created `/{item_id}` resource.
    *   Click **Actions** -> **Create Method**.
    *   Select `DELETE`, click the checkmark (✔).
    *   Integration type: `Lambda Function`
    *   Check **Use Lambda Proxy integration**.
    *   Lambda Function: `GroceryAssistant-InventoryService`.
    *   Click **Save**, then **OK**.

**4. Create Recipe Endpoints (`/recipes/...`):**

*   **(Resource: /recipes)** Select the root `/` resource again.
    *   Click **Actions** -> **Create Resource**.
    *   Resource Name: `recipes`
    *   Resource Path: `/recipes`
    *   Click **Create Resource**.
*   **(Resource: /recipes/generate)** Select the newly created `/recipes` resource.
    *   Click **Actions** -> **Create Resource**.
    *   Resource Name: `generate`
    *   Resource Path: `/generate`
    *   Click **Create Resource**.
*   **(Method: GET /recipes/generate)** Select the newly created `/generate` resource.
    *   Click **Actions** -> **Create Method**.
    *   Select `GET`, click the checkmark (✔).
    *   Integration type: `Lambda Function`
    *   Check **Use Lambda Proxy integration**.
    *   Lambda Function: `GroceryAssistant-RecipeService`.
    *   Click **Save**, then **OK**.
*   _Note:_ The internal `/recipes/predict_food_info` endpoint is called by the Inventory service (if configured) and does **not** need to be exposed here in the public API Gateway.

**5. Enable CORS (Cross-Origin Resource Sharing):**

CORS is required to allow your frontend (hosted on S3/CloudFront) to make requests to this API Gateway. Apply CORS settings to **each resource that has methods defined**.

*   **(CORS for /auth/login)** Select the `/auth/login` resource in the tree.
    *   Click **Actions** -> **Enable CORS**.
    *   Verify the method listed is `POST`.
    *   Gateway Responses: Keep defaults checked (`Default 4XX`, `Default 5XX`).
    *   Methods: Ensure `POST` and `OPTIONS` are implicitly covered or explicitly listed if configurable.
    *   Headers: `Access-Control-Allow-Headers`: Keep defaults (`Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`) or add others if needed.
    *   `Access-Control-Allow-Origin`: Enter `*` (a single asterisk, **no quotes**) for initial testing. **SECURITY NOTE:** After deploying your frontend *and verifying it works*, replace `*` with your specific CloudFront domain name (e.g., `https://d1234abcd.cloudfront.net`) or S3 website endpoint if not using CloudFront (e.g., `http://your-bucket.s3-website-region.amazonaws.com`).
    *   Click **Enable CORS and replace existing CORS headers**.
*   **(CORS for /auth/register)** Select the `/auth/register` resource.
    *   Click **Actions** -> **Enable CORS**.
    *   Verify the method is `POST`.
    *   Set `Access-Control-Allow-Origin` (use `*` **no quotes** for testing, then your specific origin).
    *   Click **Enable CORS and replace existing CORS headers**.
*   **(CORS for /inventory/items)** Select the `/inventory/items` resource.
    *   Click **Actions** -> **Enable CORS**.
    *   Verify methods include `GET` and `POST`.
    *   Set `Access-Control-Allow-Origin` (use `*` **no quotes** for testing, then your specific origin).
    *   Click **Enable CORS and replace existing CORS headers**.
*   **(CORS for /inventory/items/{item_id})** Select the `/inventory/items/{item_id}` resource.
    *   Click **Actions** -> **Enable CORS**.
    *   Verify method is `DELETE`.
    *   Set `Access-Control-Allow-Origin` (use `*` **no quotes** for testing, then your specific origin).
    *   Click **Enable CORS and replace existing CORS headers**.
*   **(CORS for /recipes/generate)** Select the `/recipes/generate` resource.
    *   Click **Actions** -> **Enable CORS**.
    *   Verify method is `GET`.
    *   Set `Access-Control-Allow-Origin` (use `*` **no quotes** for testing, then your specific origin).
    *   Click **Enable CORS and replace existing CORS headers**.

**Note on 403 Errors for `/health` endpoints:** You might see 403 (Forbidden) errors in your browser console for requests to paths like `/auth/health`. This is expected because these endpoints were not defined in the API Gateway configuration steps above. Your frontend code (e.g., in `ServiceHealth.js`) is likely attempting to call them. To resolve this, either remove these health check calls from your frontend JavaScript for the deployed version or, if they are necessary, add the corresponding resources, methods, and Lambda integrations in API Gateway.

**6. Deploy the API:**

*   Click **Actions** -> **Deploy API**.
*   Deployment stage: Select **[New Stage]**.
*   Stage name: `prod` (or `dev`, `v1`, etc. - choose a meaningful name).
*   Stage description: (Optional)
*   Deployment description: (Optional)
*   Click **Deploy**.

**7. Note the Invoke URL:**

*   After deployment, the Stage Editor will appear. Expand the stage (`prod`).
*   The **Invoke URL** will be displayed at the top (e.g., `https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod`).
*   **Copy this full URL.** You will need it for the frontend configuration (`frontend/js/config.js`).

**8. Final API Structure Diagram:**

Your final API resource structure should look like this (OPTIONS methods are created by the 'Enable CORS' action on the specific endpoint resources):

```
/ (Root)
├── auth/
│   ├── login
│   │   ├── POST -> (Proxy) GroceryAssistant-AuthService
│   │   └── OPTIONS
│   └── register
│       ├── POST -> (Proxy) GroceryAssistant-AuthService
│       └── OPTIONS
├── inventory/
│   └── items
│       ├── GET  -> (Proxy) GroceryAssistant-InventoryService
│       ├── POST -> (Proxy) GroceryAssistant-InventoryService
│       ├── OPTIONS
│       └── {item_id}/
│           ├── DELETE -> (Proxy) GroceryAssistant-InventoryService
│           └── OPTIONS
└── recipes/
    └── generate
        ├── GET  -> (Proxy) GroceryAssistant-RecipeService
        └── OPTIONS
```

### 2. Frontend Deployment (S3 & CloudFront)

Host the static frontend files.

#### A. Update Frontend Configuration

1.  Open `frontend/js/config.js` locally.
2.  Find the `API_GATEWAY_INVOKE_URL` constant.
3.  Replace the placeholder `'https://YOUR_API_GATEWAY_ID...'` with the actual **Invoke URL** you copied from the API Gateway deployment.
4.  **Save the file.** This change must be done *before* uploading to S3.

#### B. Create S3 Bucket for Static Hosting

1.  **Navigate to S3:** AWS Console -> S3.
2.  **Create bucket:**
    *   Bucket name: Choose a globally unique name (e.g., `grocery-assistant-frontend-your-unique-id`).
    *   Region: Choose your desired region.
    *   Object Ownership: "ACLs enabled" -> "Bucket owner preferred".
    *   **Block Public Access:** **UNCHECK** "Block all public access". Acknowledge the warning.
    *   Create bucket.
3.  **Enable Static Website Hosting:**
    *   Go into the bucket -> "Properties" tab.
    *   Scroll to "Static website hosting" -> "Edit".
    *   Select "Enable". Hosting type: "Host a static website".
    *   Index document: `index.html`. Error document: (Optional).
    *   Save changes.
4.  **Set Bucket Policy:**
    *   Go to "Permissions" tab -> "Bucket policy" -> "Edit".
    *   Paste the policy, replacing `YOUR_BUCKET_NAME`:
        ```json
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicReadGetObject",
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": "s3:GetObject",
                    "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
                }
            ]
        }
        ```
    *   Save changes.

#### C. Upload Frontend Files to S3

Upload the necessary static website files from your local `frontend` directory to the root of your S3 bucket, **preserving the internal folder structure**.

1.  Go to your S3 bucket in the AWS Console -> **Objects** tab.
2.  Click **Upload**.
3.  Use **Add files** and **Add folder** to upload the following required files and folders from your local `frontend` directory:
    *   `index.html`
    *   `script.js` (if present at the root)
    *   `styles.css` (if present at the root)
    *   The entire `js/` directory, **including all its subdirectories** (like `core/`, `services/`) and files. Ensure `js/config.js` has the correct API Gateway Invoke URL.
    *   The entire `styles/` directory, including any subdirectories.
    *   Any other necessary asset directories (e.g., `images/`, `fonts/`, `libs/`), preserving their internal structure.
4.  **Do NOT upload** development or configuration files such as:
    *   `run-local.js`
    *   `deploy.js`
    *   `deploy-config.json`
    *   `s3-cors-config.json`
    *   `.htaccess`
    *   `web.config`
    *   `serviceWorker.js` (unless you specifically require its functionality)
    *   Any other development-specific files or folders (e.g., `.vscode/`, `.venv-py312/`, `node_modules/`)
5.  Ensure the files and folders are uploaded to the **root** of the bucket, not inside an extra top-level subdirectory.
6.  Click **Upload** to complete the process.

**Expected S3 Bucket Structure (Root Level):**

After uploading, the root of your S3 bucket should mirror your local `frontend` structure for the necessary files:

```
/ (Bucket Root)
├── index.html
├── script.js       # (If applicable)
├── styles.css      # (If applicable)
├── js/             # Directory
│   ├── config.js
│   ├── app.js
│   ├── main.js
│   ├── utils.js
│   ├── core/         # Subdirectory
│   │   └── ... (JS files)
│   └── services/     # Subdirectory
│       └── ... (JS files)
├── styles/         # Directory
│   └── ... (CSS files, potentially in subdirectories)
# └── images/       # (If applicable)
# └── libs/         # (If applicable)
# ... (other necessary assets)
```

#### D. Create CloudFront Distribution

1.  **Navigate to CloudFront:** AWS Console -> CloudFront.
2.  **Create distribution:**
    *   Origin domain: Select your S3 bucket. **IMPORTANT:** Choose the entry that looks like `your-bucket-name.s3-website-us-east-1.amazonaws.com` (the static website endpoint), NOT the one ending in `.s3.amazonaws.com`.
    *   Viewer protocol policy: "Redirect HTTP to HTTPS".
    *   Allowed HTTP methods: "GET, HEAD, OPTIONS".
    *   Cache key and origin requests: Use recommended settings (e.g., `CachingOptimized`, `CORS-S3Origin`).
    *   Web Application Firewall (WAF): "Do not enable" for now.
    *   Settings -> Default root object: `index.html`.
    *   Click "Create distribution". (Deployment takes 5-15 minutes).
3.  **Note Distribution Domain Name:** Once deployed (`Last modified` date updates), copy the **Distribution domain name** (e.g., `d1234abcd.cloudfront.net`). This is the public URL for your application.
4.  **(Security Improvement)** Go back to API Gateway -> Your API -> Resources -> Enable CORS (Actions) -> Set `Access-Control-Allow-Origin` to your CloudFront domain (`https://d1234abcd.cloudfront.net`), replacing the `'*'`. Redeploy the API stage.

### 3. Testing the Deployment

1.  Open your CloudFront **Distribution domain name** in your browser (e.g., `https://d1234abcd.cloudfront.net`).
2.  Hard refresh (`Ctrl+Shift+R` or `Cmd+Shift+R`).
3.  Test functionality: Register, Login, Add/Delete Items, Generate Recipes.
4.  Use browser Developer Tools (Network tab, Console tab) to check for API calls (should go to your `execute-api` URL) and any errors.
5.  Check CloudWatch Logs for your Lambda functions if backend requests fail.

### 4. Deploying Updates

#### Backend Updates

1.  Make code changes in the relevant service directory locally.
2.  Re-package the service code (Repeat Step 1.B for that service).
3.  Go to the corresponding Lambda function in the AWS Console.
4.  Upload the new `.zip` file ("Code source" -> "Upload from" -> ".zip file").
5.  If API Gateway resources/methods changed (unlikely for just code changes), redeploy the API stage.

#### Frontend Updates

1.  Make changes to your local `frontend` code.
2.  If `js/config.js` changes (e.g., new API URL), update it.
3.  Upload the **changed files/folders** to your S3 bucket, overwriting existing ones.
4.  **Invalidate CloudFront Cache:** Go to your CloudFront distribution -> "Invalidations" tab -> Create invalidation -> Enter `/*` -> Create. (Takes a few minutes).

## Automated AWS Deployment (Terraform & GitHub Actions)

This project is now configured for automated deployment using Terraform for Infrastructure as Code (IaC) and GitHub Actions for Continuous Integration and Continuous Deployment (CI/CD).

### Repository Structure

Your final repository structure should look like this:

```
.
├── .github/
│   └── workflows/
│       ├── backend-deploy.yml    # Workflow for backend Lambda deployment
│       ├── frontend-deploy.yml   # Workflow for frontend S3/CloudFront deployment
│       └── terraform.yml         # Workflow for Terraform infrastructure deployment
├── backend/
│   ├── services/
│   │   ├── auth_service/
│   │   │   ├── app.py
│   │   │   ├── database.py
│   │   │   └── handler.py
│   │   ├── inventory_service/
│   │   │   ├── app.py
│   │   │   ├── database.py
│   │   │   └── handler.py
│   │   └── recipe_service/
│   │       ├── app.py
│   │       └── handler.py
│   ├── utils/
│   │   ├── __init__.py
│   │   └── secrets.py
│   ├── lambda-package-script.sh  # Script to create Lambda deployment packages
│   ├── requirements.txt          # Python dependencies for backend
│   └── run-local.py              # Script for running backend locally (optional)
├── frontend/
│   ├── js/
│   │   ├── app.js
│   │   ├── config.js             # Frontend configuration (API URL updated by Terraform/CI)
│   │   ├── main.js
│   │   ├── utils.js
│   │   ├── core/
│   │   └── services/
│   ├── styles/
│   │   ├── auth.css
│   │   ├── base.css
│   │   ├── inventory.css
│   │   ├── main.css
│   │   └── recipe.css
│   ├── index.html
│   ├── styles.css
│   └── run-local.js              # Script for running frontend locally (optional)
├── terraform/
│   ├── backend/                  # Terraform module for backend resources
│   │   ├── main.tf
│   │   ├── outputs.tf
│   │   └── variables.tf
│   ├── frontend/                 # Terraform module for frontend resources
│   │   ├── main.tf
│   │   ├── outputs.tf
│   │   └── variables.tf
│   ├── network/                  # Terraform module for network resources
│   │   ├── main.tf
│   │   ├── outputs.tf
│   │   └── variables.tf
│   ├── backend.tf                # Terraform S3 backend configuration
│   ├── main.tf                   # Root Terraform configuration
│   ├── outputs.tf                # Root Terraform outputs
│   ├── providers.tf              # Terraform AWS provider configuration
│   └── variables.tf              # Root Terraform variables
├── .gitignore                    # Specifies intentionally untracked files
├── README.md                     # This file
├── requirements.txt              # Root requirements (if any, e.g., for diagrams)
├── run.bat                       # Quick start script for Windows (optional)
└── run.sh                        # Quick start script for Linux/Mac (optional)

# Files NOT typically committed:
# terraform/terraform.tfvars      # Contains sensitive variable values like secrets_manager_arn
# backend/auth_deployment_package.zip
# backend/inventory_deployment_package.zip
# backend/recipe_deployment_package.zip
# backend/build_temp/
# .venv-py312/
# .vscode/
# *.pyc
# __pycache__/
# node_modules/
```

### Prerequisites for Automated Deployment

1.  **AWS Account:** An active AWS account.
2.  **IAM User/Role:** An IAM user or role with sufficient permissions to manage the resources defined in Terraform (VPC, Subnets, S3, CloudFront, Lambda, API Gateway, IAM, Secrets Manager, DynamoDB). This user's credentials (`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`) will be used in GitHub Actions secrets.
3.  **AWS Secrets Manager Secret:** A secret created in AWS Secrets Manager (us-east-1 region recommended) containing the necessary keys (`MONGODB_URI`, `GROQ_API_KEY`, `jwt_secret_key`). Note its ARN.
4.  **Terraform State Backend Resources:**
    *   An **S3 bucket** in the `us-east-1` region to store the Terraform state file. Choose a globally unique name (e.g., `grocery-assistant-tfstate-YOUR_UNIQUE_ID`).
    *   A **DynamoDB table** in the `us-east-1` region for Terraform state locking. Use `LockID` (Type: String) as the primary key. Choose a name (e.g., `grocery-assistant-tf-locks`).
5.  **GitHub Repository:** A GitHub repository to host your code.
6.  **GitHub Secrets:** Configure the following secrets in your GitHub repository settings (`Settings` -> `Secrets and variables` -> `Actions` -> `Repository secrets`):
    *   `AWS_ACCESS_KEY_ID`: The Access Key ID for the IAM user mentioned in step 2.
    *   `AWS_SECRET_ACCESS_KEY`: The Secret Access Key for the IAM user.
    *   `CLOUDFRONT_DISTRIBUTION_ID`: Leave this empty initially. It will be populated after the first successful Terraform deployment.

### Initial Setup and Deployment Steps

Follow these steps carefully to set up your environment and perform the initial deployment:

1.  **Create Terraform Backend Resources:**
    *   Log in to your AWS account.
    *   Navigate to **S3** and create a new bucket in the `us-east-1` region. Use a unique name (e.g., `grocery-assistant-tfstate-YOUR_UNIQUE_ID`). Keep default settings (Block all public access should be ON).
    *   Navigate to **DynamoDB** and create a new table in the `us-east-1` region.
        *   Table name: `grocery-assistant-tf-locks` (or your chosen name).
        *   Primary key: `LockID` (Type: String).
        *   Use default settings for the rest.
    *   **Important:** Update the `terraform/backend.tf` file in your local code to use the exact S3 bucket name and DynamoDB table name you just created.
        ```hcl
        # terraform/backend.tf
        terraform {
          backend "s3" {
            bucket         = "YOUR_UNIQUE_S3_BUCKET_NAME" # Replace with your bucket name
            key            = "prod/terraform.tfstate"
            region         = "us-east-1"
            dynamodb_table = "YOUR_DYNAMODB_TABLE_NAME" # Replace with your table name
            encrypt        = true
          }
        }
        ```

2.  **Create `terraform.tfvars` File:**
    *   In the `terraform/` directory of your local project, create a new file named `terraform.tfvars`.
    *   Add the ARN of your AWS Secrets Manager secret to this file:
        ```tfvars
        # terraform/terraform.tfvars
        secrets_manager_arn = "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:YOUR_SECRET_NAME-XXXXXX" 
        ```
        Replace the placeholder ARN with your actual secret ARN.
    *   **Crucially:** Add `terraform/terraform.tfvars` to your `.gitignore` file to prevent committing sensitive information.

3.  **Initialize Terraform Locally:**
    *   Open a terminal or command prompt in the root directory of your project.
    *   Navigate into the Terraform directory: `cd terraform`
    *   Run `terraform init`. This command initializes the backend (connecting to your S3 bucket and DynamoDB table) and downloads the necessary AWS provider plugins. You should see a success message.

4.  **Set Up GitHub Repository:**
    *   If you haven't already, create a new repository on GitHub.
    *   Initialize Git in your local project directory (if not already done): `git init`
    *   Add all project files: `git add .`
    *   Commit the files: `git commit -m "Initial commit with Terraform and CI/CD setup"`
    *   Add your GitHub repository as the remote origin: `git remote add origin YOUR_GITHUB_REPO_URL`
    *   Push your code to GitHub: `git push -u origin main` (or your default branch name).

5.  **Configure GitHub Secrets:**
    *   Go to your repository on GitHub.
    *   Navigate to `Settings` -> `Secrets and variables` -> `Actions`.
    *   Under `Repository secrets`, click `New repository secret`.
    *   Add `AWS_ACCESS_KEY_ID` with the value of your IAM user's access key ID.
    *   Add `AWS_SECRET_ACCESS_KEY` with the value of your IAM user's secret access key.
    *   You don't need to add `CLOUDFRONT_DISTRIBUTION_ID` yet.

6.  **Trigger Initial Deployment:**
    *   The push in step 4 should have automatically triggered the `Terraform CI/CD` workflow in GitHub Actions.
    *   Go to the "Actions" tab in your GitHub repository.
    *   Monitor the `Terraform CI/CD` workflow run. It should:
        *   Initialize Terraform.
        *   Validate the configuration.
        *   Generate a Terraform plan.
        *   **Apply** the plan (since it's a push to the main branch). This will create all the AWS resources (VPC, Lambdas, API Gateway, S3, CloudFront, etc.). This step might take several minutes.
    *   If the workflow fails, check the logs for errors (e.g., permissions issues, incorrect backend configuration, Terraform syntax errors).

7.  **Update `CLOUDFRONT_DISTRIBUTION_ID` Secret:**
    *   Once the `Terraform CI/CD` workflow completes successfully, check the Terraform outputs. You can do this locally by running `terraform output` in the `terraform` directory, or find the CloudFront ID in the AWS console.
    *   Go back to your GitHub repository secrets (`Settings` -> `Secrets and variables` -> `Actions` -> `Repository secrets`).
    *   Add a new secret named `CLOUDFRONT_DISTRIBUTION_ID` and paste the actual ID of the CloudFront distribution created by Terraform (e.g., `E1234ABCDEFGH`).

8.  **Verify Deployment:**
    *   Find the `cloudfront_distribution_url` output from the Terraform apply step (or run `terraform output cloudfront_distribution_url` locally).
    *   Access this URL in your browser. You should see your frontend application.
    *   Test the application functionality (login, register, add items, generate recipes) to ensure the backend API is working correctly.

### Subsequent Deployments

*   **Infrastructure Changes:** Modify files within the `terraform/` directory and push them to the `main` branch. The `Terraform CI/CD` workflow will automatically plan and apply the changes. For Pull Requests, it will only plan and add the plan as a comment.
*   **Backend Code Changes:** Modify files within the `backend/` directory and push them to the `main` branch. The `Backend Deployment` workflow will automatically run the packaging script and update the corresponding Lambda functions.
*   **Frontend Code Changes:** Modify files within the `frontend/` directory and push them to the `main` branch. The `Frontend Deployment` workflow will automatically sync the changes to the S3 bucket and invalidate the CloudFront cache.

## Troubleshooting

-   **CORS Errors:** Double-check API Gateway CORS `Access-Control-Allow-Origin` matches your CloudFront URL. Ensure Lambda allows requests (should be handled by API Gateway Proxy integration).
-   **5xx Server Errors (API Gateway/Lambda):** Check CloudWatch Logs for the specific Lambda function. Look for Python errors, missing environment variables/secrets, permission issues (IAM Role), timeouts.
-   **403 Forbidden (API Gateway):** Often JWT authentication/authorization issues or incorrect API Gateway method setup.
-   **Frontend Not Updating:** Ensure you uploaded correct files to S3 and **invalidated the CloudFront cache** (`/*`
