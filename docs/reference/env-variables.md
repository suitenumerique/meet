# Environment Variables

Complete reference for all environment variables accepted by LaSuite Meet's components.

## Django Backend

### Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_SETTINGS_MODULE` | **Yes** | -- | Must be `meet.settings`. App will not start without it. |
| `DJANGO_CONFIGURATION` | **Yes** | -- | `Production`, `Demo`, `Development`, `Test` |
| `DJANGO_SECRET_KEY` | **Yes** | -- | 50+ character random string for cryptographic signing |
| `DJANGO_ALLOWED_HOSTS` | **Yes** | -- | Comma-separated list of allowed hostnames |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | **Yes** | -- | Comma-separated list of trusted HTTPS origins |
| `PYTHONPATH` | No | -- | Set to `/app` in production |
| `MEET_BASE_URL` | No | -- | ⚠️ Set in the example env templates and Helm chart, but not currently read by any backend code path - verify before relying on it for anything. |
| `ALLOW_UNREGISTERED_ROOMS` | No | `True` | Allow unauthenticated room creation |
| `ALLOW_UNSECURE_USER_LISTING` | No | `False` | Allow listing users without additional restrictions. Leave disabled unless you understand the exposure. |
| `RESOURCE_DEFAULT_ACCESS_LEVEL` | No | `public` | Default access level for newly created rooms. Values: `public` (anyone with the link can join), `trusted` (authenticated users join directly; others request entry), `restricted` (everyone must request entry). |
| `SESSION_COOKIE_AGE` | No | `43200` | Session cookie lifetime in seconds (default: 12 hours) |
| `REQUEST_ENTRY_THROTTLE_RATES` | No | `150/minute` | Rate limit for room entry requests |
| `CREATION_CALLBACK_THROTTLE_RATES` | No | `600/minute` | Rate limit for creation callback requests |
| `ROOM_CREATION_CALLBACK_CACHE_TIMEOUT` | No | `600` | Seconds to cache room creation callbacks (default: 10 minutes) |
| `DJANGO_LANGUAGE_CODE` | No | `en-us` | Default language code for the Django backend |
| `DATABASE_URL` | No | -- | Full database URL (e.g. `postgres://user:pass@host:5432/name`). When set, takes precedence over the individual `DB_*` variables below. |

### Database

Only used when `DATABASE_URL` is not set. All have real (insecure) defaults meant for local development - override every one of them in production.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_ENGINE` | No | `django.db.backends.postgresql_psycopg2` | Django database backend |
| `DB_HOST` | **In production** | `localhost` | PostgreSQL hostname |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_NAME` | **In production** | `meet` | Database name |
| `DB_USER` | **In production** | `dinum` | Database user |
| `DB_PASSWORD` | **In production** | `pass` | Database password |

### Redis

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | No | `redis://redis:6379/1` | Full Redis URL used for the Django cache backend |
| `SESSION_ENGINE` | No | `django.contrib.sessions.backends.cache` | Django session storage backend |

