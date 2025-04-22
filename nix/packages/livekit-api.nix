{
  lib,
  buildPythonPackage,
  fetchFromGitHub,
  setuptools,
  pyjwt,
  aiohttp,
  protobuf,
  types-protobuf,
  livekit-protocol,
}:

buildPythonPackage rec {
  pname = "livekit-api";
  version = "1.0.2";
  pyproject = true;

  src = fetchFromGitHub {
    owner = "livekit";
    repo = "python-sdks";
    tag = "api-v${version}";
    hash = "sha256-Rmvn72xaOai/Y2aXgMNUW8DJWx1a+egRfdsUYGY/dxU=";
    fetchSubmodules = true;
  };

  sourceRoot = "source/livekit-api";

  build-system = [
    setuptools
  ];

  dependencies = [
    pyjwt
    aiohttp
    protobuf
    types-protobuf
    livekit-protocol
  ];
  
  pythonImportsCheck = [
    "livekit"
  ];

  meta = {
    description = "LiveKit real-time and server SDKs for Python";
    homepage = "https://github.com/livekit/python-sdks/";
    license = lib.licenses.asl20;
    maintainers = with lib.maintainers; [ soyouzpanda ];
    platforms = lib.platforms.all;
  };
}
