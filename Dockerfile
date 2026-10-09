# Agam: web app + background worker in one image. Data (lists, alerts, audit log) lives in /app/.agam-data — mount a volume there.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start:all"]
