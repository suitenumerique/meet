FROM livekit/livekit-server:v1.8.0

# We inject the nip.io certificate manually because the livekit chart doesn't support volume mounting
COPY rootCA.pem /etc/ssl/certs/

ENTRYPOINT ["/livekit-server"]
