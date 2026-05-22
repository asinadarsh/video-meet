export type Meeting = {
  meeting_id: string;
  title: string;
  description: string | null;
  host_name: string;
  scheduled_for: string | null;
  duration_minutes: number;
  status: "scheduled" | "active" | "ended";
  lobby_enabled?: boolean;
  locked?: boolean;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  invite_url: string | null;
  participant_count: number;
};

export type MeetingCreated = Meeting & { host_token: string };

export type Participant = {
  participant_id: string;
  name: string;
  is_host: boolean;
  joined_at: string | null;
  left_at?: string | null;
};

export type JoinResponse = {
  meeting: Meeting;
  participant_id: string;
  is_host: boolean;
  status?: "admitted" | "waiting";
  participants: Participant[];
};

export type ChatMessage = {
  id: number;
  meeting_id: string;
  participant_id: string;
  sender_name: string;
  content: string;
  created_at: string;
};
