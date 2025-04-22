{
  config,
  lib,
  pkgs,
  ...
}:
let
  inherit (lib)
    getExe
    mkDefault
    mkEnableOption
    mkIf
    mkPackageOption
    mkOption
    types
    optionalAttrs
    optional
    optionalString
    ;

  cfg = config.services.meet;

  gunicornSettings = pkgs.writeText "gunicorn-settings.py" ''
    bind = [ "${cfg.listenAddress}:${toString cfg.port}" ]
    name = "impress"
    python_path = "${cfg.package}/lib/meet/src/"

    graceful_timeout = 90
    timeout = 90
    workers = 3

    accesslog = "-"
    errorlog = "-"
    loglevel = "debug"
  '';

  commonServiceConfig = {
    RuntimeDirectory = "meet";
    StateDirectory = "meet";
    WorkingDirectory = "/var/lib/meet";

    User = "meet";
    DynamicUser = true;
    SupplementaryGroups = mkIf cfg.redis.createLocally [ "redis-meet" ];
    # hardening
    AmbientCapabilities = "";
    CapabilityBoundingSet = [ "" ];
    DevicePolicy = "closed";
    NoNewPrivileges = true;
    PrivateTmp = true;
    RemoveIPC = true;
    RestrictSUIDSGID = true;
    LockPersonality = true;
    MemoryDenyWriteExecute = true;
    ProtectClock = true;
    ProtectControlGroups = true;
    ProtectHostname = true;
    ProtectKernelLogs = true;
    ProtectKernelModules = true;
    ProtectKernelTunables = true;
    PrivateDevices = true;
    PrivateMounts = true;
    PrivateUsers = true;
    RestrictNamespaces = true;
    RestrictRealtime = true;
    ProtectHome = true;
    SystemCallArchitectures = "native";
    Restart = "on-failure";
    RestartSec = 5;
    UMask = "077";

    LoadCredential =
      (optional (cfg.secretKeyPath != null) "django_secret_key:${cfg.secretKeyPath}")
      ++ (optional (cfg.s3.accessKeyIDPath != null) "aws_s3_access_key_id:${cfg.s3.accessKeyIDPath}")
      ++ (optional (
        cfg.s3.secretAccessKeyPath != null
      ) "aws_s3_secret_access_key:${cfg.s3.secretAccessKeyPath}")
      ++ (optional (
        cfg.oidc.clientSecretPath != null
      ) "oidc_rp_client_secret:${cfg.oidc.clientSecretPath}")
      ++ (optional (cfg.livekit.keyFile != null) "livekit_secrets:${cfg.livekit.keyFile}");
  };

  pythonHardening = {
    RestrictAddressFamilies = [
      "AF_INET"
      "AF_INET6"
      "AF_UNIX"
    ];
    ProcSubset = "pid";
    ProtectProc = "invisible";
    ProtectSystem = "strict";
  };

  pythonPreloadSecrets = ''
    ${
      if cfg.secretKeyPath != null then
        "export DJANGO_SECRET_KEY=$(cat $CREDENTIALS_DIRECTORY/django_secret_key)"
      else
        ''
          if [[ ! -f /var/lib/meet/django_secret_key ]]; then
            (
              umask 0377
              tr -dc A-Za-z0-9 < /dev/urandom | head -c64 | ${pkgs.moreutils}/bin/sponge /var/lib/meet/django_secret_key
            )
          fi
          export DJANGO_SECRET_KEY=$(cat /var/lib/meet/django_secret_key)
        ''
    }
    ${optionalString (
      cfg.s3.accessKeyIDPath != null
    ) "export AWS_S3_ACCESS_KEY_ID=$(cat $CREDENTIALS_DIRECTORY/aws_s3_access_key_id)"}
    ${optionalString (
      cfg.s3.secretAccessKeyPath != null
    ) "export AWS_S3_SECRET_ACCESS_KEY=$(cat $CREDENTIALS_DIRECTORY/aws_s3_secret_access_key)"}
    ${optionalString (
      cfg.oidc.clientSecretPath != null
    ) "export OIDC_RP_CLIENT_SECRET=$(cat $CREDENTIALS_DIRECTORY/oidc_rp_client_secret)"}
    ${optionalString (cfg.livekit.keyFile != null) ''
      LIVEKIT_SECRETS=$(cat $CREDENTIALS_DIRECTORY/livekit_secrets)
      export LIVEKIT_API_KEY=$(echo $LIVEKIT_SECRETS | cut -d':' -f1 | sed 's/ //g')
      export LIVEKIT_API_SECRET=$(echo $LIVEKIT_SECRETS | cut -d':' -f2 | sed 's/ //g')
    ''}
  '';

  yaml = pkgs.formats.yaml { };

  livekitConfig = yaml.generate "livekit-config.yaml" cfg.livekit.config;
