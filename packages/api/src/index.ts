import 'dotenv/config';

import app from './app';
import { startReminderScheduler } from './lib/scheduler';

const PORT = Number(
  process.env.PORT ?? 3001,
);

if (
  !Number.isInteger(PORT) ||
  PORT <= 0
) {
  throw new Error(
    `Invalid PORT value: ${
      process.env.PORT ?? 'undefined'
    }`,
  );
}

const server = app.listen(
  PORT,
  () => {
    console.log(
      `Lake Pass API listening on port ${PORT}`,
    );

    if (
      process.env.NODE_ENV !== 'test'
    ) {
      startReminderScheduler();
    }
  },
);

function shutdown(
  signal: string,
): void {
  console.log(
    `${signal} received. Shutting down...`,
  );

  server.close((error) => {
    if (error) {
      console.error(
        'Failed to close HTTP server:',
        error,
      );

      process.exit(1);
    }

    console.log(
      'HTTP server closed',
    );

    process.exit(0);
  });
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM'),
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT'),
);
