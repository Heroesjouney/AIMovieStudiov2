FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# ffmpeg is required by moviepy for video assembly. build-essential is kept so a
# dependency added later that has no prebuilt wheel still compiles.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Requirements are copied on their own so editing application code reuses this layer.
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# The whole tree, so new routers, drivers and schemas need no change here.
COPY . .

# Inside a container 127.0.0.1 is the container itself, so point at the host by
# default. Anything set in backend/.env overrides this.
ENV COMFY_URL=http://host.docker.internal:8188 \
    HOST=0.0.0.0 \
    PORT=8001

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["sh", "-c", "python main.py serve --host \"$HOST\" --port \"$PORT\""]
