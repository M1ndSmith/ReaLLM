FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && adduser --disabled-password --gecos "" --uid 1000 realmm

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY prompts ./prompts
COPY config ./config

RUN mkdir -p /app/data \
    && chown -R realmm:realmm /app

USER realmm

ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/app/data/cache/hf
ENV HUGGINGFACE_HUB_CACHE=/app/data/cache/hf
ENV FASTEMBED_CACHE_PATH=/app/data/cache/fastembed

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)"

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
