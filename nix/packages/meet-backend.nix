{
  lib,
  python3,
  fetchFromGitHub,
  fetchpatch,
}:
let
  python = python3.override {
    self = python3;
    packageOverrides = (self: super: {
      django = super.django_5;

      django-extensions = super.django-extensions.overridePythonAttrs (oldAttrs: {
        nativeCheckInputs = [ self.pyasyncore ];

        patches = lib.optional (lib.versionOlder oldAttrs.version "4.0") (fetchpatch {
          url = "https://patch-diff.githubusercontent.com/raw/browniebroke/django-extensions/pull/2.patch";
          hash = "sha256-oYRfchotvv7E4xOuicPEVjfRZ2jiKfTPHWQZ/+YLE2g=";
        });
      });
    });
  };
in
python.pkgs.buildPythonApplication rec {
  pname = "meet-backend";
  version = "0.1.18";
  pyproject = true;
  
  src = fetchFromGitHub {
    owner = "suitenumerique";
    repo = "meet";
    tag = "v${version}";
    hash = "sha256-+LgequMAwatkn7SWStY7NzrDnhPa91gW/uN0d4+v9VU=";
    fetchSubmodules = true;
  };

  sourceRoot = "source/src/backend";

  build-system = with python.pkgs; [
    setuptools
  ];

  dependencies = with python.pkgs; [
    boto3
    brotli
    brevo-python
    celery
    django-configurations
    django-cors-headers
    django-countries
    django-extensions
    django-parler
    django-storages
    django-timezone-field
    redis
    django-redis
    django
    djangorestframework
    drf-spectacular
    drf-spectacular-sidecar
    python-dockerflow
    easy-thumbnails
    factory-boy
    gunicorn
    jsonschema
    june-analytics-python
    markdown
    nested-multipart-parser
    psycopg
    pyjwt
    pyopenssl
    python-frontmatter
    requests
    sentry-sdk
    whitenoise
    mozilla-django-oidc
    livekit-api
    aiohttp
  ];

  pythonRelaxDeps = true;

  prePatch = ''
    substituteInPlace meet/settings.py \
      --replace-fail "DATA_DIR = " "DATA_DIR = os.getenv('DATA_DIR') #"
  '';

  postBuild = ''
    export DATA_DIR=$(pwd)/data
    ${python.pythonOnBuildForHost.interpreter} manage.py collectstatic --noinput
  '';

  installPhase =
    let
      pythonPath = python.pkgs.makePythonPath dependencies;
    in
    ''
      runHook preInstall

      mkdir -p $out/lib/meet/src
      cp -r {core,demo,meet,locale,manage.py} $out/lib/meet/src
      cp -r data/static $out/lib/meet
      chmod +x $out/lib/meet/src/manage.py
      makeWrapper $out/lib/meet/src/manage.py $out/bin/meet \
        --prefix PYTHONPATH : "${pythonPath}"
      makeWrapper ${lib.getExe python.pkgs.celery} $out/bin/celery \
        --prefix PYTHONPATH : "${pythonPath}:$out/lib/meet/src"
      makeWrapper ${lib.getExe python.pkgs.gunicorn} $out/bin/gunicorn \
        --prefix PYTHONPATH : "${pythonPath}:$out/lib/meet/src"

      runHook postInstall
    '';

  passthru = {
    inherit python;
  };

  meta = {
    description = "Open source alternative to Google Meet and Zoom powered by LiveKit: HD video calls, screen sharing, and chat features. Built with Django and React";
    homepage = "https://github.com/suitenumerique/meet";
    changelog = "https://github.com/suitenumerique/meet/blob/${src.rev}/CHANGELOG.md";
    license = lib.licenses.mit;
    maintainers = with lib.maintainers; [ soyouzpanda ];
    mainProgram = "meet";
    platforms = lib.platforms.all;
  };
}
