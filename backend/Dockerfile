FROM python:3.11-slim
WORKDIR /app/backend
COPY pyproject.toml ./
COPY swapnet ./swapnet
COPY queries ./queries
COPY tests ./tests
RUN pip install --no-cache-dir -e .
EXPOSE 8000
CMD ["uvicorn", "swapnet.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
