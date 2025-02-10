# Contributing

## Release

1. Run `npm run build`

2. Update CHANGELOG.md according to the Major / Minor / Patch semver convention.

3. Based on semver upgrade the package version in `package.json`.

4. Commit the changes and create a PR named "🔖(release) version packages".

5. Run `npx @changesets/cli publish`. It will publish the new version of the package to NPM and create a git tag.

6. Run `git push origin tag @gouvfr-lasuite/visio-sdk@<VERSION>`

7. Tell everyone 🎉 !
