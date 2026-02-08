# WebSocket Implementation - Quick Reference

> **TL;DR:** The custom websocket implementation is well-designed and justified. Keep it as-is. See [WEBSOCKET_ANALYSIS_REPORT.md](./WEBSOCKET_ANALYSIS_REPORT.md) for full analysis.

## Architecture at a Glance

### Technology Stack

- **Server:** `ws@8.18.3` (minimal WebSocket library)
- **Client:** Native Browser WebSocket API
- **Custom Code:** ~2,185 LOC (16 files)

### Code Organization

**Client Side** (`src/client/scripts/esm/game/websocket/`):

- `socketman.ts` - Connection lifecycle & reconnection
- `socketmessages.ts` - Sending messages & echo tracking
- `socketrouter.ts` - Incoming message routing
- `socketclose.ts` - Close event handling
- `socketsubs.ts` - Subscription state

**Server Side** (`src/server/socket/`):

- `socketServer.ts` - WebSocket server initialization
- `openSocket.ts` - Connection validation & authentication
- `socketManager.ts` - Connection state tracking
- `receiveSocketMessage.ts` - Incoming message validation
- `sendSocketMessage.ts` - Outgoing messages & health checks
- `echoTracker.ts` - Echo timer management
- `socketRouter.ts` - Message routing
- `generalrouter.ts` - General route handler
- `closeSocket.ts` - Cleanup on close
- `socketUtility.ts` - Helper functions

## Key Features

### 1. Bidirectional Echo Protocol

- Every message gets a unique ID and expects an echo back
- 5-second timeout for echo responses
- Enables fast failure detection (<5 seconds)
- Provides ping/RTT measurement

### 2. Smart Reconnection

- Automatic reconnection on network failure
- Preserves subscription state
- Resubscribes to all previous subscriptions
- Resynchronizes game state

### 3. Security Features

- Origin validation (HTTPS enforcement)
- Browser-ID cookie authentication
- JWT verification for signed-in users
- Connection limits: 10 per IP, 5 per session
- Message size limit: 500 KB
- Rate limiting at multiple levels

### 4. Connection Management

- 15-minute connection expiry (forces auth refresh)
- 10-second inactivity check (sends "renewconnection")
- Auto-close after 10 seconds with zero subscriptions

### 5. Subscription System

- **`invites`** - Real-time invite list updates
- **`game`** - In-game move synchronization

## Why Custom Implementation?

### Why NOT Socket.IO?

❌ Over-engineered (polling fallback, multiple transports)  
❌ Larger bundle size (~60KB+ client)  
❌ Custom protocol (not standard WebSocket)  
❌ Room/namespace model doesn't match use case  
❌ Features we don't need (binary support, polling)

### Why NOT SockJS?

❌ Outdated (modern browsers have excellent WebSocket support)  
❌ Unnecessary transport fallbacks  
❌ Custom protocol

### Why Custom IS Justified ✅

✅ Minimal overhead on top of standard WebSocket  
✅ Bidirectional echo for fast failure detection  
✅ Game-specific lifecycle integration  
✅ Subscription state preservation on reconnect  
✅ Security-first design with multiple layers  
✅ Exactly matches application needs

## Message Protocol

### Client → Server

```json
{
	"route": "general|invites|game",
	"contents": {
		"action": "...",
		"value": "..."
	},
	"id": 12345
}
```

### Server → Client

```json
{
	"sub": "general|invites|game",
	"action": "...",
	"value": "...",
	"id": 67890,
	"replyto": 12345
}
```

### Echo (Both Directions)

```json
// Client echo: { "route": "general", "action": "echo", "value": 67890 }
// Server echo: { "action": "echo", "value": 12345 }
```

## Configuration Constants

### Timeouts

- Echo timeout: 5 seconds
- Inactivity check: 10 seconds
- Connection expiry: 15 minutes
- Auto-close cushion: 10 seconds

### Limits

- Max sockets per IP: 10
- Max sockets per session: 5
- Max message size: 500 KB

### Debug Features

- Simulated latency (client & server)
- Debug logging toggle
- Ping/RTT display

## Debugging

### Client Debug Mode

Press `4` in-game to toggle debug mode:

- Simulates 1 second websocket latency
- Prints all sent/received messages to console

### Server Debug Mode

Set `simulatedWebsocketLatencyMillis` in `sendSocketMessage.ts`:

```typescript
const simulatedWebsocketLatencyMillis = 1000; // 1 second
```

**Note:** Must be 0 in production (enforced by code)

## Performance

### Efficiency

- Message overhead: ~50-100 bytes average (JSON)
- Echo overhead: 1 extra message per sent message
- O(1) socket lookup by ID
- Auto-cleanup prevents memory leaks

### Scalability

- Current: Suitable for thousands of concurrent connections
- Bottleneck: Single Node.js process
- Future: Would need Redis pub/sub for horizontal scaling

## Maintenance Guidelines

### DO ✅

- Preserve the bidirectional echo protocol
- Keep timeouts and limits as-is (they're tuned)
- Maintain type safety with Zod validation
- Follow existing module separation patterns

### DON'T ❌

- Replace with Socket.IO or similar (unjustified complexity)
- Remove echo tracking (critical for health monitoring)
- Change timeout values without thorough testing
- Mix concerns between modules

## Testing

### Current State

- No dedicated websocket unit tests
- Manual testing during development

### Recommended Additions (Optional)

- Unit tests for echo tracking
- Unit tests for reconnection logic
- Unit tests for subscription state
- Integration tests for full message flow

## Common Tasks

### Adding a New Subscription Type

1. Add to `validSubs` in `src/client/scripts/esm/game/websocket/socketsubs.ts`
2. Add case in `socketman.resubAll()` for reconnection handling
3. Add route handler in `src/server/socket/socketRouter.ts`
4. Implement subscription logic in appropriate manager

### Changing Timeout Values

1. Update constant in both client and server code
2. Test thoroughly with network interruption scenarios
3. Consider mobile network conditions

### Adding New Message Actions

1. Add to Zod schema in appropriate router
2. Add TypeScript type
3. Implement handler
4. Test with validation

## Related Documentation

- [Full Analysis Report](./WEBSOCKET_ANALYSIS_REPORT.md) - Complete 23KB+ deep-dive
- [NAVIGATING.md](./docs/NAVIGATING.md) - Project structure guide
- [CONTRIBUTING.md](./docs/CONTRIBUTING.md) - Contribution guidelines

## Conclusion

The websocket implementation is a **well-architected custom protocol layer** that solves real problems without over-engineering. The decision to use minimal `ws` library and build custom application logic is the correct architectural choice.

**No major refactoring recommended.** Continue maintaining the existing architecture.

---

_Report generated: 2026-02-08_  
_Analysis scope: 16 files, ~2,185 lines of code_
