FROM node:22-alpine AS Dependencies
WORKDIR /Application
COPY package.json ./
RUN npm install

FROM node:22-alpine AS Builder
WORKDIR /Application
COPY --from=Dependencies /Application/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN mkdir -p dist/Plugins && cp -R Plugins/* dist/Plugins/

FROM node:22-alpine AS Runner
WORKDIR /Application
ENV NODE_ENV=production
COPY --from=Builder /Application/package.json ./package.json
COPY --from=Builder /Application/node_modules ./node_modules
COPY --from=Builder /Application/.next ./.next
COPY --from=Builder /Application/public ./public
COPY --from=Builder /Application/dist ./dist
COPY --from=Builder /Application/prisma ./prisma
EXPOSE 3000
CMD ["npm", "run", "start"]
