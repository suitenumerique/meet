self: super:
{
  meet-backend = self.callPackage ./packages/meet-backend.nix { };

  pythonPackagesExtensions = super.pythonPackagesExtensions ++ [
    (pyself: pysuper: {
      brevo-python = pyself.callPackage ./packages/brevo-python.nix { };

      june-analytics-python = pyself.callPackage ./packages/june-analytics-python.nix { };

      livekit-api = pyself.callPackage ./packages/livekit-api.nix { };

      livekit-protocol = pyself.callPackage ./packages/livekit-protocol.nix { };

      nested-multipart-parser = pyself.callPackage ./packages/nested-multipart-parser.nix { };

      python-dockerflow = pyself.callPackage ./packages/python-dockerflow.nix { };
    })
  ];
}
