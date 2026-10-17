# Built from the repo root (docker-compose locally and deploy/aws on the server), so the data/ tables come with the image.
FROM python:3.11-slim
WORKDIR /app/backend
COPY backend/pyproject.toml ./
COPY backend/swapnet ./swapnet
COPY backend/queries ./queries
COPY backend/tests ./tests
RUN pip install --no-cache-dir -e .
COPY data /app/data
EXPOSE 8000
# PORT can be set by the host; it is 8000 by default.
CMD ["sh", "-c", "uvicorn swapnet.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
