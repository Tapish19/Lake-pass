declare module '@prisma/client' {
  export class PrismaClient {
    constructor(options?: unknown);
    [model: string]: any;
  }
}
