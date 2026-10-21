// API request and response shapes, shared by the server and the browser.
export type ErrorCode = 'VALIDATION_FAILED' | 'SLOT_UNAVAILABLE' | 'NOT_FOUND' | 'INTERNAL';
export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
};
export type SlotDto = { startsAt: string; available: boolean };
export type SlotsResponse = { now: string; demo: boolean; slots: SlotDto[] };
export type MentorDto = {
  id: number;
  name: string;
  bio: string;
  subjects: string[];
  timeZone: string;
  bookings: { startsAt: string }[];
};
export type MentorsResponse = { now: string; demo: boolean; mentors: MentorDto[] };
export type BookingRequest = {
  startsAt: string;
  parentName: string;
  parentEmail: string;
  childName: string;
  parentTimeZone: string;
};
export type BookingDto = {
  id: string;
  startsAt: string;
  endsAt: string;
  childName: string;
  parentName: string;
  parentEmail: string;
  parentTimeZone: string;
  classLink: string;
  mentor: { name: string; bio: string; subjects: string[]; timeZone: string };
};
export type BookingResponse = { booking: BookingDto };
