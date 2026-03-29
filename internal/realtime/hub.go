package realtime

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var (
	msgTostiQueue       = []byte(`{"t":"tosti_queue"}`)
	msgMyTostiOrders    = []byte(`{"t":"my_tosti_orders"}`)
	msgTostiPublicQueue = []byte(`{"t":"tosti_public_queue"}`)
	msgPaymentRequests  = []byte(`{"t":"payment_requests"}`)
)

const (
	writeWait     = 10 * time.Second
	pongWait      = 60 * time.Second
	pingPeriod    = (pongWait * 9) / 10
	clientSendBuf = 8
)

// Hub fans out lightweight JSON events to WebSocket clients.
type Hub struct {
	registerKraam             chan *Client
	unregisterKraam           chan *Client
	registerUser              chan userClientReg
	unregisterUser            chan userClientReg
	broadcastKraam            chan struct{}
	broadcastPaymentRequests  chan struct{}
	broadcastMemberTostiQueue chan struct{}
	notifyUserTosti           chan int64

	mu    sync.Mutex
	kraam map[*Client]struct{}
	users map[int64]map[*Client]struct{}
}

type userClientReg struct {
	userID int64
	c      *Client
}

// Client is one WebSocket connection managed by the hub.
type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	userID int64 // 0 = kraam-only subscription
}

// NewHub starts the run loop in a goroutine.
func NewHub() *Hub {
	h := &Hub{
		registerKraam:             make(chan *Client),
		unregisterKraam:           make(chan *Client),
		registerUser:              make(chan userClientReg),
		unregisterUser:            make(chan userClientReg),
		broadcastKraam:            make(chan struct{}, 64),
		broadcastPaymentRequests:  make(chan struct{}, 64),
		broadcastMemberTostiQueue: make(chan struct{}, 64),
		notifyUserTosti:           make(chan int64, 256),
		kraam:                     make(map[*Client]struct{}),
		users:                     make(map[int64]map[*Client]struct{}),
	}
	go h.run()
	return h
}

func (h *Hub) run() {
	for {
		select {
		case c := <-h.registerKraam:
			h.mu.Lock()
			h.kraam[c] = struct{}{}
			h.mu.Unlock()

		case c := <-h.unregisterKraam:
			h.mu.Lock()
			if _, ok := h.kraam[c]; ok {
				delete(h.kraam, c)
				close(c.send)
			}
			h.mu.Unlock()

		case reg := <-h.registerUser:
			h.mu.Lock()
			if h.users[reg.userID] == nil {
				h.users[reg.userID] = make(map[*Client]struct{})
			}
			h.users[reg.userID][reg.c] = struct{}{}
			h.mu.Unlock()

		case reg := <-h.unregisterUser:
			h.mu.Lock()
			if m, ok := h.users[reg.userID]; ok {
				if _, ok := m[reg.c]; ok {
					delete(m, reg.c)
					if len(m) == 0 {
						delete(h.users, reg.userID)
					}
					close(reg.c.send)
				}
			}
			h.mu.Unlock()

		case <-h.broadcastKraam:
			h.mu.Lock()
			for c := range h.kraam {
				select {
				case c.send <- msgTostiQueue:
				default:
				}
			}
			h.mu.Unlock()

		case <-h.broadcastPaymentRequests:
			h.mu.Lock()
			for c := range h.kraam {
				select {
				case c.send <- msgPaymentRequests:
				default:
				}
			}
			h.mu.Unlock()

		case uid := <-h.notifyUserTosti:
			if uid == 0 {
				continue
			}
			h.mu.Lock()
			for c := range h.users[uid] {
				select {
				case c.send <- msgMyTostiOrders:
				default:
				}
			}
			h.mu.Unlock()

		case <-h.broadcastMemberTostiQueue:
			h.mu.Lock()
			for _, m := range h.users {
				for c := range m {
					select {
					case c.send <- msgTostiPublicQueue:
					default:
					}
				}
			}
			h.mu.Unlock()
		}
	}
}

// BroadcastKraam signals all kraam subscribers to refetch the queue (non-blocking).
func (h *Hub) BroadcastKraam() {
	select {
	case h.broadcastKraam <- struct{}{}:
	default:
	}
}

// BroadcastKraamPaymentRequests signals kraam subscribers to refetch the payment request queue (non-blocking).
func (h *Hub) BroadcastKraamPaymentRequests() {
	select {
	case h.broadcastPaymentRequests <- struct{}{}:
	default:
	}
}

// BroadcastMemberTostiQueue signals all member WebSocket clients to refetch the public queue (non-blocking).
func (h *Hub) BroadcastMemberTostiQueue() {
	select {
	case h.broadcastMemberTostiQueue <- struct{}{}:
	default:
	}
}

// NotifyUserTostiOrders signals one user to refetch /api/tosti-orders/mine (non-blocking).
func (h *Hub) NotifyUserTostiOrders(userID int64) {
	if userID == 0 {
		return
	}
	select {
	case h.notifyUserTosti <- userID:
	default:
	}
}

// ServeKraam registers as a kraam client until the connection closes.
func (h *Hub) ServeKraam(conn *websocket.Conn) {
	c := &Client{hub: h, conn: conn, send: make(chan []byte, clientSendBuf), userID: 0}
	h.registerKraam <- c
	go c.writePump()
	c.readPumpKraam()
}

// ServeMijnTosti registers a user-scoped client.
func (h *Hub) ServeMijnTosti(conn *websocket.Conn, userID int64) {
	c := &Client{hub: h, conn: conn, send: make(chan []byte, clientSendBuf), userID: userID}
	h.registerUser <- userClientReg{userID: userID, c: c}
	go c.writePump()
	c.readPumpUser(userID)
}

func (c *Client) readPumpKraam() {
	defer func() {
		c.hub.unregisterKraam <- c
		_ = c.conn.Close()
	}()
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (c *Client) readPumpUser(userID int64) {
	defer func() {
		c.hub.unregisterUser <- userClientReg{userID: userID, c: c}
		_ = c.conn.Close()
	}()
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
