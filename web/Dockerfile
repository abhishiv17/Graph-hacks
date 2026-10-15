FROM node:22-alpine AS build
WORKDIR /web
COPY package.json ./
RUN npm install
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /web
COPY --from=build /web/.next/standalone ./
COPY --from=build /web/.next/static ./.next/static
ENV PORT=3001 HOSTNAME=0.0.0.0
EXPOSE 3001
CMD ["node", "server.js"]
