# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Copy only the manifests first so the dependency layer is reused whenever
# application source changes but dependencies do not.
COPY package.json package-lock.json ./

# `npm ci` rather than `npm install`: it installs exactly the lockfile, fails if
# the lockfile and package.json disagree, and is reproducible. `npm install`
# could silently resolve different versions than CI or a teammate.
RUN npm ci

COPY . .

# ---------------------------------------------------------------------------
# Build-time configuration.
#
# Vite inlines `import.meta.env.VITE_*` at BUILD time, not at run time, so a
# variable that is only present in the container's environment reaches nothing:
# by then the bundle is already written. Without these ARGs an operator could
# set VITE_LLM_PROXY_URL in Coolify, see it in the running container, and still
# find the Copilot absent — because the build never saw it.
#
# Each is declared ARG (so `--build-arg` / a Coolify *build* variable can set
# it) and promoted to ENV (so Vite picks it up). All are optional: unset, the
# app falls back to the defaults documented in .env.example.
# ---------------------------------------------------------------------------
ARG VITE_APP_ENV=production
ARG VITE_LAB_AUTH_ENABLED
ARG VITE_LAB_AUTH_VERIFY_URL
ARG VITE_LAB_LOGIN_URL
ARG VITE_LAB_HOME_URL
ARG VITE_LAB_AUTH_REVALIDATE_MS
ARG VITE_DEMO_USER
ARG VITE_DEMO_PASSWORD
ARG VITE_LLM_PROXY_URL
ARG VITE_LLM_MODEL
ARG VITE_LLM_TIMEOUT_MS

ENV VITE_APP_ENV=$VITE_APP_ENV \
    VITE_LAB_AUTH_ENABLED=$VITE_LAB_AUTH_ENABLED \
    VITE_LAB_AUTH_VERIFY_URL=$VITE_LAB_AUTH_VERIFY_URL \
    VITE_LAB_LOGIN_URL=$VITE_LAB_LOGIN_URL \
    VITE_LAB_HOME_URL=$VITE_LAB_HOME_URL \
    VITE_LAB_AUTH_REVALIDATE_MS=$VITE_LAB_AUTH_REVALIDATE_MS \
    VITE_DEMO_USER=$VITE_DEMO_USER \
    VITE_DEMO_PASSWORD=$VITE_DEMO_PASSWORD \
    VITE_LLM_PROXY_URL=$VITE_LLM_PROXY_URL \
    VITE_LLM_MODEL=$VITE_LLM_MODEL \
    VITE_LLM_TIMEOUT_MS=$VITE_LLM_TIMEOUT_MS

# Typecheck as part of the image build, so a type error fails the deploy rather
# than shipping broken code.
# `verify` rather than typecheck+build: it also runs the test suite, which is
# what asserts the channel mathematics against published reference values.
# Those tests are the only thing standing between an arithmetic regression
# and a workshop full of students copying wrong numbers into their notes.
RUN npm run verify

# ---------------------------------------------------------------------------
# Stage 2 — serve
# ---------------------------------------------------------------------------
FROM nginx:alpine AS runtime

# Drop the packaged default site so it cannot shadow ours.
RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf                    /etc/nginx/conf.d/default.conf
COPY nginx-security-headers.conf   /etc/nginx/conf.d/security-headers.conf
COPY --from=build /app/dist        /usr/share/nginx/html

# Read-only for the web server; it never needs to write into the document root.
RUN chmod -R a-w /usr/share/nginx/html \
 && chown -R nginx:nginx /usr/share/nginx/html

# Run unprivileged. The image binds port 3000, which is above 1024, so no
# capability to bind low ports is required.
RUN touch /var/run/nginx.pid \
 && chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /var/log/nginx

USER nginx

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
