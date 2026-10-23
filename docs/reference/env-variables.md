# Environment Variables

Every environment variable Meet's services read, grouped by service and then by
feature. Sections run from what every instance needs to what few change, and
each table lists its required variables first.

| Service | Where the variables go |
|---|---|
| [Backend](#backend) | `env.d/common` with Docker Compose, `backend.envVars` in the Helm chart |
| [Summary service](#summary-service) | `env.d/summary`, only if you run transcription |
| [Agents](#agents) | each agent container's environment, only if you run real-time subtitles or the metadata collector |

## Start here

A production backend does not start, or no one can log in, without these:

- [Core](#core): `DJANGO_SETTINGS_MODULE`, `DJANGO_CONFIGURATION`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`
- [Database](#database): `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, or `DATABASE_URL` alone
- [Authentication](#authentication-oidc): `OIDC_RP_CLIENT_SECRET`, `OIDC_OP_JWKS_ENDPOINT`, `OIDC_OP_AUTHORIZATION_ENDPOINT`, `OIDC_OP_TOKEN_ENDPOINT`, `OIDC_OP_USER_ENDPOINT`
- [LiveKit](#livekit): `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_API_URL`

Everything else has a working default. The optional features are off until
their switch is set:

- `RECORDING_ENABLE`, `ROOM_SUBTITLE_ENABLED`, `ROOM_TELEPHONY_ENABLED`, `FILE_UPLOAD_ENABLED`: one each
- the external API: `EXTERNAL_API_ENABLED` and `APPLICATION_ENABLED`
- add-ons: `ADDONS_ENABLED` and `EXTERNAL_API_ENABLED`

---

## Backend

### Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_SETTINGS_MODULE` | **Yes** | -- | Must be `meet.settings`. Unset, the backend exits at start with `ImproperlyConfigured`. |
| `DJANGO_CONFIGURATION` | **Yes** | -- | `Production`, `Demo`, `Development`, `Test`. Unset, the backend exits at start with `ImproperlyConfigured`. |
| `DJANGO_SECRET_KEY` | **Yes** | -- | 50+ character random string for cryptographic signing |
| `DJANGO_ALLOWED_HOSTS` | **Yes** | -- | Comma-separated list of allowed hostnames |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | **Yes** | -- | Comma-separated list of trusted HTTPS origins |
| `DJANGO_LANGUAGE_CODE` | No | `en-us` | Default language code for the Django backend |
| `DJANGO_LANGUAGES` | No | English, French, Dutch, German, Spanish | Languages a user's profile can store, as `code,name` pairs separated by `;`, e.g. `en-us,English;fr-fr,French`. The interface's language picker keeps its own fixed list. |
| `SESSION_COOKIE_AGE` | No | `43200` | Session cookie lifetime in seconds (default: 12 hours) |
| `PYTHONPATH` | No | -- | Set to `/app` in production |
| `MEET_BASE_URL` | No | -- | ⚠️ Set in the example env templates and Helm chart, but not currently read by any backend code path - verify before relying on it for anything. |

### Database

`DATABASE_URL` takes precedence over the `DB_*` variables. The `DB_*` defaults
are insecure values meant for local development: override every one of them in
production.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_HOST` | **In production** | `localhost` | PostgreSQL hostname |
| `DB_NAME` | **In production** | `meet` | Database name |
| `DB_USER` | **In production** | `dinum` | Database user |
| `DB_PASSWORD` | **In production** | `pass` | Database password |
| `DATABASE_URL` | No | -- | Full database URL (e.g. `postgres://user:pass@host:5432/name`), in place of the `DB_*` variables |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_ENGINE` | No | `django.db.backends.postgresql_psycopg2` | Django database backend |

### Authentication (OIDC)

The browser login. See [SSO & Authentication](../self-hosting/configuration/sso.md) for per-provider values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_RP_CLIENT_SECRET` | **Yes** | -- | OIDC client secret |
| `OIDC_OP_JWKS_ENDPOINT` | **Yes** | -- | OIDC JWKS URL |
| `OIDC_OP_AUTHORIZATION_ENDPOINT` | **Yes** | -- | OIDC authorization URL |
| `OIDC_OP_TOKEN_ENDPOINT` | **Yes** | -- | OIDC token exchange URL |
| `OIDC_OP_USER_ENDPOINT` | **Yes** | -- | OIDC userinfo URL |
| `OIDC_RP_CLIENT_ID` | No | `meet` | OIDC client ID |
| `OIDC_OP_LOGOUT_ENDPOINT` | No | -- | OIDC logout URL |
| `OIDC_OP_URL` | No | -- | Base URL of the OIDC provider, used for auto-discovery in place of setting each endpoint individually. |
| `OIDC_RP_SIGN_ALGO` | No | `RS256` | Token signing algorithm |
| `OIDC_RP_SCOPES` | No | `openid email` | Requested OIDC scopes |
| `OIDC_REDIRECT_REQUIRE_HTTPS` | No | `False` | Require HTTPS for OIDC redirect URIs. **Recommended in production.** |
| `OIDC_USE_PKCE` | No | `False` | Enable PKCE (Proof Key for Code Exchange). **Recommended in production.** |
| `OIDC_PKCE_CODE_CHALLENGE_METHOD` | No | `S256` | PKCE challenge method -- `S256` is recommended |
| `OIDC_PKCE_CODE_VERIFIER_SIZE` | No | `64` | Length of the random PKCE code verifier (43–128 characters) |
| `OIDC_CREATE_USER` | No | `True` | Automatically create a local user if none exists on first login |
| `OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION` | No | `False` | Fallback to matching users by email if `sub` claim doesn't match. Enable only if emails are unique across your provider. |
| `OIDC_USER_SUB_FIELD_IMMUTABLE` | No | `True` | Prevent the `sub` claim from being changed once set on a user. Disable with care - this exists to stop account takeover via `sub` reassignment. |
| `OIDC_OP_USER_ENDPOINT_FORMAT` | No | `AUTO` | Format of the userinfo response: `AUTO` (detect), `JWT`, or `JSON` |
| `OIDC_OP_INTROSPECTION_ENDPOINT` | No | -- | OIDC token introspection URL |
| `OIDC_REDIRECT_ALLOWED_HOSTS` | No | `[]` | Allowed hosts for OIDC redirects |
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

### LiveKit

| Variable | Required | Default | Description |
|---|---|---|---|
| `LIVEKIT_API_KEY` | **Yes** | -- | LiveKit API key (must match server config) |
| `LIVEKIT_API_SECRET` | **Yes** | -- | LiveKit API secret (must match server config) |
| `LIVEKIT_API_URL` | **Yes** | -- | **Public** LiveKit URL -- returned to browser clients AND used for server API calls. Must be `https://livekit.example.com` (not the Docker-internal address). |
| `LIVEKIT_DEFAULT_VIDEO_CODEC` | No | `vp9` | Default video codec. One of `vp8`, `h264`, `vp9`, `av1`. |
| `LIVEKIT_DEFAULT_SOURCES` | No | `["camera","microphone","screen_share","screen_share_audio"]` | Media sources participants can publish by default |
| `LIVEKIT_FORCE_WSS_PROTOCOL` | No | `False` | Force WSS protocol in the WebSocket URL returned to clients. Enable for legacy browsers (Firefox <124, Chrome <125) where HTTPS URLs in `WebSocket()` may fail. |
| `LIVEKIT_ENABLE_FIREFOX_PROXY_WORKAROUND` | No | `False` | Workaround for Firefox clients behind proxies that fail to establish WebSocket connections. Pre-establishes a dummy connection to prime the WebSocket. |
| `LIVEKIT_VERIFY_SSL` | No | `True` | Verify SSL certificate for LiveKit API calls |
| `LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX` | No | -- | Regex to filter LiveKit webhook events by room name. Only matching events are processed. |
| `AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME` | No | `True` | Allow authenticated participants to change their display name in a room |
| `PARTICIPANT_FORBIDDEN_PERMISSION_FIELDS` | No | `["hidden", "recorder", "agent"]` | LiveKit participant permission fields that can never be granted through the API |

### Rooms and waiting room

Who may join a room is explained in [Unauthenticated access](../self-hosting/configuration/sso.md#unauthenticated-access).

| Variable | Required | Default | Description |
|---|---|---|---|
| `RESOURCE_DEFAULT_ACCESS_LEVEL` | No | `public` | Access level of a new room whose creator picked none under Settings → Rooms. Values: `public` (anyone with the link can join), `trusted` (authenticated users join directly; others request entry), `restricted` (people holding a role on the room join directly; others request entry). |
| `ALLOW_UNREGISTERED_ROOMS` | No | `True` | Let anyone join a meeting under a room code that matches no room. `False` answers `404` for such codes |
| `ALLOW_UNSECURE_USER_LISTING` | No | `False` | Allow listing users without additional restrictions. Leave disabled unless you understand the exposure. |
| `LOBBY_WAITING_TIMEOUT` | No | `6` | Seconds a participant's entry request stays in the waiting state before expiring |
| `LOBBY_DENIED_TIMEOUT` | No | `5` | Seconds before a denied participant may re-request entry |
| `LOBBY_ACCEPTED_TIMEOUT` | No | `21600` | Seconds (6 hours) that an accepted lobby token remains valid. Controls how long after admission a participant can actually join. |
| `REQUEST_ENTRY_THROTTLE_RATES` | No | `150/minute` | Rate limit for room entry requests |
| `CREATION_CALLBACK_THROTTLE_RATES` | No | `600/minute` | Rate limit for creation callback requests |
| `ROOM_CREATION_CALLBACK_CACHE_TIMEOUT` | No | `600` | Seconds to cache room creation callbacks (default: 10 minutes) |
| `LOBBY_KEY_PREFIX` | No | `room_lobby` | Redis key prefix for lobby state |
| `LOBBY_NOTIFICATION_TYPE` | No | `participantWaiting` | LiveKit data channel notification type sent to the room when someone is waiting |
| `LOBBY_COOKIE_NAME` | No | `lobbyParticipantId` | Cookie name used to track anonymous lobby participants |

### Email

Needed for recording download links and room invitations. See [Email (SMTP)](../self-hosting/configuration/email.md) for setup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_EMAIL_HOST` | For email | -- | SMTP server hostname |
| `DJANGO_EMAIL_PORT` | For email | -- | SMTP port |
| `DJANGO_EMAIL_HOST_USER` | No | -- | SMTP username |
| `DJANGO_EMAIL_HOST_PASSWORD` | No | -- | SMTP password |
| `DJANGO_EMAIL_USE_TLS` | No | `False` | Enable STARTTLS |
| `DJANGO_EMAIL_USE_SSL` | No | `False` | Enable SSL (mutually exclusive with TLS) |
| `DJANGO_EMAIL_FROM` | No | `from@example.com` | From address for outgoing emails. The default is a placeholder - override it in production so recipients (and SPF/DKIM) see your real domain. |
| `DJANGO_EMAIL_APP_BASE_URL` | For invitations | -- | Base URL of the Meet frontend, used in email links. Unset, invitation links read `None/<room code>`. |
| `DJANGO_EMAIL_BRAND_NAME` | No | -- | Brand name in email templates |
| `DJANGO_EMAIL_LOGO_IMG` | No | -- | Logo URL for email templates |
| `DJANGO_EMAIL_SUPPORT_EMAIL` | No | -- | Support contact address shown in email templates |
| `DJANGO_EMAIL_DOMAIN` | For invitations | -- | Domain shown in email templates |
| `DJANGO_EMAIL_BACKEND` | No | `django.core.mail.backends.smtp.EmailBackend` | Django email backend class |

### Object storage (S3 / MinIO)

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

### Recording

See [Recording](../self-hosting/configuration/recording.md) for setup, and [Configuring recording encoding](../self-hosting/configuration/recording.md#configuring-recording-encoding) for what the `RECORDING_ENCODING_*` values become in LiveKit Egress.

| Variable | Required | Default | Description |
|---|---|---|---|
| `RECORDING_ENABLE` | For recording | `False` | Enable recording functionality. Must be `True` to show the record button in meetings. |
| `RECORDING_DOWNLOAD_BASE_URL` | For recording | -- | Base URL for recording download notification links. **Must include the `/recording` path**: `https://meet.example.com/recording`. Using the bare domain sends email links to a page that treats the UUID as a room code. |
| `RECORDING_EXPIRATION_DAYS` | No | -- | Days before recordings expire; match your bucket's lifecycle policy. Unset means no expiration. |
| `RECORDING_MAX_DURATION` | No | -- | Maximum recording duration in milliseconds. Unset means no limit. |
| `RECORDING_OUTPUT_FOLDER` | No | `recordings` | Folder/prefix used in S3 storage for recording files |
| `MEDIA_AUTH_ORIGINAL_URL_HEADER` | No | `HTTP_X_ORIGINAL_URL` | Request header the reverse proxy uses to pass the original download URL to the backend's media-auth check. Traefik's ForwardAuth sends `X-Forwarded-Uri`: set `HTTP_X_FORWARDED_URI`. |
| `RECORDING_ENCODING_ENABLED` | No | `False` | Enable custom encoding for recordings. When `False`, LiveKit uses its built-in H264_720P_30 preset. |
| `RECORDING_ENCODING_WIDTH` | No | `1280` | Recording width in pixels |
| `RECORDING_ENCODING_HEIGHT` | No | `720` | Recording height in pixels |
| `RECORDING_ENCODING_FRAMERATE` | No | `30` | Recording frame rate |
| `RECORDING_ENCODING_VIDEO_BITRATE_KBPS` | No | `3000` | H.264 video bitrate in kbps |
| `RECORDING_ENCODING_AUDIO_BITRATE_KBPS` | No | `128` | AAC audio bitrate in kbps |
| `RECORDING_ENCODING_KEY_FRAME_INTERVAL_S` | No | `4.0` | Key frame interval in seconds |
| `RECORDING_WORKER_CLASSES` | No | -- | Maps recording mode to its worker class. Default: `screen_recording` → `VideoCompositeEgressService`, `transcript` → `AudioCompositeEgressService`. Only change if you implement custom egress workers. |
| `SCREEN_RECORDING_BASE_URL` | No | -- | ⚠️ **Deprecated.** Use `RECORDING_DOWNLOAD_BASE_URL` instead. Still accepted but logs a warning. |

### Transcription

The backend's connection to the [summary service](#summary-service). See [AI Transcription](../self-hosting/configuration/transcription.md) for setup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUMMARY_SERVICE_VERSION` | For transcription | `1` | **Must be set to `2`** when using transcription. Version `1` is deprecated and logs a warning at startup. The v2 API uses different endpoints and payloads. |
| `SUMMARY_SERVICE_ENDPOINT` | For transcription | -- | URL of the summary service API endpoint. **Must use v2 API**: `http://summary:8000/api/v2/async-jobs/transcribe/` |
| `SUMMARY_SERVICE_API_TOKEN` | For transcription | -- | API token for authenticating with the summary service. Must match the `api_key` of the corresponding tenant in the summary service's `AUTHORIZED_TENANTS`. |
| `SUMMARY_SERVICE_WEBHOOK_API_TOKEN` | For transcription | -- | Token the backend requires on incoming result callbacks from the summary service. Must match the tenant's `webhook_api_key` in `AUTHORIZED_TENANTS`. |
| `SUMMARY_SERVICE_CLOUD_STORAGE_SIGNED_URL_EXPIRY_SECONDS` | No | `86400` | Expiration of the pre-signed URL given to the summary service to fetch the recording (24 hours) |
| `TRANSCRIPTION_SATISFACTION_FORM_BASE_URL` | No | -- | Base URL for an optional post-transcription satisfaction survey link |

### Subtitles

Real-time captions, provided by the [subtitles agent](#subtitles-agent). See [Real-time Subtitles](../self-hosting/configuration/subtitles.md) for setup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ROOM_SUBTITLE_ENABLED` | For subtitles | `False` | Enable real-time subtitles |
| `ROOM_SUBTITLE_AGENT_NAME` | No | `multi-user-transcriber` | LiveKit agent dispatched to provide subtitles. Must match the agent's `TRANSCRIBER_AGENT_NAME`. |

### Telephony

Requires a running [LiveKit SIP](../overview/how-meet-works.md#agents-and-phone-calls) service and a SIP trunk from a VoIP provider (e.g. Twilio, Vonage, Infobip, or a self-hosted Asterisk/FreeSWITCH) - these variables alone don't provide dial-in, they only control how Meet displays/validates the phone number and PIN once SIP is wired up. See [Telephony](../self-hosting/configuration/telephony.md) for the full setup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ROOM_TELEPHONY_ENABLED` | For telephony | `False` | Enable SIP telephony integration. Shows the dial-in phone number in the meeting room info panel. |
| `ROOM_TELEPHONY_PHONE_NUMBER` | For telephony | -- | Dial-in phone number displayed in the meeting room info panel. |
| `ROOM_TELEPHONY_DEFAULT_COUNTRY` | No | `US` | Default country code for phone number display formatting. |
| `ROOM_TELEPHONY_PIN_LENGTH` | No | `10` | Length of the PIN code for telephony dial-in |
| `ROOM_TELEPHONY_PIN_MAX_RETRIES` | No | `5` | Attempts at drawing a PIN no other room uses, when a room is created. After that many, the room gets no PIN. |

### Roomkit (meeting-room SIP devices)

Lets dedicated meeting-room hardware join a room via SIP before any WebRTC participant has connected.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ROOMKIT_ENABLED` | No | `False` | Enable the roomkit integration |
| `ROOMKIT_SERVER_TO_SERVER_API_TOKEN` | If enabled | -- | Token allowing LiveKit's SIP module to call roomkit endpoints on behalf of a dialing-in device |
| `ROOMKIT_JOIN_THROTTLE_RATES` | No | `300/minute` | Rate limit for roomkit join requests |

### Frontend

Backend settings served to the browser via `GET /api/v1.0/config/`, read at runtime. The app title is the one value fixed at build time: it takes the `VITE_APP_TITLE` build argument, and changing it means building a custom frontend image.

| Variable | Required | Default | Description |
|---|---|---|---|
| `FRONTEND_CUSTOM_CSS_URL` | No | -- | URL (or path) to a custom CSS file loaded at runtime. Use this to override CSS variables for colors, fonts, and spacing without rebuilding the image. Example: `https://your-domain.com/custom.css` or `/custom.css` (relative to the Meet domain). |
| `FRONTEND_IS_SILENT_LOGIN_ENABLED` | No | `True` | Enable silent OIDC authentication. Requires your provider to support `prompt=none`. |
| `FRONTEND_EXTERNAL_HOME_URL` | No | -- | Custom URL for the home button |
| `FRONTEND_DOCUMENTATION_URL` | No | -- | URL for a "Documentation" link/menu item in the UI |
| `FRONTEND_TRANSCRIPTION_DESTINATION` | No | -- | Label/link shown to users for where transcripts are delivered (e.g. your LaSuite Docs instance) |
| `FRONTEND_IDLE_DISCONNECT_WARNING_DELAY` | No | -- | Seconds before idle disconnect warning is shown. When unset, idle disconnect is disabled. |
| `FRONTEND_MAX_PARTICIPANTS_FOR_SOUND` | No | `5` | Above this participant count, join/leave sounds are muted |
| `FRONTEND_AUTO_MUTE_ON_JOIN_THRESHOLD` | No | `50` | Above this participant count, new participants join muted by default |
| `FRONTEND_USE_PROCONNECT_BUTTON` | No | `False` | Show ProConnect login button (French gov) |
| `FRONTEND_USE_FRENCH_GOV_FOOTER` | No | `False` | Show French government footer |
| `FRONTEND_ANALYTICS` | No | `{}` | Analytics configuration exposed to the frontend (backend/provider selection, keys) |
| `FRONTEND_SUPPORT` | No | `{}` | Support widget configuration exposed to the frontend (e.g. Crisp) |
| `FRONTEND_FEEDBACK` | No | `{}` | Feedback form configuration exposed to the frontend |
| `FRONTEND_MANIFEST_LINK` | No | -- | Override the web app manifest URL |
| `FRONTEND_SILENCE_LIVEKIT_DEBUG` | No | `False` | Suppress LiveKit debug logs |

> **Custom assets (logo, images):** You can replace built-in assets (logo, landing page images) at runtime by bind-mounting your files into the frontend container at `/usr/share/nginx/html/assets`. Files mounted there override the defaults without rebuilding the image.

### Custom backgrounds

Lets participants upload custom virtual background images. These `FILE_UPLOAD_*` variables currently only govern this one feature (`background_image` is the only upload category implemented). Disabled by default.

| Variable | Required | Default | Description |
|---|---|---|---|
| `FILE_UPLOAD_ENABLED` | No | `False` | Enable custom background image uploads (max 10 per user, 2 MB, JPEG/PNG only by default). |
| `FILE_UPLOAD_APPLY_RESTRICTIONS` | No | `True` | Enforce the size/count/extension limits in `FILE_UPLOAD_RESTRICTIONS`. Disable only for trusted, controlled deployments. |
| `FILE_UPLOAD_RESTRICTIONS` | No | `{"background_image": {"max_size": 2097152, "max_count_by_user": 10, "allowed_extensions": [".jpeg", ".jpg", ".png"], "allowed_mimetypes": ["image/jpeg", "image/png"]}}` | Per-category upload limits, as a JSON dict. |
| `MEDIA_BASE_URL` | No | `""` | Prefix put in front of `/media/` in the URLs of uploaded files, for serving them from another host |
| `FILE_UPLOAD_PATH` | No | `files` | Folder/prefix used in object storage for uploaded files |
| `FILE_UPLOAD_TMP_PATH` | No | `tmp/files` | Temporary folder/prefix used while a file is being uploaded |
| `FILE_PURGE_GRACE_DAYS` | No | `7` | Days a soft-deleted file is kept before being purged for good (via `CELERY_ENABLED` cleanup task) |

### Connection test

Lets participants run a pre-join connectivity check against LiveKit before a real meeting (added in v1.25.0).

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONNECTION_TEST_ENABLED` | No | `False` | Enable the connection test feature |
| `CONNECTION_TEST_TOKEN_TTL_SECONDS` | No | `300` | Validity of the connection-test LiveKit token, in seconds |
| `CONNECTION_TEST_ROOM_EXTRA_AGE_SECONDS` | No | `10` | Extra time added on top of the token TTL before the cleanup worker deletes a leftover test room. Requires `CELERY_ENABLED=True`. |
| `CONNECTION_TEST_ROOM_PREFIX` | No | `connection-test` | Prefix used to name ephemeral connection-test rooms |
| `CONNECTION_TEST_THROTTLE_RATES` | No | `30/minute` | Rate limit for starting connection tests |

### External API (applications)

Lets external applications authenticate against Meet on behalf of users with application JWTs. See [External API](external-api-delegated.md). Applications are registered in the Django admin at `/admin/` → **Core → Applications**.

| Variable | Required | Default | Description |
|---|---|---|---|
| `EXTERNAL_API_ENABLED` | For the external API | `False` | Mounts the `/external-api/v1.0/` router. Without it, every path under it answers 404 whatever the other settings. |
| `APPLICATION_ENABLED` | For the external API | `False` | Enables the token endpoint. Without it, the token endpoint answers 404 even with `EXTERNAL_API_ENABLED=True`. |
| `APPLICATION_JWT_SECRET_KEY` | If enabled | -- | Secret key used to sign application JWTs |
| `APPLICATION_JWT_EXPIRATION_SECONDS` | No | `3600` | Application JWT lifetime |
| `APPLICATION_ALLOW_USER_CREATION` | No | `False` | Allow applications to create users by email only. Fragile due to deferred `sub` reconciliation - enable with care. |
| `EXTERNAL_API_DEFAULT_ACCESS_LEVEL` | No | `trusted` | Default access level for rooms created through the external API |
| `EXTERNAL_API_ALLOW_PUBLIC_ACCESS` | No | `False` | Allow the external API to create rooms with, or switch them to, `access_level=public`. Existing public rooms stay listable and editable either way. Ignored when `EXTERNAL_API_DEFAULT_ACCESS_LEVEL=public`. |
| `APPLICATION_JWT_ALG` | No | `HS256` | Application JWT signing algorithm |
| `APPLICATION_JWT_ISSUER` | No | `lasuite-meet` | `iss` claim for application JWTs |
| `APPLICATION_JWT_AUDIENCE` | No | -- | `aud` claim for application JWTs |
| `APPLICATION_JWT_TOKEN_TYPE` | No | `Bearer` | Token type advertised for application JWTs |
| `APPLICATION_CLIENT_ID_LENGTH` | No | `40` | Length of generated application client IDs |
| `APPLICATION_CLIENT_SECRET_LENGTH` | No | `128` | Length of generated application client secrets |
| `APPLICATION_BASE_URL` | No | -- | Base URL used when building links for applications |

### External API (OIDC resource server)

Lets external applications call Meet's [OAuth2 Resource Server API](external-api-resource-server.md) with their own OIDC-issued tokens, separate from the browser login.

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_RS_CLIENT_SECRET` | If used | -- | Client secret for the resource server |
| `OIDC_RS_CLIENT_ID` | No | `meet` | Client ID expected in tokens presented to the resource server |
| `OIDC_RS_SCOPES` | No | `["lasuite_meet"]` | Required scopes on incoming tokens |
| `OIDC_RS_SCOPES_PREFIX` | No | -- | Unset, integrators request flat scopes (e.g. `lasuite_meet rooms:list`). Set it (e.g. `lasuite_meet`) if your IdP issues namespaced scopes like `lasuite_meet:rooms:list`: the prefix is stripped from each scope before matching. |
| `OIDC_RS_AUDIENCE_CLAIM` | No | `client_id` | Token claim used to identify the audience/client |
| `OIDC_RS_SIGNING_ALGO` | No | `ES256` | Expected token signing algorithm |
| `OIDC_RS_PRIVATE_KEY_STR` | If encrypted tokens are used | -- | Private key (PEM string) used to decrypt encrypted tokens |
| `OIDC_RS_ENCRYPTION_ALGO` | No | `RSA-OAEP` | Expected token encryption algorithm (if tokens are encrypted) |
| `OIDC_RS_ENCRYPTION_ENCODING` | No | `A256GCM` | Expected token encryption encoding |
| `OIDC_RS_ENCRYPTION_KEY_TYPE` | No | `RSA` | Key type used to decrypt encrypted tokens |

### Add-ons

Backend support for calendar/office add-ins. See [External API: add-ons](external-api-addons.md). Add-ons also need `EXTERNAL_API_ENABLED=True`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADDONS_ENABLED` | For add-ons | `False` | Enable add-on support |
| `ADDONS_TOKEN_SECRET_KEY` | If enabled | -- | Secret key used to sign add-on tokens |
| `ADDONS_CSRF_SECRET` | If enabled | -- | Secret used to protect add-on session CSRF tokens |
| `ADDONS_TOKEN_SCOPE` | No | `rooms:create` | Scope granted to add-on tokens |
| `ADDONS_TOKEN_TTL` | No | `7200` | Add-on token lifetime, in seconds |
| `ADDONS_SESSION_TTL` | No | `3600` | Add-on session lifetime, in seconds |
| `ADDONS_TRANSIT_TOKEN_TTL` | No | `120` | Lifetime of the short-lived transit token used during the add-on handshake |
| `ADDONS_TOKEN_AUDIENCE` | No | `addons` | `aud` claim for add-on tokens |
| `ADDONS_TOKEN_ISSUER` | No | `lasuite-meet` | `iss` claim for add-on tokens |
| `ADDONS_TOKEN_ALG` | No | `HS256` | Add-on token signing algorithm |
| `ADDONS_TOKEN_TYPE` | No | `Bearer` | Token type advertised for add-on tokens |
| `ADDONS_RANDOM_TOKEN_BYTE_LENGTH` | No | `60` | Byte length of generated random add-on tokens |
| `ADDONS_SESSION_ID_COOKIE` | No | `addonsSid` | Cookie name for the add-on session ID |
| `ADDONS_PENDING_SESSION_KEY` | No | `addons_sid` | Cache key prefix for pending add-on sessions |
| `ADDONS_CACHE_PREFIX_SESSION` | No | `sid` | Redis key prefix for add-on sessions |
| `ADDONS_CACHE_PREFIX_TRANSIT` | No | `transit` | Redis key prefix for add-on transit tokens |

### Redis, Celery and presence

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | No | `redis://redis:6379/1` | Full Redis URL used for the Django cache backend |
| `SESSION_ENGINE` | No | `django.contrib.sessions.backends.cache` | Django session storage backend |
| `CELERY_ENABLED` | No | `False` | Enable Celery for async task processing. Needed for the scheduled deletion of connection-test rooms, which does not happen without it; also makes file deletion asynchronous, which otherwise runs inline. Recording email notifications are sent synchronously and do not require Celery. |
| `CELERY_BROKER_URL` | No | `redis://redis:6379/0` | Redis URL used as Celery message broker. Defaults to the same Redis instance as the session cache. |
| `CELERY_TASK_DEFAULT_QUEUE` | No | `meet-backend` | Default Celery queue name |
| `CELERY_BROKER_TRANSPORT_OPTIONS` | No | `{}` | Extra options passed to the Celery broker transport, as a JSON dict |
| `CELERY_TASK_ALWAYS_EAGER` | No | `False` | Run Celery tasks synchronously in-process instead of dispatching them to a worker. Useful for local development without a running worker; do not enable in production. |
| `PRESENCE_CACHE_TIMEOUT` | No | `3600` | Seconds a presence entry, which records who is connected to a room, is kept without a refresh |
| `PRESENCE_CLEAR_ON_PARTICIPANT_LEFT` | No | `True` | Remove a participant's presence entry immediately when they leave, instead of waiting for the cache to expire |
| `PRESENCE_KEY_PREFIX` | No | `room_presence` | Redis key prefix for presence state |

### CORS

Standard `django-cors-headers` settings. They govern **cross-origin JavaScript requests** (`fetch`/XHR from a page on a different domain calling the API directly) - not iframe embedding, which is controlled by `X-Frame-Options`/CSP `frame-ancestors` instead.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_CORS_ALLOWED_ORIGINS` | No | `[]` | List of origins allowed to make cross-origin requests. Example: `["https://app.example.com"]` |
| `DJANGO_CORS_ALLOWED_ORIGIN_REGEXES` | No | `[]` | List of regex patterns matching allowed origins |
| `DJANGO_CORS_ALLOW_ALL_ORIGINS` | No | `False` | Allow all origins. **Do not enable in production** - use `DJANGO_CORS_ALLOWED_ORIGINS` instead. |

### Logging and monitoring

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_SENTRY_DSN` | No | -- | Sentry DSN for error tracking. Sentry's `environment` tag is derived automatically from `DJANGO_CONFIGURATION` (e.g. `production`, `demo`) - there is no separate variable to set it. |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0.0` | Fraction of transactions sampled for Sentry performance tracing (`0.0`-`1.0`) |
| `LOGGING_LEVEL_LOGGERS_ROOT` | No | `INFO` | Log level of the root logger |
| `LOGGING_LEVEL_LOGGERS_APP` | No | `INFO` | Log level of the backend's `core` loggers |
| `LOGGING_LEVEL_REQUEST_SUMMARY` | No | `WARNING` | Log level of the per-request summary logger |
| `LOGGING_SILENCED_401_PATHS` | No | `["/api/v1.0/users/me/"]` | Paths whose 401 responses are not logged |

### Metadata collector

Silently joins rooms to record participant/VAD/chat metadata for the summary service. The agent itself is configured under [Metadata collector agent](#metadata-collector-agent).

| Variable | Required | Default | Description |
|---|---|---|---|
| `METADATA_COLLECTOR_ENABLED` | No | `False` | Enable the metadata collector agent |
| `METADATA_COLLECTOR_AGENT_NAME` | No | `metadata-collector` | LiveKit agent name dispatched to rooms |
| `METADATA_COLLECTOR_OUTPUT_FOLDER` | No | `metadata` | Folder/prefix the backend reads collected metadata from. Must match the agent's `AWS_S3_OUTPUT_FOLDER`. |

### Analytics and marketing

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

### Advanced

Rarely changed.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_DATA_DIR` | No | `/data` | Directory holding local media and static files |
| `DJANGO_STORAGES_STATICFILES_BACKEND` | No | `whitenoise.storage.CompressedManifestStaticFilesStorage` | Django storage class for static files |
| `DJANGO_SILENCED_SYSTEM_CHECKS` | No | `[]` | Django system check IDs to silence |
| `DJANGO_SPECTACULAR_SETTINGS_ENABLE_DJANGO_DEPLOY_CHECK` | No | `False` | Run Django's deploy checks while generating the API schema |

---

## Summary service

Runs transcription and summaries. See [AI Transcription](../self-hosting/configuration/transcription.md) for setup. Every variable marked **Yes** must be set for the service to start, even with summaries turned off.

### Tenants

`AUTHORIZED_TENANTS` defines every Meet backend allowed to submit tasks and receive results. There is no other supported authentication mode.

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTHORIZED_TENANTS` | **Yes** | -- | JSON array of tenant configs. Each entry: `{"id": "...", "api_key": "...", "webhook_url": "...", "webhook_api_key": "...", "allowed_push_to_docs": false}`. |

Example value:
```
AUTHORIZED_TENANTS='[{"id":"meet","api_key":"<strong-random-secret>","webhook_url":"https://meet.example.com/api/v1.0/recordings/external-process-hook/","webhook_api_key":"<strong-random-secret>","allowed_push_to_docs":true}]'
```

### Storage

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_S3_ENDPOINT_URL` | **Yes** | -- | S3-compatible endpoint URL |
| `AWS_S3_ACCESS_KEY_ID` | **Yes** | -- | S3 access key |
| `AWS_S3_SECRET_ACCESS_KEY` | **Yes** | -- | S3 secret key |
| `AWS_STORAGE_BUCKET_NAME` | **Yes** | -- | S3 bucket name |
| `AWS_S3_SECURE_ACCESS` | No | `True` | Use HTTPS for S3 requests. Set to `False` for local MinIO over HTTP. |
| `AWS_S3_REGION_NAME` | No | -- | S3 region |
| `AWS_TRANSCRIPT_PATH` | No | `transcripts` | Folder/prefix used in object storage for transcript files |
| `AWS_SUMMARY_PATH` | No | `summaries` | Folder/prefix used in object storage for summary files |

### Speech-to-text (WhisperX)

| Variable | Required | Default | Description |
|---|---|---|---|
| `WHISPERX_API_KEY` | **Yes** | -- | API key for the WhisperX / OpenAI-compatible API |
| `WHISPERX_BASE_URL` | No | `https://api.openai.com/v1` | WhisperX-compatible API endpoint. Default works with the OpenAI Whisper API. Override with your self-hosted WhisperX URL (e.g., `http://whisperx:8000/v1`). |
| `WHISPERX_ASR_MODEL` | No | `whisper-1` | ASR model name. Use `whisper-1` for the OpenAI Whisper API, or a WhisperX model like `large-v3` for a self-hosted instance. |
| `WHISPERX_DEFAULT_LANGUAGE` | No | -- | ISO 639-1 language code (e.g., `fr`, `en`). When set, skips automatic language detection. |
| `WHISPERX_ALLOWED_LANGUAGES` | No | `{"en","fr","de","nl"}` | Set of accepted ISO 639-1 language codes. Requests with other codes are rejected. |
| `RECORDING_MAX_DURATION` | No | -- | Maximum recording duration in **seconds**; longer recordings are not transcribed. Separate from the backend's own `RECORDING_MAX_DURATION`, which is in milliseconds. |
| `HALLUCINATION_PATTERNS` | No | `["Vap'n'Roll Thierry"]` | Transcript substrings treated as known WhisperX hallucinations and filtered out |
| `IS_RESOLVE_SPEAKER_IDENTITIES_ENABLED` | No | `True` | Match diarized `SPEAKER_00`-style labels to real participant names using VAD metadata |
| `RESOLVE_SPEAKER_IDENTITIES_DEFAULT_OVERLAP_THRESHOLD` | No | `0.5` | Minimum overlap ratio required to attribute a speaker segment to a participant |
| `RESOLVE_SPEAKER_IDENTITIES_ENABLE_SPLIT_ON_WORDS` | No | `True` | Split segments on word boundaries when resolving overlapping speakers |
| `RESOLVE_SPEAKER_IDENTITIES_MAX_WORD_DURATION` | No | `1` | Maximum plausible word duration, in seconds, used as a sanity bound during resolution |

### Summaries (LLM)

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_BASE_URL` | **Yes** | -- | LLM API endpoint (OpenAI-compatible) |
| `LLM_API_KEY` | **Yes** | -- | LLM API key |
| `LLM_MODEL` | **Yes** | -- | LLM model identifier (e.g., `gpt-4o`) |
| `IS_SUMMARY_ENABLED` | No | `True` | Write a summary in addition to the transcript. `False` produces transcripts only. |

### LaSuite Docs

| Variable | Required | Default | Description |
|---|---|---|---|
| `IS_LASUITE_DOCS_INTEGRATION_ENABLED` | No | `False` | Push completed transcripts to a LaSuite Docs instance, for tenants with `allowed_push_to_docs` |
| `LASUITE_DOCS_BASE_URL` | If enabled | `https://example.com` | Base URL of the LaSuite Docs instance |
| `LASUITE_DOCS_SERVER_TO_SERVER_API_KEY` | If enabled | `NO_API_KEY` | Server-to-server API key for authenticating with LaSuite Docs |

### Queues and webhooks

| Variable | Required | Default | Description |
|---|---|---|---|
| `CELERY_BROKER_URL` | No | `redis://redis/0` | Celery broker URL. Note: the summary service default omits the port (`redis/0`), unlike the Django backend which uses `redis:6379/0`. |
| `CELERY_RESULT_BACKEND` | No | `redis://redis/0` | Celery result backend URL |
| `CELERY_MAX_RETRIES` | No | `1` | Maximum retries for a failed Celery task |
| `TRANSCRIBE_QUEUE_V2` | No | `transcribe-queue-v2` | Celery queue name for transcription tasks |
| `SUMMARIZE_QUEUE_V2` | No | `summarize-queue-v2` | Celery queue name for summarization tasks |
| `CALL_WEBHOOK_QUEUE_V2` | No | `call-webhook-queue-v2` | Celery queue name for result-callback tasks |
| `WEBHOOK_MAX_RETRIES` | No | `2` | Maximum retries for a failed result callback to the backend |
| `WEBHOOK_STATUS_FORCELIST` | No | `[502, 503, 504]` | HTTP status codes that trigger a retry |
| `WEBHOOK_BACKOFF_FACTOR` | No | `0.1` | Exponential backoff factor between retries |
| `TASK_TRACKER_REDIS_URL` | No | `redis://redis/0` | Redis URL used to track task progress/state |
| `TASK_TRACKER_PREFIX` | No | `task_metadata:` | Redis key prefix for task tracker entries |

### Monitoring

| Variable | Required | Default | Description |
|---|---|---|---|
| `SENTRY_IS_ENABLED` | No | `False` | Send errors to Sentry |
| `SENTRY_DSN` | If enabled | -- | Sentry DSN |
| `POSTHOG_ENABLED` | No | `False` | Send transcription and summary events to PostHog |
| `POSTHOG_API_KEY` | If enabled | -- | PostHog project API key |
| `POSTHOG_API_HOST` | No | `https://eu.i.posthog.com` | PostHog host |
| `LANGFUSE_ENABLED` | No | `False` | Trace LLM calls in Langfuse |
| `LANGFUSE_HOST` | If enabled | -- | Langfuse host |
| `LANGFUSE_PUBLIC_KEY` | If enabled | -- | Langfuse public key |
| `LANGFUSE_SECRET_KEY` | If enabled | -- | Langfuse secret key |
| `LANGFUSE_ENVIRONMENT` | No | `development` | Environment name reported to Langfuse |

---

## Agents

The LiveKit agents run as their own containers. Both read these:

| Variable | Required | Default | Description |
|---|---|---|---|
| `LIVEKIT_URL` | **Yes** | -- | LiveKit server WebSocket URL |
| `LIVEKIT_API_KEY` | **Yes** | -- | LiveKit API key |
| `LIVEKIT_API_SECRET` | **Yes** | -- | LiveKit API secret |
| `SENTRY_DSN` | No | -- | Sentry DSN. Unset, errors are not sent. |
| `SENTRY_ENVIRONMENT` | No | -- | Environment name reported to Sentry |

### Subtitles agent

Provides real-time subtitles. See [Real-time Subtitles](../self-hosting/configuration/subtitles.md) for setup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `STT_PROVIDER` | No | `deepgram` | Speech-to-text provider: `deepgram`, `kyutai`, or `voxtral-vllm` |
| `TRANSCRIBER_AGENT_NAME` | No | `multi-user-transcriber` | Agent name for dispatch. Must match the backend's `ROOM_SUBTITLE_AGENT_NAME`. |
| `ENABLE_SILERO_VAD` | No | `true` | Voice activity detection, for better caption timing |

Then the variables of the provider `STT_PROVIDER` names:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DEEPGRAM_API_KEY` | For Deepgram | -- | Deepgram API key |
| `DEEPGRAM_STT_MODEL` | No | `nova-3` | Deepgram model |
| `DEEPGRAM_STT_LANGUAGE` | No | `multi` | Language code, or `multi` for automatic detection |
| `KYUTAI_STT_BASE_URL` | For Kyutai | -- | Kyutai service base URL |
| `KYUTAI_API_KEY` | For Kyutai | -- | Kyutai API key |
| `VOXTRAL_VLLM_BASE_URL` | No | `ws://127.0.0.1:8000/v1/realtime` | vLLM realtime WebSocket endpoint |
| `VOXTRAL_VLLM_MODEL` | No | `mistralai/Voxtral-Mini-4B-Realtime-2602` | Model served by vLLM |
| `VOXTRAL_VLLM_API_KEY` | No | -- | Bearer token, if the endpoint requires one |
| `VOXTRAL_VLLM_TARGET_STREAMING_DELAY_MS` | No | server default | Target streaming delay |

### Metadata collector agent

Records participant, voice-activity and chat metadata for the summary service, when the backend's `METADATA_COLLECTOR_ENABLED` is on.

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_S3_ENDPOINT_URL` | **Yes** | -- | S3-compatible endpoint as `host:port`, e.g. `minio:9000`. A URL with `http://` is refused, unlike the backend's. |
| `AWS_S3_ACCESS_KEY_ID` | **Yes** | -- | S3 access key |
| `AWS_S3_SECRET_ACCESS_KEY` | **Yes** | -- | S3 secret key |
| `AWS_STORAGE_BUCKET_NAME` | **Yes** | -- | S3 bucket the metadata is written to |
| `AWS_S3_SECURE_ACCESS` | No | `False` | Use HTTPS for S3 requests. Note the default differs from the summary service's. |
| `AWS_S3_OUTPUT_FOLDER` | No | `metadata` | Folder/prefix the metadata is written under. Must match the backend's `METADATA_COLLECTOR_OUTPUT_FOLDER`. |
| `METADATA_COLLECTOR_AGENT_NAME` | No | `metadata-collector` | Agent name for dispatch. Must match the backend's `METADATA_COLLECTOR_AGENT_NAME`. |
