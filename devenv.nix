# =============================================================================
#  devenv.nix — La Suite Meet ("Visio") developer environment
# =============================================================================
{
  pkgs,
  lib,
  config,
  ...
}:

let
  python = pkgs.python313;
  nodejs = pkgs.nodejs_22;

  backendDir = "src/backend";
  agentsDir = "src/agents";
  summaryDir = "src/summary";
  frontendDir = "src/frontend";

  readDotEnv =
    file:
    let
      lines = lib.splitString "\n" (builtins.readFile file);
      unquote =
        v:
        let
          len = builtins.stringLength v;
        in
        if len >= 2 && lib.hasPrefix "\"" v && lib.hasSuffix "\"" v then
          builtins.substring 1 (len - 2) v
        else if len >= 2 && lib.hasPrefix "'" v && lib.hasSuffix "'" v then
          builtins.substring 1 (len - 2) v
        else
          v;
      parseLine =
        line:
        let
          m = builtins.match "[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.*)" line;
        in
        if m == null then null else { name = builtins.elemAt m 0; value = unquote (builtins.elemAt m 1); };
    in
    builtins.listToAttrs (builtins.filter (x: x != null) (map parseLine lines));

  # Reuse existing .env
  dotEnv =
    (readDotEnv ./env.d/development/common.dist)
    // (readDotEnv ./env.d/development/postgresql.dist);

  sharedEnv = builtins.removeAttrs dotEnv [ "PYTHONPATH" ]; # only makes sense inside the backend container.
