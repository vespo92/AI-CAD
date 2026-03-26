# Build stage - use Node for cross-platform compatibility (Bun segfaults under QEMU)
FROM node:22-alpine AS build

WORKDIR /app

# Build args for Vite env vars (baked into bundle at build time)
ARG VITE_AZURE_AD_CLIENT_ID
ARG VITE_AZURE_AD_TENANT_ID
ARG VITE_LLM_GATEWAY_URL=http://localhost:8092
ARG VITE_CAD_SERVICE_URL=http://localhost:8090
ARG VITE_FILE_SERVER_URL=http://localhost:8091
ARG VITE_APP_VERSION=0.1.0

# Set env vars for Vite build
ENV VITE_AZURE_AD_CLIENT_ID=$VITE_AZURE_AD_CLIENT_ID
ENV VITE_AZURE_AD_TENANT_ID=$VITE_AZURE_AD_TENANT_ID
ENV VITE_LLM_GATEWAY_URL=$VITE_LLM_GATEWAY_URL
ENV VITE_CAD_SERVICE_URL=$VITE_CAD_SERVICE_URL
ENV VITE_FILE_SERVER_URL=$VITE_FILE_SERVER_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION

# Install dependencies
COPY package.json ./
RUN npm install --legacy-peer-deps

# Copy source and build
COPY . .
RUN npx tsc -b && npx vite build

# Production stage - tiny nginx image (~25MB total)
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Run nginx
CMD ["nginx", "-g", "daemon off;"]
