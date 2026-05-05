FROM node:22-alpine AS dependencies
WORKDIR /Application
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM node:22-alpine AS builder
WORKDIR /Application
RUN apk add --no-cache openssl
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /Application/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN mkdir -p dist/Plugins && cp -R Plugins/* dist/Plugins/

FROM node:22-alpine AS runner
WORKDIR /Application
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl
COPY --from=builder /Application/package.json ./package.json
COPY --from=builder /Application/node_modules ./node_modules
COPY --from=builder /Application/.next ./.next
COPY --from=builder /Application/public ./public
COPY --from=builder /Application/dist ./dist
COPY --from=builder /Application/prisma ./prisma
EXPOSE 3000
CMD ["npm", "run", "start"]
