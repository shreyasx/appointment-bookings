create table mentors (
  id          int generated always as identity primary key,
  name        text not null,
  email       text not null unique,
  time_zone   text not null,          -- IANA name
  bio         text not null,
  subjects    text[] not null
);

create table mentor_hours (            -- weekly working hours, in the mentor's own time zone
  mentor_id   int not null references mentors(id),
  weekday     smallint not null check (weekday between 0 and 6),  -- 0 = Sunday, like getUTCDay
  start_time  time not null,
  end_time    time not null,
  check (start_time < end_time)
);

create table bookings (
  id                 uuid primary key default gen_random_uuid(),
  mentor_id          int not null references mentors(id),
  starts_at          timestamptz not null,
  mentor_local_date  date not null,     -- starts_at's date in the mentor's own time zone
  parent_name        text not null,
  parent_email       text not null,
  child_name         text not null,
  parent_time_zone   text not null,
  class_link         text not null,
  created_at         timestamptz not null default now(),
  cancelled_at       timestamptz
);

create unique index bookings_one_per_mentor_hour
  on bookings (mentor_id, starts_at) where cancelled_at is null;
create index bookings_mentor_day
  on bookings (mentor_id, mentor_local_date) where cancelled_at is null;
