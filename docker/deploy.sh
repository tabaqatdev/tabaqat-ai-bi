#!/bin/bash

# Deploy script for multiple production environments
# Usage: ./deploy.sh <env-name> [up|down|restart|logs|clean|destroy]
# Example: ./deploy.sh prod1 up
#          ./deploy.sh prod1 down
#          ./deploy.sh prod1 clean    # stop and remove containers
#          ./deploy.sh prod1 destroy  # complete cleanup (containers, volumes, networks)

ENV_NAME=${1:-prod1}
ACTION=${2:-up}

ENV_FILE=".env.${ENV_NAME}"
COMPOSE_FILE="docker-compose.multi.yaml"
PROJECT_NAME="wrenai-${ENV_NAME}"  # Explicit project name to avoid conflicts

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file '$ENV_FILE' not found!"
    echo "Available environments:"
    ls -1 .env.* 2>/dev/null | sed 's/.env./  - /'
    exit 1
fi

echo "Using environment: $ENV_FILE"
echo "Project name: $PROJECT_NAME"

case $ACTION in
    up)
        echo "Starting containers for $ENV_NAME..."
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d
        ;;
    down)
        echo "Stopping containers for $ENV_NAME..."
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down
        ;;
    restart)
        echo "Restarting containers for $ENV_NAME..."
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT_NAME" restart
        ;;
    logs)
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs -f
        ;;
    ps)
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps
        ;;
    clean)
        echo "Cleaning up containers for $ENV_NAME..."
        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down --remove-orphans
        ;;
    destroy)
        echo "DESTROYING ALL resources for $ENV_NAME (containers, volumes, networks)..."
        echo "This will DELETE ALL DATA for this environment!"
        read -p "Are you sure? Type 'YES' to confirm: " CONFIRM
        if [ "$CONFIRM" = "YES" ]; then
            docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down --volumes --remove-orphans
            # Clean up any leftover networks
            docker network rm "${PROJECT_NAME}_default" 2>/dev/null || true
            echo "Destroy completed for $ENV_NAME"
        else
            echo "Aborted."
        fi
        ;;
    status)
        echo "Containers for $ENV_NAME:"
        docker ps --filter "name=${PROJECT_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo -e "\nVolumes for $ENV_NAME:"
        docker volume ls --filter "name=${PROJECT_NAME}" --format "table {{.Name}}"
        echo -e "\nNetworks for $ENV_NAME:"
        docker network ls --filter "name=${PROJECT_NAME}" --format "table {{.Name}}"
        ;;
    fix-network)
        echo "Fixing network issues for $ENV_NAME..."
        # Remove the problematic network if it exists
        NETWORK_NAME="${PROJECT_NAME}_default"
        if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
            echo "Removing network $NETWORK_NAME..."
            docker network rm "$NETWORK_NAME"
        fi
        echo "Network cleanup completed. Run './deploy.sh $ENV_NAME up' to recreate."
        ;;
    *)
        echo "Usage: $0 <env-name> [up|down|restart|logs|ps|clean|destroy|status|fix-network]"
        echo "  env-name: prod1, prod2, etc. (matches .env.<env-name>)"
        echo ""
        echo "Commands:"
        echo "  up           - Start containers"
        echo "  down         - Stop containers"
        echo "  restart      - Restart containers"
        echo "  logs         - Follow logs"
        echo "  ps           - List containers"
        echo "  clean        - Stop and remove containers (keeps volumes)"
        echo "  destroy      - Complete cleanup (containers, volumes, networks)"
        echo "  status       - Show containers, volumes, networks"
        echo "  fix-network  - Remove orphaned networks"
        exit 1
        ;;
esac