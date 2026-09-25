import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { Button, Div, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'

const TOPIC = 'meet-whiteboard-v1'
const MAX_STROKES = 20
const WIDTH = 800
const HEIGHT = 560

type Point = { x: number; y: number }
type Stroke = { id: string; color: string; points: Point[] }
type Message =
  | { type: 'stroke'; stroke: Stroke }
  | { type: 'clear' }
  | { type: 'request' }
  | { type: 'snapshot'; strokes: Stroke[] }

const boardSnapshots = new Map<string, Stroke[]>()

const colors = ['#1d2939', '#dc2626', '#2563eb', '#16a34a']

export function CollaborativeWhiteboard() {
  const room = useRoomContext()
  const { t } = useTranslation('rooms', { keyPrefix: 'moreTools.tools.whiteboard' })
  const [strokes, setStrokes] = useState<Stroke[]>(
    () => boardSnapshots.get(room.name) ?? []
  )
  const [color, setColor] = useState(colors[0])
  const [isReady, setIsReady] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const activeStroke = useRef<Stroke | null>(null)
  const lastBroadcastAt = useRef(0)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes

  useEffect(() => {
    boardSnapshots.set(room.name, strokes)
  }, [room.name, strokes])

  const send = useCallback(
    async (message: Message) => {
      try {
        await room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify(message)),
          { reliable: true, topic: TOPIC }
        )
      } catch (error) {
        console.error('Unable to sync whiteboard data', error)
      }
    },
    [room]
  )

  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string
    ) => {
      if (topic !== TOPIC) return
      let message: Message
      try {
        message = JSON.parse(new TextDecoder().decode(payload)) as Message
      } catch {
        return
      }

      if (message.type === 'request') {
        void send({ type: 'snapshot', strokes: strokesRef.current })
      } else if (message.type === 'snapshot' && Array.isArray(message.strokes)) {
        setStrokes((current) =>
          current.length ? current : message.strokes.slice(-MAX_STROKES)
        )
        setIsReady(true)
      } else if (message.type === 'clear') {
        setStrokes([])
        setIsReady(true)
      } else if (message.type === 'stroke' && message.stroke?.points) {
        setStrokes((current) => {
          const index = current.findIndex((stroke) => stroke.id === message.stroke.id)
          if (index === -1) return [...current, message.stroke].slice(-MAX_STROKES)
          return current.map((stroke, strokeIndex) =>
            strokeIndex === index ? message.stroke : stroke
          )
        })
        setIsReady(true)
      }
    }

    room.on(RoomEvent.DataReceived, onData)
    const requestSnapshot = () => {
      setIsReady(true)
      void send({ type: 'request' })
    }
    room.on(RoomEvent.Connected, requestSnapshot)
    room.on(RoomEvent.Reconnected, requestSnapshot)
    if (room.state === 'connected') requestSnapshot()
    return () => {
      room.off(RoomEvent.DataReceived, onData)
      room.off(RoomEvent.Connected, requestSnapshot)
      room.off(RoomEvent.Reconnected, requestSnapshot)
    }
  }, [room, send])

  const getPoint = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const bounds = svgRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(WIDTH, ((event.clientX - bounds.left) / bounds.width) * WIDTH)),
      y: Math.max(0, Math.min(HEIGHT, ((event.clientY - bounds.top) / bounds.height) * HEIGHT)),
    }
  }

  const startStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    svgRef.current.setPointerCapture(event.pointerId)
    activeStroke.current = {
      id: `${room.localParticipant.identity}-${Date.now()}-${Math.random()}`,
      color,
      points: [getPoint(event)],
    }
    setStrokes((current) => [...current, activeStroke.current!].slice(-MAX_STROKES))
  }

  const continueStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    const stroke = activeStroke.current
    if (!stroke) return
    stroke.points.push(getPoint(event))
    setStrokes((current) =>
      current.map((item) => (item.id === stroke.id ? { ...stroke } : item))
    )
    const now = Date.now()
    if (now - lastBroadcastAt.current >= 80) {
      lastBroadcastAt.current = now
      void send({ type: 'stroke', stroke: compactStroke(stroke) })
    }
  }

  const finishStroke = () => {
    if (!activeStroke.current) return
    const original = activeStroke.current
    activeStroke.current = null
    const stroke = compactStroke(original)
    setStrokes((current) =>
      current.map((item) => (item.id === stroke.id ? stroke : item))
    )
    void send({ type: 'stroke', stroke })
  }

  const clearBoard = () => {
    setStrokes([])
    setIsReady(true)
    void send({ type: 'clear' })
  }

  const pathFor = (points: Point[]) =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  function compactStroke(stroke: Stroke): Stroke {
    const stride = Math.max(1, Math.ceil(stroke.points.length / 24))
    const points = stroke.points.filter((_, index) => index % stride === 0)
    const lastPoint = stroke.points.at(-1)
    if (lastPoint && points.at(-1) !== lastPoint) points.push(lastPoint)
    return { ...stroke, points }
  }

  return (
    <Div display="flex" flexDirection="column" gap={3} padding="1rem" flexGrow={1}>
      <Text variant="smNote">{t('description', { defaultValue: 'Draw together. Your board is shared with everyone in this meeting.' })}</Text>
      {!isReady && (
        <Text variant="smNote">{t('waiting', { defaultValue: 'Waiting for the shared board…' })}</Text>
      )}
      <div className={css({ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' })}>
        {colors.map((item) => (
          <button
            key={item}
            type="button"
            aria-label={t('color', { defaultValue: 'Choose drawing color' })}
            aria-pressed={color === item}
            onClick={() => setColor(item)}
            className={css({ width: 8, height: 8, borderRadius: 'full', border: '2px solid', borderColor: color === item ? 'primary.700' : 'transparent', background: item, cursor: 'pointer' })}
          />
        ))}
        <Button variant="secondary" size="sm" onPress={clearBoard}>
          {t('clear', { defaultValue: 'Clear board' })}
        </Button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="application"
        aria-label={t('canvas', { defaultValue: 'Collaborative whiteboard canvas' })}
        onPointerDown={startStroke}
        onPointerMove={continueStroke}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        className={css({ width: '100%', minHeight: '20rem', flex: 1, border: '1px solid', borderColor: 'box.border', borderRadius: 8, background: 'white', touchAction: 'none', cursor: 'crosshair' })}
      >
        {strokes.map((stroke) => (
          <path
            key={stroke.id}
            d={pathFor(stroke.points)}
            fill="none"
            stroke={stroke.color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </Div>
  )
}
