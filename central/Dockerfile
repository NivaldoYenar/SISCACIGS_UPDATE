# /central/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Dependências de sistema pra psycopg2, numpy, Pillow etc.
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copia requirements e instala
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o restante do código (inclui models/, face_*.py etc.)
COPY . .

# Se quiser, expõe a porta lógica do serviço
EXPOSE 8000

# Entrypoint FastAPI
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
