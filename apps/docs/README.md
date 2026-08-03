# Storage Bridge API Reference

This package generates the developer API documentation from TSDoc comments across all `@storage-bridge` packages.

## Building the Documentation

To build the documentation in HTML format:

```bash
pnpm --filter @storage-bridge/docs build
```

The output will be generated in the `dist` directory.

## Viewing the Documentation

After building, you can open `dist/index.html` in any browser or run a simple local web server:

```bash
npx serve dist
```
