# CloudShell Examples

This directory contains example usage patterns and configurations for CloudShell.

## Basic Usage

### 1. Quick File Operations

```bash
# Create and edit files
mkdir myproject
cd myproject
echo "# My Project" > README.md

# Use pre-installed tools
git init
git add README.md
git commit -m "Initial commit"
```

### 2. Development Environment

```bash
# Node.js project
mkdir node-demo
cd node-demo
npm init -y
npm install express

# Create server
cat > server.js << 'EOF'
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Hello from CloudShell!'));
app.listen(3000, () => console.log('Server running on port 3000'));
EOF

# Run it
node server.js
```

### 3. Port Forwarding

Once your server is running:

```bash
# In a new terminal or via API:
curl -X POST https://cloudshell.coey.dev/api/ports/forward \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"port": 3000}'
```

You'll get a URL like `https://3000-shell-test.cloudshell.coey.dev` to access your server.

### 4. Python Development

```bash
# Python project
mkdir python-demo
cd python-demo
python3 -m venv venv
source venv/bin/activate
pip install flask

# Create app
cat > app.py << 'EOF'
from flask import Flask
app = Flask(__name__)

@app.route('/')
def hello():
    return 'Hello from CloudShell Flask!'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
EOF

python3 app.py
```

### 5. tmux Session Management

```bash
# Create named session
tmux new-session -s myproject

# Detach: Ctrl+B, then D
# Reattach later:
tmux attach-session -t myproject

# List sessions
tmux ls
```

### 6. Data Processing with jq

```bash
# Example: Process JSON API response
curl -s https://api.github.com/repos/acoyfellow/cloudshell | jq '.stargazers_count, .forks_count'

# Filter and transform
cat > data.json << 'EOF'
{"users": [{"name": "alice", "role": "admin"}, {"name": "bob", "role": "user"}]}
EOF

jq '.users[] | select(.role == "admin") | .name' data.json
```

### 7. Git Workflow

```bash
# Configure git (already done in container)
git config --global user.name "Your Name"
git config --global user.email "your@email.com"

# Typical workflow
mkdir myrepo && cd myrepo
git init
echo "# My Repo" > README.md
git add .
git commit -m "Initial commit"

# Make changes
echo "Some code" > main.js
git add main.js
git commit -m "Add main.js"
```

### 8. Custom Dockerfile Example

Save your preferred environment:

```bash
# Via API
curl -X POST https://cloudshell.coey.dev/api/container/custom \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dockerfile": "FROM alpine:latest\nRUN apk add --no-cache nodejs npm python3 py3-pip git vim\nWORKDIR /home/user\nCMD [\"/server\"]"
  }'
```

## Tips

- **Persistence**: Files in `/home/user` survive container sleep
- **Dev Tools**: git, node, npm, python3, vim, nano, htop, tree, jq, tmux pre-installed
- **Session Timeout**: JWT expires after 24 hours
- **Container Sleep**: After 5 minutes idle, wakes instantly on reconnect

## More Examples

See the main [README.md](../README.md) for complete API documentation.