in
{
  options.services.meet = {
    enable = mkEnableOption "Meet";

    package = mkPackageOption pkgs "meet-backend" { };

    frontendPackage = mkPackageOption pkgs "meet-frontend" { };

    listenAddress = mkOption {
      type = types.str;
      default = "127.0.0.1";
      description = ''
        Address used by gunicorn to listen to.
      '';
    };

    port = mkOption {
      type = types.port;
      default = 8000;
      description = ''
        Port used by gunicorn to listen to.
      '';
    };

    enableNginx = mkOption {
      type = types.bool;
      default = true;
      description = ''
        Enable Nginx as a proxy server.
      '';
    };

    secretKeyPath = mkOption {
      type = types.nullOr types.path;
      default = null;
      description = ''
        Path to the Django secret key.
      '';
    };

    livekit = {
      enable = mkEnableOption "Livekit";

      package = mkPackageOption pkgs "livekit" { };

      keyFile = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = ''
          Path to the secret key of the livekit server.

          Should be of format:
          `key: secret`
        '';
      };

      config = mkOption {
        type = yaml.type;
        default = {
          port = 7880;
          rtc = {
            port_range_start = 50000;
            port_range_end = 60000;
            tcp_port = 7881;
            udp_port = 7882;
          };
        };
        description = ''
          Configuration of livekit.
        '';
      };
    };

    s3 = {
      accessKeyIDPath = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = ''
          Path to the access key ID of the bucket.
        '';
      };

      secretAccessKeyPath = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = ''
          Path to the secret access key of the bucket.
        '';
      };
    };

    oidc = {
      clientSecretPath = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = ''
          Path to the client secret of the client of OIDC.
        '';
      };
    };

    database = {
      createLocally = mkOption {
        type = types.bool;
        default = false;
        description = ''
          Configure local PostgreSQL database server for meet.
        '';
      };
    };

    redis = {
      createLocally = mkOption {
        type = types.bool;
        default = false;
        description = ''
          Configure local Redis cache server for meet.
        '';
      };
    };

    domain = mkOption {
      type = types.str;
      description = ''
        Domain name of the meet instance.
      '';
    };

    config = mkOption {
      type = types.attrsOf (
        types.oneOf [
          types.str
          types.bool
        ]
      );
      default = { };
      example = ''
        {
          DJANGO_ALLOWED_HOSTS = "*";
        }
      '';
      description = ''
        Configuration options of meet.
      '';
    };

    environmentFile = mkOption {
      type = types.nullOr types.path;
      default = null;
      description = ''
        Path to environment file.

        This can be useful to pass secrets to meet via tools like `agenix` or `sops`.
      '';
    };
  };

  config = mkIf cfg.enable {
    services.meet.config =
      {
        DJANGO_CONFIGURATION = mkDefault "Production";
        DJANGO_SETTINGS_MODULE = mkDefault "meet.settings";
        DATA_DIR = mkDefault "/var/lib/meet";
      }
      // (optionalAttrs cfg.enableNginx {
        DJANGO_ALLOWED_HOSTS = mkDefault "localhost,127.0.0.1,${cfg.domain}";
      })
      // (optionalAttrs cfg.database.createLocally {
        DB_NAME = mkDefault "meet";
        DB_USER = mkDefault "meet";
        DB_HOST = mkDefault "/run/postgresql";
      })
      // (optionalAttrs cfg.redis.createLocally {
        REDIS_URL = mkDefault "unix://${config.services.redis.servers.meet.unixSocket}?db=1";
        CELERY_BROKER_URL = mkDefault "redis+socket://${config.services.redis.servers.meet.unixSocket}?db=2";
      })
      // (optionalAttrs (cfg.livekit.enable && cfg.enableNginx) {
        LIVEKIT_API_URL = mkDefault "https://${cfg.domain}/livekit";
      });

    systemd.services.meet = {
      description = "Meet from SuiteNumérique";
      after =
        [ "network.target" ]
        ++ (optional cfg.database.createLocally "postgresql.service")
        ++ (optional cfg.redis.createLocally "redis-meet.service");
      wants =
        (optional cfg.database.createLocally "postgresql.service")
        ++ (optional cfg.redis.createLocally "redis-meet.service");
      wantedBy = [ "multi-user.target" ];

      preStart = ''
        ln -sf ${cfg.package}/lib/meet/static /var/lib/meet/

        if [ ! -f .version ]; then 
          touch .version
        fi

        if [ "${cfg.package.version}" != "$(cat .version)" ]; then 
          ${getExe cfg.package} migrate && echo -n "${cfg.package.version}" > .version 
        fi
      '';

      script = ''
        ${pythonPreloadSecrets}

        ${cfg.package}/bin/gunicorn -c ${gunicornSettings} meet.wsgi:application
      '';

      environment = cfg.config;

      serviceConfig =
        {
          EnvironmentFile = optional (cfg.environmentFile != null) cfg.environmentFile;
        }
        // commonServiceConfig
        // pythonHardening;
    };

    systemd.services.meet-celery = {
      description = "Meet Celery broker from SuiteNumérique";
      after =
        [ "network.target" ]
        ++ (optional cfg.database.createLocally "postgresql.service")
        ++ (optional cfg.redis.createLocally "redis-meet.service");
      wants =
        (optional cfg.database.createLocally "postgresql.service")
        ++ (optional cfg.redis.createLocally "redis-meet.service");
      wantedBy = [ "multi-user.target" ];

      script = ''
        ${pythonPreloadSecrets}

        ${cfg.package}/bin/celery -A meet.celery_app worker
      '';

      environment = cfg.config;

      serviceConfig =
        (optionalAttrs (cfg.environmentFile != null) { EnvironmentFile = cfg.environmentFile; })
        // commonServiceConfig
        // pythonHardening;
    };

    systemd.services.livekit = mkIf cfg.livekit.enable {
      description = "Livekit server for Meet SuiteNumérique";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];

      script = ''
        ${getExe cfg.livekit.package} --config ${livekitConfig} ${
          optionalString (cfg.livekit.keyFile != null) "--key-file $CREDENTIALS_DIRECTORY/livekit_secrets"
        }
      '';

      serviceConfig = commonServiceConfig // {
        RestrictAddressFamilies = [
          "AF_INET"
          "AF_INET6"
          "AF_NETLINK"
        ];
      };
    };

    services.postgresql = mkIf cfg.database.createLocally {
      enable = true;
      ensureDatabases = [ "meet" ];
      ensureUsers = [
        {
          name = "meet";
          ensureDBOwnership = true;
        }
      ];
    };

    services.redis.servers.meet = mkIf cfg.redis.createLocally { enable = true; };

    services.nginx = mkIf cfg.enableNginx {
      enable = true;

      virtualHosts.${cfg.domain} = {
        root = cfg.frontendPackage;

        extraConfig = ''
          error_page 404 = /index.html;
        '';

        locations."/api" = {
          proxyPass = "http://localhost:${toString cfg.port}";
          recommendedProxySettings = true;
        };

        locations."/admin" = {
          proxyPass = "http://localhost:${toString cfg.port}";
          recommendedProxySettings = true;
        };

        locations."/livekit" = mkIf cfg.livekit.enable {
          proxyPass = "http://localhost:${toString cfg.livekit.config.port}";
          recommendedProxySettings = true;
          proxyWebsockets = true;
          extraConfig = ''
            rewrite ^/livekit/(.*)$ /$1 break;
          '';
        };
      };
    };
  };
}
