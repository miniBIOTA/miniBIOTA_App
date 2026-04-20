const SUPABASE_URL = "https://vmosexwnmnddabmmnidy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtb3NleHdubW5kZGFibW1uaWR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA2MzA0MSwiZXhwIjoyMDg3NjM5MDQxfQ.3Yr1DEOvPNHRJuJOV7_ADDhsf0nYSFRWHnou-D2ajKI";

const HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": "Bearer " + SUPABASE_KEY,
  "Content-Type": "application/json"
};

function api(path) {
  return fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: HEADERS }).then(r => r.json());
}
