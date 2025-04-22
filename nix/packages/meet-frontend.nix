{
  lib,
  fetchFromGitHub,
  fetchNpmDeps,
  buildNpmPackage,
}:

buildNpmPackage rec {
  pname = "meet-frontend";
  version = "0.1.18";

  src = fetchFromGitHub {
    owner = "suitenumerique";
    repo = "meet";
    tag = "v${version}";
    hash = "sha256-+LgequMAwatkn7SWStY7NzrDnhPa91gW/uN0d4+v9VU=";
    fetchSubmodules = true;
  };

  sourceRoot = "source/src/frontend";

  npmDeps = fetchNpmDeps {
    inherit version src;
    sourceRoot = "source/src/frontend";
    hash = "sha256-2qkHJ3Wfz5FWJOi1SNFWvMbvw1jQXzH8leuewmzVZ2E=";
  };

  buildPhase = ''
    runHook preBuild

    npm run build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    cp -r dist $out

    runHook postInstall
  '';

  meta = {
    description = "A collaborative note taking, wiki and documentation platform that scales. Built with Django and React. Opensource alternative to Notion or Outline";
    homepage = "https://github.com/suitenumerique/docs";
    changelog = "https://github.com/suitenumerique/docs/blob/${src.tag}/CHANGELOG.md";
    license = lib.licenses.mit;
    maintainers = with lib.maintainers; [ soyouzpanda ];
    platforms = lib.platforms.all;
  };
}

