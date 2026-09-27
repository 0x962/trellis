#!/bin/sh
set -eu

usage() {
	printf '%s\n' 'Usage: build-image.sh --release <path> --tag <image> --arch <amd64|arm64>' >&2
	exit 2
}

release=
tag=
arch=
while [ "$#" -gt 0 ]; do
	case "$1" in
		--release) release=${2-}; shift 2 ;;
		--tag) tag=${2-}; shift 2 ;;
		--arch) arch=${2-}; shift 2 ;;
		*) usage ;;
	esac
done

[ -n "$release" ] && [ -n "$tag" ] && [ -n "$arch" ] || usage
release=$(CDPATH= cd -- "$release" && pwd)
[ -f "$release/release.json" ] || { printf '%s\n' 'The release has no release.json file.' >&2; exit 1; }

case "$arch" in
	amd64)
		manifest_arch=x64
		source_lib_dir=lib64
		destination_lib_dir=lib64
		base_name=docker.io/rockylinux/rockylinux:8.10-minimal
		base_digest=sha256:af5fbd460188a87059557422b2c00978f488ac6bc6b78d63a02e2fad040d7733
		toolchain_name=registry.access.redhat.com/ubi8/nodejs-24-minimal
		toolchain_digest=sha256:2b9bf75c2d49d9e774b4301cc72103bf6474f9d0f917ad3dd5e15c40859a451c
		;;
	arm64)
		manifest_arch=arm64
		source_lib_dir=lib64
		destination_lib_dir=lib64
		base_name=docker.io/rockylinux/rockylinux:8.10-minimal
		base_digest=sha256:55ddcbe11a7bf1696f67ce3b2ffcc6d58b3d33007be03bc372d61fc147a92015
		toolchain_name=registry.access.redhat.com/ubi8/nodejs-24-minimal
		toolchain_digest=sha256:ab6c9311540baa3b6a0986533aff625a25d10976534efed25f066ae14cff3c25
		;;
	*) usage ;;
esac

release_arch=$(sed -n '/"target"[[:space:]]*:/,/"compatibility"[[:space:]]*:/s/.*"arch"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$release/release.json" | head -n 1)
release_libc=$(sed -n '/"target"[[:space:]]*:/,/"compatibility"[[:space:]]*:/s/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$release/release.json" | head -n 1)
[ "$release_arch" = "$manifest_arch" ] || { printf '%s\n' "The release targets $release_arch, not $manifest_arch." >&2; exit 1; }
[ "$release_libc" = 2.28 ] || { printf '%s\n' "The release targets glibc $release_libc, not glibc 2.28." >&2; exit 1; }

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$root/../.." && pwd)
engine=${CONTAINER_ENGINE:-docker}
"$engine" buildx build \
	--load \
	--platform "linux/$arch" \
	--build-context "release=$release" \
	--build-context "source=$repository_root" \
	--build-arg "BASE_IMAGE=$base_name@$base_digest" \
	--build-arg "TOOLCHAIN_IMAGE=$toolchain_name@$toolchain_digest" \
	--build-arg "BASE_IMAGE_NAME=$base_name" \
	--build-arg "BASE_IMAGE_DIGEST=$base_digest" \
	--build-arg "TOOLCHAIN_IMAGE_NAME=$toolchain_name" \
	--build-arg "TOOLCHAIN_IMAGE_DIGEST=$toolchain_digest" \
	--build-arg "SOURCE_LIB_DIR=$source_lib_dir" \
	--build-arg "DESTINATION_LIB_DIR=$destination_lib_dir" \
	--tag "$tag" \
	"$root"
