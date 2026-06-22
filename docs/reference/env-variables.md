# Environment Variables

Complete reference for all environment variables accepted by LaSuite Meet's components.

## Django Backend

### Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_SETTINGS_MODULE` | **Yes** | -- | Must be `meet.settings`. App will not start without it. |
| `DJANGO_CONFIGURATION` | **Yes** | -- | `Production`, `Demo`, or `Development` |
| `DJANGO_SECRET_KEY` | **Yes** | -- | 50+ character random string for cryptographic signing |
| `DJANGO_ALLOWED_HOSTS` | **Yes** | -- | Comma-separated list of allowed hostnames |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | **Yes** | -- | Comma-separated list of trusted HTTPS origins |
| `PYTHONPATH` | No | -- | Set to `/app` in production |
| `MEET_BASE_URL` | No | -- | Full public URL (e.g., `https://meet.example.com`) |
| `ALLOW_UNREGISTERED_ROOMS` | No | `True` | Allow unauthenticated room creation |
| `RESOURCE_DEFAULT_ACCESS_LEVEL` | No | `public` | Default access level for newly created rooms. Values: `public` (anyone with the link can join), `trusted` (authenticated users join directly; others request entry), `restricted` (everyone must request entry). |
| `SESSION_COOKIE_AGE` | No | `43200` | Session cookie lifetime in seconds (default: 12 hours) |
| `REQUEST_ENTRY_THROTTLE_RATES` | No | `150/minute` | Rate limit for room entry requests |
| `CREATION_CALLBACK_THROTTLE_RATES` | No | `600/minute` | Rate limit for creation callback requests |
| `ROOM_CREATION_CALLBACK_CACHE_TIMEOUT` | No | `600` | Seconds to cache room creation callbacks (default: 10 minutes) |
| `DJANGO_LANGUAGE_CODE` | No | `en-us` | Default language code for the Django backend |

### Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_HOST` | **Yes** | -- | PostgreSQL hostname |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_NAME` | **Yes** | -- | Database name |
| `DB_USER` | **Yes** | -- | Database user |
| `DB_PASSWORD` | **Yes** | -- | Database password |

### Redis

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | **Yes** | -- | Full Redis URL (e.g., `redis://redis:6379/0`) |
| `SESSION_ENGINE` | No | cache backend | Django session storage backend |

### OIDC / Authentication

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_RP_CLIENT_ID` | **Yes** | `meet` | OIDC client ID |
| `OIDC_RP_CLIENT_SECRET` | **Yes** | -- | OIDC client secret |
| `OIDC_RP_SIGN_ALGO` | No | `RS256` | Token signing algorithm |
| `OIDC_RP_SCOPES` | No | `openid email` | Requested OIDC scopes |
| `OIDC_OP_JWKS_ENDPOINT` | **Yes** | -- | OIDC JWKS URL |
| `OIDC_OP_AUTHORIZATION_ENDPOINT` | **Yes** | -- | OIDC authorization URL |
| `OIDC_OP_TOKEN_ENDPOINT` | **Yes** | -- | OIDC token exchange URL |
| `OIDC_OP_USER_ENDPOINT` | **Yes** | -- | OIDC userinfo URL |
| `OIDC_OP_USER_ENDPOINT_FORMAT` | No | `AUTO` | Format of the userinfo response: `AUTO` (detect), `JWT`, or `JSON` |
| `OIDC_OP_LOGOUT_ENDPOINT` | No | -- | OIDC logout URL |
| `OIDC_CREATE_USER` | No | `True` | Automatically create a local user if none exists on first login |
| `OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION` | No | `False` | Fall back to matching users by email if `sub` claim doesn't match. Enable only if emails are unique across your provider. |
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

**PKCE (recommended for production):**

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_USE_PKCE` | No | `False` | Enable PKCE (Proof Key for Code Exchange) for enhanced security. **Recommended.** |
| `OIDC_PKCE_CODE_CHALLENGE_METHOD` | No | `S256` | PKCE challenge method -- `S256` is recommended |
| `OIDC_PKCE_CODE_VERIFIER_SIZE` | No | `64` | Length of the random PKCE code verifier (43–128 characters) |

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

