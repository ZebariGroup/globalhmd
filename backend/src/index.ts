import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch, { HeadersInit } from 'node-fetch';
import { z } from 'zod';

const CURASEV_BASE_URL = 'https://api.curasev.com';
const AUTH_ENDPOINT = '/api/v1/user/authenticate';

const REQUIRED_ENV = z.object({
  CURASEV_USERNAME: z.string().min(1),
  CURASEV_PASSWORD: z.string().min(1),
  CURASEV_CLIENT_KEY: z.string().min(1),
  BASIC_AUTH_USER: z.string().min(1),
  BASIC_AUTH_PASS: z.string().min(1),
});

type Env = z.infer<typeof REQUIRED_ENV>;

type RouteHandler = (req: VercelRequest, res: VercelResponse, env: Env) => Promise<void>;

const TOKEN_TTL_MS = 1000 * 60 * 25;

let cachedToken: { token: string; fetchedAt: number } | null = null;

function getEnv(): Env {
  const parsed = REQUIRED_ENV.safeParse(process.env);
  if (!parsed.success) {
    throw Object.assign(new Error('Missing environment variables'), {
      status: 500,
      details: parsed.error.errors.map((err) => err.path.join('.')).join(', '),
    });
  }
  return parsed.data;
}

function assertBasicAuth(req: VercelRequest, env: Env) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Basic ')) {
    throwUnauthorized();
  }
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const [user, pass] = decoded.split(':');
  if (user !== env.BASIC_AUTH_USER || pass !== env.BASIC_AUTH_PASS) {
    throwUnauthorized();
  }
}

function throwUnauthorized(): never {
  const err = new Error('Unauthorized');
  (err as any).status = 401;
  throw err;
}

async function fetchCurasev(path: string, init: RequestInit & { headers?: HeadersInit }) {
  const response = await fetch(`${CURASEV_BASE_URL}${path}`, init);
  if (!response.ok) {
    const text = await response.text();
    throw Object.assign(new Error(`Curasev API error: ${response.status}`), {
      status: response.status,
      details: text,
    });
  }
  return response;
}

async function getToken(env: Env): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) {
    return cachedToken.token;
  }
  const payload = {
    p1: env.CURASEV_USERNAME,
    p2: env.CURASEV_PASSWORD,
  };
  const response = await fetchCurasev(AUTH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const json = (await response.json()) as any;
  const token = json?.data?.patient?.currentToken;
  if (!token) {
    throw Object.assign(new Error('Curasev authentication failed: missing token'), {
      status: 502,
      details: json,
    });
  }
  cachedToken = { token, fetchedAt: Date.now() };
  return token;
}

async function proxyRequest(req: VercelRequest, res: VercelResponse, env: Env, curasevPath: string) {
  assertBasicAuth(req, env);
  const token = await getToken(env);

  const search = buildSearch(req);
  const downstreamHeaders: HeadersInit = {
    Authorization: `Bearer ${token}`,
    clientkey: env.CURASEV_CLIENT_KEY,
    'Content-Type': 'application/json',
  };

  const body = getForwardBody(req);

  const response = await fetchCurasev(`${curasevPath}${search}`, {
    method: req.method,
    headers: downstreamHeaders,
    body,
  });

  const contentType = response.headers.get('content-type') ?? 'application/json';
  const text = await response.text();

  res.status(response.status).setHeader('Content-Type', contentType).send(text);
}

function buildSearch(req: VercelRequest): string {
  const url = new URL(req.url ?? '', `https://${req.headers.host ?? 'localhost'}`);
  return url.search;
}

function getForwardBody(req: VercelRequest): string | undefined {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }
  if (typeof req.body === 'string') {
    return req.body;
  }
  if (!req.body) {
    return undefined;
  }
  return JSON.stringify(req.body);
}

const routes: Record<string, RouteHandler> = {
  '/api/auth/login': async (req, res, env) => {
    assertBasicAuth(req, env);
    const token = await getToken(env);
    res.status(200).json({ token, fetchedAt: cachedToken?.fetchedAt ?? Date.now() });
  },
  '/api/report/download-history': (req, res, env) =>
    proxyRequest(req, res, env, '/api/v1/report/get-all-download-history'),
};

function resolveRoute(req: VercelRequest): RouteHandler | undefined {
  const pathname = new URL(req.url ?? '', `https://${req.headers.host ?? 'localhost'}`).pathname;
  return routes[pathname];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const env = getEnv();
  const route = resolveRoute(req);
  if (!route) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  try {
    await route(req, res, env);
  } catch (error: any) {
    const status = error?.status ?? 500;
    if (status === 401) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Reporting"');
    }
    res.status(status).json({
      error: error?.message ?? 'Internal Server Error',
      details: error?.details,
    });
  }
}