### OIDC / Authentication

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_RP_CLIENT_ID` | No | `meet` | OIDC client ID |
| `OIDC_RP_CLIENT_SECRET` | **Yes** | -- | OIDC client secret |
| `OIDC_RP_SIGN_ALGO` | No | `RS256` | Token signing algorithm |
| `OIDC_RP_SCOPES` | No | `openid email` | Requested OIDC scopes |
| `OIDC_OP_URL` | No | -- | Base URL of the OIDC provider, used for auto-discovery in place of setting each endpoint individually. |
| `OIDC_OP_JWKS_ENDPOINT` | **Yes** | -- | OIDC JWKS URL |
| `OIDC_OP_AUTHORIZATION_ENDPOINT` | **Yes** | -- | OIDC authorization URL |
| `OIDC_OP_TOKEN_ENDPOINT` | **Yes** | -- | OIDC token exchange URL |
| `OIDC_OP_USER_ENDPOINT` | **Yes** | -- | OIDC userinfo URL |
| `OIDC_OP_USER_ENDPOINT_FORMAT` | No | `AUTO` | Format of the userinfo response: `AUTO` (detect), `JWT`, or `JSON` |
| `OIDC_OP_LOGOUT_ENDPOINT` | No | -- | OIDC logout URL |
| `OIDC_OP_INTROSPECTION_ENDPOINT` | No | -- | OIDC token introspection URL |
| `OIDC_CREATE_USER` | No | `True` | Automatically create a local user if none exists on first login |
| `OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION` | No | `False` | Fallback to matching users by email if `sub` claim doesn't match. Enable only if emails are unique across your provider. |
| `OIDC_USER_SUB_FIELD_IMMUTABLE` | No | `True` | Prevent the `sub` claim from being changed once set on a user. Disable with care - this exists to stop account takeover via `sub` reassignment. |
| `OIDC_REDIRECT_ALLOWED_HOSTS` | No | `[]` | Allowed hosts for OIDC redirects |
| `OIDC_REDIRECT_REQUIRE_HTTPS` | No | `False` | Require HTTPS for OIDC redirect URIs. **Recommended in production.** |
| `OIDC_AUTH_REQUEST_EXTRA_PARAMS` | No | `{}` | Extra parameters included in OIDC authentication requests (e.g. `{"acr_values": "eidas1"}`) |
| `ALLOW_LOGOUT_GET_METHOD` | No | `True` | Allow logout via HTTP GET. POST is more secure; disable if your provider supports POST logout. |
| `LOGIN_REDIRECT_URL` | No | -- | Redirect after successful login |
| `LOGIN_REDIRECT_URL_FAILURE` | No | -- | Redirect after failed login |
| `LOGOUT_REDIRECT_URL` | No | -- | Redirect after logout |
| `OIDC_USERINFO_FULLNAME_FIELDS` | No | `["given_name", "usual_name"]` | OIDC claims used to build the user's full name |
| `OIDC_USERINFO_SHORTNAME_FIELD` | No | `given_name` | OIDC claim used for the user's short/display name |
| `OIDC_USERINFO_ESSENTIAL_CLAIMS` | No | `[]` | Claims that must be present in the userinfo response |
| `OIDC_VERIFY_SSL` | No | `True` | Verify SSL certificates when contacting the OIDC provider |
| `OIDC_USE_NONCE` | No | `True` | Use nonce to prevent replay attacks |
| `OIDC_STORE_ID_TOKEN` | No | `True` | Store the ID token returned by the OIDC provider |
| `OIDC_REDIRECT_FIELD_NAME` | No | `returnTo` | Query parameter name used for redirect after login |
| `OIDC_TIMEOUT` | No | `5` | Timeout in seconds for HTTP requests to the OIDC provider |
| `OIDC_PROXY` | No | -- | Proxy URL used for requests to the OIDC provider, if any |

**PKCE (recommended for production):**

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_USE_PKCE` | No | `False` | Enable PKCE (Proof Key for Code Exchange) for enhanced security. **Recommended.** |
| `OIDC_PKCE_CODE_CHALLENGE_METHOD` | No | `S256` | PKCE challenge method -- `S256` is recommended |
| `OIDC_PKCE_CODE_VERIFIER_SIZE` | No | `64` | Length of the random PKCE code verifier (43–128 characters) |

### OIDC Resource Server (external API)

Separate from the browser-facing OIDC client above. Lets external applications call Meet's [OAuth2 Resource Server API](external-api-resource-server.md) with their own OIDC-issued tokens.

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_RS_CLIENT_ID` | No | `meet` | Client ID expected in tokens presented to the resource server |
| `OIDC_RS_CLIENT_SECRET` | If used | -- | Client secret for the resource server |
| `OIDC_RS_AUDIENCE_CLAIM` | No | `client_id` | Token claim used to identify the audience/client |
| `OIDC_RS_SCOPES` | No | `["lasuite_meet"]` | Required scopes on incoming tokens |
| `OIDC_RS_SCOPES_PREFIX` | No | -- | Optional prefix stripped from/expected on scope names |
| `OIDC_RS_SIGNING_ALGO` | No | `ES256` | Expected token signing algorithm |
| `OIDC_RS_ENCRYPTION_ALGO` | No | `RSA-OAEP` | Expected token encryption algorithm (if tokens are encrypted) |
| `OIDC_RS_ENCRYPTION_ENCODING` | No | `A256GCM` | Expected token encryption encoding |
| `OIDC_RS_ENCRYPTION_KEY_TYPE` | No | `RSA` | Key type used to decrypt encrypted tokens |
| `OIDC_RS_PRIVATE_KEY_STR` | If encrypted tokens are used | -- | Private key (PEM string) used to decrypt encrypted tokens |

### LiveKit

| Variable | Required | Default | Description |
|---|---|---|---|
| `LIVEKIT_API_KEY` | **Yes** | -- | LiveKit API key (must match server config) |
| `LIVEKIT_API_SECRET` | **Yes** | -- | LiveKit API secret (must match server config) |
| `LIVEKIT_API_URL` | **Yes** | -- | **Public** LiveKit URL -- returned to browser clients AND used for server API calls. Must be `https://livekit.example.com` (not the Docker-internal address). |
| `LIVEKIT_FORCE_WSS_PROTOCOL` | No | `False` | Force WSS protocol in the WebSocket URL returned to clients. Enable for legacy browsers (Firefox <124, Chrome <125) where HTTPS URLs in `WebSocket()` may fail. |
| `LIVEKIT_ENABLE_FIREFOX_PROXY_WORKAROUND` | No | `False` | Workaround for Firefox clients behind proxies that fail to establish WebSocket connections. Pre-establishes a dummy connection to prime the WebSocket. |
| `LIVEKIT_VERIFY_SSL` | No | `True` | Verify SSL certificate for LiveKit API calls |
| `LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX` | No | -- | Regex to filter LiveKit webhook events by room name. Only matching events are processed. |
| `LIVEKIT_DEFAULT_SOURCES` | No | `["camera","microphone","screen_share","screen_share_audio"]` | Media sources participants can publish by default |
| `LIVEKIT_DEFAULT_VIDEO_CODEC` | No | `vp9` | Default video codec. One of `vp8`, `h264`, `vp9`, `av1`. |
| `PARTICIPANT_FORBIDDEN_PERMISSION_FIELDS` | No | `["hidden", "recorder", "agent"]` | LiveKit participant permission fields that can never be granted through the API |
| `AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME` | No | `True` | Allow authenticated participants to change their display name in a room |

