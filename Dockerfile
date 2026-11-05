# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Accept Supabase and VAPID environment variables as build arguments
ARG VITE_SUPABASE_URL=https://domvere-api.zlabs.com.br
ARG VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc5NzI0NzEwLCJleHAiOjE5Mzc0MDQ3MTB9.Wqz3IMmdmOvnco09bqUJm06CxblFBfduerDxvEGB0xw
ARG VITE_VAPID_PUBLIC_KEY=BN1iq_xw_QmolqgHgdP2_s1eE_gKEAYx5VPF2hG8PiISSSyA8pEZLvG1aayzphjffk8dbyW9H17XhVWb8Uyebzs
ARG VITE_APP_VERSION=2.11

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
ENV VITE_APP_VERSION=$VITE_APP_VERSION

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build the project
COPY . .
RUN npm run build

# --- Production Stage ---
FROM nginx:alpine

# Copy build output to Nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration for routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
