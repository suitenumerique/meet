# Customising Meet

Everything an administrator can change in Meet is listed below, from its colours and logo to who can join a meeting and what gets recorded. Each row gives the default and links to the guide that explains the change.

## Applying a change

Most changes are settings of Meet's backend. Where you write them depends on how Meet is installed:

| Installation | Where the setting goes | How to apply it |
|---|---|---|
| Docker Compose | `env.d/common` | Run `docker compose up -d` in `~/docker/meet` |
| Kubernetes | `backend.envVars` in `values.yaml` | Run `helm upgrade`, as [Upgrading](kubernetes/helm.md#upgrading) shows |
| Scalingo | The app's environment | Run `scalingo env-set`, as [Step 2](scalingo.md#step-2-set-the-environment-variables) shows |

A few settings belong to another service, transcription for example. [Environment Variables](../reference/env-variables.md) tells you which file each one goes in.

## Look and feel

| What you can change | Default | Where to change it |
|---|---|---|
| Colours and font | Meet's blue, and the device's own font | [Theming: Colors and fonts](configuration/theming.md#colors-and-fonts) |
| The logo, the home page pictures and the browser-tab icon | Meet's own | [Theming: Custom assets](configuration/theming.md#custom-assets-logo-images) |
| The built-in virtual backgrounds | Eight pictures from Meet | [Theming: Custom assets](configuration/theming.md#custom-assets-logo-images), over the files of [`assets/backgrounds/`](https://github.com/suitenumerique/meet/tree/main/src/frontend/public/assets/backgrounds) |
| The app's name, in the browser tab and once installed | Empty in the published image: it needs your own build | [Theming: Build-time theming](configuration/theming.md#build-time-theming) |
| The French government footer | Off | [`FRONTEND_USE_FRENCH_GOV_FOOTER`](../reference/env-variables.md#FRONTEND_USE_FRENCH_GOV_FOOTER) |
| A page of your own in place of the home page, for signed-out visitors | Off | [`FRONTEND_EXTERNAL_HOME_URL`](../reference/env-variables.md#FRONTEND_EXTERNAL_HOME_URL) |
| A **Learn more** link on the home page | None | [`FRONTEND_MANIFEST_LINK`](../reference/env-variables.md#FRONTEND_MANIFEST_LINK) |
| Documentation and feedback links in the meeting's menu | None | [`FRONTEND_DOCUMENTATION_URL`](../reference/env-variables.md#FRONTEND_DOCUMENTATION_URL), [`FRONTEND_FEEDBACK`](../reference/env-variables.md#FRONTEND_FEEDBACK) |
| A support button, and help links in the meeting's side panels | Off | [`FRONTEND_SUPPORT`](../reference/env-variables.md#FRONTEND_SUPPORT) |

## Sign-in and who can join

| What you can change | Default | Where to change it |
|---|---|---|
| The sign-in service: Keycloak, Authentik, Google or any other OpenID Connect provider | None: one is required | [SSO & Authentication](configuration/sso.md) |
| Signing in without a click, for someone already signed in to that service | On | [`FRONTEND_IS_SILENT_LOGIN_ENABLED`](../reference/env-variables.md#FRONTEND_IS_SILENT_LOGIN_ENABLED) |
| The ProConnect button, for French public servants | Off | [`FRONTEND_USE_PROCONNECT_BUTTON`](../reference/env-variables.md#FRONTEND_USE_PROCONNECT_BUTTON) |
| Creating a Meet account at someone's first sign-in | On | [`OIDC_CREATE_USER`](../reference/env-variables.md#OIDC_CREATE_USER) |
| How long a sign-in lasts | 12 hours | [`SESSION_COOKIE_AGE`](../reference/env-variables.md#SESSION_COOKIE_AGE) |
| Starting a meeting without an account, under a room code nobody created | On. The Docker Compose template turns it off | [SSO: Unauthenticated access](configuration/sso.md#unauthenticated-access) |
| Who joins a new room directly, and who waits for the host to let them in | **Open**: anyone with the link joins directly | [SSO: Unauthenticated access](configuration/sso.md#unauthenticated-access), [Room access levels](../user/features-controls.md#access-levels) |
| How long someone let in from the waiting room has to join | 6 hours | [`LOBBY_ACCEPTED_TIMEOUT`](../reference/env-variables.md#LOBBY_ACCEPTED_TIMEOUT) |
| How soon someone turned away may ask again | 5 seconds | [`LOBBY_DENIED_TIMEOUT`](../reference/env-variables.md#LOBBY_DENIED_TIMEOUT) |

## Recording and transcription

| What you can change | Default | Where to change it |
|---|---|---|
| Recording, with the download link sent by email | Off | [Recording](configuration/recording.md), [`RECORDING_ENABLE`](../reference/env-variables.md#RECORDING_ENABLE) |
| Recording by any signed-in participant, in a room that is not **Restricted** | On | [Recording: Who can record](configuration/recording.md#who-can-record) |
| The recording quality | 720p at 30 images a second, about 1.4 GB an hour | [Recording: encoding](configuration/recording.md#configuring-recording-encoding) |
| Hosts choosing the quality of each recording | Off | [Recording: Letting users choose](configuration/recording.md#letting-users-choose) |
| When Meet shows a recording as expired, without deleting it | Never | [`RECORDING_EXPIRATION_DAYS`](../reference/env-variables.md#RECORDING_EXPIRATION_DAYS) |
| AI transcription, in beta, delivered to LaSuite Docs | Offered once recording is on, and delivers nothing until set up | [AI Transcription](configuration/transcription.md), or hidden with [`RECORDING_WORKER_CLASSES`](../reference/env-variables.md#RECORDING_WORKER_CLASSES) |
| AI summaries of the transcript | Off | [AI Transcription: LLM summaries](configuration/transcription.md#llm-summaries) |
| Speaker names in the transcript | Off: speakers are numbered | [AI Transcription: Name the speakers](configuration/transcription.md#step-4-name-the-speakers) |
| Telling users where their transcripts go | Not shown | [`FRONTEND_TRANSCRIPTION_DESTINATION`](../reference/env-variables.md#FRONTEND_TRANSCRIPTION_DESTINATION) |
| A satisfaction survey link after a transcription | None | [`TRANSCRIPTION_SATISFACTION_FORM_BASE_URL`](../reference/env-variables.md#TRANSCRIPTION_SATISFACTION_FORM_BASE_URL) |

## In a meeting

| What you can change | Default | Where to change it |
|---|---|---|
| Real-time subtitles, in beta | Off | [Real-time Subtitles](configuration/subtitles.md), [`ROOM_SUBTITLE_ENABLED`](../reference/env-variables.md#ROOM_SUBTITLE_ENABLED) |
| The speech-to-text service behind subtitles | Deepgram | [Real-time Subtitles: STT providers](configuration/subtitles.md#stt-providers) |
| Phone dial-in | Off | [Telephony](configuration/telephony.md), [`ROOM_TELEPHONY_ENABLED`](../reference/env-variables.md#ROOM_TELEPHONY_ENABLED) |
| The PIN callers type | 10 digits | [`ROOM_TELEPHONY_PIN_LENGTH`](../reference/env-variables.md#ROOM_TELEPHONY_PIN_LENGTH) |
| Meeting-room hardware joining a room, in beta | Off | [`ROOMKIT_ENABLED`](../reference/env-variables.md#ROOMKIT_ENABLED) |
| Uploading your own virtual backgrounds | Off. Once on, 10 per person, 2 MB each | [`FILE_UPLOAD_ENABLED`](../reference/env-variables.md#FILE_UPLOAD_ENABLED) |
| What participants may share, until the host changes it | Camera, microphone, screen and its sound | [`LIVEKIT_DEFAULT_SOURCES`](../reference/env-variables.md#LIVEKIT_DEFAULT_SOURCES) |
| Signed-in people changing their name in a meeting | On | [`AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME`](../reference/env-variables.md#AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME) |
| Joining muted, in a large meeting | Above 50 participants | [`FRONTEND_AUTO_MUTE_ON_JOIN_THRESHOLD`](../reference/env-variables.md#FRONTEND_AUTO_MUTE_ON_JOIN_THRESHOLD) |
| Join and leave sounds | Muted from 5 participants | [`FRONTEND_MAX_PARTICIPANTS_FOR_SOUND`](../reference/env-variables.md#FRONTEND_MAX_PARTICIPANTS_FOR_SOUND) |
| Ending the call of someone left alone, after a warning | Off | [`FRONTEND_IDLE_DISCONNECT_WARNING_DELAY`](../reference/env-variables.md#FRONTEND_IDLE_DISCONNECT_WARNING_DELAY) |

## Connection

| What you can change | Default | Where to change it |
|---|---|---|
| A relay for people whose network blocks calls, as some company networks do | Off | [LiveKit & TURN: TURN](configuration/livekit.md#turn) |
| A page where visitors test their connection before a meeting | Off. Once on, the [French government footer](https://github.com/suitenumerique/meet/blob/main/src/frontend/src/layout/Footer.tsx#L274) links it | [`CONNECTION_TEST_ENABLED`](../reference/env-variables.md#CONNECTION_TEST_ENABLED) |
| A link to your network requirements, for a visitor's IT team | None | [`FRONTEND_TECHNICAL_DOCUMENTATION_URL`](../reference/env-variables.md#FRONTEND_TECHNICAL_DOCUMENTATION_URL) |

## Email

| What you can change | Default | Where to change it |
|---|---|---|
| Sending email, for recording download links and room invitations | Nothing is sent until you name an email server | [Email](configuration/email.md) |
| The sender address | A placeholder, `from@example.com` | [`DJANGO_EMAIL_FROM`](../reference/env-variables.md#DJANGO_EMAIL_FROM) |
| Your name, logo and support address in emails | None | [Environment Variables: Email](../reference/env-variables.md#email) |
| Retrying an email that failed | Off | [`CELERY_ENABLED`](../reference/env-variables.md#CELERY_ENABLED) |

## Languages

| What you can change | Default | Where to change it |
|---|---|---|
| The languages a transcription accepts | English, French, German, Dutch | [`WHISPERX_ALLOWED_LANGUAGES`](../reference/env-variables.md#WHISPERX_ALLOWED_LANGUAGES) |
| The language a transcription assumes when none is picked | Detected from the speech | [`WHISPERX_DEFAULT_LANGUAGE`](../reference/env-variables.md#WHISPERX_DEFAULT_LANGUAGE) |
| The language of subtitles | Detected from the speech, with Deepgram | [`DEEPGRAM_STT_LANGUAGE`](../reference/env-variables.md#DEEPGRAM_STT_LANGUAGE) |
| The language of the phone prompts | English | [Telephony: Audio prompt language](configuration/telephony.md#audio-prompt-language) |

## Other applications

| What you can change | Default | Where to change it |
|---|---|---|
| Letting other applications create and manage rooms | Off | [External API](../reference/external-api.md), [`EXTERNAL_API_ENABLED`](../reference/env-variables.md#EXTERNAL_API_ENABLED) |
| The ways those applications sign in | All off | [External API: Getting a token](../reference/external-api.md#getting-a-token) |
| The Outlook add-in | Off | [Add-ons](../reference/external-api-addons.md), [`ADDONS_ENABLED`](../reference/env-variables.md#ADDONS_ENABLED) |
| Showing Meet inside another application's page | Allowed | [External API: Showing Meet in an iframe](../reference/external-api.md#signing-a-user-in-to-an-iframe) |
| Signing the user in to Meet there | Off | [`USER_ACCESS_TOKEN_ENABLED`](../reference/env-variables.md#USER_ACCESS_TOKEN_ENABLED) |
| Who joins a room another application created | **Open to trusted people**: signed-in users join directly, others wait | [`EXTERNAL_API_DEFAULT_ACCESS_LEVEL`](../reference/env-variables.md#EXTERNAL_API_DEFAULT_ACCESS_LEVEL) |
| Other applications creating rooms open to anyone | Off | [`EXTERNAL_API_ALLOW_PUBLIC_ACCESS`](../reference/env-variables.md#EXTERNAL_API_ALLOW_PUBLIC_ACCESS) |

## Data, logs and analytics

| What you can change | Default | Where to change it |
|---|---|---|
| Deleting unused rooms, and rooms their host deleted, for good | Off: every room is kept | [Room purge](configuration/room-purge.md) |
| Deleting uploaded backgrounds for good, once their owner removes them | After 7 days | [`FILE_PURGE_GRACE_DAYS`](../reference/env-variables.md#FILE_PURGE_GRACE_DAYS) |
| The audit log of sign-ins, recordings, and external API and admin actions | Always on, in the backend's output | [Audit logging](configuration/audit-logging.md) |
| Usage analytics in the browser, with [PostHog](https://posthog.com/) | Off | [`FRONTEND_ANALYTICS`](../reference/env-variables.md#FRONTEND_ANALYTICS) |
| Usage analytics from the server | Off | [`ANALYTICS_BACKEND`](../reference/env-variables.md#ANALYTICS_BACKEND) |
| Adding new users to a marketing mailing list | Off | [`SIGNUP_NEW_USER_TO_MARKETING_EMAIL`](../reference/env-variables.md#SIGNUP_NEW_USER_TO_MARKETING_EMAIL) |
| Error reports to [Sentry](https://sentry.io/) | Off | [`DJANGO_SENTRY_DSN`](../reference/env-variables.md#DJANGO_SENTRY_DSN) |

Browser analytics hide the
[recording](https://github.com/suitenumerique/meet/blob/main/src/frontend/src/features/recording/hooks/useHasRecordingAccess.ts#L18),
[transcription](configuration/transcription.md) and
[subtitle](configuration/subtitles.md#who-sees-it-and-what-it-costs) buttons from every user
your PostHog project has not given the matching
[feature flag](https://github.com/suitenumerique/meet/blob/main/src/frontend/src/features/analytics/enums.ts#L1-L9).

## Limits

| What you can change | Default | Where to change it |
|---|---|---|
| Rooms one person can create | 50 a minute, 1,000 a day | [`ROOM_CREATION_THROTTLE_RATES`](../reference/env-variables.md#ROOM_CREATION_THROTTLE_RATES) |
| Recordings one person can start | 10 a minute, 100 a day | [`START_RECORDING_THROTTLE_RATES`](../reference/env-variables.md#START_RECORDING_THROTTLE_RATES) |
| Every other limit, such as requests to join from the waiting room | Each has its own | [Security: Rate limiting](../reference/security.md#rate-limiting) |

## What you cannot change

- The interface's languages:
  [English, French, Dutch, German and Spanish](https://github.com/suitenumerique/meet/blob/main/src/frontend/src/i18n/init.ts#L18).
  Until someone picks one, Meet follows
  [the browser's language](https://github.com/suitenumerique/meet/blob/main/src/frontend/src/i18n/init.ts#L22),
  or [French](https://github.com/suitenumerique/meet/blob/main/src/frontend/src/i18n/init.ts#L6)
  when it is none of these.
- A footer of your own: the only one is the
  [French government footer](configuration/theming.md#footer).
- The recording's layout, which is
  [always LiveKit's](configuration/recording.md#what-it-cannot-do).
- A second dial-in number: Meet [shows one](configuration/telephony.md#limitations).