### Connection Test

Lets participants run a pre-join connectivity check against LiveKit before a real meeting. See the [connection test feature](../user/getting-started.md) (added in v1.25.0).

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONNECTION_TEST_ENABLED` | No | `False` | Enable the connection test feature |
| `CONNECTION_TEST_TOKEN_TTL_SECONDS` | No | `300` | Validity of the connection-test LiveKit token, in seconds |
| `CONNECTION_TEST_ROOM_EXTRA_AGE_SECONDS` | No | `10` | Extra time added on top of the token TTL before the cleanup worker deletes a leftover test room |
| `CONNECTION_TEST_ROOM_PREFIX` | No | `connection-test` | Prefix used to name ephemeral connection-test rooms |
| `CONNECTION_TEST_THROTTLE_RATES` | No | `30/minute` | Rate limit for starting connection tests |

### Recording

| Variable | Required | Default | Description |
|---|---|---|---|
| `RECORDING_ENABLE` | No | `False` | Enable recording functionality. Must be `True` to show the record button in meetings. |
| `RECORDING_OUTPUT_FOLDER` | No | `recordings` | Folder/prefix used in S3 storage for recording files. Change this to organize recordings under a custom path in your bucket. |
| `RECORDING_WORKER_CLASSES` | No | -- | Maps recording mode to its worker class. Default: `screen_recording` → `VideoCompositeEgressService`, `transcript` → `AudioCompositeEgressService`. Only change if you implement custom egress workers. |
| `RECORDING_DOWNLOAD_BASE_URL` | For recording | -- | Base URL for recording download notification links. **Must include the `/recording` path**: `https://meet.example.com/recording`. Using the bare domain sends email links to a page that treats the UUID as a room code. |
| `SCREEN_RECORDING_BASE_URL` | No | -- | ⚠️ **Deprecated.** Use `RECORDING_DOWNLOAD_BASE_URL` instead. Still accepted but logs a warning. |
| `RECORDING_EXPIRATION_DAYS` | No | -- | Days before recordings expire. `null` means no expiration. |
| `RECORDING_MAX_DURATION` | No | -- | Maximum recording duration in milliseconds. `null` means no limit. |
| `RECORDING_ENCODING_ENABLED` | No | `False` | Enable custom encoding for recordings. When `False`, LiveKit uses its built-in H264_720P_30 preset. |
| `RECORDING_ENCODING_WIDTH` | No | `1280` | Recording width in pixels |
| `RECORDING_ENCODING_HEIGHT` | No | `720` | Recording height in pixels |
| `RECORDING_ENCODING_FRAMERATE` | No | `30` | Recording frame rate |
| `RECORDING_ENCODING_VIDEO_BITRATE_KBPS` | No | `3000` | Video bitrate in kbps |
| `RECORDING_ENCODING_AUDIO_BITRATE_KBPS` | No | `128` | Audio bitrate in kbps |
| `RECORDING_ENCODING_KEY_FRAME_INTERVAL_S` | No | `4.0` | Key frame interval in seconds |

### Object Storage (S3 / MinIO)

Required for recording and custom virtual backgrounds.

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_S3_ENDPOINT_URL` | For recording | -- | S3-compatible endpoint URL (e.g., `http://minio:9000` for local MinIO) |
| `AWS_S3_ACCESS_KEY_ID` | For recording | -- | S3 access key |
| `AWS_S3_SECRET_ACCESS_KEY` | For recording | -- | S3 secret key |
| `AWS_STORAGE_BUCKET_NAME` | No | `meet-media-storage` | S3 bucket for media files |
| `AWS_S3_REGION_NAME` | No | -- | S3 region. Not set by default; most S3-compatible providers (including MinIO) still require some value, e.g. `us-east-1`. |
| `AWS_S3_SIGNATURE_VERSION` | No | `s3v4` | S3 request signature version |
| `AWS_S3_UPLOAD_POLICY_EXPIRATION` | No | `60` | Expiration, in seconds, of generated upload policies/pre-signed URLs |
| `AWS_S3_DOMAIN_REPLACE` | No | -- | Replace the storage domain in generated URLs (e.g. to serve media through a CDN or reverse-proxy path instead of the raw S3 endpoint) |
| `AWS_S3_SECURE_ACCESS` | No | `True` | Used in egress configuration (`livekit-egress.yaml`). Set to `False` for local MinIO over HTTP. Note: this is an egress-level setting, not a native Django backend setting. |

