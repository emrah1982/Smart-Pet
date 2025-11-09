FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
EXPOSE 8080
ENV DB_HOST=mysql DB_PORT=3306 DB_USER=feeder DB_PASS=feeder_pass DB_NAME=feeder_db
ENV FALLBACK_ESP_HOST=192.168.1.50 FALLBACK_ESP_PORT=80
CMD ["node", "dist/index.js"]
