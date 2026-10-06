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
2. Generate a dedicated token with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. Set `MCP_API_KEY` to that token in the API environment, then run
   `pnpm --filter @lake-pass/api dev`.
4. Connect a Streamable HTTP client to `http://localhost:3001/mcp` with
   `Authorization: Bearer <your-token>`.

An unset or shorter-than-32-character key disables the endpoint (503).
Invalid or missing tokens return 401. GET and DELETE return 405 because
the endpoint does not keep sessions or an SSE stream. Each POST creates
an isolated server/transport and closes it when the response finishes.

## Render

Deploy the API changes using your existing Render build/start commands.
Set `MCP_API_KEY` on that API service, then use
`https://<your-api-service>.onrender.com/mcp` as the client URL. Keep the
token in client secrets, never in frontend bundles or version control.
Rotating the environment variable revokes the old key.

Clients must support a configured bearer header. This endpoint does not
implement OAuth discovery or an interactive sign-in flow. A client requiring
OAuth needs a separate integration. The dedicated key grants catalog and
availability access across active marinas, not user or staff privileges.
Requests remain subject to the API's existing rate limit and CORS policy;
browser clients must have their exact origin listed in `ALLOWED_ORIGINS`.

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
