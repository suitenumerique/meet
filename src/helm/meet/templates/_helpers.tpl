{{/*
Expand the name of the chart.
*/}}
{{- define "meet.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "meet.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "meet.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
meet.labels
*/}}
{{- define "meet.labels" -}}
helm.sh/chart: {{ include "meet.chart" . }}
{{ include "meet.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "meet.selectorLabels" -}}
app.kubernetes.io/name: {{ include "meet.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
transform dictionnary of environment variables
Usage : {{ include "meet.env.transformDict" .Values.envVars }}

Example:
envVars:
  # Using simple strings as env vars
  ENV_VAR_NAME: "envVar value"
  # Using a value from a configMap
  ENV_VAR_FROM_CM:
    configMapKeyRef:
      name: cm-name
      key: "key_in_cm"
  # Using a value from a secret
  ENV_VAR_FROM_SECRET:
    secretKeyRef:
      name: secret-name
      key: "key_in_secret"
*/}}
{{- define "meet.env.transformDict" -}}
{{- range $key, $value := . }}
- name: {{ $key | quote }}
{{- if $value | kindIs "map" }}
  valueFrom: {{ $value | toYaml | nindent 4 }}
{{- else }}
  value: {{ $value | quote }}
{{- end }}
{{- end }}
{{- end }}


{{/*
meet env vars
*/}}
{{- define "meet.common.env" -}}
{{- $topLevelScope := index . 0 -}}
{{- $workerScope := index . 1 -}}
{{- include "meet.env.transformDict" $workerScope.envVars -}}
{{- end }}

{{/*
Common labels

Requires array with top level scope and component name
*/}}
{{- define "meet.common.labels" -}}
{{- $topLevelScope := index . 0 -}}
{{- $component := index . 1 -}}
{{- include "meet.labels" $topLevelScope }}
app.kubernetes.io/component: {{ $component }}
{{- end }}

{{/*
Common selector labels

Requires array with top level scope and component name
*/}}
{{- define "meet.common.selectorLabels" -}}
{{- $topLevelScope := index . 0 -}}
{{- $component := index . 1 -}}
{{- include "meet.selectorLabels" $topLevelScope }}
app.kubernetes.io/component: {{ $component }}
{{- end }}

{{- define "meet.probes.abstract" -}}
{{- if .exec -}}
exec:
{{- toYaml .exec | nindent 2 }}
{{- else if .tcpSocket -}}
tcpSocket:
{{- toYaml .tcpSocket | nindent 2 }}
{{- else -}}
httpGet:
  path: {{ .path }}
  port: {{ .targetPort }}
{{- end }}
initialDelaySeconds: {{ .initialDelaySeconds | eq nil | ternary 0 .initialDelaySeconds }}
timeoutSeconds: {{ .timeoutSeconds | eq nil | ternary 1 .timeoutSeconds }}
{{- end }}

{{/*
Full name for the backend

Requires top level scope
*/}}
{{- define "meet.backend.fullname" -}}
{{ include "meet.fullname" . }}-backend
{{- end }}

{{/*
Full name for the frontend

Requires top level scope
*/}}
{{- define "meet.frontend.fullname" -}}
{{ include "meet.fullname" . }}-frontend
{{- end }}

{{/*
Full name for the webrtc

Requires top level scope
*/}}
{{- define "meet.webrtc.fullname" -}}
{{ include "meet.fullname" . }}-webrtc
{{- end }}

{{/*
Full name for the Posthog

Requires top level scope
*/}}
{{- define "meet.posthog.fullname" -}}
{{ include "meet.fullname" . }}-posthog
{{- end }}

{{/*
Full name for the summary

Requires top level scope
*/}}
{{- define "meet.summary.fullname" -}}
{{ include "meet.fullname" . }}-summary
{{- end }}

{{/*
Full name for the Celery

Requires top level scope
*/}}
{{- define "meet.celery.fullname" -}}
{{ include "meet.fullname" . }}-celery
{{- end }}

{{/*
Full name for the agents

Requires top level scope
*/}}
{{- define "meet.agents.fullname" -}}
{{ include "meet.fullname" . }}-agents
{{- end }}

{{/*
Usage : {{ include "meet.secret.dockerconfigjson.name" (dict "fullname" (include "meet.fullname" .) "imageCredentials" .Values.path.to.the.image1) }}
*/}}
{{- define "meet.secret.dockerconfigjson.name" }}
{{- if (default (dict) .imageCredentials).name }}{{ .imageCredentials.name }}{{ else }}{{ .fullname | trunc 63 | trimSuffix "-" }}-dockerconfig{{ end -}}
{{- end }}

{{/*
Usage : {{ include "meet.secret.dockerconfigjson" (dict "fullname" (include "meet.fullname" .) "imageCredentials" .Values.path.to.the.image1) }}
*/}}
{{- define "meet.secret.dockerconfigjson" }}
{{- if .imageCredentials -}}
apiVersion: v1
kind: Secret
metadata:
  name: {{ template "meet.secret.dockerconfigjson.name" (dict "fullname" .fullname "imageCredentials" .imageCredentials) }}
  annotations:
    "helm.sh/hook": pre-install,pre-upgrade
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: {{ template "meet.secret.dockerconfigjson.data" .imageCredentials }}
{{- end -}}
{{- end }}
