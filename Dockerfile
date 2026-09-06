ARG NODE_VERSION=22.12.0

FROM node:${NODE_VERSION}-alpine AS dependencies
WORKDIR /Application
RUN apk add --no-cache openssl python3
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi
# Ensure yt-dlp is up-to-date (fixes YouTube 403 errors caused by outdated bundled binary)
RUN ./node_modules/youtube-dl-exec/bin/yt-dlp -U || echo "yt-dlp update failed, continuing"

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /Application
RUN apk add --no-cache openssl python3
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /Application/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN mkdir -p dist/Plugins && cp -R Plugins/* dist/Plugins/

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /Application
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache ffmpeg fontconfig openssl python3 ttf-dejavu ttf-liberation yt-dlp || apk add --no-cache ffmpeg fontconfig openssl python3 ttf-dejavu ttf-liberation
COPY --from=builder /Application/package.json ./package.json
COPY --from=builder /Application/node_modules ./node_modules
COPY --from=builder /Application/.next ./.next
COPY --from=builder /Application/public ./public
COPY --from=builder /Application/dist ./dist
COPY --from=builder /Application/prisma ./prisma
EXPOSE 3000
CMD ["npm", "run", "start"]
