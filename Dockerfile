# A toolbox for this repo's scripts: Node, Chromium for rendering the banners,
# and the fonts the SVGs ask for, so renders match from any machine.
# The repo itself is bind-mounted at /work (see compose.yaml), so outputs land
# in your working tree; only the npm packages live in the image, at
# /node_modules, where Node finds them walking up from /work/scripts.
#
#   docker compose build
#   docker compose run --rm tools npm run build
#   docker compose run --rm tools npm run banners

# Node major version: keep in step with .nvmrc, which CI reads
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-trixie-slim

# Chromium, plus Liberation (Arial-metric fallback for the sans stack) and
# DejaVu (symbols like ➜ and ⌘ that the text faces lack)
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# The faces the SVGs name first: Archivo (sans) and IBM Plex Mono. Space
# Grotesk needs nothing here; it's embedded in the SVGs.
ARG GF=https://github.com/google/fonts/raw/main/ofl
RUN mkdir -p /usr/local/share/fonts/web && cd /usr/local/share/fonts/web \
 && curl -fsSL -o Archivo.ttf "$GF/archivo/Archivo%5Bwdth%2Cwght%5D.ttf" \
 && for w in Regular SemiBold Bold; do curl -fsSLO "$GF/ibmplexmono/IBMPlexMono-$w.ttf"; done \
 && fc-cache -f

WORKDIR /
COPY package.json package-lock.json ./
RUN npm install -g --no-audit --no-fund npm@latest \
 && npm ci --no-audit --no-fund && npm cache clean --force

# banners.mjs reads these; Chromium's sandbox needs privileges containers
# don't get, and the pages it renders are our own SVGs
ENV CHROME=/usr/bin/chromium \
    CHROME_FLAGS=--no-sandbox

WORKDIR /work
USER node
CMD ["npm", "run", "build"]
