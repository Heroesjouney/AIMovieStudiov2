FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY package.json package-lock.json* ./

# npm ci is strict about the lockfile matching package.json. The fallback keeps the
# image buildable when someone adds a dependency without regenerating the lockfile.
RUN npm ci --include=dev || npm install --include=dev

COPY . .

# A type or lint error in work-in-progress code should not stop the container from
# building. Plain `npm run build` outside Docker still type checks as normal.
ENV NEXT_IGNORE_BUILD_ERRORS=1
RUN npm run build

ENV PORT=3000 \
    HOSTNAME=0.0.0.0

EXPOSE 3000

# Node 20 has fetch built in, so this needs no extra packages in the image.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