### Recording

| Variable | Required | Default | Description |
|---|---|---|---|
| `RECORDING_ENABLE` | No | `False` | Enable recording functionality. Must be `True` to show the record button in meetings. |
| `RECORDING_OUTPUT_FOLDER` | No | `recordings` | Folder/prefix used in S3 storage for recording files. Change this to organize recordings under a custom path in your bucket. |
| `RECORDING_WORKER_CLASSES` | No | -- | Maps recording mode to its worker class. Default: `screen_recording` → `VideoCompositeEgressService`, `transcript` → `AudioCompositeEgressService`. Only change if you implement custom egress workers. |
| `RECORDING_EVENT_PARSER_CLASS` | No | `core.recording.event.parsers.MinioParser` | Class that parses storage events and updates recording state. Use `core.recording.event.parsers.S3Parser` for generic S3-compatible providers (added in v1.17.0); keep the default `MinioParser` for MinIO. |
| `RECORDING_DOWNLOAD_BASE_URL` | For recording | -- | Base URL for recording download notification links. **Must include the `/recording` path**: `https://meet.example.com/recording`. Using the bare domain sends email links to a page that treats the UUID as a room code. |
| `SCREEN_RECORDING_BASE_URL` | No | -- | ⚠️ **Deprecated.** Use `RECORDING_DOWNLOAD_BASE_URL` instead. Still accepted but logs a warning. |
| `RECORDING_STORAGE_EVENT_ENABLE` | No | `False` | Enable MinIO/S3 bucket event notifications. Required for the backend to be notified when a recording file is uploaded. |
| `RECORDING_ENABLE_STORAGE_EVENT_AUTH` | No | `True` | Require Bearer token for the storage webhook. Set to `False` for the simplest setup. |
| `RECORDING_STORAGE_EVENT_TOKEN` | If auth enabled | -- | Bearer token MinIO sends with storage webhook requests. |
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

Required for recording functionality.

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_S3_ENDPOINT_URL` | For recording | -- | S3-compatible endpoint URL (e.g., `http://minio:9000` for local MinIO) |
| `AWS_S3_ACCESS_KEY_ID` | For recording | -- | S3 access key |
| `AWS_S3_SECRET_ACCESS_KEY` | For recording | -- | S3 secret key |
| `AWS_STORAGE_BUCKET_NAME` | For recording | -- | S3 bucket for media files |
| `AWS_S3_REGION_NAME` | No | `us-east-1` | S3 region (required even for MinIO) |
| `AWS_S3_SECURE_ACCESS` | No | `True` | Used in egress configuration (`livekit-egress.yaml`). Set to `False` for local MinIO over HTTP. Note: this is an egress-level setting, not a native Django backend setting. |

### Email

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_EMAIL_HOST` | No | `localhost` | SMTP server hostname |
| `DJANGO_EMAIL_PORT` | No | `25` | SMTP port |
| `DJANGO_EMAIL_HOST_USER` | No | -- | SMTP username |
| `DJANGO_EMAIL_HOST_PASSWORD` | No | -- | SMTP password |
| `DJANGO_EMAIL_USE_TLS` | No | `False` | Enable STARTTLS |
| `DJANGO_EMAIL_USE_SSL` | No | `False` | Enable SSL (mutually exclusive with TLS) |
| `DJANGO_EMAIL_FROM` | No | -- | From address for outgoing emails |
| `DJANGO_EMAIL_BRAND_NAME` | No | -- | Brand name in email templates |
| `DJANGO_EMAIL_LOGO_IMG` | No | -- | Logo URL for email templates |
| `DJANGO_EMAIL_SUPPORT_EMAIL` | No | -- | Support contact address shown in email templates |
| `DJANGO_EMAIL_DOMAIN` | No | -- | Domain shown in email templates |
| `DJANGO_EMAIL_APP_BASE_URL` | No | -- | Base URL of the Meet frontend (used in email links) |

### Frontend feature flags

| Variable | Required | Default | Description |
|---|---|---|---|
| `FRONTEND_CUSTOM_CSS_URL` | No | -- | URL (or path) to a custom CSS file loaded at runtime. Use this to override CSS variables for colors, fonts, and spacing without rebuilding the image. Example: `https://your-domain.com/custom.css` or `/custom.css` (relative to the Meet domain). |
| `FRONTEND_SILENCE_LIVEKIT_DEBUG` | No | `False` | Suppress LiveKit debug logs |
| `FRONTEND_IS_SILENT_LOGIN_ENABLED` | No | `True` | Enable silent OIDC token refresh. Requires your provider to support `prompt=none`. |
| `FRONTEND_IDLE_DISCONNECT_WARNING_DELAY` | No | -- | Seconds before idle disconnect warning is shown. When unset, idle disconnect is disabled. |
| `FRONTEND_EXTERNAL_HOME_URL` | No | -- | Custom URL for the home button |
| `FRONTEND_USE_PROCONNECT_BUTTON` | No | `False` | Show ProConnect login button (French gov) |
| `FRONTEND_USE_FRENCH_GOV_FOOTER` | No | `False` | Show French government footer |
| `FILE_UPLOAD_ENABLED` | No | `False` | Enable custom background image uploads (max 10 per user, 2 MB, JPEG/PNG only). Set `FILE_UPLOAD_RESTRICTIONS` to override limits. |

