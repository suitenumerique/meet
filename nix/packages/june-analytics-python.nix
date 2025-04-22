{
  lib,
  buildPythonPackage,
  fetchFromGitHub,
  setuptools,
  dateutils,
  requests,
  monotonic,
  backoff
}:

buildPythonPackage {
  pname = "june-analytics-python";
  version = "2.3.0";
  pyproject = true;

  src = fetchFromGitHub {
    owner = "juneHQ";
    repo = "analytics-python";
    rev = "462b523a617fbadc016ace45e6eec5762a8ae45f";
    hash = "sha256-9IcikYQW1Q3aAyjIZw6UltD6cYFE+tBK+/EMQpRGCoQ=";
  };

  prePatch = ''
    substituteInPlace setup.py \
      --replace-fail "backoff~=1.10" "backoff>=1.10"
  '';

  build-system = [
    setuptools
  ];

  dependencies = [
    dateutils
    requests
    monotonic
    backoff
  ];

  pythonImportsCheck = [
    "june"
  ];

  meta = {
    description = "The hassle-free way to integrate analytics into any python application";
    homepage = "https://github.com/juneHQ/analytics-python";
    license = lib.licenses.mit;
    maintainers = with lib.maintainers; [ soyouzpanda ];
  };
}
