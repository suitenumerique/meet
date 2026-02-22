flowchart LR

%% ========================
%% USER & HOST FRONTEND
%% ========================

User["User<br/>Open /xxx-yyy-zzz"]

Frontend["Frontend (React)<br/>Room.tsx / Join.tsx / Conference.tsx<br/><br/>GET /api/v1.0/rooms/{roomId}<br/><br/>If livekit = null:<br/>POST /request-entry<br/>startWaiting()<br/>useLobby poll 1s<br/><br/>onAccepted:<br/>enterRoom()<br/>LiveKitRoom connect"]

HostFE["Frontend Host<br/>useWaitingParticipants<br/><br/>Display: Lobby / Wait<br/>GET waiting-participants<br/>POST enter on approve"]

User -->|Listen| Frontend
HostFE --> User


%% ========================
%% AUTH
%% ========================

Auth["Auth Provider (OIDC / Keycloak)<br/><br/>Authenticates user<br/>Issues access token<br/>Provides identity & roles"]


%% ========================
%% BACKEND
%% ========================

Backend["Backend (Django API)<br/>RoomViewSet<br/><br/>retrieve: validate room<br/>RBAC (OIDC roles)<br/>Stateless API<br/><br/>If allowed:<br/>generate_livekit_config()<br/>return { livekit }<br/><br/>If restricted:<br/>return livekit = null<br/><br/>Delegates lobby to LobbyService"]

Frontend --> Backend
Auth --> Backend


%% ========================
%% LOBBY SERVICE
%% ========================

Lobby["LobbyService<br/>core/services/lobby.py<br/><br/>POST /request-entry<br/><br/>can_bypass_lobby?<br/>• public room → yes<br/>• trusted + auth → yes<br/><br/>Else:<br/>_get_or_create_participant_id<br/>cache state = WAITING<br/>Set-Cookie LOBBY_COOKIE_NAME<br/><br/>On admin approval:<br/>handle_participant_entry<br/>update state = ACCEPTED"]

Backend --> Lobby


%% ========================
%% REDIS
%% ========================

Redis[("Redis / Cache<br/>django cache<br/><br/>room_lobby_{room_id}_{participant_id}<br/>WAITING / ACCEPTED / DENIED<br/>LOBBY_WAITING_TIMEOUT<br/>TTL cleanup")]

Lobby --> Redis


%% ========================
%% ADMIN / HOST
%% ========================

Admin["Admin / Host<br/><br/>POST /api/v1.0/rooms/{roomId}/enter/<br/>{ participant_id, allow_entry }<br/><br/>Backend: handle_participant_entry<br/>cache.set ACCEPTED/DENIED<br/>User poll sees ACCEPTED → connect"]

HostFE --> Admin
Lobby -->|notify_participants<br/>SendDataRequest| Livekit
Admin --> Backend


%% ========================
%% LIVEKIT
%% ========================

Livekit["LiveKit<br/><br/>WebRTC Room<br/>Token-based access<br/>Media & signaling<br/><br/>Data channel: participantWaiting"]

Backend --> Livekit
Frontend -->|token + serverUrl| Livekit


%% ========================
%% WEBHOOK
%% ========================

Livekit -.->|webhook<br/>room_finished| Backend