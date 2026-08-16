#!/bin/sh

set -eu

version=${1:-}
platform=${2:-}

if [ -z "$version" ] || [ -z "$platform" ]; then
  echo "用法: $0 <version> <linux/amd64|linux/arm64> [output.tar]" >&2
  exit 1
fi

case "$platform" in
  linux/amd64 | linux/arm64) ;;
  *)
    echo "不支持的平台: $platform" >&2
    exit 1
    ;;
esac

architecture=${platform#linux/}
output=${3:-whatsnew-${version}-linux-${architecture}.tar}
backendImage="whatsnew-backend:${version}"
frontendImage="whatsnew-frontend:${version}"

docker buildx build --platform "$platform" --target backend --tag "$backendImage" --load .
docker buildx build --platform "$platform" --target frontend --tag "$frontendImage" --load .
docker save --output "$output" "$backendImage" "$frontendImage"
outputDir=$(dirname "$output")
outputName=$(basename "$output")
(
  cd "$outputDir"
  sha256sum "$outputName" > "${outputName}.sha256"
)

echo "镜像包已生成: $output"
echo "校验文件已生成: ${output}.sha256"
echo "后端镜像: $backendImage"
echo "前端镜像: $frontendImage"
