FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-liberation \
    fonts-noto-core \
    python3 \
    python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/smartbuild-python \
    && /opt/smartbuild-python/bin/pip install --no-cache-dir "pydantic>=2,<3" "fastapi>=0.115,<1" "uvicorn>=0.30,<1"

ENV SMARTBUILD_PYTHON_EXECUTABLE=/opt/smartbuild-python/bin/python \
    CHROMIUM_PATH=/usr/bin/chromium \
    SMARTBUILD_SYNTHETIC_EVALUATOR_ENGINE=lightweight \
    SMARTBUILD_CHROMIUM_LAUNCH_TIMEOUT_MS=25000 \
    SMARTBUILD_BROWSER_RUNNER_TIMEOUT_MS=45000 \
    SMARTBUILD_SYNTHETIC_EVALUATOR_TIMEOUT_MS=50000 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY . .
RUN npm install -g corepack@latest && corepack pnpm install && corepack pnpm run build

ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=128 \
    MALLOC_ARENA_MAX=2 \
    UV_THREADPOOL_SIZE=1
CMD ["node", "dist/index.js"]
