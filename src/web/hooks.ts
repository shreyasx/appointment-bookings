import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, createBooking, getSlots } from './api.ts';
import { initialTimeZone } from './booking.ts';

function readSavedZone(): string | null {
  try {
    return localStorage.getItem('tz');
  } catch {
    return null; // storage blocked: fall back to the device zone
  }
}

export function useTimeZone() {
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [timeZone, setZone] = useState(() => initialTimeZone(readSavedZone(), deviceTimeZone));
  const setTimeZone = (tz: string) => {
    setZone(tz);
    try {
      localStorage.setItem('tz', tz);
    } catch {
      // storage blocked: the choice still holds for this visit
    }
  };
  return { timeZone, setTimeZone, deviceTimeZone };
}

export function useSlots() {
  return useQuery({ queryKey: ['slots'], queryFn: getSlots, refetchInterval: 60_000 });
}

export function useBookSlot(onUnavailable: (startsAt: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBooking,
    onSuccess: ({ booking }) => location.assign('/bookings/' + booking.id),
    onError: (error, variables) => {
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['slots'] });
        onUnavailable(variables.startsAt);
      }
    },
  });
}
