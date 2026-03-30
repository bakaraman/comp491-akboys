FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json

RUN npm ci

COPY packages/shared packages/shared
COPY packages/server packages/server

RUN npm run build -w packages/shared \
  && node -e "const fs=require('fs'); const p='./packages/shared/package.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); j.main='./dist/index.js'; j.types='./dist/index.d.ts'; j.exports={'.':{types:'./dist/index.d.ts',default:'./dist/index.js'}}; fs.writeFileSync(p, JSON.stringify(j, null, 2));" \
  && npm run build -w packages/server

FROM node:20-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/server ./packages/server

CMD ["node", "packages/server/dist/server/src/index.js"]
