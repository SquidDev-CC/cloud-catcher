{
  description = "A ComputerCraft terminal renderer on the web";

  inputs.dream2nix.url = "github:nix-community/dream2nix";
  inputs.utils.url = "github:numtide/flake-utils";

  outputs = {self, dream2nix, nixpkgs, utils}:
    let
      name = "cloud-catcher";
      nodejs = 18;
      mkOutputs = pkgs:
        let
          d2n = dream2nix.lib.init { inherit pkgs; config.projectRoot = ./.; };

          # TODO: Expose nodejs on fullPkgs passthru?
          fullNode = pkgs."nodejs-${builtins.toString nodejs}_x";
          slimNode = pkgs."nodejs-slim-${builtins.toString nodejs}_x";

          # Use dream2nix to generate our core package.
          output = d2n.dream2nix-interface.makeOutputs {
            source = ./.;
            settings = [{ subsystemInfo.nodejs = nodejs; }];

            packageOverrides = {
              "${name}" = {
                add-lua = { nativeBuildInputs = old: old ++ [pkgs.lua]; };
              };
            };
          };
          fullPkg = output.packages.default;

          # The full package includes a lot of stuff we don't need to run the
          # site (namely development dependencies). Instead build a separate
          # package with just the assets and binary.
          #
          # We also replace nodejs (which requires node-gyp and Python) with
          # nodejs-slim.
          slimPkg = pkgs.stdenv.mkDerivation {
            inherit name;
            unpackPhase = ":";
            installPhase = ''
              mkdir $out

              # Copy static files
              mkdir -p $out/share
              cp -r ${fullPkg}/lib/node_modules/${name}/_site $out/share/${name}

              # Copy server file
              mkdir -p $out/lib/node_modules/${name}/
              cp -r ${fullPkg}/lib/node_modules/${name}/_bin $out/lib/node_modules/${name}/_bin
              cp -r ${fullPkg}/bin $out/bin
            '';

            fixupPhase = ''
              chmod +w $out/lib/node_modules/${name}/_bin
              sed -i -e 's|${fullNode}|${slimNode}|g' $out/lib/node_modules/${name}/_bin/*
            '';

            disallowedReferences = [fullNode pkgs.python3];
          };
        in
        {
          devShells.default = output.devShells.default.overrideAttrs (old: {
            shellHook = ''
              ${old.shellHook}
              export npm_package_config_server=localhost:8080
            '';
          });

          packages.full = fullPkg;
          packages.default = slimPkg;
        };
    in utils.lib.eachDefaultSystem (system:
      let pkgs = import nixpkgs { inherit system; }; in
      mkOutputs pkgs
    ) // {
      checks = self.packages;
    };
}