### Custom Backgrounds

Lets participants upload custom virtual background images. These `FILE_UPLOAD_*` variables currently only govern this one feature (`background_image` is the only upload category implemented) - despite the generic name, there is no separate "upload files during a meeting" capability wired up yet. Disabled by default.

| Variable | Required | Default | Description |
|---|---|---|---|
| `FILE_UPLOAD_ENABLED` | No | `False` | Enable custom background image uploads (max 10 per user, 2 MB, JPEG/PNG only by default). |
| `FILE_UPLOAD_APPLY_RESTRICTIONS` | No | `True` | Enforce the size/count/extension limits in `FILE_UPLOAD_RESTRICTIONS`. Disable only for trusted, controlled deployments. |
| `FILE_UPLOAD_RESTRICTIONS` | No | `{"background_image": {"max_size": 2097152, "max_count_by_user": 10, "allowed_extensions": [".jpeg", ".jpg", ".png"], "allowed_mimetypes": ["image/jpeg", "image/png"]}}` | Per-category upload limits, as a JSON dict. |
| `FILE_UPLOAD_PATH` | No | `files` | Folder/prefix used in object storage for uploaded files |
| `FILE_UPLOAD_TMP_PATH` | No | `tmp/files` | Temporary folder/prefix used while a file is being uploaded |
| `FILE_PURGE_GRACE_DAYS` | No | `7` | Days a soft-deleted file is kept before being purged for good (via `CELERY_ENABLED` cleanup task) |

### Email

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_EMAIL_HOST` | No | -- | SMTP server hostname |
| `DJANGO_EMAIL_PORT` | No | -- | SMTP port |
| `DJANGO_EMAIL_HOST_USER` | No | -- | SMTP username |
| `DJANGO_EMAIL_HOST_PASSWORD` | No | -- | SMTP password |
| `DJANGO_EMAIL_USE_TLS` | No | `False` | Enable STARTTLS |
| `DJANGO_EMAIL_USE_SSL` | No | `False` | Enable SSL (mutually exclusive with TLS) |
| `DJANGO_EMAIL_FROM` | No | `from@example.com` | From address for outgoing emails. The default is a placeholder - override it in production so recipients (and SPF/DKIM) see your real domain. |
| `DJANGO_EMAIL_BRAND_NAME` | No | -- | Brand name in email templates |
| `DJANGO_EMAIL_LOGO_IMG` | No | -- | Logo URL for email templates |
| `DJANGO_EMAIL_SUPPORT_EMAIL` | No | -- | Support contact address shown in email templates |
| `DJANGO_EMAIL_DOMAIN` | No | -- | Domain shown in email templates |
| `DJANGO_EMAIL_APP_BASE_URL` | No | -- | Base URL of the Meet frontend (used in email links) |

### Frontend Configurations

These are Django backend settings served to the browser via `GET /api/v1.0/config/` - not build-time Vite variables.

| Variable | Required | Default | Description |
|---|---|---|---|
| `FRONTEND_CUSTOM_CSS_URL` | No | -- | URL (or path) to a custom CSS file loaded at runtime. Use this to override CSS variables for colors, fonts, and spacing without rebuilding the image. Example: `https://your-domain.com/custom.css` or `/custom.css` (relative to the Meet domain). |
| `FRONTEND_SILENCE_LIVEKIT_DEBUG` | No | `False` | Suppress LiveKit debug logs |
| `FRONTEND_IS_SILENT_LOGIN_ENABLED` | No | `True` | Enable silent OIDC authentication. Requires your provider to support `prompt=none`. |
| `FRONTEND_IDLE_DISCONNECT_WARNING_DELAY` | No | -- | Seconds before idle disconnect warning is shown. When unset, idle disconnect is disabled. |
| `FRONTEND_EXTERNAL_HOME_URL` | No | -- | Custom URL for the home button |
| `FRONTEND_USE_PROCONNECT_BUTTON` | No | `False` | Show ProConnect login button (French gov) |
| `FRONTEND_USE_FRENCH_GOV_FOOTER` | No | `False` | Show French government footer |
| `FRONTEND_ANALYTICS` | No | `{}` | Analytics configuration exposed to the frontend (backend/provider selection, keys) |
| `FRONTEND_SUPPORT` | No | `{}` | Support widget configuration exposed to the frontend (e.g. Crisp) |
| `FRONTEND_FEEDBACK` | No | `{}` | Feedback form configuration exposed to the frontend |
| `FRONTEND_DOCUMENTATION_URL` | No | -- | URL for a "Documentation" link/menu item in the UI |
| `FRONTEND_MANIFEST_LINK` | No | -- | Override the web app manifest URL |
| `FRONTEND_TRANSCRIPTION_DESTINATION` | No | -- | Label/link shown to users for where transcripts are delivered (e.g. your LaSuite Docs instance) |
| `FRONTEND_MAX_PARTICIPANTS_FOR_SOUND` | No | `5` | Above this participant count, join/leave sounds are muted |
| `FRONTEND_AUTO_MUTE_ON_JOIN_THRESHOLD` | No | `50` | Above this participant count, new participants join muted by default |

