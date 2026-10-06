# Lake Pass MCP

The API exposes a stateless Streamable HTTP MCP endpoint at `/mcp` on the
same port as the existing API. It supports `list_marinas`, `list_boats`, and
`check_availability`. All three tools are read-only and return public catalog
information; they never return customer records, payment details, reservation
IDs, or blockout notes. Listing tools support `limit` (1–100, default 25) and
`offset` (default 0).

## Run locally

1. Install with `pnpm install` and configure the existing API environment,
   including `DATABASE_URL`.
2. Run `pnpm --filter @lake-pass/api dev`.
3. Connect a Streamable HTTP client to `http://localhost:3001/mcp`.
   The endpoint is public: no API key, bearer header, or sign-in is required.

GET and DELETE return 405 because
the endpoint does not keep sessions or an SSE stream. Each POST creates
an isolated server/transport and closes it when the response finishes.

## Render

Deploy the API changes using your existing Render build/start commands.
Use `https://<your-api-service>.onrender.com/mcp` as the client URL.
No additional MCP environment variables are needed.

Anyone can discover and call the three read-only tools across active marinas.
Requests remain subject to the API's existing rate limit. The MCP endpoint
allows browser clients from any origin; other API routes retain their existing
CORS policy. Opening the URL in a browser returns 405 because MCP clients
communicate using protocol POST requests.

## Availability

Pass `boatId`, `startDate`, and `endDate` with timezone-qualified ISO timestamps.
The end must follow the start. Active reservations (pending, confirmed,
checked_in) are checked with the boat's turnaround buffer. Blockouts use
the actual requested range, matching the booking route. Maintenance boats
and inactive boats/marinas cannot be reported as available. Availability
is a snapshot and never holds inventory; booking must recheck conflicts.

## Validation

Run `pnpm --filter @lake-pass/api build`, then
`node --test packages/api/tests/mcp.test.cjs`. The tests use a real MCP client
and HTTP transport with a mocked database; they do not contact production.
