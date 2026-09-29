FROM ghcr.io/astral-sh/uv:0.12.7@sha256:95f2aa1fe59274951cfe9b0cbc7972e879ff1004bc8945d130a32eb0dbd85945 AS uv
FROM python:3.12.12-bookworm@sha256:c0abd0758831ad99b7a29e0c1a875da9c4abb9a2e3f21e2eeb585dbcadfb6cd0 AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy PYTHONDONTWRITEBYTECODE=1
WORKDIR /opt/langflow
COPY source/ ./
COPY editor/ ./src/backend/base/langflow/frontend/
RUN python -c 'import platform; assert platform.python_version() == "3.12.12"'
RUN --mount=type=cache,id=trellis-langflow-uv,target=/root/.cache/uv \
    uv sync --frozen --package langflow-base --extra postgresql --no-default-groups \
        --no-editable --python /usr/local/bin/python3.12 \
    && uv pip check --python .venv/bin/python
RUN mkdir /build-evidence \
    && .venv/bin/python -c 'import importlib.metadata as m,json,platform; print(json.dumps({"qualification":"candidate","python":platform.python_version(),"dependencies":sorted([{"name":d.metadata["Name"],"version":d.version} for d in m.distributions()],key=lambda d:d["name"])},sort_keys=True))' > /build-evidence/dependencies.json \
    && cp uv.lock /build-evidence/uv.lock

FROM scratch AS evidence
COPY --from=build /build-evidence/ /

FROM python:3.12.12-bookworm@sha256:c0abd0758831ad99b7a29e0c1a875da9c4abb9a2e3f21e2eeb585dbcadfb6cd0 AS candidate
COPY --from=build /opt/langflow/.venv/ /opt/langflow/.venv/
COPY --from=build /build-evidence/ /opt/trellis/build-evidence/
COPY inputs/ /opt/trellis/inputs/
COPY entrypoint.sh /opt/trellis/entrypoint.sh
RUN mkdir -p /data/config /data/cache /data/home \
    && chown -R 10001:10001 /data \
    && chmod 0700 /data /data/config /data/cache /data/home \
    && chmod 0555 /opt/trellis/entrypoint.sh
ENV PATH=/opt/langflow/.venv/bin:/usr/local/bin:/usr/bin:/bin \
    HOME=/data/home XDG_CACHE_HOME=/data/cache LANGFLOW_CONFIG_DIR=/data/config \
    LANGFLOW_DATABASE_URL=sqlite:////data/config/langflow.db \
    LANGFLOW_AUTO_LOGIN=false LANGFLOW_DO_NOT_TRACK=true \
    PYTHONDONTWRITEBYTECODE=1
USER 10001:10001
WORKDIR /data
ENTRYPOINT ["/opt/trellis/entrypoint.sh"]
CMD ["run", "--host", "127.0.0.1", "--port", "7860", "--workers", "1"]
