FROM livekit/livekit-server:latest

# We inject the nip.io certificate manually because the livekit chart doesn't support volume mounting
COPY rootCA.pem /etc/ssl/certs/

ENTRYPOINT ["/livekit-server"]
