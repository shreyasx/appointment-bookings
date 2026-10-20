FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM deps AS test
COPY . .
CMD ["npm", "test"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production TZ=UTC
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY migrations ./migrations
COPY src/shared ./src/shared
COPY src/server ./src/server
COPY --from=build /app/dist/web ./dist/web
EXPOSE 3000
CMD ["node", "src/server/main.ts"]
