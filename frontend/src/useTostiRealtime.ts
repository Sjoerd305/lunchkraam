import { useEffect, useRef } from 'react'
import { z } from 'zod'

/** Server → client hint; unknown keys ignored. */
const tostiRealtimeMessageSchema = z.object({
  t: z.string().optional(),
})

function wsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}

const maxBackoffMs = 30_000
const initialBackoffMs = 1000

export type RealtimeHintReason = 'open' | string

/**
 * Subscribes to server push hints; calls onHint with 'open' after connect/reconnect
 * and with the message type (e.g. tosti_queue) when a filtered event arrives.
 */
export function useTostiRealtime(
  path: string,
  enabled: boolean,
  onHint: (reason: RealtimeHintReason) => void,
  filterTypes: string[],
) {
  const onHintRef = useRef(onHint)
  const filterRef = useRef(filterTypes)

  useEffect(() => {
    onHintRef.current = onHint
    filterRef.current = filterTypes
  }, [onHint, filterTypes])

  useEffect(() => {
    if (!enabled) return

    let socket: WebSocket | null = null
    let closed = false
    let attempt = 0
    let reconnectTimer: number | undefined

    const clearTimer = () => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
    }

    const connect = () => {
      if (closed) return
      clearTimer()
      socket = new WebSocket(wsUrl(path))

      socket.onopen = () => {
        attempt = 0
        onHintRef.current('open')
      }

      socket.onmessage = (ev) => {
        let raw: unknown
        try {
          const s = typeof ev.data === 'string' ? ev.data : String(ev.data)
          raw = JSON.parse(s) as unknown
        } catch {
          if (import.meta.env.DEV) {
            console.warn('[useTostiRealtime] skip non-JSON WebSocket payload')
          }
          return
        }
        const parsed = tostiRealtimeMessageSchema.safeParse(raw)
        if (!parsed.success) {
          if (import.meta.env.DEV) {
            console.warn('[useTostiRealtime] skip invalid message shape', parsed.error.flatten())
          }
          return
        }
        const t = parsed.data.t
        if (t && filterRef.current.includes(t)) {
          onHintRef.current(t)
        }
      }

      socket.onclose = () => {
        socket = null
        if (closed) return
        const delay = Math.min(maxBackoffMs, initialBackoffMs * Math.pow(2, attempt))
        attempt += 1
        reconnectTimer = window.setTimeout(connect, delay)
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      closed = true
      clearTimer()
      socket?.close()
    }
  }, [path, enabled])
}
