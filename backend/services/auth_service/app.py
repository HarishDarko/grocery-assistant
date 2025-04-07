import os
from handler import app

if __name__ == '__main__':
    port = int(os.environ.get('SERVICE_PORT', 3000))
    app.run(debug=True, port=port, host='0.0.0.0') 