> **Custom assets (logo, images):** You can replace built-in assets (logo, landing page images) at runtime by bind-mounting your files into the frontend container at `/usr/share/nginx/html/assets`. Files mounted there override the defaults without rebuilding the image. The app title (`LaSuite Meet`) can only be changed at build time via the `VITE_APP_TITLE` Docker build argument -- this requires building a custom frontend image.

### Lobby / Waiting room

These control the behavior of the waiting room (lobby). All are optional - the defaults work for most deployments.

| Variable | Required | Default | Description |
|---|---|---|---|
| `LOBBY_WAITING_TIMEOUT` | No | `3` | Seconds a participant's entry request stays in the waiting state before expiring |
| `LOBBY_DENIED_TIMEOUT` | No | `5` | Seconds before a denied participant may re-request entry |
| `LOBBY_ACCEPTED_TIMEOUT` | No | `21600` | Seconds (6 hours) that an accepted lobby token remains valid. Controls how long after admission a participant can actually join. |
| `LOBBY_KEY_PREFIX` | No | `room_lobby` | Redis key prefix for lobby state |
| `LOBBY_NOTIFICATION_TYPE` | No | `participantWaiting` | LiveKit data channel notification type sent to the room when someone is waiting |
| `LOBBY_COOKIE_NAME` | No | `lobbyParticipantId` | Cookie name used to track anonymous lobby participants |

### CORS

Required when embedding Meet in iframes or calling the API from a different origin (e.g., external integrations or add-ins).

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

### Summary Service Connection

These variables configure the backend's connection to the summary service (for transcription).

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUMMARY_SERVICE_ENDPOINT` | For transcription | -- | URL of the summary service API endpoint (e.g., `http://summary:8000/api/v1/tasks/`) |
| `SUMMARY_SERVICE_API_TOKEN` | For transcription | -- | API token for authenticating with the summary service. Must match the `api_key` of the corresponding tenant in the summary service's `AUTHORIZED_TENANTS`. |

### Telephony

| Variable | Required | Default | Description |
|---|---|---|---|
| `ROOM_TELEPHONY_ENABLED` | No | `False` | Enable SIP telephony integration. Shows the dial-in phone number in the meeting room info panel. |
| `ROOM_TELEPHONY_PHONE_NUMBER` | No | -- | Dial-in phone number displayed in the meeting room info panel. |
| `ROOM_TELEPHONY_DEFAULT_COUNTRY` | No | `US` | Default country code for phone number display formatting. |
| `ROOM_TELEPHONY_PIN_LENGTH` | No | `10` | Length of the PIN code for telephony dial-in |
| `ROOM_TELEPHONY_PIN_MAX_RETRIES` | No | `5` | Maximum number of PIN entry attempts |

### Security & Monitoring

