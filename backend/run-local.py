#!/usr/bin/env python
import os
import subprocess
import sys
import time
import signal
import atexit
from concurrent.futures import ThreadPoolExecutor

# Configuration
SERVICES = {
    "auth": {
        "dir": "services/auth_service",
        "port": 3000
    },
    "inventory": {
        "dir": "services/inventory_service",
        "port": 3001
    },
    "recipe": {
        "dir": "services/recipe_service",
        "port": 3002
    }
}

# Store processes to terminate them later
processes = []

def run_service(service_name, service_config):
    """Run a single service with Flask"""
    service_dir = service_config["dir"]
    port = service_config["port"]
    
    # Change to the service directory
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), service_dir))
    
    # Set environment variable for Flask and the service port
    env = os.environ.copy()
    # Remove Flask-specific vars if directly running app.py
    # env["FLASK_APP"] = "handler.py" 
    # env["FLASK_ENV"] = "development"
    # env["FLASK_DEBUG"] = "1"
    env["SERVICE_PORT"] = str(port) # Add port environment variable
    
    # Run the service's app.py directly
    # cmd = ["python", "-m", "flask", "run", "--port", str(port)] # Old command
    cmd = [sys.executable, "app.py"] # New command: Run app.py directly
    
    print(f"Starting {service_name} service via app.py on port {port}...")
    process = subprocess.Popen(cmd, env=env)
    processes.append(process)
    
    # Return to the original directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    return process

def cleanup():
    """Terminate all processes when the script is stopped"""
    print("\nShutting down all services...")
    for process in processes:
        try:
            process.terminate()
        except:
            pass

def main():
    # Register cleanup function
    atexit.register(cleanup)
    signal.signal(signal.SIGTERM, lambda signum, frame: sys.exit(0))
    signal.signal(signal.SIGINT, lambda signum, frame: sys.exit(0))
    
    # Check if Python dependencies are installed
    try:
        import flask
        import pymongo
        import flask_cors
        import flask_jwt_extended
    except ImportError:
        print("Installing dependencies...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    
    # Start each service in a separate thread
    with ThreadPoolExecutor(max_workers=len(SERVICES)) as executor:
        future_to_service = {
            executor.submit(run_service, service_name, service_config): service_name
            for service_name, service_config in SERVICES.items()
        }
        
        # Wait for all services to start
        for future in future_to_service:
            service_name = future_to_service[future]
            try:
                future.result()
                print(f"{service_name.capitalize()} service started successfully")
            except Exception as e:
                print(f"Error starting {service_name} service: {e}")
    
    print("\nAll services are running.")
    print("Auth service:       http://localhost:3000")
    print("Inventory service:  http://localhost:3001")
    print("Recipe service:     http://localhost:3002")
    print("\nPress Ctrl+C to stop all services.")
    
    try:
        # Keep the script running
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main() 