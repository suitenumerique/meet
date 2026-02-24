#!/usr/bin/env bash

set -eo pipefail

REPO_DIR="$(cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd)"
UNSET_USER=0

COMPOSE_FILE="${REPO_DIR}/compose.yml"
COMPOSE_PROJECT="meet"


# _set_user: set (or unset) default user id used to run docker commands
#
# usage: _set_user
#
# You can override default user ID (the current host user ID), by defining the
# USER_ID environment variable.
#
# To avoid running docker commands with a custom user, please set the
# $UNSET_USER environment variable to 1.
function _set_user() {

    if [ $UNSET_USER -eq 1 ]; then
        USER_ID=""
        return
    fi

    # USER_ID = USER_ID or `id -u` if USER_ID is not set
    USER_ID=${USER_ID:-$(id -u)}

    echo "🙋(user) ID: ${USER_ID}"
}

# docker_compose: wrap docker compose command
#
# usage: docker_compose [options] [ARGS...]
#
# options: docker compose command options
# ARGS   : docker compose command arguments
function _docker_compose() {

    echo "🐳(compose) project: '${COMPOSE_PROJECT}' file: '${COMPOSE_FILE}'"
    docker compose \
        -p "${COMPOSE_PROJECT}" \
        -f "${COMPOSE_FILE}" \
        --project-directory "${REPO_DIR}" \
        "$@"
}

# _dc_run: wrap docker compose run command
#
# usage: _dc_run [options] [ARGS...]
#
# options: docker compose run command options
# ARGS   : docker compose run command arguments
function _dc_run() {
    _set_user

    user_args="--user=$USER_ID"
    if [ -z $USER_ID ]; then
        user_args=""
    fi

    _docker_compose run --rm $user_args "$@"
}

# _dc_exec: wrap docker compose exec command
#
# usage: _dc_exec [options] [ARGS...]
#
# options: docker compose exec command options
# ARGS   : docker compose exec command arguments
function _dc_exec() {
    _set_user

    echo "🐳(compose) exec command: '\$@'"

    user_args="--user=$USER_ID"
    if [ -z $USER_ID ]; then
        user_args=""
    fi

    _docker_compose exec $user_args "$@"
}

# _django_manage: wrap django's manage.py command with docker compose
#
# usage : _django_manage [ARGS...]
#
# ARGS : django's manage.py command arguments
function _django_manage() {
    _dc_run "app-development" python manage.py "$@"
}