in
{
  options.meet = {
    agents.enable = lib.mkEnableOption "tooling for the LiveKit agents in src/agents";
    summary.enable = lib.mkEnableOption "tooling for the summary service in src/summary";
    k8s.enable = lib.mkEnableOption "Kubernetes dev utilities";
  };

  config = {
    # Profile can be activated with devenv --profile <profile> shell
    profiles = {
      agents.module = {
        meet.agents.enable = true;
      };
      summary.module = {
        meet.summary.enable = true;
      };
      k8s.module = {
        meet.k8s.enable = true;
      };
    };
    languages.python = {
      enable = true;
      package = python;
      directory = backendDir;
      manylinux.enable = pkgs.stdenv.hostPlatform.isLinux;

      libraries = [
        "${config.devenv.dotfile}/profile"
        pkgs.file
        pkgs.zlib
        pkgs.libffi
        pkgs.openssl
      ];

      uv.enable = true;
      uv.sync.enable = false;
      venv.enable = false;
      lsp.enable = true;
    };

    languages.javascript = {
      enable = true;
      package = nodejs;
      directory = frontendDir;

      npm.enable = true;
      yarn.enable = true;
      corepack.enable = false;
    };

    languages.typescript.enable = false;
    languages.nix.enable = true;

    git-hooks.hooks.gitlint.enable = true;

    packages =
      with pkgs;
      [
        gnumake
        file
        shared-mime-info
        gettext
        postgresql_16
        git
        curl
        jq
        podman
        podman-compose
        docker-client
      ]

      # -- LiveKit agents
      ++ lib.optionals config.meet.agents.enable [
        glib
        portaudio
        livekit-cli
      ]

      # -- summary service
      ++ lib.optionals config.meet.summary.enable [
        redis
      ]

      # -- Kubernetes tools
      ++ lib.optionals config.meet.k8s.enable [
        kubectl
        kubernetes-helm
        helmfile
        tilt
        kind
        mkcert
      ];

    env = sharedEnv // {
      UV_LINK_MODE = "copy";

      PYTHONDONTWRITEBYTECODE = "1";
      PYTHONUNBUFFERED = "1";

      UV_PROJECT_ENVIRONMENT = lib.mkForce ".venv";

      COMPOSE_PROJECT_NAME = "meet";

      DJANGO_DATA_DIR = "${config.devenv.root}/data";

      # Database / Pgsql
      DB_HOST = "127.0.0.1";
      DB_PORT = "15432";
      PGHOST = "127.0.0.1";
      PGPORT = "15432";
      PGDATABASE = sharedEnv.DB_NAME;
      PGUSER = sharedEnv.DB_USER;
      PGPASSWORD = sharedEnv.DB_PASSWORD;

      REDIS_URL = "redis://127.0.0.1:6379/1";
      CELERY_BROKER_URL = "redis://127.0.0.1:6379/0";

      # S3 / MinIO
      AWS_S3_ENDPOINT_URL = "http://127.0.0.1:9000";

      # OIDC
      OIDC_OP_JWKS_ENDPOINT = "http://localhost:8083/realms/meet/protocol/openid-connect/certs";
      OIDC_OP_TOKEN_ENDPOINT = "http://localhost:8083/realms/meet/protocol/openid-connect/token";
      OIDC_OP_USER_ENDPOINT = "http://localhost:8083/realms/meet/protocol/openid-connect/userinfo";
      OIDC_OP_INTROSPECTION_ENDPOINT = "http://localhost:8083/realms/meet/protocol/openid-connect/token/introspect";

      # summary service
      SUMMARY_SERVICE_ENDPOINT = "http://127.0.0.1:8001/api/v2/async-jobs/transcribe/";
      SUMMARY_SERVICE_VERSION = "2";

      # Mail
      DJANGO_EMAIL_HOST = "127.0.0.1";
    };

    scripts = {

      meet-venv = {
        description = "Create/refresh meet uv virtualenvs for backend, agents and summary";
        exec = ''
          set -euo pipefail
          cd "$DEVENV_ROOT"

          echo "==> ${backendDir} (uv sync --locked, dependency-groups)"
          ( cd "${backendDir}" && uv sync --locked --all-groups )

          echo "==> ${agentsDir} (uv sync --locked --all-extras)"
          ( cd "${agentsDir}" && uv sync --locked --all-extras )

          echo "==> ${summaryDir} (uv sync --locked --all-extras)"
          ( cd "${summaryDir}" && uv sync --locked --all-extras )

          echo
          echo "Synced the following virtualenvs successfully:"
          echo "  ${backendDir}/.venv"
          echo "  ${agentsDir}/.venv"
          echo "  ${summaryDir}/.venv"
        '';
      };
    };

    enterShell = ''
      # Make podman socket accessible in order to launch regular docker commands.
      # Set MEET_PODMAN_SOCKET=0 to keep the DOCKER_HOST of the calling environment.
      case "''${MEET_PODMAN_SOCKET:-1}" in
        0|false|no|off) ;;
        *)
          _rundir="''${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
          export DOCKER_HOST="unix://$_rundir/podman/podman.sock"
          unset _rundir
          ;;
      esac

      # Compose files to merge
      _compose_dir="${config.devenv.root}/docker/compose.d"
      _compose_files="${config.devenv.root}/compose.yml"

      export DOCKER_USER="$(id -u):$(id -g)"

      case "''${DOCKER_HOST:-}" in
        *podman*)
          _compose_files="$_compose_files:$_compose_dir/compose.podman.yml"

          # Build images with Podman/Buildah rather than BuildKit. `docker
          # compose build` otherwise has buildx boot a moby/buildkit container,
          # and that container lands in its own network namespace with neither
          # the proxy in its environment nor any route to it.
          # Buildah has neither problem: base images are resolved by the Podman systemd
          # service, which inherits the proxy from its systemd socket activated unit, and
          # RUN steps execute in the *host* network namespace

          export DOCKER_BUILDKIT=0
          export COMPOSE_BAKE=false
          ;;
      esac


      # Apply Bureautix override
      if [ -n "''${http_proxy:-}" ]; then
        _compose_files="$_compose_files:$_compose_dir/compose.bureautix.yml"
      fi

      export COMPOSE_FILE="$_compose_files"
      unset _compose_dir _compose_files

      # Make binaries accessible
      for _d in \
        "$DEVENV_ROOT/${backendDir}/.venv/bin" \
        "$DEVENV_ROOT/${agentsDir}/.venv/bin" \
        "$DEVENV_ROOT/${summaryDir}/.venv/bin" \
        "$DEVENV_ROOT/${frontendDir}/node_modules/.bin"
      do
        [ -d "$_d" ] && export PATH="$_d:$PATH"
      done
      unset _d
    '';
  };
}
