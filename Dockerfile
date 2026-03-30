FROM python:3.11-slim

# Install Node.js 20
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Frontend build
COPY frontend/package*.json frontend/
RUN cd frontend && npm install

COPY frontend/ frontend/
RUN cd frontend && npm run build

# App code
COPY . .

EXPOSE $PORT
CMD uvicorn execution.api_server:app --host 0.0.0.0 --port ${PORT:-8000}
