FROM python:3.14-slim-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY prompts ./prompts

RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/app/data/cache/hf
ENV HUGGINGFACE_HUB_CACHE=/app/data/cache/hf
ENV FASTEMBED_CACHE_PATH=/app/data/cache/fastembed

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