| Variable | Required | Default | Description |
|---|---|---|---|
| `SENTRY_DSN` | No | -- | Sentry DSN for error tracking |
| `SENTRY_ENVIRONMENT` | No | -- | Sentry environment label |

---

## Summary Service

### Authentication

The summary service supports two authentication modes. The **multi-tenant approach** (`AUTHORIZED_TENANTS`) is the current recommended method. The legacy single-tenant approach (`APP_API_TOKEN` / `WEBHOOK_API_TOKEN` / `WEBHOOK_URL`) is deprecated but still works, and logs a warning at startup.

**Current approach (multi-tenant):**

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTHORIZED_TENANTS` | **Yes** | -- | JSON array of tenant configs. Each entry: `{"id": "...", "api_key": "...", "webhook_url": "...", "webhook_api_key": "..."}`. Defines all Meet backends that can submit tasks and receive results. |

Example value:
```
AUTHORIZED_TENANTS='[{"id":"meet","api_key":"<strong-random-secret>","webhook_url":"https://meet.example.com/api/v1/tasks/callback/","webhook_api_key":"<strong-random-secret>"}]'
```

**Legacy approach (deprecated):**

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_API_TOKEN` | ~~Yes~~ | -- | ⚠️ Deprecated. API token for requests from Meet backend. Use `AUTHORIZED_TENANTS` instead. |
| `WEBHOOK_URL` | ~~Yes~~ | -- | ⚠️ Deprecated. Meet backend URL for result callbacks. Use `AUTHORIZED_TENANTS` instead. |
| `WEBHOOK_API_TOKEN` | ~~Yes~~ | -- | ⚠️ Deprecated. Token for authenticating webhook calls to Meet backend. Use `AUTHORIZED_TENANTS` instead. |

### Storage

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_S3_ENDPOINT_URL` | **Yes** | -- | S3-compatible endpoint URL |
| `AWS_S3_ACCESS_KEY_ID` | **Yes** | -- | S3 access key |
| `AWS_S3_SECRET_ACCESS_KEY` | **Yes** | -- | S3 secret key |
| `AWS_STORAGE_BUCKET_NAME` | **Yes** | -- | S3 bucket name |
| `AWS_S3_SECURE_ACCESS` | No | `True` | Use HTTPS for S3 requests. Set to `False` for local MinIO over HTTP. |

### Celery

| Variable | Required | Default | Description |
|---|---|---|---|
| `CELERY_BROKER_URL` | No | `redis://redis/0` | Celery broker URL. Note: the summary service default omits the port (`redis/0`), unlike the Django backend which uses `redis:6379/0`. |
| `CELERY_RESULT_BACKEND` | No | `redis://redis/0` | Celery result backend URL |

### Speech-to-text (WhisperX)

| Variable | Required | Default | Description |
|---|---|---|---|
| `WHISPERX_API_KEY` | **Yes** | -- | API key for the WhisperX / OpenAI-compatible API |
| `WHISPERX_BASE_URL` | No | `https://api.openai.com/v1` | WhisperX-compatible API endpoint. Default works with the OpenAI Whisper API. Override with your self-hosted WhisperX URL (e.g., `http://whisperx:8000/v1`). |
| `WHISPERX_ASR_MODEL` | No | `whisper-1` | ASR model name. Use `whisper-1` for the OpenAI Whisper API, or a WhisperX model like `large-v3` for a self-hosted instance. |
| `WHISPERX_DEFAULT_LANGUAGE` | No | -- | ISO 639-1 language code (e.g., `fr`, `en`). When set, skips automatic language detection. |
| `WHISPERX_ALLOWED_LANGUAGES` | No | `{"en","fr","de","nl"}` | Set of accepted ISO 639-1 language codes. Requests with other codes are rejected. |

### LLM (summarization)

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_BASE_URL` | For summarization | -- | LLM API endpoint (OpenAI-compatible) |
| `LLM_API_KEY` | For summarization | -- | LLM API key |
| `LLM_MODEL` | For summarization | -- | LLM model identifier (e.g., `gpt-4o`) |
| `IS_SUMMARY_ENABLED` | No | `True` | Enable AI summarization in addition to transcription. Set to `False` to produce transcripts only. |