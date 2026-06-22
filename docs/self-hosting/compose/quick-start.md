# Quick Start
 
Gets you a running Meet instance in minutes. Sets up three stacks automatically:
a reverse proxy, Keycloak (identity provider), and Meet itself.
 
**Prerequisites:**
 
- A Linux server with Docker and docker compose installed  - see [Prerequisites](prerequisites.md)
- Ports 80/TCP, 443/TCP, 7881/TCP, 7882/UDP open - see [Firewall & Ports](../configuration/firewall.md)
- Three DNS A records pointing to your server: `meet.example.com`, `auth.example.com`, `livekit.example.com`
- DNS must resolve before you run the script
---
 
## One-liner
 
```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/main"
curl -fsSL $RAW/docs/docs/install.sh -o install.sh
```
 
Review it, then run:
 
```bash
bash install.sh
```
 
The script prompts for your four domains, generates all secrets, and starts everything.
 
---
 
## What it sets up
 
```
~/docker/
  nginx-proxy/   ← nginx-proxy + acme-companion (automatic TLS via Let's Encrypt)
  keycloak/      ← Keycloak with a pre-configured Meet realm
  meet/          ← Meet core: backend, frontend, livekit, postgresql, redis
```
 
Each stack lives in its own directory and is managed independently.
 
---
 
## Already have a reverse proxy or identity provider?
 
Use the [step-by-step Deployment Guide](deployment-guide.md) instead. Each stack section can be skipped independently - it's designed for exactly that case.
 
---
 
## After setup
 
- Open `https://meet.example.com`
- Log in with `meet-admin` / `ChangeMe!` - **change this password immediately**
**Recommended next steps:**
 
- [Configure recording](../configuration/recording.md) - LiveKit Egress + MinIO
- [Configure AI transcription](../configuration/transcription.md) - WhisperX + summary service
- [Configure TURN](../configuration/turn.md) - for participants on restricted corporate networks
- [Configure SMTP](../configuration/upgrade.md) - required for recording download email notifications
- [Configure theming](../configuration/theming.md) - custom CSS, logo, and branding
