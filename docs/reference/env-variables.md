# Environment Variables

Look up each environment variable a Meet server reads, required or optional, with its default and its meaning.

| Service | Where the variables go |
|---|---|
| [Backend](#backend) | `env.d/common` with Docker Compose, `backend.envVars` in the Helm chart |
| [Summary service](#summary-service) | `env.d/summary`, with transcription only |
| [Agents](#agents) | Each agent container's environment, with real-time subtitles or the metadata collector only |

Set `<NAME>_FILE` to a file's path to read a backend secret from that file, the way Docker and Kubernetes mount secrets.

It works for every variable holding a single secret, such as [`DJANGO_SECRET_KEY`](#DJANGO_SECRET_KEY), [`DB_PASSWORD`](#DB_PASSWORD) or [`OIDC_RP_CLIENT_SECRET`](#OIDC_RP_CLIENT_SECRET), and the file wins over `<NAME>`.

## Start here

A production backend does not start, or no one can log in, without these:

| Variable | What to set |
|---|---|
| [`DJANGO_CONFIGURATION`](#DJANGO_CONFIGURATION) | `Production` on a server, `Development` or `Test` locally. The default needs development-only packages the published image does not include. |
| [`DJANGO_SECRET_KEY`](#DJANGO_SECRET_KEY) | 50+ character random string for cryptographic signing. Rotating it signs everyone out |
| [`DJANGO_ALLOWED_HOSTS`](#DJANGO_ALLOWED_HOSTS) | Comma-separated list of allowed hostnames |
| [`DB_HOST`](#DB_HOST) | PostgreSQL hostname |
| [`DB_NAME`](#DB_NAME) | Database name |
| [`DB_USER`](#DB_USER) | Database user |
| [`DB_PASSWORD`](#DB_PASSWORD) | Database password |
| [`DATABASE_URL`](#DATABASE_URL) | Full database URL, such as `postgres://user:pass@host:5432/name`, in place of the four `DB_` variables |
| [`OIDC_RP_CLIENT_SECRET`](#OIDC_RP_CLIENT_SECRET) | OIDC client secret |
| [`OIDC_OP_JWKS_ENDPOINT`](#OIDC_OP_JWKS_ENDPOINT) | OIDC JWKS URL |
| [`OIDC_OP_AUTHORIZATION_ENDPOINT`](#OIDC_OP_AUTHORIZATION_ENDPOINT) | OIDC authorization URL |
| [`OIDC_OP_TOKEN_ENDPOINT`](#OIDC_OP_TOKEN_ENDPOINT) | OIDC token exchange URL |
| [`OIDC_OP_USER_ENDPOINT`](#OIDC_OP_USER_ENDPOINT) | OIDC userinfo URL |
| [`LIVEKIT_API_KEY`](#LIVEKIT_API_KEY) | LiveKit API key. Must match a key under `keys:` in `livekit-server.yaml`, or `livekit.keys` in `livekit-values.yaml` on Kubernetes |
| [`LIVEKIT_API_SECRET`](#LIVEKIT_API_SECRET) | LiveKit API secret, the value of that key under `keys:`. 32+ characters: anyone holding it can forge tokens for your LiveKit server, so rotate it at once if it leaks |
| [`LIVEKIT_API_URL`](#LIVEKIT_API_URL) | **Public** LiveKit URL, e.g. `https://livekit.example.com`. Browsers receive it and the backend calls it, so it cannot be the Docker-internal address. |

Everything else has a working default. The optional features are off until
their switch is set:

- [`RECORDING_ENABLE`](#RECORDING_ENABLE), [`ROOM_SUBTITLE_ENABLED`](#ROOM_SUBTITLE_ENABLED), [`ROOM_TELEPHONY_ENABLED`](#ROOM_TELEPHONY_ENABLED), [`FILE_UPLOAD_ENABLED`](#FILE_UPLOAD_ENABLED): one each
- the external API: [`EXTERNAL_API_ENABLED`](#EXTERNAL_API_ENABLED), plus [`APPLICATION_ENABLED`](#APPLICATION_ENABLED) for application tokens
- add-ons: [`ADDONS_ENABLED`](#ADDONS_ENABLED) and [`EXTERNAL_API_ENABLED`](#EXTERNAL_API_ENABLED)
- Meet in another application's iframe: [`USER_ACCESS_TOKEN_ENABLED`](#USER_ACCESS_TOKEN_ENABLED) and the external API
- the room purge: [`ROOM_INACTIVITY_DELETION_DAYS`](#ROOM_INACTIVITY_DELETION_DAYS) or [`ROOM_DELETED_RETENTION_DAYS`](#ROOM_DELETED_RETENTION_DAYS)

## Backend

### Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_SETTINGS_MODULE`{#DJANGO_SETTINGS_MODULE} | No | `meet.settings` | The only value. `wsgi.py`, `manage.py` and the Celery app set it when it is missing. |
| `DJANGO_CONFIGURATION`{#DJANGO_CONFIGURATION} | **Yes** | `Development` | `Production` on a server, `Development` or `Test` locally. The default needs development-only packages the published image does not include. |
| `DJANGO_SECRET_KEY`{#DJANGO_SECRET_KEY} | **Yes** | -- | 50+ character random string for cryptographic signing. Rotating it signs everyone out |
| `DJANGO_ALLOWED_HOSTS`{#DJANGO_ALLOWED_HOSTS} | **Yes** | -- | Comma-separated list of allowed hostnames |
| `DJANGO_CSRF_TRUSTED_ORIGINS`{#DJANGO_CSRF_TRUSTED_ORIGINS} | No | -- | Comma-separated HTTPS origins allowed to send form posts from another domain. Requests from Meet's own domain, through the reverse proxy, need nothing here |
| `NUM_PROXIES`{#NUM_PROXIES} | No | `1` | Proxies in front of the backend that append to `X-Forwarded-For`; rate limits and audit events read the client's address that many entries from the right. If it is too low, every client gets a proxy's address; if it is too high, a client can pick its own. The Docker Compose template sets `2`: the reverse proxy and the frontend's nginx |
| `DJANGO_LANGUAGE_CODE`{#DJANGO_LANGUAGE_CODE} | No | `en-us` | Default language code for the Django backend |
| `DJANGO_LANGUAGES`{#DJANGO_LANGUAGES} | No | English, French, Dutch, German, Spanish | Languages a user's profile can store, as `code,name` pairs separated by `;`, e.g. `en-us,English;fr-fr,French`. The interface's language picker keeps its own fixed list. |
| `SESSION_COOKIE_AGE`{#SESSION_COOKIE_AGE} | No | `43200` | Session cookie lifetime in seconds, 12 hours by default |
| `DJANGO_SUPERUSER_EMAIL`{#DJANGO_SUPERUSER_EMAIL} | Helm only | -- | Email of the admin account the Helm chart's `createsuperuser` Job creates |
| `DJANGO_SUPERUSER_PASSWORD`{#DJANGO_SUPERUSER_PASSWORD} | Helm only | -- | That account's password |

### Database

[`DATABASE_URL`](#DATABASE_URL) takes precedence over the `DB_*` variables. The `DB_*` defaults
are insecure values meant for local development: override every one of them in
production.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_HOST`{#DB_HOST} | **In production** | `localhost` | PostgreSQL hostname |
| `DB_NAME`{#DB_NAME} | **In production** | `meet` | Database name |
| `DB_USER`{#DB_USER} | **In production** | `dinum` | Database user |
| `DB_PASSWORD`{#DB_PASSWORD} | **In production** | `pass` | Database password |
| `DATABASE_URL`{#DATABASE_URL} | No | -- | Full database URL, such as `postgres://user:pass@host:5432/name`, in place of the `DB_*` variables |
| `DB_PORT`{#DB_PORT} | No | `5432` | PostgreSQL port |
| `DB_ENGINE`{#DB_ENGINE} | No | `django.db.backends.postgresql` | Django database backend |
| `DB_PSYCOPG_POOL_ENABLED`{#DB_PSYCOPG_POOL_ENABLED} | No | `False` | Keep a pool of open connections in each backend process instead of opening one per request. The backend refuses to start with it on and an engine other than PostgreSQL. |
| `DB_PSYCOPG_POOL_MIN_SIZE`{#DB_PSYCOPG_POOL_MIN_SIZE} | No | `1` | Connections each pool keeps open. Must not exceed [`DB_PSYCOPG_POOL_MAX_SIZE`](#DB_PSYCOPG_POOL_MAX_SIZE). |
| `DB_PSYCOPG_POOL_MAX_SIZE`{#DB_PSYCOPG_POOL_MAX_SIZE} | No | `3` | Most connections each pool opens |
| `DB_PSYCOPG_POOL_TIMEOUT`{#DB_PSYCOPG_POOL_TIMEOUT} | No | `30.0` | Seconds a request waits for a free connection before failing |
| `DB_PSYCOPG_POOL_MAX_IDLE`{#DB_PSYCOPG_POOL_MAX_IDLE} | No | `600.0` | Seconds an unused connection stays open before the pool closes it |

### Redis, Celery and presence

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL`{#REDIS_URL} | No | `redis://redis:6379/1` | Full Redis URL used for the Django cache backend |
| `SESSION_ENGINE`{#SESSION_ENGINE} | No | `django.contrib.sessions.backends.cache` | Django session storage backend |
| `CELERY_ENABLED`{#CELERY_ENABLED} | No | `False` | Run async tasks on a Celery worker, which retries a failed email up to five times. Without it, file deletion and recording emails run inline with no retry, and nothing closes a connection-test room whose participant stays past the token TTL. |
| `CELERY_BROKER_URL`{#CELERY_BROKER_URL} | No | `redis://redis:6379/0` | Redis URL of Celery's message broker |
| `CELERY_TASK_DEFAULT_QUEUE`{#CELERY_TASK_DEFAULT_QUEUE} | No | `meet-backend` | Default Celery queue name |
| `CELERY_BROKER_TRANSPORT_OPTIONS`{#CELERY_BROKER_TRANSPORT_OPTIONS} | No | `{}` | Extra options passed to the Celery broker transport, as a JSON dict |
| `PRESENCE_CACHE_TIMEOUT`{#PRESENCE_CACHE_TIMEOUT} | No | `3600` | Seconds a presence entry, which records who is connected to a room, is kept without a refresh |
| `PRESENCE_CLEAR_ON_PARTICIPANT_LEFT`{#PRESENCE_CLEAR_ON_PARTICIPANT_LEFT} | No | `True` | Remove a participant's presence entry immediately when they leave, instead of waiting for the cache to expire |

### Authentication (OIDC)

The browser login. See [SSO & Authentication](../self-hosting/configuration/sso.md) for per-provider values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_RP_CLIENT_SECRET`{#OIDC_RP_CLIENT_SECRET} | **Yes** | -- | OIDC client secret |
| `OIDC_OP_JWKS_ENDPOINT`{#OIDC_OP_JWKS_ENDPOINT} | **Yes** | -- | OIDC JWKS URL |
| `OIDC_OP_AUTHORIZATION_ENDPOINT`{#OIDC_OP_AUTHORIZATION_ENDPOINT} | **Yes** | -- | OIDC authorization URL |
| `OIDC_OP_TOKEN_ENDPOINT`{#OIDC_OP_TOKEN_ENDPOINT} | **Yes** | -- | OIDC token exchange URL |
| `OIDC_OP_USER_ENDPOINT`{#OIDC_OP_USER_ENDPOINT} | **Yes** | -- | OIDC userinfo URL |
| `OIDC_RP_CLIENT_ID`{#OIDC_RP_CLIENT_ID} | No | `meet` | OIDC client ID |
| `OIDC_OP_LOGOUT_ENDPOINT`{#OIDC_OP_LOGOUT_ENDPOINT} | No | -- | OIDC logout URL |
| `OIDC_OP_URL`{#OIDC_OP_URL} | No | -- | Issuer URL of the OIDC provider, e.g. `https://auth.example.com/realms/meet`. Checked as the `iss` of back-channel logout tokens, and required for the [user's OIDC token](#external-api-oidc-resource-server) mode. It does not replace the `OIDC_OP_*_ENDPOINT` variables |
| `OIDC_RP_SIGN_ALGO`{#OIDC_RP_SIGN_ALGO} | No | `RS256` | Token signing algorithm |
| `OIDC_RP_SCOPES`{#OIDC_RP_SCOPES} | No | `openid email` | Requested OIDC scopes |
| `OIDC_REDIRECT_REQUIRE_HTTPS`{#OIDC_REDIRECT_REQUIRE_HTTPS} | No | `False` | Require HTTPS for OIDC redirect URIs. **Recommended in production.** |
| `OIDC_USE_PKCE`{#OIDC_USE_PKCE} | No | `False` | Enable PKCE, Proof Key for Code Exchange. **Recommended in production.** |
| `OIDC_PKCE_CODE_CHALLENGE_METHOD`{#OIDC_PKCE_CODE_CHALLENGE_METHOD} | No | `S256` | PKCE challenge method. Keep the default |
| `OIDC_PKCE_CODE_VERIFIER_SIZE`{#OIDC_PKCE_CODE_VERIFIER_SIZE} | No | `64` | Length of the random PKCE code verifier, from 43 to 128 characters |
| `OIDC_CREATE_USER`{#OIDC_CREATE_USER} | No | `True` | Automatically create a local user if none exists on first login |
| `OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION`{#OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION} | No | `False` | Fall back to matching users by email when no user has the `sub` the provider sent. Enable only if emails are unique across your provider. |
| `OIDC_USER_SUB_FIELD_IMMUTABLE`{#OIDC_USER_SUB_FIELD_IMMUTABLE} | No | `True` | Prevent the `sub` claim from being changed once set on a user. Disable with care: this exists to stop account takeover via `sub` reassignment. |
| `OIDC_OP_USER_ENDPOINT_FORMAT`{#OIDC_OP_USER_ENDPOINT_FORMAT} | No | `AUTO` | Format of the userinfo response: `AUTO` to detect it, `JWT` or `JSON` |
| `OIDC_OP_INTROSPECTION_ENDPOINT`{#OIDC_OP_INTROSPECTION_ENDPOINT} | No | -- | OIDC token introspection URL |
| `OIDC_REDIRECT_ALLOWED_HOSTS`{#OIDC_REDIRECT_ALLOWED_HOSTS} | No | `[]` | Allowed hosts for OIDC redirects |
| `OIDC_AUTH_REQUEST_EXTRA_PARAMS`{#OIDC_AUTH_REQUEST_EXTRA_PARAMS} | No | `{}` | Extra parameters included in OIDC authentication requests, such as `{"acr_values": "eidas1"}` |
| `ALLOW_LOGOUT_GET_METHOD`{#ALLOW_LOGOUT_GET_METHOD} | No | `True` | Allow logout via HTTP GET. POST is more secure; disable if your provider supports POST logout. |
| `LOGIN_REDIRECT_URL`{#LOGIN_REDIRECT_URL} | No | -- | Redirect after successful login |
| `LOGIN_REDIRECT_URL_FAILURE`{#LOGIN_REDIRECT_URL_FAILURE} | No | -- | Redirect after failed login |
| `LOGOUT_REDIRECT_URL`{#LOGOUT_REDIRECT_URL} | No | -- | Redirect after logout |
| `OIDC_USERINFO_FULLNAME_FIELDS`{#OIDC_USERINFO_FULLNAME_FIELDS} | No | `["given_name", "usual_name"]` | OIDC claims used to build the user's full name |
| `OIDC_USERINFO_SHORTNAME_FIELD`{#OIDC_USERINFO_SHORTNAME_FIELD} | No | `given_name` | OIDC claim used for the user's short/display name |
| `OIDC_USERINFO_ESSENTIAL_CLAIMS`{#OIDC_USERINFO_ESSENTIAL_CLAIMS} | No | `[]` | Claims that must be present in the userinfo response |
| `OIDC_VERIFY_SSL`{#OIDC_VERIFY_SSL} | No | `True` | Verify SSL certificates when contacting the OIDC provider |
| `OIDC_USE_NONCE`{#OIDC_USE_NONCE} | No | `True` | Use nonce to prevent replay attacks |
| `OIDC_STORE_ID_TOKEN`{#OIDC_STORE_ID_TOKEN} | No | `True` | Store the ID token returned by the OIDC provider |
| `OIDC_REDIRECT_FIELD_NAME`{#OIDC_REDIRECT_FIELD_NAME} | No | `returnTo` | Query parameter name used for redirect after login |
| `OIDC_TIMEOUT`{#OIDC_TIMEOUT} | No | `5` | Timeout in seconds for HTTP requests to the OIDC provider |
| `OIDC_PROXY`{#OIDC_PROXY} | No | -- | Proxy URL used for requests to the OIDC provider |

### LiveKit

| Variable | Required | Default | Description |
|---|---|---|---|
| `LIVEKIT_API_KEY`{#LIVEKIT_API_KEY} | **Yes** | -- | LiveKit API key. Must match a key under `keys:` in `livekit-server.yaml`, or `livekit.keys` in `livekit-values.yaml` on Kubernetes |
| `LIVEKIT_API_SECRET`{#LIVEKIT_API_SECRET} | **Yes** | -- | LiveKit API secret, the value of that key under `keys:`. 32+ characters: anyone holding it can forge tokens for your LiveKit server, so rotate it at once if it leaks |
| `LIVEKIT_API_URL`{#LIVEKIT_API_URL} | **Yes** | -- | **Public** LiveKit URL, e.g. `https://livekit.example.com`. Browsers receive it and the backend calls it, so it cannot be the Docker-internal address. |
| `LIVEKIT_DEFAULT_VIDEO_CODEC`{#LIVEKIT_DEFAULT_VIDEO_CODEC} | No | `vp9` | Default video codec. One of `vp8`, `h264`, `vp9`, `av1`. |
| `LIVEKIT_DEFAULT_SOURCES`{#LIVEKIT_DEFAULT_SOURCES} | No | `["camera","microphone","screen_share","screen_share_audio"]` | Media sources participants can publish by default |
| `LIVEKIT_FORCE_WSS_PROTOCOL`{#LIVEKIT_FORCE_WSS_PROTOCOL} | No | `False` | Force WSS protocol in the WebSocket URL returned to clients. Enable for Firefox before 124 and Chrome before 125, where HTTPS URLs in `WebSocket()` may fail. |
| `LIVEKIT_ENABLE_FIREFOX_PROXY_WORKAROUND`{#LIVEKIT_ENABLE_FIREFOX_PROXY_WORKAROUND} | No | `False` | For Firefox behind proxies where the WebSocket fails to open: opens a throwaway WebSocket first. |
| `LIVEKIT_VERIFY_SSL`{#LIVEKIT_VERIFY_SSL} | No | `True` | Verify SSL certificate for LiveKit API calls |
| `LIVEKIT_API_TIMEOUT_SECONDS`{#LIVEKIT_API_TIMEOUT_SECONDS} | No | `10` | Seconds the backend waits for a LiveKit API call, including its response, before giving up |
| `LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX`{#LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX} | No | -- | Regex to filter LiveKit webhook events by room name. Only matching events are processed. |
| `AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME`{#AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME} | No | `True` | Allow authenticated participants to change their display name in a room |
| `PARTICIPANT_FORBIDDEN_PERMISSION_FIELDS`{#PARTICIPANT_FORBIDDEN_PERMISSION_FIELDS} | No | `["hidden", "recorder", "agent"]` | LiveKit participant permission fields that can never be granted through the API |

### Rooms and waiting room

| Variable | Required | Default | Description |
|---|---|---|---|
| `RESOURCE_DEFAULT_ACCESS_LEVEL`{#RESOURCE_DEFAULT_ACCESS_LEVEL} | No | `public` | Access level of a new room whose creator picked none under Settings → Rooms. Values: `public`, `trusted`, `restricted`, see [Room access levels](../user/features-controls.md#access-levels). |
| `ALLOW_UNREGISTERED_ROOMS`{#ALLOW_UNREGISTERED_ROOMS} | No | `True` | Let anyone join a meeting under a room code that matches no room. With `False`, an anonymous visitor gets a 404, and a signed-in one creates the room, see [Unauthenticated access](../self-hosting/configuration/sso.md#unauthenticated-access) |
| `ALLOW_UNSECURE_USER_LISTING`{#ALLOW_UNSECURE_USER_LISTING} | No | `False` | Lets any signed-in user list users and search them by email, with `GET /api/v1.0/users/?q=`. When it is off, the list is empty |
| `LOBBY_WAITING_TIMEOUT`{#LOBBY_WAITING_TIMEOUT} | No | `6` | Seconds a waiting request survives without a status poll; the waiting page's polling keeps it alive |
| `LOBBY_DENIED_TIMEOUT`{#LOBBY_DENIED_TIMEOUT} | No | `5` | Seconds before a denied participant may re-request entry |
| `LOBBY_ACCEPTED_TIMEOUT`{#LOBBY_ACCEPTED_TIMEOUT} | No | `21600` | Seconds an admitted participant has to join before the admission expires: 6 hours |
| `ROOM_CREATION_THROTTLE_RATES`{#ROOM_CREATION_THROTTLE_RATES} | No | `50/minute` | Rooms one signed-in user may create through `/api/v1.0/rooms/` |
| `ROOM_CREATION_DAILY_THROTTLE_RATES`{#ROOM_CREATION_DAILY_THROTTLE_RATES} | No | `1000/day` | The same, over a day |
| `REQUEST_ENTRY_THROTTLE_RATES`{#REQUEST_ENTRY_THROTTLE_RATES} | No | `150/minute` | Rate limit for room entry requests |
| `CREATION_CALLBACK_THROTTLE_RATES`{#CREATION_CALLBACK_THROTTLE_RATES} | No | `600/minute` | Rate limit for creation callback requests |
| `ROOM_CREATION_CALLBACK_CACHE_TIMEOUT`{#ROOM_CREATION_CALLBACK_CACHE_TIMEOUT} | No | `600` | Seconds to cache room creation callbacks, 10 minutes by default |

### Room purge

The `purge_inactive_rooms` command deletes rooms for good once one of these is set. [Room purge](../self-hosting/configuration/room-purge.md) covers scheduling it, what is kept and what a purge deletes.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ROOM_INACTIVITY_DELETION_DAYS`{#ROOM_INACTIVITY_DELETION_DAYS} | No | -- | Days without a start after which a room is purged. A room never started counts from its creation. |
| `ROOM_DELETED_RETENTION_DAYS`{#ROOM_DELETED_RETENTION_DAYS} | No | -- | Days a room deleted by its owner is kept before it is purged |

### Email

Room invitations and recording download links need it, see [Email (SMTP)](../self-hosting/configuration/email.md).

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_EMAIL_HOST`{#DJANGO_EMAIL_HOST} | For email | -- | SMTP server hostname |
| `DJANGO_EMAIL_PORT`{#DJANGO_EMAIL_PORT} | For email | -- | SMTP port |
| `DJANGO_EMAIL_HOST_USER`{#DJANGO_EMAIL_HOST_USER} | No | -- | SMTP username |
| `DJANGO_EMAIL_HOST_PASSWORD`{#DJANGO_EMAIL_HOST_PASSWORD} | No | -- | SMTP password |
| `DJANGO_EMAIL_USE_TLS`{#DJANGO_EMAIL_USE_TLS} | No | `False` | Enable STARTTLS |
| `DJANGO_EMAIL_USE_SSL`{#DJANGO_EMAIL_USE_SSL} | No | `False` | Enable SSL. Set either this or [`DJANGO_EMAIL_USE_TLS`](#DJANGO_EMAIL_USE_TLS), never both |
| `DJANGO_EMAIL_TIMEOUT`{#DJANGO_EMAIL_TIMEOUT} | No | `30` | Seconds to wait for the SMTP server before giving up |
| `DJANGO_EMAIL_FROM`{#DJANGO_EMAIL_FROM} | No | `from@example.com` | From address for outgoing emails. The default is a placeholder: override it in production so recipients and SPF and DKIM checks see your real domain. |
| `DJANGO_EMAIL_APP_BASE_URL`{#DJANGO_EMAIL_APP_BASE_URL} | For invitations | -- | Base URL of the Meet frontend, used in email links. If it is unset, invitation links read `None/<room code>`. |
| `DJANGO_EMAIL_BRAND_NAME`{#DJANGO_EMAIL_BRAND_NAME} | No | -- | Brand name in email templates |
| `DJANGO_EMAIL_LOGO_IMG`{#DJANGO_EMAIL_LOGO_IMG} | No | -- | Logo URL for email templates |
| `DJANGO_EMAIL_SUPPORT_EMAIL`{#DJANGO_EMAIL_SUPPORT_EMAIL} | No | -- | Support contact address shown in email templates |
| `DJANGO_EMAIL_DOMAIN`{#DJANGO_EMAIL_DOMAIN} | For invitations | -- | Domain shown in email templates |
| `DJANGO_EMAIL_BACKEND`{#DJANGO_EMAIL_BACKEND} | No | `django.core.mail.backends.smtp.EmailBackend` | Django email backend class |

### Object storage (S3)

Any S3-compatible storage works. Required for recording and custom virtual backgrounds.

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_S3_ENDPOINT_URL`{#AWS_S3_ENDPOINT_URL} | For recording | -- | S3-compatible endpoint URL, with its scheme, e.g. `http://garage:9000` |
| `AWS_S3_ACCESS_KEY_ID`{#AWS_S3_ACCESS_KEY_ID} | For recording | -- | S3 access key |
| `AWS_S3_SECRET_ACCESS_KEY`{#AWS_S3_SECRET_ACCESS_KEY} | For recording | -- | S3 secret key |
| `AWS_STORAGE_BUCKET_NAME`{#AWS_STORAGE_BUCKET_NAME} | No | `meet-media-storage` | S3 bucket for media files |
| `AWS_S3_REGION_NAME`{#AWS_S3_REGION_NAME} | No | -- | S3 region. Most S3-compatible stores require one: `garage` for the Garage example, or your provider's region. |
| `AWS_S3_SIGNATURE_VERSION`{#AWS_S3_SIGNATURE_VERSION} | No | `s3v4` | S3 request signature version |
| `AWS_S3_UPLOAD_POLICY_EXPIRATION`{#AWS_S3_UPLOAD_POLICY_EXPIRATION} | No | `60` | Seconds a signed upload URL stays valid |
| `AWS_S3_DOMAIN_REPLACE`{#AWS_S3_DOMAIN_REPLACE} | No | -- | Replace the storage domain in generated URLs, to serve media through a CDN or a reverse-proxy path instead of the raw S3 endpoint |

### Recording

See [Recording](../self-hosting/configuration/recording.md) for setup, and [Configuring recording encoding](../self-hosting/configuration/recording.md#configuring-recording-encoding) for what the `RECORDING_ENCODING_*` values become in LiveKit Egress.

| Variable | Required | Default | Description |
|---|---|---|---|
| `RECORDING_ENABLE`{#RECORDING_ENABLE} | For recording | `False` | Enable recording functionality. Must be `True` to show the record button in meetings. |
| `RECORDING_DOWNLOAD_BASE_URL`{#RECORDING_DOWNLOAD_BASE_URL} | For recording | -- | Base URL for recording download notification links. **Must include the `/recording` path**: `https://meet.example.com/recording`, see [Troubleshooting](troubleshooting.md#recording-download-link-shows-verify-your-meeting-code). |
| `RECORDING_AUTHENTICATED_PARTICIPANTS_ENABLED`{#RECORDING_AUTHENTICATED_PARTICIPANTS_ENABLED} | No | `True` | Let any signed-in participant connected to a `public` or `trusted` room start and stop its recordings. `False` keeps that to the room's administrators and owners. |
| `RECORDING_EXPIRATION_DAYS`{#RECORDING_EXPIRATION_DAYS} | No | -- | Days after which Meet shows a recording as expired, in its page and email. Meet deletes no file: set a bucket lifecycle rule with the same delay. If it is unset, recordings never expire |
| `RECORDING_MAX_DURATION`{#RECORDING_MAX_DURATION} | No | -- | Recording limit in milliseconds, shown to users. Meet does not enforce it: set the same limit in LiveKit Egress. Unset means no limit |
| `RECORDING_OUTPUT_FOLDER`{#RECORDING_OUTPUT_FOLDER} | No | `recordings` | Folder/prefix used in S3 storage for recording files |
| `MEDIA_AUTH_ORIGINAL_URL_HEADER`{#MEDIA_AUTH_ORIGINAL_URL_HEADER} | No | `HTTP_X_ORIGINAL_URL` | Request header the reverse proxy uses to pass the original download URL to the backend's media-auth check. Traefik's ForwardAuth sends `X-Forwarded-Uri`: set `HTTP_X_FORWARDED_URI`. |
| `START_RECORDING_THROTTLE_RATES`{#START_RECORDING_THROTTLE_RATES} | No | `10/minute` | Recordings one user may start |
| `START_RECORDING_DAILY_THROTTLE_RATES`{#START_RECORDING_DAILY_THROTTLE_RATES} | No | `100/day` | The same, over a day |
| `RECORDING_ENCODING_DEFAULT_RESOLUTION`{#RECORDING_ENCODING_DEFAULT_RESOLUTION} | No | `720p` | Resolution used when a screen recording request names none; a key of [`RECORDING_ENCODING_AVAILABLE_RESOLUTIONS`](#RECORDING_ENCODING_AVAILABLE_RESOLUTIONS). When this or the default profile is empty, LiveKit's built-in H264_720P_30 preset applies instead, and the backend warns at start. |
| `RECORDING_ENCODING_DEFAULT_PROFILE`{#RECORDING_ENCODING_DEFAULT_PROFILE} | No | `full` | Frame rate and bitrate used when a screen recording request names no profile; a key of [`RECORDING_ENCODING_AVAILABLE_PROFILES`](#RECORDING_ENCODING_AVAILABLE_PROFILES) |
| `RECORDING_CUSTOM_ENCODING_ENABLED`{#RECORDING_CUSTOM_ENCODING_ENABLED} | No | `False` | Let the start-recording request pick a resolution and profile from the available ones. With `False`, a request that names one gets 400. |
| `RECORDING_ENCODING_AVAILABLE_RESOLUTIONS`{#RECORDING_ENCODING_AVAILABLE_RESOLUTIONS} | No | `540p`, `720p`, `1080p` | Resolutions by name, as a one-line dict: `{"540p": {"width": 960, "height": 540}, "720p": {"width": 1280, "height": 720}, "1080p": {"width": 1920, "height": 1080}}` |
| `RECORDING_ENCODING_AVAILABLE_PROFILES`{#RECORDING_ENCODING_AVAILABLE_PROFILES} | No | `talking_heads`, `text`, `mixed`, `full` | Profiles by name, each a frame rate and a video bitrate in kbps for every resolution, as a one-line dict. The built-in values are in [Configuring recording encoding](../self-hosting/configuration/recording.md#configuring-recording-encoding). The backend refuses to start unless each profile has a bitrate for exactly the resolutions of [`RECORDING_ENCODING_AVAILABLE_RESOLUTIONS`](#RECORDING_ENCODING_AVAILABLE_RESOLUTIONS). |
| `RECORDING_ENCODING_AUDIO_BITRATE_KBPS`{#RECORDING_ENCODING_AUDIO_BITRATE_KBPS} | No | `128` | AAC audio bitrate in kbps |
| `RECORDING_ENCODING_KEY_FRAME_INTERVAL_S`{#RECORDING_ENCODING_KEY_FRAME_INTERVAL_S} | No | `0.0` | Key frame interval in seconds. `0.0` leaves it to LiveKit Egress. |
| `SCREEN_RECORDING_BASE_URL`{#SCREEN_RECORDING_BASE_URL} | No | -- | **Deprecated.** Use [`RECORDING_DOWNLOAD_BASE_URL`](#RECORDING_DOWNLOAD_BASE_URL) instead. Still accepted but logs a warning. |

### Transcription

The backend's connection to the [summary service](#summary-service). See [AI Transcription](../self-hosting/configuration/transcription.md) for setup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUMMARY_SERVICE_VERSION`{#SUMMARY_SERVICE_VERSION} | For transcription | `1` | **Must be set to `2`** when using transcription. Version `1` is deprecated and logs a warning at startup. |
| `SUMMARY_SERVICE_ENDPOINT`{#SUMMARY_SERVICE_ENDPOINT} | For transcription | -- | URL of the summary service API endpoint. **Must use v2 API**: `http://app-summary:8000/api/v2/async-jobs/transcribe` |
| `SUMMARY_SERVICE_API_TOKEN`{#SUMMARY_SERVICE_API_TOKEN} | For transcription | -- | API token for authenticating with the summary service. Must match the `api_key` of the corresponding tenant in the summary service's [`AUTHORIZED_TENANTS`](#AUTHORIZED_TENANTS). |
| `SUMMARY_SERVICE_WEBHOOK_API_TOKEN`{#SUMMARY_SERVICE_WEBHOOK_API_TOKEN} | For transcription | -- | Token the backend requires on incoming result callbacks from the summary service. Must match the tenant's `webhook_api_key` in [`AUTHORIZED_TENANTS`](#AUTHORIZED_TENANTS). |
| `SUMMARY_SERVICE_CLOUD_STORAGE_SIGNED_URL_EXPIRY_SECONDS`{#SUMMARY_SERVICE_CLOUD_STORAGE_SIGNED_URL_EXPIRY_SECONDS} | No | `86400` | Expiration of the pre-signed URL given to the summary service to fetch the recording: 24 hours |
| `TRANSCRIPTION_SATISFACTION_FORM_BASE_URL`{#TRANSCRIPTION_SATISFACTION_FORM_BASE_URL} | No | -- | Base URL for an optional post-transcription satisfaction survey link |

### Metadata collector

These variables are the backend side of the [metadata collector](../overview/how-meet-works.md#transcription-and-summary). The agent itself is configured under [Metadata collector agent](#metadata-collector-agent).

| Variable | Required | Default | Description |
|---|---|---|---|
| `METADATA_COLLECTOR_ENABLED`{#METADATA_COLLECTOR_ENABLED} | No | `False` | Enable the metadata collector agent |
| `METADATA_COLLECTOR_AGENT_NAME`{#METADATA_COLLECTOR_AGENT_NAME} | No | `metadata-collector` | LiveKit agent name dispatched to rooms |
| `METADATA_COLLECTOR_OUTPUT_FOLDER`{#METADATA_COLLECTOR_OUTPUT_FOLDER} | No | `metadata` | Folder/prefix the backend reads collected metadata from. Must match the agent's [`AWS_S3_OUTPUT_FOLDER`](#AWS_S3_OUTPUT_FOLDER). |

### Subtitles

Real-time captions, provided by the [subtitles agent](#subtitles-agent). See [Real-time Subtitles](../self-hosting/configuration/subtitles.md) for setup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ROOM_SUBTITLE_ENABLED`{#ROOM_SUBTITLE_ENABLED} | For subtitles | `False` | Enable real-time subtitles |
| `ROOM_SUBTITLE_AGENT_NAME`{#ROOM_SUBTITLE_AGENT_NAME} | No | `multi-user-transcriber` | LiveKit agent dispatched to provide subtitles. Must match the agent's [`TRANSCRIBER_AGENT_NAME`](#TRANSCRIBER_AGENT_NAME). |

### Telephony

These variables only set how Meet shows the phone number and handles PINs. Dial-in also needs a running [LiveKit SIP](../overview/how-meet-works.md#agents-and-phone-calls) service and a SIP trunk.

[Telephony](../self-hosting/configuration/telephony.md#prerequisites) lists the providers and covers the full setup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ROOM_TELEPHONY_ENABLED`{#ROOM_TELEPHONY_ENABLED} | For telephony | `False` | Enable SIP telephony integration. Shows the dial-in phone number in the meeting room info panel. |
| `ROOM_TELEPHONY_PHONE_NUMBER`{#ROOM_TELEPHONY_PHONE_NUMBER} | For telephony | -- | Dial-in phone number displayed in the meeting room info panel. |
| `ROOM_TELEPHONY_DEFAULT_COUNTRY`{#ROOM_TELEPHONY_DEFAULT_COUNTRY} | No | `US` | Default country code for phone number display formatting. |
| `ROOM_TELEPHONY_PIN_LENGTH`{#ROOM_TELEPHONY_PIN_LENGTH} | No | `10` | Length of the PIN code for telephony dial-in |
| `ROOM_TELEPHONY_PIN_MAX_RETRIES`{#ROOM_TELEPHONY_PIN_MAX_RETRIES} | No | `5` | Attempts at drawing a PIN no other room uses, when a room is created. After that many, the room gets no PIN. |

### Roomkit (meeting-room SIP devices)

Lets dedicated meeting-room hardware join a room via SIP before any WebRTC participant has connected.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ROOMKIT_ENABLED`{#ROOMKIT_ENABLED} | No | `False` | Enable the roomkit integration |
| `ROOMKIT_SERVER_TO_SERVER_API_TOKEN`{#ROOMKIT_SERVER_TO_SERVER_API_TOKEN} | If enabled | -- | Token allowing LiveKit's SIP module to call roomkit endpoints on behalf of a dialing-in device |
| `ROOMKIT_JOIN_THROTTLE_RATES`{#ROOMKIT_JOIN_THROTTLE_RATES} | No | `300/minute` | Rate limit for roomkit join requests |

### Frontend

Backend settings served to the browser via `GET /api/v1.0/config/`, read at runtime.

The published image calls the API on its own origin, so the frontend and the backend must answer on the same domain; `VITE_API_BASE_URL` is a development setting.

The app title is set at build time, see [Build-time theming](../self-hosting/configuration/theming.md#build-time-theming).

| Variable | Required | Default | Description |
|---|---|---|---|
| `FRONTEND_CUSTOM_CSS_URL`{#FRONTEND_CUSTOM_CSS_URL} | No | -- | URL, or path on the Meet domain, of a CSS file loaded at runtime, e.g. `/custom.css`. It overrides the CSS variables for colors, fonts and spacing without rebuilding the image. |
| `FRONTEND_IS_SILENT_LOGIN_ENABLED`{#FRONTEND_IS_SILENT_LOGIN_ENABLED} | No | `True` | Enable silent OIDC authentication. Requires your provider to support `prompt=none`. |
| `FRONTEND_EXTERNAL_HOME_URL`{#FRONTEND_EXTERNAL_HOME_URL} | No | -- | Custom URL for the home button |
| `FRONTEND_DOCUMENTATION_URL`{#FRONTEND_DOCUMENTATION_URL} | No | -- | URL for a "Documentation" link/menu item in the UI |
| `FRONTEND_TECHNICAL_DOCUMENTATION_URL`{#FRONTEND_TECHNICAL_DOCUMENTATION_URL} | No | -- | Page giving the network requirements, for a participant's IT department. The connection test links to it after a warning, and so does the French government footer. If it is unset, neither shows the link. |
| `FRONTEND_TRANSCRIPTION_DESTINATION`{#FRONTEND_TRANSCRIPTION_DESTINATION} | No | -- | Label or link shown to users for where transcripts are delivered, such as your LaSuite Docs instance |
| `FRONTEND_IDLE_DISCONNECT_WARNING_DELAY`{#FRONTEND_IDLE_DISCONNECT_WARNING_DELAY} | No | -- | Milliseconds a participant alone in the room waits before the idle-disconnect warning. Unset disables it |
| `FRONTEND_MAX_PARTICIPANTS_FOR_SOUND`{#FRONTEND_MAX_PARTICIPANTS_FOR_SOUND} | No | `5` | From this participant count up, join/leave sounds are muted |
| `FRONTEND_AUTO_MUTE_ON_JOIN_THRESHOLD`{#FRONTEND_AUTO_MUTE_ON_JOIN_THRESHOLD} | No | `50` | Above this participant count, new participants join muted by default |
| `FRONTEND_USE_PROCONNECT_BUTTON`{#FRONTEND_USE_PROCONNECT_BUTTON} | No | `False` | Show the ProConnect login button, for French government instances |
| `FRONTEND_USE_FRENCH_GOV_FOOTER`{#FRONTEND_USE_FRENCH_GOV_FOOTER} | No | `False` | Show French government footer |
| `FRONTEND_ANALYTICS`{#FRONTEND_ANALYTICS} | No | `{}` | Analytics configuration exposed to the frontend: the backend or provider, and its keys |
| `FRONTEND_SUPPORT`{#FRONTEND_SUPPORT} | No | `{}` | Support settings for the frontend: `widget_script_url`, `widget_api_url` and `widget_channel` of the La Suite support form, whose button shows only when all three are set, and the `help_article_recording`, `help_article_transcript` and `help_article_more_tools` links |
| `FRONTEND_FEEDBACK`{#FRONTEND_FEEDBACK} | No | `{}` | Feedback form configuration exposed to the frontend |
| `FRONTEND_MANIFEST_LINK`{#FRONTEND_MANIFEST_LINK} | No | -- | URL of the home page's **Learn more about** link, followed by the app name; unset, the link is hidden |
| `FRONTEND_SILENCE_LIVEKIT_DEBUG`{#FRONTEND_SILENCE_LIVEKIT_DEBUG} | No | `False` | Suppress LiveKit debug logs |

To replace the logo or the landing page images at runtime, mount your own files over them, as [Theming: Custom assets](../self-hosting/configuration/theming.md#custom-assets-logo-images) shows.

### Custom backgrounds

Lets participants upload their own virtual background images, the only kind of upload Meet has.

| Variable | Required | Default | Description |
|---|---|---|---|
| `FILE_UPLOAD_ENABLED`{#FILE_UPLOAD_ENABLED} | No | `False` | Enable custom background image uploads: by default 10 per user, 2 MB each, JPEG or PNG only. |
| `FILE_UPLOAD_APPLY_RESTRICTIONS`{#FILE_UPLOAD_APPLY_RESTRICTIONS} | No | `True` | Enforce the size/count/extension limits in [`FILE_UPLOAD_RESTRICTIONS`](#FILE_UPLOAD_RESTRICTIONS). Disable only for trusted, controlled deployments. |
| `FILE_UPLOAD_RESTRICTIONS`{#FILE_UPLOAD_RESTRICTIONS} | No | `{"background_image": {"max_size": 2097152, "max_count_by_user": 10, "allowed_extensions": [".jpeg", ".jpg", ".png"], "allowed_mimetypes": ["image/jpeg", "image/png"]}}` | Per-category upload limits, as a JSON dict. |
| `MEDIA_BASE_URL`{#MEDIA_BASE_URL} | No | `""` | Prefix put in front of `/media/` in the URLs of uploaded files, for serving them from another host |
| `FILE_UPLOAD_PATH`{#FILE_UPLOAD_PATH} | No | `files` | Folder/prefix used in object storage for uploaded files |
| `FILE_UPLOAD_TMP_PATH`{#FILE_UPLOAD_TMP_PATH} | No | `tmp/files` | Temporary folder/prefix used while a file is being uploaded |
| `FILE_PURGE_GRACE_DAYS`{#FILE_PURGE_GRACE_DAYS} | No | `7` | Days a soft-deleted file is kept before `purge_deleted_files` deletes it for good. The Helm chart runs that command nightly; with Docker Compose, schedule it yourself |

### Connection test

Lets participants check their connection to LiveKit before a meeting.

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONNECTION_TEST_ENABLED`{#CONNECTION_TEST_ENABLED} | No | `False` | Enable the connection test feature |
| `CONNECTION_TEST_TOKEN_TTL_SECONDS`{#CONNECTION_TEST_TOKEN_TTL_SECONDS} | No | `300` | Validity of the connection-test LiveKit token, in seconds |
| `CONNECTION_TEST_ROOM_EXTRA_AGE_SECONDS`{#CONNECTION_TEST_ROOM_EXTRA_AGE_SECONDS} | No | `10` | Extra time added on top of the token TTL before the cleanup worker deletes a leftover test room. Requires [`CELERY_ENABLED=True`](#CELERY_ENABLED). |
| `CONNECTION_TEST_ROOM_PREFIX`{#CONNECTION_TEST_ROOM_PREFIX} | No | `connection-test` | Prefix used to name ephemeral connection-test rooms |
| `CONNECTION_TEST_THROTTLE_RATES`{#CONNECTION_TEST_THROTTLE_RATES} | No | `30/minute` | Rate limit for starting connection tests |

### External API (applications)

Lets external applications authenticate against Meet on behalf of users with application JWTs. See [External API: Application token](external-api.md#application-token).

| Variable | Required | Default | Description |
|---|---|---|---|
| `EXTERNAL_API_ENABLED`{#EXTERNAL_API_ENABLED} | For the external API | `False` | Mounts the `/external-api/v1.0/` router. Without it, every path under it returns 404, regardless of the other settings. |
| `APPLICATION_ENABLED`{#APPLICATION_ENABLED} | For application tokens | `False` | Enables the token endpoint. Without it, the token endpoint answers 404 even with [`EXTERNAL_API_ENABLED=True`](#EXTERNAL_API_ENABLED). |
| `APPLICATION_JWT_SECRET_KEY`{#APPLICATION_JWT_SECRET_KEY} | If enabled | -- | Secret key used to sign application JWTs |
| `APPLICATION_JWT_EXPIRATION_SECONDS`{#APPLICATION_JWT_EXPIRATION_SECONDS} | No | `3600` | Application JWT lifetime |
| `APPLICATION_ALLOW_USER_CREATION`{#APPLICATION_ALLOW_USER_CREATION} | No | `False` | Let an application create a user from an email alone. It works only with [`OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION`](#OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION) on and [`OIDC_USER_SUB_FIELD_IMMUTABLE`](#OIDC_USER_SUB_FIELD_IMMUTABLE) off, so the user's OIDC `sub` can be set at their first sign-in. |
| `EXTERNAL_API_DEFAULT_ACCESS_LEVEL`{#EXTERNAL_API_DEFAULT_ACCESS_LEVEL} | No | `trusted` | Default access level for rooms created through the external API |
| `EXTERNAL_API_ALLOW_PUBLIC_ACCESS`{#EXTERNAL_API_ALLOW_PUBLIC_ACCESS} | No | `False` | Allow the external API to create rooms with, or switch them to, `access_level=public`. Existing public rooms stay listable and editable either way. Ignored when [`EXTERNAL_API_DEFAULT_ACCESS_LEVEL=public`](#EXTERNAL_API_DEFAULT_ACCESS_LEVEL). |
| `APPLICATION_CLIENT_SECRET_LENGTH`{#APPLICATION_CLIENT_SECRET_LENGTH} | No | `50` | Length of generated application client secrets. The backend warns at start below 43, the length that gives 256 bits of randomness. |
| `APPLICATION_BASE_URL`{#APPLICATION_BASE_URL} | No | -- | Meet's frontend URL. When set, external-API room responses include `url: <base>/<slug>` |

### User access tokens

These settings control the transit code that signs a user in to Meet inside another application's iframe, see [External API: Signing a user in to an iframe](external-api.md#signing-a-user-in-to-an-iframe).

It needs the [External API (applications)](#external-api-applications) switched on, and an application holding the `users:session` scope.

| Variable | Required | Default | Description |
|---|---|---|---|
| `USER_ACCESS_TOKEN_ENABLED`{#USER_ACCESS_TOKEN_ENABLED} | For embedding | `False` | Enable the transit code and the token exchange. When it is off, both endpoints return 404. |
| `USER_ACCESS_TOKEN_SECRET_KEY`{#USER_ACCESS_TOKEN_SECRET_KEY} | If enabled | -- | Secret key used to sign user access tokens. With the feature on and no key, the core API answers 500. |
| `USER_ACCESS_TOKEN_TTL`{#USER_ACCESS_TOKEN_TTL} | No | `7200` | User access token lifetime, in seconds |
| `TRANSIT_CODE_TTL`{#TRANSIT_CODE_TTL} | No | `60` | Seconds a transit code stays valid. It needs to last only through the redirect and the exchange. |
| `EXCHANGE_ACCESS_TOKEN_THROTTLE_RATES`{#EXCHANGE_ACCESS_TOKEN_THROTTLE_RATES} | No | `30/minute` | Rate limit for transit code exchanges, per client address |

### External API (user's OIDC token) { #external-api-oidc-resource-server }

Lets an application call the external API with the access token its user got from your [OIDC](https://openid.net/developers/how-connect-works/) provider, separate from the browser login. What the mode needs is in [External API: User's OIDC token](external-api.md#users-oidc-token).

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_RS_CLIENT_SECRET`{#OIDC_RS_CLIENT_SECRET} | If used | -- | Client secret for the resource server |
| `OIDC_RS_CLIENT_ID`{#OIDC_RS_CLIENT_ID} | No | `meet` | Meet's client at the provider, used to call the introspection endpoint |
| `OIDC_RS_SCOPES`{#OIDC_RS_SCOPES} | No | `["lasuite_meet"]` | A token must carry at least one of these scopes |
| `OIDC_RS_SCOPES_PREFIX`{#OIDC_RS_SCOPES_PREFIX} | No | -- | Set it, to `lasuite_meet` for one, when your IdP issues namespaced scopes like `lasuite_meet:rooms:list`: the prefix is stripped from each scope before matching. |
| `OIDC_RS_AUDIENCE_CLAIM`{#OIDC_RS_AUDIENCE_CLAIM} | No | `client_id` | Token claim used to identify the audience/client |
| `OIDC_RS_PRIVATE_KEY_STR`{#OIDC_RS_PRIVATE_KEY_STR} | No | -- | Private key, as a PEM string, whose public part Meet publishes at `/jwks` |

### External API (Menshen token exchange)

These settings connect Meet to the [Menshen token exchange](external-api.md#menshen-token-exchange), through which another La Suite service calls the external API.

| Variable | Required | Default | Description |
|---|---|---|---|
| `MENSHEN_ENABLED`{#MENSHEN_ENABLED} | No | `False` | Accept tokens issued by Menshen |
| `MENSHEN_SERVER_URL`{#MENSHEN_SERVER_URL} | If enabled | -- | Menshen's URL |
| `MENSHEN_CLIENT_ID`{#MENSHEN_CLIENT_ID} | If enabled | -- | Meet's client at Menshen, used to check tokens |
| `MENSHEN_CLIENT_SECRET`{#MENSHEN_CLIENT_SECRET} | If enabled | -- | Secret of that client |

### Add-ons

Backend support for add-ins embedded in other applications, the Outlook add-in for one. See [External API: add-ons](external-api-addons.md).

Add-ons also need [`EXTERNAL_API_ENABLED=True`](#EXTERNAL_API_ENABLED).

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADDONS_ENABLED`{#ADDONS_ENABLED} | For add-ons | `False` | Enable add-on support |
| `ADDONS_TOKEN_SECRET_KEY`{#ADDONS_TOKEN_SECRET_KEY} | If enabled | -- | Secret key used to sign add-on tokens |
| `ADDONS_CSRF_SECRET`{#ADDONS_CSRF_SECRET} | If enabled | -- | Secret used to protect add-on session CSRF tokens |
| `ADDONS_TOKEN_SCOPE`{#ADDONS_TOKEN_SCOPE} | No | `rooms:create` | Scope granted to add-on tokens |
| `ADDONS_TOKEN_TTL`{#ADDONS_TOKEN_TTL} | No | `7200` | Add-on token lifetime, in seconds |
| `ADDONS_SESSION_TTL`{#ADDONS_SESSION_TTL} | No | `3600` | Add-on session lifetime, in seconds |
| `ADDONS_TRANSIT_TOKEN_TTL`{#ADDONS_TRANSIT_TOKEN_TTL} | No | `120` | Seconds the transit token of the add-on sign-in stays valid |

### CORS

Standard `django-cors-headers` settings. They govern JavaScript on another domain calling the API with `fetch`.

Showing Meet in an iframe depends on `X-Frame-Options` and CSP `frame-ancestors` instead.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_CORS_ALLOWED_ORIGINS`{#DJANGO_CORS_ALLOWED_ORIGINS} | No | `[]` | Origins allowed to make cross-origin requests, such as `["https://app.example.com"]` |
| `DJANGO_CORS_ALLOWED_ORIGIN_REGEXES`{#DJANGO_CORS_ALLOWED_ORIGIN_REGEXES} | No | `[]` | Regex patterns matching allowed origins |
| `DJANGO_CORS_ALLOW_ALL_ORIGINS`{#DJANGO_CORS_ALLOW_ALL_ORIGINS} | No | `False` | Allow all origins. **Do not enable in production**: use [`DJANGO_CORS_ALLOWED_ORIGINS`](#DJANGO_CORS_ALLOWED_ORIGINS) instead. |

### Logging and monitoring

| Variable | Required | Default | Description |
|---|---|---|---|
| `DJANGO_SENTRY_DSN`{#DJANGO_SENTRY_DSN} | No | -- | Sentry DSN for error tracking. Sentry's `environment` tag comes from [`DJANGO_CONFIGURATION`](#DJANGO_CONFIGURATION), such as `production` or `demo`; no separate variable sets it. |
| `SENTRY_TRACES_SAMPLE_RATE`{#SENTRY_TRACES_SAMPLE_RATE} | No | `0.0` | Fraction of transactions sampled for Sentry performance tracing, from `0.0` to `1.0` |
| `LOGGING_LEVEL_LOGGERS_ROOT`{#LOGGING_LEVEL_LOGGERS_ROOT} | No | `INFO` | Log level of the root logger |
| `LOGGING_LEVEL_LOGGERS_APP`{#LOGGING_LEVEL_LOGGERS_APP} | No | `INFO` | Log level of the backend's `core` loggers |
| `LOGGING_LEVEL_REQUEST_SUMMARY`{#LOGGING_LEVEL_REQUEST_SUMMARY} | No | `WARNING` | Log level of the per-request summary logger |
| `LOGGING_LEVEL_DOCKERFLOW`{#LOGGING_LEVEL_DOCKERFLOW} | No | `WARNING` | Log level of the health checks behind `/__heartbeat__` |
| `LOGGING_SILENCED_401_PATHS`{#LOGGING_SILENCED_401_PATHS} | No | `["/api/v1.0/users/me/"]` | Paths whose 401 responses are not logged |

### Audit logging

The backend writes a JSON event to [`AUDIT_LOG_STREAM`](#AUDIT_LOG_STREAM) for each:

- sign-in;
- room action made through the external API;
- recording action;
- Django admin change.

[Audit logging](../self-hosting/configuration/audit-logging.md) describes what an event holds. Each event's client address follows [`NUM_PROXIES`](#NUM_PROXIES), under [Core](#core).

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUDIT_LOG_STREAM`{#AUDIT_LOG_STREAM} | No | `ext://sys.stdout` | Where events are written. The default is the backend's standard output, beside its other logs. |
| `AUDIT_LOG_LEVEL`{#AUDIT_LOG_LEVEL} | No | `INFO` | Log level of the `audit` logger |
| `AUDIT_LOG_SERVICE_NAME`{#AUDIT_LOG_SERVICE_NAME} | No | `meet` | `service.name` of each event, and the dataset `<name>.audit`, lower-cased, with each `-` turned into `_` |
| `AUDIT_LOG_DATA_STREAM_NAMESPACE`{#AUDIT_LOG_DATA_STREAM_NAMESPACE} | No | `default` | Namespace of the data stream events are routed to, `logs-<service name>.audit-<namespace>`. The backend refuses to start when it contains `-`. |
| `REQUEST_ID_TRUST_HEADER`{#REQUEST_ID_TRUST_HEADER} | No | `False` | Reuse the proxy's request id, so the proxy, Gunicorn and audit events share it. Turn it on only when your proxy overwrites that header; otherwise a client can choose the id. When it is off, the backend generates the id. |
| `DOCKERFLOW_REQUEST_ID_HEADER_NAME`{#DOCKERFLOW_REQUEST_ID_HEADER_NAME} | No | `X-Request-ID` | Header carrying the request id. Read from requests only when [`REQUEST_ID_TRUST_HEADER`](#REQUEST_ID_TRUST_HEADER) is on, and always sent back on responses. |

### Analytics and marketing

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANALYTICS_BACKEND`{#ANALYTICS_BACKEND} | No | -- | Dotted path to an analytics backend class, such as a PostHog backend. Unset disables analytics. |
| `ANALYTICS_BACKEND_SETTINGS`{#ANALYTICS_BACKEND_SETTINGS} | No | `{}` | Configuration dict passed to the analytics backend, such as its API key and host |
| `SIGNUP_NEW_USER_TO_MARKETING_EMAIL`{#SIGNUP_NEW_USER_TO_MARKETING_EMAIL} | No | `False` | Add each new user to a marketing mailing list on their first sign-in. The contact is sent from a Celery task. |
| `LASUITE_MARKETING_BACKEND`{#LASUITE_MARKETING_BACKEND} | No | `lasuite.marketing.backends.dummy.DummyBackend` | Dotted path to the marketing backend. The default sends nothing; `lasuite.marketing.backends.brevo.BrevoBackend` sends to Brevo. |
| `LASUITE_MARKETING_PARAMETERS`{#LASUITE_MARKETING_PARAMETERS} | No | `{}` | Settings passed to the backend, as a one-line dict. Brevo takes `api_key`, `api_contact_list_ids` and, optionally, `api_contact_attributes`: `{"api_key": "<key>", "api_contact_list_ids": [3]}`. |

### Advanced

Rarely changed: internal names, token claims and lengths. None is required.

| Variable | Feature | Default | Description |
|---|---|---|---|
| `DJANGO_DATA_DIR`{#DJANGO_DATA_DIR} | [Core](#core) | `/data` | Directory holding local media and static files |
| `DJANGO_STORAGES_STATICFILES_BACKEND`{#DJANGO_STORAGES_STATICFILES_BACKEND} | [Core](#core) | `whitenoise.storage.CompressedManifestStaticFilesStorage` | Django storage class for static files |
| `DJANGO_SILENCED_SYSTEM_CHECKS`{#DJANGO_SILENCED_SYSTEM_CHECKS} | [Core](#core) | `[]` | Django system check IDs to silence |
| `DJANGO_SPECTACULAR_SETTINGS_ENABLE_DJANGO_DEPLOY_CHECK`{#DJANGO_SPECTACULAR_SETTINGS_ENABLE_DJANGO_DEPLOY_CHECK} | [Core](#core) | `False` | Run Django's deploy checks while generating the API schema |
| `CELERY_TASK_ALWAYS_EAGER`{#CELERY_TASK_ALWAYS_EAGER} | [Celery](#redis-celery-and-presence) | `False` | Run Celery tasks in-process instead of on a worker, for local development without one. Do not enable in production. |
| `PRESENCE_KEY_PREFIX`{#PRESENCE_KEY_PREFIX} | [Presence](#redis-celery-and-presence) | `room_presence` | Redis key prefix for presence state |
| `LOBBY_KEY_PREFIX`{#LOBBY_KEY_PREFIX} | [Waiting room](#rooms-and-waiting-room) | `room_lobby` | Redis key prefix for lobby state |
| `LOBBY_NOTIFICATION_TYPE`{#LOBBY_NOTIFICATION_TYPE} | [Waiting room](#rooms-and-waiting-room) | `participantWaiting` | LiveKit data channel notification type sent to the room when someone is waiting |
| `RECORDING_WORKER_CLASSES`{#RECORDING_WORKER_CLASSES} | [Recording](#recording) | -- | Worker class per recording mode. Default: `screen_recording` → `core.recording.worker.services.VideoCompositeEgressService`, `transcript` → `core.recording.worker.services.AudioCompositeEgressService`; each value is a full Python path. Change it only for custom egress workers. |
| `APPLICATION_JWT_ALG`{#APPLICATION_JWT_ALG} | [External API](#external-api-applications) | `HS256` | Application JWT signing algorithm |
| `APPLICATION_JWT_ISSUER`{#APPLICATION_JWT_ISSUER} | [External API](#external-api-applications) | `lasuite-meet` | `iss` claim for application JWTs |
| `APPLICATION_JWT_AUDIENCE`{#APPLICATION_JWT_AUDIENCE} | [External API](#external-api-applications) | -- | `aud` claim for application JWTs |
| `APPLICATION_JWT_TOKEN_TYPE`{#APPLICATION_JWT_TOKEN_TYPE} | [External API](#external-api-applications) | `Bearer` | Token type advertised for application JWTs |
| `APPLICATION_CLIENT_ID_LENGTH`{#APPLICATION_CLIENT_ID_LENGTH} | [External API](#external-api-applications) | `40` | Length of generated application client IDs |
| `USER_ACCESS_TOKEN_AUDIENCE`{#USER_ACCESS_TOKEN_AUDIENCE} | [User access tokens](#user-access-tokens) | -- | `aud` claim for user access tokens |
| `USER_ACCESS_TOKEN_ISSUER`{#USER_ACCESS_TOKEN_ISSUER} | [User access tokens](#user-access-tokens) | `lasuite-meet` | `iss` claim for user access tokens |
| `USER_ACCESS_TOKEN_ALG`{#USER_ACCESS_TOKEN_ALG} | [User access tokens](#user-access-tokens) | `HS256` | User access token signing algorithm |
| `USER_ACCESS_TOKEN_TYPE`{#USER_ACCESS_TOKEN_TYPE} | [User access tokens](#user-access-tokens) | `Bearer` | Token type advertised for user access tokens, and the scheme of the `Authorization` header that carries them |
| `USER_ACCESS_TOKEN_TYPE_CLAIM`{#USER_ACCESS_TOKEN_TYPE_CLAIM} | [User access tokens](#user-access-tokens) | `user_token` | `token_type` claim every user access token must carry |
| `TRANSIT_CODE_NBYTES`{#TRANSIT_CODE_NBYTES} | [User access tokens](#user-access-tokens) | `48` | Random bytes in a transit code. 48 bytes make a 64-character code. |
| `TRANSIT_CODE_CACHE_PREFIX`{#TRANSIT_CODE_CACHE_PREFIX} | [User access tokens](#user-access-tokens) | `transit-code` | Redis key prefix for transit codes |
| `OIDC_RS_SIGNING_ALGO`{#OIDC_RS_SIGNING_ALGO} | [User's OIDC token](#external-api-oidc-resource-server) | `ES256` | Read by the shared library for signed introspection responses. Meet reads introspection as plain JSON, so it has no effect today |
| `OIDC_RS_ENCRYPTION_ALGO`{#OIDC_RS_ENCRYPTION_ALGO} | [User's OIDC token](#external-api-oidc-resource-server) | `RSA-OAEP` | Algorithm advertised as `alg` for the key published at `/jwks`; would also decrypt encrypted introspection responses, which Meet does not request |
| `OIDC_RS_ENCRYPTION_ENCODING`{#OIDC_RS_ENCRYPTION_ENCODING} | [User's OIDC token](#external-api-oidc-resource-server) | `A256GCM` | For encrypted introspection responses, which Meet does not request; no effect today |
| `OIDC_RS_ENCRYPTION_KEY_TYPE`{#OIDC_RS_ENCRYPTION_KEY_TYPE} | [User's OIDC token](#external-api-oidc-resource-server) | `RSA` | Key type used to read [`OIDC_RS_PRIVATE_KEY_STR`](#OIDC_RS_PRIVATE_KEY_STR) for `/jwks` |
| `ADDONS_TOKEN_AUDIENCE`{#ADDONS_TOKEN_AUDIENCE} | [Add-ons](#add-ons) | `addons` | `aud` claim for add-on tokens |
| `ADDONS_TOKEN_ISSUER`{#ADDONS_TOKEN_ISSUER} | [Add-ons](#add-ons) | `lasuite-meet` | `iss` claim for add-on tokens |
| `ADDONS_TOKEN_ALG`{#ADDONS_TOKEN_ALG} | [Add-ons](#add-ons) | `HS256` | Add-on token signing algorithm |
| `ADDONS_TOKEN_TYPE`{#ADDONS_TOKEN_TYPE} | [Add-ons](#add-ons) | `Bearer` | Token type advertised for add-on tokens |
| `ADDONS_RANDOM_TOKEN_BYTE_LENGTH`{#ADDONS_RANDOM_TOKEN_BYTE_LENGTH} | [Add-ons](#add-ons) | `60` | Byte length of generated random add-on tokens |
| `ADDONS_SESSION_ID_COOKIE`{#ADDONS_SESSION_ID_COOKIE} | [Add-ons](#add-ons) | `addonsSid` | Cookie name for the add-on session ID |
| `ADDONS_PENDING_SESSION_KEY`{#ADDONS_PENDING_SESSION_KEY} | [Add-ons](#add-ons) | `addons_sid` | Cache key prefix for pending add-on sessions |
| `ADDONS_CACHE_PREFIX_SESSION`{#ADDONS_CACHE_PREFIX_SESSION} | [Add-ons](#add-ons) | `sid` | Redis key prefix for add-on sessions |
| `ADDONS_CACHE_PREFIX_TRANSIT`{#ADDONS_CACHE_PREFIX_TRANSIT} | [Add-ons](#add-ons) | `transit` | Redis key prefix for add-on transit tokens |

## Summary service

Runs transcription and summaries. See [AI Transcription](../self-hosting/configuration/transcription.md) for setup.

Every variable marked **Yes** must be set for the service to start, even with summaries turned off.

### Tenants

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTHORIZED_TENANTS`{#AUTHORIZED_TENANTS} | **Yes** | -- | JSON array, one entry per Meet backend allowed to submit tasks and receive results, as in [Step 1: Summary service environment](../self-hosting/configuration/transcription.md#step-1-summary-service-environment). Keep `allowed_push_to_docs` true even with the Docs push off: Meet always sends its Docs settings, and the service answers 400 to a tenant without it. |

### Storage

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_S3_ENDPOINT_URL` | **Yes** | -- | S3-compatible endpoint, with or without a scheme. [`AWS_S3_SECURE_ACCESS`](#AWS_S3_SECURE_ACCESS) picks the scheme, whatever the URL says. |
| `AWS_S3_ACCESS_KEY_ID` | **Yes** | -- | S3 access key |
| `AWS_S3_SECRET_ACCESS_KEY` | **Yes** | -- | S3 secret key |
| `AWS_STORAGE_BUCKET_NAME` | **Yes** | -- | S3 bucket name |
| `AWS_S3_SECURE_ACCESS`{#AWS_S3_SECURE_ACCESS} | No | `True` | Use HTTPS for S3 requests. Set to `False` for an endpoint served over plain HTTP. |
| `AWS_S3_REGION_NAME` | No | -- | S3 region |
| `AWS_S3_REQUEST_CHECKSUM_CALCULATION`{#AWS_S3_REQUEST_CHECKSUM_CALCULATION} | No | -- | When uploads carry a checksum: `when_supported` or `when_required`. If it is unset, the AWS SDK's own default applies. |
| `AWS_S3_RESPONSE_CHECKSUM_VALIDATION`{#AWS_S3_RESPONSE_CHECKSUM_VALIDATION} | No | -- | When downloads have their checksum checked: `when_supported` or `when_required`. If it is unset, the AWS SDK's own default applies. |
| `AWS_TRANSCRIPT_PATH`{#AWS_TRANSCRIPT_PATH} | No | `transcripts` | Folder/prefix used in object storage for transcript files |
| `AWS_SUMMARY_PATH`{#AWS_SUMMARY_PATH} | No | `summaries` | Folder/prefix used in object storage for summary files |

### Speech-to-text (WhisperX)

| Variable | Required | Default | Description |
|---|---|---|---|
| `WHISPERX_API_KEY`{#WHISPERX_API_KEY} | **Yes** | -- | API key for the WhisperX / OpenAI-compatible API |
| `WHISPERX_BASE_URL`{#WHISPERX_BASE_URL} | No | `https://api.openai.com/v1` | Base URL of the speech-to-text API. For [meet-whisperx](https://github.com/suitenumerique/meet-whisperx), end it in `/v1`, e.g. `http://whisperx:8000/v1`. See [AI Transcription](../self-hosting/configuration/transcription.md#requirements) for what the API must return. |
| `WHISPERX_ASR_MODEL`{#WHISPERX_ASR_MODEL} | No | `whisper-1` | ASR model name. Use `whisper-1` for the OpenAI Whisper API, or a WhisperX model like `large-v3` for a self-hosted instance. |
| `WHISPERX_DEFAULT_LANGUAGE`{#WHISPERX_DEFAULT_LANGUAGE} | No | -- | ISO 639-1 language code, such as `fr` or `en`. When set, skips automatic language detection. |
| `WHISPERX_ALLOWED_LANGUAGES`{#WHISPERX_ALLOWED_LANGUAGES} | No | `{"en","fr","de","nl"}` | Set of accepted ISO 639-1 language codes. Requests with other codes are rejected. |
| `RECORDING_MAX_DURATION` | No | -- | Maximum recording duration in **seconds**; longer recordings are not transcribed. Separate from the backend's own `RECORDING_MAX_DURATION`, which is in milliseconds. |
| `HALLUCINATION_PATTERNS`{#HALLUCINATION_PATTERNS} | No | `["Vap'n'Roll Thierry"]` | Transcript substrings treated as known WhisperX hallucinations and filtered out |
| `IS_RESOLVE_SPEAKER_IDENTITIES_ENABLED`{#IS_RESOLVE_SPEAKER_IDENTITIES_ENABLED} | No | `True` | Put participant names on the `SPEAKER_00`-style speakers WhisperX finds, from the metadata collector's record of who spoke when |
| `RESOLVE_SPEAKER_IDENTITIES_DEFAULT_OVERLAP_THRESHOLD`{#RESOLVE_SPEAKER_IDENTITIES_DEFAULT_OVERLAP_THRESHOLD} | No | `0.5` | Minimum overlap ratio required to attribute a speaker segment to a participant |
| `RESOLVE_SPEAKER_IDENTITIES_ENABLE_SPLIT_ON_WORDS`{#RESOLVE_SPEAKER_IDENTITIES_ENABLE_SPLIT_ON_WORDS} | No | `True` | Split segments on word boundaries when resolving overlapping speakers |
| `RESOLVE_SPEAKER_IDENTITIES_MAX_WORD_DURATION`{#RESOLVE_SPEAKER_IDENTITIES_MAX_WORD_DURATION} | No | `1` | Maximum plausible word duration, in seconds, used as a sanity bound during resolution |

### Summaries (LLM)

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_BASE_URL`{#LLM_BASE_URL} | **Yes** | -- | OpenAI-compatible LLM API endpoint |
| `LLM_API_KEY`{#LLM_API_KEY} | **Yes** | -- | LLM API key |
| `LLM_MODEL`{#LLM_MODEL} | **Yes** | -- | LLM model identifier, such as `gpt-4o` |
| `IS_SUMMARY_ENABLED`{#IS_SUMMARY_ENABLED} | No | `True` | Write a summary in addition to the transcript. `False` produces transcripts only. |

### LaSuite Docs

| Variable | Required | Default | Description |
|---|---|---|---|
| `IS_LASUITE_DOCS_INTEGRATION_ENABLED`{#IS_LASUITE_DOCS_INTEGRATION_ENABLED} | No | `False` | Push completed transcripts to a [LaSuite Docs](https://github.com/suitenumerique/docs) instance, for tenants with `allowed_push_to_docs` |
| `LASUITE_DOCS_BASE_URL`{#LASUITE_DOCS_BASE_URL} | If enabled | `https://example.com` | Base URL of the LaSuite Docs instance |
| `LASUITE_DOCS_SERVER_TO_SERVER_API_KEY`{#LASUITE_DOCS_SERVER_TO_SERVER_API_KEY} | If enabled | `NO_API_KEY` | Server-to-server API key for authenticating with LaSuite Docs |

### Queues and webhooks

| Variable | Required | Default | Description |
|---|---|---|---|
| `CELERY_BROKER_URL` | No | `redis://redis/0` | Celery broker URL |
| `CELERY_RESULT_BACKEND`{#CELERY_RESULT_BACKEND} | No | `redis://redis/0` | Celery result backend URL |
| `CELERY_MAX_RETRIES`{#CELERY_MAX_RETRIES} | No | `1` | Maximum retries for a failed Celery task |
| `TRANSCRIBE_QUEUE_V2`{#TRANSCRIBE_QUEUE_V2} | No | `transcribe-queue-v2` | Celery queue name for transcription tasks |
| `SUMMARIZE_QUEUE_V2`{#SUMMARIZE_QUEUE_V2} | No | `summarize-queue-v2` | Celery queue name for summarization tasks |
| `CALL_WEBHOOK_QUEUE_V2`{#CALL_WEBHOOK_QUEUE_V2} | No | `call-webhook-queue-v2` | Celery queue name for result-callback tasks |
| `WEBHOOK_MAX_RETRIES`{#WEBHOOK_MAX_RETRIES} | No | `2` | Maximum retries for a failed result callback to the backend |
| `WEBHOOK_STATUS_FORCELIST`{#WEBHOOK_STATUS_FORCELIST} | No | `[502, 503, 504]` | HTTP status codes that trigger a retry |
| `WEBHOOK_BACKOFF_FACTOR`{#WEBHOOK_BACKOFF_FACTOR} | No | `0.1` | Exponential backoff factor between retries |
| `TASK_TRACKER_REDIS_URL`{#TASK_TRACKER_REDIS_URL} | No | `redis://redis/0` | Redis URL used to track task progress/state |
| `TASK_TRACKER_PREFIX`{#TASK_TRACKER_PREFIX} | No | `task_metadata:` | Redis key prefix for task tracker entries |

### Monitoring

| Variable | Required | Default | Description |
|---|---|---|---|
| `SENTRY_IS_ENABLED`{#SENTRY_IS_ENABLED} | No | `False` | Send errors to Sentry |
| `SENTRY_DSN`{#SENTRY_DSN} | If enabled | -- | Sentry DSN |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0.1` | Fraction of requests and tasks sampled for Sentry performance tracing, from `0.0` to `1.0` |
| `POSTHOG_ENABLED`{#POSTHOG_ENABLED} | No | `False` | Send transcription and summary events to PostHog |
| `POSTHOG_API_KEY`{#POSTHOG_API_KEY} | If enabled | -- | PostHog project API key |
| `POSTHOG_API_HOST`{#POSTHOG_API_HOST} | No | `https://eu.i.posthog.com` | PostHog host |
| `LANGFUSE_ENABLED`{#LANGFUSE_ENABLED} | No | `False` | Trace LLM calls in Langfuse |
| `LANGFUSE_HOST`{#LANGFUSE_HOST} | If enabled | -- | Langfuse host |
| `LANGFUSE_PUBLIC_KEY`{#LANGFUSE_PUBLIC_KEY} | If enabled | -- | Langfuse public key |
| `LANGFUSE_SECRET_KEY`{#LANGFUSE_SECRET_KEY} | If enabled | -- | Langfuse secret key |
| `LANGFUSE_ENVIRONMENT`{#LANGFUSE_ENVIRONMENT} | No | `development` | Environment name reported to Langfuse |

## Agents

The LiveKit agents run as their own containers. Both read these:

| Variable | Required | Default | Description |
|---|---|---|---|
| `LIVEKIT_URL`{#LIVEKIT_URL} | **Yes** | -- | LiveKit server WebSocket URL |
| `LIVEKIT_API_KEY` | **Yes** | -- | LiveKit API key |
| `LIVEKIT_API_SECRET` | **Yes** | -- | LiveKit API secret |
| `SENTRY_DSN` | No | -- | Sentry DSN. If it is unset, errors are not sent. |
| `SENTRY_ENVIRONMENT`{#SENTRY_ENVIRONMENT} | No | -- | Environment name reported to Sentry |

### Subtitles agent

Provides real-time subtitles. See [Real-time Subtitles](../self-hosting/configuration/subtitles.md) for setup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `STT_PROVIDER`{#STT_PROVIDER} | No | `deepgram` | Speech-to-text provider: `deepgram`, `kyutai`, or `voxtral-vllm` |
| `TRANSCRIBER_AGENT_NAME`{#TRANSCRIBER_AGENT_NAME} | No | `multi-user-transcriber` | Agent name for dispatch. Must match the backend's [`ROOM_SUBTITLE_AGENT_NAME`](#ROOM_SUBTITLE_AGENT_NAME). |
| `ENABLE_SILERO_VAD`{#ENABLE_SILERO_VAD} | No | `true` | Voice activity detection, for better caption timing |

Then the variables of the provider [`STT_PROVIDER`](#STT_PROVIDER) names:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DEEPGRAM_API_KEY`{#DEEPGRAM_API_KEY} | For Deepgram | -- | Deepgram API key |
| `DEEPGRAM_STT_MODEL`{#DEEPGRAM_STT_MODEL} | No | `nova-3` | Deepgram model |
| `DEEPGRAM_STT_LANGUAGE`{#DEEPGRAM_STT_LANGUAGE} | No | `multi` | Language code, or `multi` for automatic detection |
| `KYUTAI_STT_BASE_URL`{#KYUTAI_STT_BASE_URL} | For Kyutai | -- | Kyutai service base URL |
| `KYUTAI_API_KEY`{#KYUTAI_API_KEY} | For Kyutai | -- | Kyutai API key |
| `VOXTRAL_VLLM_BASE_URL`{#VOXTRAL_VLLM_BASE_URL} | No | `ws://127.0.0.1:8000/v1/realtime` | vLLM realtime WebSocket endpoint |
| `VOXTRAL_VLLM_MODEL`{#VOXTRAL_VLLM_MODEL} | No | `mistralai/Voxtral-Mini-4B-Realtime-2602` | Model served by vLLM |
| `VOXTRAL_VLLM_API_KEY`{#VOXTRAL_VLLM_API_KEY} | No | -- | Bearer token, if the endpoint requires one |
| `VOXTRAL_VLLM_TARGET_STREAMING_DELAY_MS`{#VOXTRAL_VLLM_TARGET_STREAMING_DELAY_MS} | No | server default | Target streaming delay |

### Metadata collector agent

The agent joins a transcription only when the backend's [`METADATA_COLLECTOR_ENABLED`](#METADATA_COLLECTOR_ENABLED) is on.

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_S3_ENDPOINT_URL` | **Yes** | -- | S3-compatible endpoint, with or without a scheme, e.g. `garage:9000`. [`AWS_S3_SECURE_ACCESS`](#AWS_S3_SECURE_ACCESS) picks the scheme, whatever the URL says. |
| `AWS_S3_ACCESS_KEY_ID` | **Yes** | -- | S3 access key |
| `AWS_S3_SECRET_ACCESS_KEY` | **Yes** | -- | S3 secret key |
| `AWS_STORAGE_BUCKET_NAME` | **Yes** | -- | S3 bucket the metadata is written to |
| `AWS_S3_SECURE_ACCESS` | No | `False` | Use HTTPS for S3 requests. The default differs from the summary service's. |
| `AWS_S3_REGION_NAME` | No | -- | S3 region |
| `AWS_S3_OUTPUT_FOLDER`{#AWS_S3_OUTPUT_FOLDER} | No | `metadata` | Folder/prefix the metadata is written under. Must match the backend's [`METADATA_COLLECTOR_OUTPUT_FOLDER`](#METADATA_COLLECTOR_OUTPUT_FOLDER). |
| `METADATA_COLLECTOR_AGENT_NAME` | No | `metadata-collector` | Agent name for dispatch. Must match the backend's `METADATA_COLLECTOR_AGENT_NAME`. |
