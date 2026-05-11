# Build Janus from source so ICE-TCP support is present (the canyan image
# was compiled against libnice 0.1.16, which lacks the runtime ICE-TCP
# capability Janus 1.1.x feature-detects at startup). Debian 13 ships
# libnice 0.1.21+ which has ICE-TCP. Also: builds natively on arm64, so
# no QEMU emulation overhead.
FROM debian:13-slim AS builder

ARG JANUS_VERSION=v1.1.4

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates git pkg-config \
    autoconf automake libtool gengetopt \
    libssl-dev libsrtp2-dev libglib2.0-dev libopus-dev libogg-dev \
    libcurl4-openssl-dev libconfig-dev libnice-dev \
    libmicrohttpd-dev libjansson-dev libsofia-sip-ua-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 --branch ${JANUS_VERSION} \
    https://github.com/meetecho/janus-gateway.git janus

WORKDIR /src/janus
RUN ./autogen.sh && \
    ./configure \
      --prefix=/opt/janus \
      --disable-rabbitmq --disable-mqtt --disable-nanomsg --disable-unix-sockets \
      --disable-data-channels \
      --disable-all-plugins \
      --enable-plugin-sip \
      --disable-all-handlers \
      --disable-all-transports --enable-rest && \
    make -j$(nproc) && \
    make install && \
    make configs

FROM debian:13-slim

# Debian 13 (trixie) renamed several libs in the time_t-64 transition:
# libglib2.0-0t64, libcurl4t64. libconfig9 → libconfig11.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 libsrtp2-1 libglib2.0-0t64 libopus0 libogg0 \
    libcurl4t64 libconfig11 libnice10 libmicrohttpd12 libjansson4 \
    libsofia-sip-ua0 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/janus /opt/janus

# Make paths match canyan's so the rest of the compose mounts (configs, demos)
# Just-Work without changes. The configs we mount in docker/janus/conf/ assume
# /usr/local/etc/janus and /usr/local/lib/janus.
RUN ln -s /opt/janus/bin/janus /usr/local/bin/janus && \
    ln -s /opt/janus/etc/janus /usr/local/etc/janus && \
    ln -s /opt/janus/lib/janus /usr/local/lib/janus && \
    ln -s /opt/janus/share/janus /usr/local/share/janus

EXPOSE 8088 10100-10120/tcp 10100-10120/udp

CMD ["/usr/local/bin/janus"]
