import { useEffect, useRef } from 'react'

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
  onHintRef.current = onHint
  filterRef.current = filterTypes

  useEffect(() => {
    if (!enabled) return

    let socket: WebSocket | null = null
    let closed = false
    let attempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

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
        try {
          const data = JSON.parse(ev.data as string) as { t?: string }
          const t = data.t
          if (t && filterRef.current.includes(t)) {
            onHintRef.current(t)
          }
        } catch {
          /* ignore */
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
