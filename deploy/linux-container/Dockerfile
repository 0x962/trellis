# syntax=docker/dockerfile:1.7

ARG BASE_IMAGE
ARG TOOLCHAIN_IMAGE
FROM ${TOOLCHAIN_IMAGE} AS toolchain

FROM ${BASE_IMAGE}

ARG SOURCE_LIB_DIR
ARG DESTINATION_LIB_DIR
ARG BASE_IMAGE_NAME
ARG BASE_IMAGE_DIGEST
ARG TOOLCHAIN_IMAGE_NAME
ARG TOOLCHAIN_IMAGE_DIGEST

LABEL org.opencontainers.image.base.name="${BASE_IMAGE_NAME}"
LABEL org.opencontainers.image.base.digest="${BASE_IMAGE_DIGEST}"
LABEL io.trellis.glibc.version="2.28"
LABEL io.trellis.toolchain.name="${TOOLCHAIN_IMAGE_NAME}"
LABEL io.trellis.toolchain.digest="${TOOLCHAIN_IMAGE_DIGEST}"

RUN --mount=from=toolchain,source=/,target=/toolchain \
	cp -a /toolchain/${SOURCE_LIB_DIR}/libstdc++.so.6* /toolchain/${SOURCE_LIB_DIR}/libatomic.so.1* /usr/${DESTINATION_LIB_DIR}/ \
	&& ldconfig

COPY --from=release / /opt/trellis/release/
COPY src/ /opt/trellis/source/deploy/linux-container/src/
COPY --from=source /scripts/host-release/manifest/ /opt/trellis/source/scripts/host-release/manifest/
COPY --from=source /scripts/host-release/observeHost/ /opt/trellis/source/scripts/host-release/observeHost/
COPY --from=source /scripts/host-release/preflightResult/ /opt/trellis/source/scripts/host-release/preflightResult/

RUN printf '%s\n' 'trellis:x:10001:10001:Trellis:/var/lib/trellis/home:/bin/sh' >> /etc/passwd \
	&& printf '%s\n' 'trellis:x:10001:' >> /etc/group \
	&& mkdir -p /var/lib/trellis /opt/trellis/source \
	&& chown -R 10001:10001 /var/lib/trellis \
	&& ln -s /opt/trellis/release/node_modules /opt/trellis/source/node_modules \
	&& chmod -R a-w /opt/trellis/source

ENV HOME=/var/lib/trellis/home
ENV TRELLIS_HOME=/var/lib/trellis
ENV TRELLIS_HOST=0.0.0.0
ENV TRELLIS_PORT=4521

USER 10001:10001
VOLUME ["/var/lib/trellis"]
EXPOSE 4521
STOPSIGNAL SIGUSR2

ENTRYPOINT ["/opt/trellis/release/bin/bun", "/opt/trellis/source/deploy/linux-container/src/supervisor.ts"]
