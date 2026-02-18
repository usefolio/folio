ARG COMMIT_SHA
ARG SERVICE_NAME
ARG REPO_NAME

FROM us-central1-docker.pkg.dev/sget-ai/cloud-run-source-deploy/${REPO_NAME}/${SERVICE_NAME}-redis:${COMMIT_SHA}
USER root

RUN apt-get update && apt-get install -y redis-server

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
