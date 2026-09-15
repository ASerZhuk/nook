export type Service = { id: string; name: string; duration_minutes: number; price: number };
export type AdminService = Service & { is_active: boolean };
export type Slot = { start_at: string; end_at: string };

export type MasterProfile = {
  id: string;
  phone: string;
  slug: string;
  name: string;
  specialty: string;
  address: string;
  onboarded: boolean;
  has_password: boolean;
  avatar_url: string | null;
};
export type PublicMaster = {
  slug: string;
  name: string;
  specialty: string;
  address: string;
  phone: string;
  timezone: string;
  avatar_url: string | null;
};
export type PublicPage = { master: PublicMaster; services: AdminService[] };

export type Booking = {
  id: string;
  service_id: string;
  service_name: string;
  price: number;
  client_name: string;
  client_phone: string;
  start_at: string;
  end_at: string;
  status: "confirmed" | "cancelled";
  cancelled_by: "master" | "client" | null;
  client_notified: boolean;
  share_url: string;
};

export type WorkingHours = { weekday: number; start_time: string; end_time: string };
export type TimeOff = { date: string; start_time: string | null; end_time: string | null; reason: string | null };
export type WorkingSlot = { weekday: number; start_time: string };
export type DateHours = { date: string; start_time: string; end_time: string };
export type DateSlot = { date: string; start_time: string };
export type ScheduleType = "weekly" | "dates";
export type Schedule = {
  schedule_type: ScheduleType | null;
  working_hours: WorkingHours[];
  working_slots: WorkingSlot[];
  date_hours: DateHours[];
  date_slots: DateSlot[];
  time_off: TimeOff[];
};

export type Client = { id: string; name: string; phone: string; notes: string | null; created_at: string; visits: number };

export type ClientBooking = {
  id: string;
  status: "confirmed" | "cancelled";
  cancelled_by: "master" | "client" | null;
  start_at: string;
  end_at: string;
  service_name: string;
  price: number;
  master: Omit<PublicMaster, "timezone">;
};
export type ClientMe = { name: string; phone: string; bookings: ClientBooking[] };
export type BookingLink = { booking: ClientBooking; in_app: boolean };
