import type {
  ApiErrorBody,
  BookingRequest,
  BookingResponse,
  ErrorCode,
  MentorsResponse,
  SlotsResponse,
} from '../shared/types.ts';

export class ApiError extends Error {
  status: number;
  code: ErrorCode;
  fields: Record<string, string>;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    fields: Record<string, string> = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    // offline or the server is down: a 5xx so queries retry it
    throw new ApiError(
      503,
      'INTERNAL',
      "We can't reach the server. Check your connection and try again.",
    );
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) {
    if (body === null) throw new ApiError(502, 'INTERNAL', 'Unexpected response from the server.'); // 200 with HTML, say a misrouted proxy
    return body as T;
  }
  const error = (body as ApiErrorBody | null)?.error;
  throw new ApiError(
    res.status,
    error?.code ?? 'INTERNAL',
    error?.message ?? 'Something went wrong. Please try again.',
    error?.fields,
  );
}

export const getSlots = () => request<SlotsResponse>('/api/slots');
export const getMentors = () => request<MentorsResponse>('/api/mentors');
export const getBooking = (id: string) =>
  request<BookingResponse>('/api/bookings/' + encodeURIComponent(id));
export const createBooking = (body: BookingRequest) =>
  request<BookingResponse>('/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
