FROM alpine:latest

ARG PB_VERSION=0.39.1
RUN apk add --no-cache unzip ca-certificates wget \
  && wget -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
  && unzip /tmp/pb.zip -d /pb \
  && rm /tmp/pb.zip

WORKDIR /pb
COPY pb_migrations/ /pb/pb_migrations/
COPY pb_hooks/ /pb/pb_hooks/
EXPOSE 8090

# serve auto-applies pending migrations on boot. The AI-agent proxy route lives
# in pb_hooks (ADR-0010); OPENAI_API_KEY is supplied as a Fly secret.
CMD ["./pocketbase", "serve", \
  "--http=0.0.0.0:8090", \
  "--dir=/pb/pb_data", \
  "--migrationsDir=/pb/pb_migrations", \
  "--hooksDir=/pb/pb_hooks"]
