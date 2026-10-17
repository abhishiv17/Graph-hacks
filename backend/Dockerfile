# Built from the repo root (docker-compose and Render both use it), so the data/ tables come with the image.
FROM python:3.11-slim
WORKDIR /app/backend
COPY backend/pyproject.toml ./
COPY backend/swapnet ./swapnet
COPY backend/queries ./queries
COPY backend/tests ./tests
RUN pip install --no-cache-dir -e .
COPY data /app/data
EXPOSE 8000
# Render sets PORT; locally it is 8000.
CMD ["sh", "-c", "uvicorn swapnet.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