> **Custom assets (logo, images):** You can replace built-in assets (logo, landing page images) at runtime by bind-mounting your files into the frontend container at `/usr/share/nginx/html/assets`. Files mounted there override the defaults without rebuilding the image. The app title (`LaSuite Meet`) can only be changed at build time via the `VITE_APP_TITLE` Docker build argument -- this requires building a custom frontend image.

### Lobby / Waiting room

These control the behavior of the waiting room (lobby). All are optional - the defaults work for most deployments.

| Variable | Required | Default | Description |
|---|---|---|---|
| `LOBBY_WAITING_TIMEOUT` | No | `6` | Seconds a participant's entry request stays in the waiting state before expiring |
| `LOBBY_DENIED_TIMEOUT` | No | `5` | Seconds before a denied participant may re-request entry |
| `LOBBY_ACCEPTED_TIMEOUT` | No | `21600` | Seconds (6 hours) that an accepted lobby token remains valid. Controls how long after admission a participant can actually join. |
| `LOBBY_KEY_PREFIX` | No | `room_lobby` | Redis key prefix for lobby state |
| `LOBBY_NOTIFICATION_TYPE` | No | `participantWaiting` | LiveKit data channel notification type sent to the room when someone is waiting |
| `LOBBY_COOKIE_NAME` | No | `lobbyParticipantId` | Cookie name used to track anonymous lobby participants |

### Presence

Tracks which participants are currently connected to a room, backed by Redis.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PRESENCE_KEY_PREFIX` | No | `room_presence` | Redis key prefix for presence state |
| `PRESENCE_CACHE_TIMEOUT` | No | `3600` | Seconds a presence entry is kept without a refresh |
| `PRESENCE_CLEAR_ON_PARTICIPANT_LEFT` | No | `True` | Remove a participant's presence entry immediately when they leave, instead of waiting for the cache to expire |

### CORS

Standard `django-cors-headers` settings. They govern **cross-origin JavaScript requests** (`fetch`/XHR from a page on a different domain calling the API directly) - not iframe embedding, which is controlled by `X-Frame-Options`/CSP `frame-ancestors` instead.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_CORS_ALLOW_ALL_ORIGINS` | No | `False` | Allow all origins. **Do not enable in production** - use `DJANGO_CORS_ALLOWED_ORIGINS` instead. |
| `DJANGO_CORS_ALLOWED_ORIGINS` | No | `[]` | List of origins allowed to make cross-origin requests. Example: `["https://app.example.com"]` |
| `DJANGO_CORS_ALLOWED_ORIGIN_REGEXES` | No | `[]` | List of regex patterns matching allowed origins |

### Celery

| Variable | Required | Default | Description |
|---|---|---|---|
| `CELERY_ENABLED` | No | `False` | Enable Celery for async task processing. Currently used for async file deletion cleanup when `FILE_UPLOAD_ENABLED=True`. Recording email notifications are sent synchronously and do not require Celery. |
| `CELERY_BROKER_URL` | No | `redis://redis:6379/0` | Redis URL used as Celery message broker. Defaults to the same Redis instance as the session cache. |
| `CELERY_TASK_ALWAYS_EAGER` | No | `False` | Run Celery tasks synchronously in-process instead of dispatching them to a worker. Useful for local development without a running worker; do not enable in production. |
| `CELERY_TASK_DEFAULT_QUEUE` | No | `meet-backend` | Default Celery queue name |
| `CELERY_BROKER_TRANSPORT_OPTIONS` | No | `{}` | Extra options passed to the Celery broker transport, as a JSON dict |

### Summary Service Connection

