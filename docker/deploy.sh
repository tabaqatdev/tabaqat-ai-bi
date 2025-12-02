#!/bin/bash

# Deploy script for multiple production environments
# Usage: ./deploy.sh <env-name> [up|down|restart|logs]
# Example: ./deploy.sh prod1 up
#          ./deploy.sh prod2 down

ENV_NAME=${1:-prod1}
ACTION=${2:-up}

ENV_FILE=".env.${ENV_NAME}"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file '$ENV_FILE' not found!"
    echo "Available environments:"
    ls -1 .env.* 2>/dev/null | sed 's/.env./  - /'
    exit 1
fi

echo "Using environment: $ENV_FILE"

COMPOSE_FILE="docker-compose.multi.yaml"

case $ACTION in
    up)
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
        ;;
    down)
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down
        ;;
    restart)
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" restart
        ;;
    logs)
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs -f
        ;;
    ps)
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
        ;;
    *)
        echo "Usage: $0 <env-name> [up|down|restart|logs|ps]"
        echo "  env-name: prod1, prod2, etc. (matches .env.<env-name>)"
        exit 1
        ;;
esac
