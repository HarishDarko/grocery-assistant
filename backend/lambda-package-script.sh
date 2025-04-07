#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

echo "Starting Lambda packaging script..."

# Define directories relative to the script's location (backend/)
SCRIPT_DIR=$(dirname "$0")
PROJECT_BACKEND_DIR=$(pwd) # Assumes the script is run from the 'backend' directory in the workflow
BUILD_DIR="$PROJECT_BACKEND_DIR/build_temp"
PYTHON_VERSION="python3.12" # Ensure this matches the Lambda runtime and workflow setup

echo "Backend Directory: $PROJECT_BACKEND_DIR"
echo "Temporary Build Directory: $BUILD_DIR"
echo "Using Python: $PYTHON_VERSION"

# --- Clean up previous build attempts ---
echo "Cleaning up previous build area and old zip files..."
rm -rf "$BUILD_DIR"
rm -f "$PROJECT_BACKEND_DIR/auth_deployment_package.zip" \
      "$PROJECT_BACKEND_DIR/inventory_deployment_package.zip" \
      "$PROJECT_BACKEND_DIR/recipe_deployment_package.zip"
echo "Cleanup done."

# --- Create build area ---
echo "Creating build directory structure..."
mkdir -p "$BUILD_DIR/base_deps"
mkdir -p "$BUILD_DIR/temp_package"

# --- 1. Install base dependencies ---
echo "Installing base dependencies from requirements.txt into $BUILD_DIR/base_deps..."
# Use the specific python version's pip if available, otherwise default pip
PIP_COMMAND="pip"
if command -v pip3.12 &> /dev/null; then
    PIP_COMMAND="pip3.12"
elif command -v pip3 &> /dev/null; then
    PIP_COMMAND="pip3"
fi
echo "Using pip command: $PIP_COMMAND"

$PIP_COMMAND install --no-cache-dir -r "$PROJECT_BACKEND_DIR/requirements.txt" \
    --target "$BUILD_DIR/base_deps"

if [ $? -ne 0 ]; then echo "ERROR: pip install failed!"; exit 1; fi
echo "Base dependencies installed."

# --- Copy shared utils ---
echo "Copying shared utils..."
cp -r "$PROJECT_BACKEND_DIR/utils" "$BUILD_DIR/base_deps/"
echo "Shared utils copied."

# --- 2. Package each service ---

package_service() {
    local service_name=$1
    local service_dir="$PROJECT_BACKEND_DIR/services/$service_name"
    local zip_file="$PROJECT_BACKEND_DIR/${service_name}_deployment_package.zip"
    local temp_package_dir="$BUILD_DIR/temp_package"

    echo "--- Packaging $service_name service ---"
    
    # Clear temp package dir
    echo "Clearing temporary package directory: $temp_package_dir"
    rm -rf "$temp_package_dir/"*
    
    # Copy base dependencies to temp package dir
    echo "Copying base dependencies to $temp_package_dir"
    cp -r "$BUILD_DIR/base_deps/." "$temp_package_dir/"
    
    # Copy service-specific files to temp package dir
    echo "Copying service files from $service_dir to $temp_package_dir"
    cp "$service_dir/"*.py "$temp_package_dir/"
    
    # Go into temp package dir
    cd "$temp_package_dir"
    
    # Create the zip file, placing it back in the original project directory
    echo "Creating zip file at $zip_file"
    zip -r "$zip_file" . -x "*__pycache__*/*" ".DS_Store"
    if [ $? -ne 0 ]; then echo "ERROR: Failed to create zip file for $service_name!"; exit 1; fi
    
    # Go back to the original backend directory
    cd "$PROJECT_BACKEND_DIR"
    echo "$service_name service packaged successfully."
}

# Package each service
package_service "auth_service"
package_service "inventory_service"
package_service "recipe_service"

# --- Clean up build directory (optional) ---
# echo "Cleaning up build directory $BUILD_DIR..."
# rm -rf "$BUILD_DIR"

echo "--- Lambda packaging complete. Zip files are in $PROJECT_BACKEND_DIR ---"
