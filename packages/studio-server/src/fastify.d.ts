// The authenticated user, attached by the /api guard hook.
declare module 'fastify' {
  interface FastifyRequest {
    authedUser?: import('./auth.js').AuthedUser;
  }
}

export {};