These variables configure the backend's connection to the summary service (for transcription).

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUMMARY_SERVICE_VERSION` | For transcription | `1` | **Must be set to `2`** when using transcription. Version `1` is deprecated and logs a warning at startup. The v2 API uses different endpoints and payloads. |
| `SUMMARY_SERVICE_ENDPOINT` | For transcription | -- | URL of the summary service API endpoint. **Must use v2 API**: `http://summary:8000/api/v2/async-jobs/transcribe/` |
| `SUMMARY_SERVICE_API_TOKEN` | For transcription | -- | API token for authenticating with the summary service. Must match the `api_key` of the corresponding tenant in the summary service's `AUTHORIZED_TENANTS`. |
| `SUMMARY_SERVICE_WEBHOOK_API_TOKEN` | For transcription | -- | Token the backend requires on incoming result callbacks from the summary service. Must match the tenant's `webhook_api_key` in `AUTHORIZED_TENANTS`. |
| `SUMMARY_SERVICE_CLOUD_STORAGE_SIGNED_URL_EXPIRY_SECONDS` | No | `86400` | Expiration of the pre-signed URL given to the summary service to fetch the recording (24 hours) |
| `TRANSCRIPTION_SATISFACTION_FORM_BASE_URL` | No | -- | Base URL for an optional post-transcription satisfaction survey link |

### Telephony

