# Build the single-file static viewer, then serve it with nginx.
# Build context is this ui/ directory:
#   docker build -t laivel-up-ui ui/
#   docker run --rm -p 8080:80 laivel-up-ui
# Then open http://localhost:8080 and drop an evaluation.json.

FROM node:22-alpine AS build
WORKDIR /ui
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . ./
RUN npm run build

FROM nginx:1.27-alpine AS serve
COPY --from=build /ui/dist/ /usr/share/nginx/html/
EXPOSE 80
