#!/usr/bin/env bash
set -euo pipefail

npm install
npx prisma generate
npm run build
mkdir -p dist/Plugins
cp -R Plugins/* dist/Plugins/