Requires a running [LiveKit SIP](../overview/architecture.md#livekit-sip-optional) service and a SIP trunk from a VoIP provider (e.g. Twilio, Vonage, Infobip, or a self-hosted Asterisk/FreeSWITCH) - these variables alone don't provide dial-in, they only control how Meet displays/validates the phone number and PIN once SIP is wired up. See [Telephony](../self-hosting/configuration/telephony.md) for the full setup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ROOM_TELEPHONY_ENABLED` | No | `False` | Enable SIP telephony integration. Shows the dial-in phone number in the meeting room info panel. |
| `ROOM_TELEPHONY_PHONE_NUMBER` | No | -- | Dial-in phone number displayed in the meeting room info panel. |
| `ROOM_TELEPHONY_DEFAULT_COUNTRY` | No | `US` | Default country code for phone number display formatting. |
| `ROOM_TELEPHONY_PIN_LENGTH` | No | `10` | Length of the PIN code for telephony dial-in |
| `ROOM_TELEPHONY_PIN_MAX_RETRIES` | No | `5` | Maximum number of PIN entry attempts |

### Roomkit (meeting-room SIP devices)

Lets dedicated meeting-room hardware join a room via SIP before any WebRTC participant has connected.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ROOMKIT_ENABLED` | No | `False` | Enable the roomkit integration |
| `ROOMKIT_SERVER_TO_SERVER_API_TOKEN` | If enabled | -- | Token allowing LiveKit's SIP module to call roomkit endpoints on behalf of a dialing-in device |
| `ROOMKIT_JOIN_THROTTLE_RATES` | No | `300/minute` | Rate limit for roomkit join requests |

### Subtitles

Real-time captions via a LiveKit agent. See [AI Transcription](../self-hosting/configuration/transcription.md).

| Variable | Required | Default | Description |
|---|---|---|---|
| `ROOM_SUBTITLE_ENABLED` | No | `False` | Enable real-time subtitles |
| `ROOM_SUBTITLE_AGENT_NAME` | No | `multi-user-transcriber` | LiveKit agent dispatched to provide subtitles |

### Metadata Collector

Silently joins rooms to record participant/VAD/chat metadata for the summary service.

| Variable | Required | Default | Description |
|---|---|---|---|
| `METADATA_COLLECTOR_ENABLED` | No | `False` | Enable the metadata collector agent |
| `METADATA_COLLECTOR_AGENT_NAME` | No | `metadata-collector` | LiveKit agent name dispatched to rooms |
| `METADATA_COLLECTOR_OUTPUT_FOLDER` | No | `metadata` | Folder/prefix used in object storage for collected metadata |

### External Applications / API

Lets external applications authenticate against Meet on behalf of users (application JWTs) or act as an OIDC resource server client. See [External API](external-api-delegated.md).

| Variable | Required | Default | Description |
|---|---|---|---|
| `EXTERNAL_API_ENABLED` | No | `False` | Enable the external, application-delegated API |
| `APPLICATION_ENABLED` | No | `False` | Enable application registration/management |
| `APPLICATION_ALLOW_USER_CREATION` | No | `False` | Allow applications to create users by email only. Fragile due to deferred `sub` reconciliation - enable with care. |
| `APPLICATION_CLIENT_ID_LENGTH` | No | `40` | Length of generated application client IDs |
| `APPLICATION_CLIENT_SECRET_LENGTH` | No | `128` | Length of generated application client secrets |
| `APPLICATION_JWT_SECRET_KEY` | If used | -- | Secret key used to sign application JWTs |
| `APPLICATION_JWT_ALG` | No | `HS256` | Application JWT signing algorithm |
| `APPLICATION_JWT_ISSUER` | No | `lasuite-meet` | `iss` claim for application JWTs |
| `APPLICATION_JWT_AUDIENCE` | No | -- | `aud` claim for application JWTs |
| `APPLICATION_JWT_EXPIRATION_SECONDS` | No | `3600` | Application JWT lifetime |
| `APPLICATION_JWT_TOKEN_TYPE` | No | `Bearer` | Token type advertised for application JWTs |
| `APPLICATION_BASE_URL` | No | -- | Base URL used when building links for applications |
| `EXTERNAL_API_ALLOW_PUBLIC_ACCESS` | No | `False` | Allow the external API to act on public rooms. Ignored when `EXTERNAL_API_DEFAULT_ACCESS_LEVEL=public`. |
| `EXTERNAL_API_DEFAULT_ACCESS_LEVEL` | No | `trusted` | Default access level for rooms created through the external API |

### Addons

Backend support for calendar/office add-ins (e.g. Outlook).

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADDONS_ENABLED` | No | `False` | Enable add-on support |
| `ADDONS_SESSION_TTL` | No | `3600` | Add-on session lifetime, in seconds |
| `ADDONS_TRANSIT_TOKEN_TTL` | No | `120` | Lifetime of the short-lived transit token used during the add-on handshake |
| `ADDONS_CSRF_SECRET` | If enabled | -- | Secret used to protect add-on session CSRF tokens |
| `ADDONS_CACHE_PREFIX_SESSION` | No | `sid` | Redis key prefix for add-on sessions |
| `ADDONS_CACHE_PREFIX_TRANSIT` | No | `transit` | Redis key prefix for add-on transit tokens |
| `ADDONS_TOKEN_AUDIENCE` | No | `addons` | `aud` claim for add-on tokens |
| `ADDONS_TOKEN_ISSUER` | No | `lasuite-meet` | `iss` claim for add-on tokens |
| `ADDONS_TOKEN_TTL` | No | `7200` | Add-on token lifetime, in seconds |
| `ADDONS_TOKEN_ALG` | No | `HS256` | Add-on token signing algorithm |
| `ADDONS_TOKEN_TYPE` | No | `Bearer` | Token type advertised for add-on tokens |
| `ADDONS_TOKEN_SECRET_KEY` | If enabled | -- | Secret key used to sign add-on tokens |
| `ADDONS_TOKEN_SCOPE` | No | `rooms:create` | Scope granted to add-on tokens |
| `ADDONS_RANDOM_TOKEN_BYTE_LENGTH` | No | `60` | Byte length of generated random add-on tokens |
| `ADDONS_SESSION_ID_COOKIE` | No | `addonsSid` | Cookie name for the add-on session ID |
| `ADDONS_PENDING_SESSION_KEY` | No | `addons_sid` | Cache key prefix for pending add-on sessions |

### Marketing & Analytics

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANALYTICS_BACKEND` | No | -- | Dotted path to an analytics backend class (e.g. a PostHog backend). Unset disables analytics. |
| `ANALYTICS_BACKEND_SETTINGS` | No | `{}` | Configuration dict passed to the analytics backend (API key, host, etc.) |
| `SIGNUP_NEW_USER_TO_MARKETING_EMAIL` | No | `False` | Automatically add new users to a marketing mailing list on signup |
| `MARKETING_SERVICE_CLASS` | No | `core.services.marketing.BrevoMarketingService` | Dotted path to the marketing service class |
| `BREVO_API_KEY` | If marketing enabled | -- | API key for the Brevo (Sendinblue) marketing service |
| `BREVO_API_CONTACT_LIST_IDS` | No | `[]` | Brevo contact list IDs new users are added to |
| `DJANGO_BREVO_API_CONTACT_ATTRIBUTES` | No | `{"VISIO_USER": True}` | Extra attributes set on new Brevo contacts |
| `BREVO_API_TIMEOUT` | No | `1` | Timeout in seconds for Brevo API calls |

### Security & Monitoring

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_SENTRY_DSN` | No | -- | Sentry DSN for error tracking. Sentry's `environment` tag is derived automatically from `DJANGO_CONFIGURATION` (e.g. `production`, `demo`) - there is no separate variable to set it. |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0.0` | Fraction of transactions sampled for Sentry performance tracing (`0.0`-`1.0`) |

---

## Summary Service

### Authentication

The summary service uses a multi-tenant configuration: `AUTHORIZED_TENANTS` defines every Meet backend allowed to submit tasks and receive results. There is no other supported authentication mode.

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTHORIZED_TENANTS` | **Yes** | -- | JSON array of tenant configs. Each entry: `{"id": "...", "api_key": "...", "webhook_url": "...", "webhook_api_key": "...", "allowed_push_to_docs": false}`. Defines all Meet backends that can submit tasks and receive results. |

Example value:
```
AUTHORIZED_TENANTS='[{"id":"meet","api_key":"<strong-random-secret>","webhook_url":"https://meet.example.com/api/v1.0/recordings/external-process-hook/","webhook_api_key":"<strong-random-secret>"}]'
```

### Storage

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_S3_ENDPOINT_URL` | **Yes** | -- | S3-compatible endpoint URL |
| `AWS_S3_ACCESS_KEY_ID` | **Yes** | -- | S3 access key |
| `AWS_S3_SECRET_ACCESS_KEY` | **Yes** | -- | S3 secret key |
| `AWS_STORAGE_BUCKET_NAME` | **Yes** | -- | S3 bucket name |
| `AWS_S3_REGION_NAME` | No | -- | S3 region |
| `AWS_S3_SECURE_ACCESS` | No | `True` | Use HTTPS for S3 requests. Set to `False` for local MinIO over HTTP. |
| `AWS_TRANSCRIPT_PATH` | No | `transcripts` | Folder/prefix used in object storage for transcript files |
| `AWS_SUMMARY_PATH` | No | `summaries` | Folder/prefix used in object storage for summary files |

### Celery

| Variable | Required | Default | Description |
|---|---|---|---|
| `CELERY_BROKER_URL` | No | `redis://redis/0` | Celery broker URL. Note: the summary service default omits the port (`redis/0`), unlike the Django backend which uses `redis:6379/0`. |
| `CELERY_RESULT_BACKEND` | No | `redis://redis/0` | Celery result backend URL |
| `CELERY_MAX_RETRIES` | No | `1` | Maximum retries for a failed Celery task |
| `TRANSCRIBE_QUEUE_V2` | No | `transcribe-queue-v2` | Celery queue name for transcription tasks |
| `SUMMARIZE_QUEUE_V2` | No | `summarize-queue-v2` | Celery queue name for summarization tasks |
| `CALL_WEBHOOK_QUEUE_V2` | No | `call-webhook-queue-v2` | Celery queue name for result-callback tasks |
| `TASK_TRACKER_REDIS_URL` | No | `redis://redis/0` | Redis URL used to track task progress/state |
| `TASK_TRACKER_PREFIX` | No | `task_metadata:` | Redis key prefix for task tracker entries |

### Speech-to-text (WhisperX)

| Variable | Required | Default | Description |
|---|---|---|---|
| `WHISPERX_API_KEY` | **Yes** | -- | API key for the WhisperX / OpenAI-compatible API |
| `WHISPERX_BASE_URL` | No | `https://api.openai.com/v1` | WhisperX-compatible API endpoint. Default works with the OpenAI Whisper API. Override with your self-hosted WhisperX URL (e.g., `http://whisperx:8000/v1`). |
| `WHISPERX_ASR_MODEL` | No | `whisper-1` | ASR model name. Use `whisper-1` for the OpenAI Whisper API, or a WhisperX model like `large-v3` for a self-hosted instance. |
| `WHISPERX_DEFAULT_LANGUAGE` | No | -- | ISO 639-1 language code (e.g., `fr`, `en`). When set, skips automatic language detection. |
| `WHISPERX_ALLOWED_LANGUAGES` | No | `{"en","fr","de","nl"}` | Set of accepted ISO 639-1 language codes. Requests with other codes are rejected. |
| `HALLUCINATION_PATTERNS` | No | `["Vap'n'Roll Thierry"]` | Transcript substrings treated as known WhisperX hallucinations and filtered out |
| `RECORDING_MAX_DURATION` | No | -- | Maximum recording duration in milliseconds accepted by the summary service. Separate from the Django backend's own `RECORDING_MAX_DURATION`. |

**Speaker-to-participant assignment:**

| Variable | Required | Default | Description |
|---|---|---|---|
| `IS_RESOLVE_SPEAKER_IDENTITIES_ENABLED` | No | `True` | Match diarized `SPEAKER_00`-style labels to real participant names using VAD metadata |
| `RESOLVE_SPEAKER_IDENTITIES_DEFAULT_OVERLAP_THRESHOLD` | No | `0.5` | Minimum overlap ratio required to attribute a speaker segment to a participant |
| `RESOLVE_SPEAKER_IDENTITIES_ENABLE_SPLIT_ON_WORDS` | No | `True` | Split segments on word boundaries when resolving overlapping speakers |
| `RESOLVE_SPEAKER_IDENTITIES_MAX_WORD_DURATION` | No | `1` | Maximum plausible word duration, in seconds, used as a sanity bound during resolution |

### LLM (summarization)

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_BASE_URL` | For summarization | -- | LLM API endpoint (OpenAI-compatible) |
| `LLM_API_KEY` | For summarization | -- | LLM API key |
| `LLM_MODEL` | For summarization | -- | LLM model identifier (e.g., `gpt-4o`) |
